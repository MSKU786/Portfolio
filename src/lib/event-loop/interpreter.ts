/**
 * The evaluator: a tree-walking interpreter over the parsed subset.
 *
 * Two design choices carry the whole feature:
 *
 * 1. Every evaluation function is a generator, and the *only* thing they ever
 *    yield is "I hit an `await`". Synchronous code therefore runs straight
 *    through, while an async function's suspension point is a real, resumable
 *    continuation — which is exactly what `await` is.
 *
 * 2. When an async function suspends, its frames are lifted off the call stack
 *    and stored with that continuation. The stack visibly empties, which is
 *    the thing people are trying to understand when they come to a page like
 *    this one.
 */

import { BudgetExceeded, Machine } from "./machine";
import { createGlobals } from "./globals";
import type { Host } from "./host";
import { getMember, setMember } from "./members";
import { type Node, parse, ParseError } from "./parser";
import type { Runtime, Trace } from "./types";
import {
  Scope,
  type Callable,
  type Suspend,
  type VFunction,
  VPromise,
  VThrow,
  isCallable,
  isPromise,
  isVError,
  makeError,
  resetPromiseIds,
  toStringValue,
} from "./values";

/** How a statement finished, so loops and functions know what to do next. */
type Completion =
  | { type: "normal" }
  | { type: "return"; value: unknown }
  | { type: "break" }
  | { type: "continue" };

const NORMAL: Completion = { type: "normal" };

/** Deep enough to demonstrate recursion, shallow enough to fail fast. */
const MAX_CALL_DEPTH = 180;

type Resume =
  | { type: "next"; value: unknown; frames?: ReturnType<Machine["detachFrames"]> }
  | { type: "throw"; value: unknown; frames?: ReturnType<Machine["detachFrames"]> };

export class Interpreter implements Host {
  readonly machine: Machine;
  readonly runtime: Runtime;
  private readonly globalScope: Scope;

  constructor(runtime: Runtime) {
    this.runtime = runtime;
    this.machine = new Machine(runtime);
    this.globalScope = createGlobals(this);
  }

  // -- Host ----------------------------------------------------------------

  *call(fn: unknown, args: unknown[], thisArg: unknown, line: number): Generator<Suspend, unknown> {
    if (!isCallable(fn)) {
      this.fail("TypeError", `${describeValue(fn)} is not a function`);
    }
    return yield* this.callFunction(fn, args, thisArg, line);
  }

  fail(name: string, message: string): never {
    throw new VThrow(makeError(name, message));
  }

  makePromise(label?: string): VPromise {
    const promise = new VPromise();
    if (label) promise.originLabel = label;
    return promise;
  }

  toPromise(value: unknown, line: number): VPromise {
    if (isPromise(value)) return value;
    const promise = this.makePromise("Promise.resolve()");
    this.machine.settle(promise, "fulfilled", value, line);
    return promise;
  }

  // -- entry point ---------------------------------------------------------

  run(program: Node) {
    const machine = this.machine;
    const scope = new Scope(this.globalScope);

    machine.pushFrame("main", "sync", program.line);
    machine.snap(
      this.runtime === "node"
        ? "Program starts. Node runs the whole script synchronously before the event loop turns even once."
        : "Program starts. The script runs to completion before the task queue gets a look in.",
      "start",
      null,
    );

    try {
      hoist((program.body as Node[]) ?? [], scope, this);

      const generator = this.execStatements((program.body as Node[]) ?? [], scope);
      const result = generator.next();
      if (!result.done) {
        this.fail(
          "SyntaxError",
          "Top-level await is not supported here — wrap it in an async function and call it.",
        );
      }

      machine.popFrame();
      machine.snap(
        "The synchronous script is done and the call stack is empty. Only now can queued work run.",
        "phase",
        null,
      );

      machine.drainMicrotasks("Script finished");
      machine.runLoop();
      machine.snap("No work left anywhere — the event loop exits and the process ends.", "done", null);
    } catch (err) {
      this.recordFailure(err);
    }
  }

  private recordFailure(err: unknown) {
    const machine = this.machine;

    if (err instanceof BudgetExceeded) {
      machine.error = err.message;
      machine.truncated = true;
      // The snapshot budget is the one limit that cannot record its own end.
      try {
        machine.snap(err.message, "error", null);
      } catch {
        /* the trace is already full; the error text alone has to do */
      }
      return;
    }

    if (err instanceof VThrow) {
      const value = err.value;
      const text = isVError(value)
        ? `${value.name}: ${value.message}`
        : `Uncaught ${describeValue(value)}`;
      machine.error = text;
      machine.truncateFrames(0);
      try {
        machine.snap(`Uncaught — ${text}`, "error", null);
      } catch {
        /* trace full */
      }
      return;
    }

    machine.error = err instanceof Error ? err.message : String(err);
    try {
      machine.snap(`Interpreter error — ${machine.error}`, "error", null);
    } catch {
      /* trace full */
    }
  }

  // -- calling -------------------------------------------------------------

  private *callFunction(
    fn: Callable,
    args: unknown[],
    thisArg: unknown,
    line: number,
  ): Generator<Suspend, unknown> {
    if (fn.__kind === "native") {
      return yield* fn.call(args, thisArg, line);
    }
    if (this.machine.frameDepth > MAX_CALL_DEPTH) {
      this.fail("RangeError", "Maximum call stack size exceeded");
    }
    if (fn.isAsync) {
      // Calling an async function never suspends the caller: it runs until the
      // first `await`, then hands back a pending promise.
      return this.startAsync(fn, args, thisArg, line);
    }
    return yield* this.invokeBody(fn, args, thisArg, line);
  }

  private *invokeBody(
    fn: VFunction,
    args: unknown[],
    thisArg: unknown,
    line: number,
  ): Generator<Suspend, unknown> {
    const machine = this.machine;
    const scope = new Scope(fn.closure);
    yield* this.bindParams(fn, args, scope);

    const label = functionLabel(fn);
    machine.pushFrame(label, fn.isAsync ? "async" : "sync", fn.body.line);
    machine.snap(`Call ${label} — pushed onto the call stack`, "sync", fn.body.line);

    let popped = false;
    const pop = () => {
      if (!popped) {
        popped = true;
        machine.popFrame();
      }
    };

    try {
      let value: unknown;
      if (fn.isExpressionBody) {
        value = yield* this.evaluate(fn.body, scope, fn.isArrow ? thisArg : undefined);
      } else {
        hoist((fn.body.body as Node[]) ?? [], scope, this);
        const completion = yield* this.execStatements((fn.body.body as Node[]) ?? [], scope, thisArg);
        value = completion.type === "return" ? completion.value : undefined;
      }
      pop();
      machine.snap(`${label} returned — popped off the call stack`, "sync", line);
      return value;
    } catch (err) {
      pop();
      throw err;
    }
  }

  /**
   * Starts an async function. The returned promise is handed back
   * synchronously; the body continues on microtasks from here on.
   */
  private startAsync(fn: VFunction, args: unknown[], thisArg: unknown, line: number): VPromise {
    const label = functionLabel(fn);
    const promise = this.makePromise(label);
    const generator = this.invokeBody(fn, args, thisArg, line);
    this.stepAsync(generator, promise, label, { type: "next", value: undefined }, line);
    return promise;
  }

  /** Advances a suspended async body by one segment, between two awaits. */
  private stepAsync(
    generator: Generator<Suspend, unknown>,
    promise: VPromise,
    label: string,
    resume: Resume,
    line: number,
  ) {
    const machine = this.machine;
    const attachDepth = machine.frameDepth;

    if (resume.frames && resume.frames.length > 0) {
      machine.attachFrames(resume.frames);
      machine.snap(`Resuming ${label} — its frames go back on the call stack`, "resume", line);
    }

    let result: IteratorResult<Suspend, unknown>;
    try {
      result =
        resume.type === "next"
          ? generator.next(resume.value)
          : generator.throw(new VThrow(resume.value));
    } catch (err) {
      if (err instanceof BudgetExceeded) throw err;
      machine.truncateFrames(attachDepth);
      if (err instanceof VThrow) {
        machine.settle(promise, "rejected", err.value, line);
        return;
      }
      throw err;
    }

    if (result.done) {
      // An async function that returns a promise adopts it, which is where the
      // "extra tick" in `return somePromise` comes from.
      const value = result.value;
      if (isPromise(value)) {
        machine.subscribe(
          value,
          (v) => machine.settle(promise, "fulfilled", v, line),
          (e) => machine.settle(promise, "rejected", e, line),
          `${label} adopting its returned promise`,
          line,
        );
      } else {
        machine.settle(promise, "fulfilled", value, line);
      }
      return;
    }

    const awaited = result.value.promise;
    const frames = machine.detachFrames(attachDepth);
    machine.snap(
      `await suspends ${label}. Its frames leave the stack, so the caller carries on and the loop stays free.`,
      "suspend",
      line,
    );

    machine.subscribe(
      awaited,
      (value) => this.stepAsync(generator, promise, label, { type: "next", value, frames }, line),
      (value) => this.stepAsync(generator, promise, label, { type: "throw", value, frames }, line),
      `resume ${label} after await`,
      line,
    );
  }

  // -- binding -------------------------------------------------------------

  private *bindParams(fn: VFunction, args: unknown[], scope: Scope): Generator<Suspend, void> {
    for (let i = 0; i < fn.params.length; i++) {
      const param = fn.params[i];
      if (param.type === "RestElement") {
        yield* this.bindPattern(param.argument as Node, args.slice(i), scope, "param");
        return;
      }
      yield* this.bindPattern(param, args[i], scope, "param");
    }
  }

  private *bindPattern(
    pattern: Node,
    value: unknown,
    scope: Scope,
    kind: "var" | "let" | "const" | "param",
  ): Generator<Suspend, void> {
    switch (pattern.type) {
      case "Identifier":
        scope.declare(pattern.name as string, value, kind);
        return;

      case "AssignmentPattern": {
        const resolved =
          value === undefined ? yield* this.evaluate(pattern.right as Node, scope) : value;
        yield* this.bindPattern(pattern.left as Node, resolved, scope, kind);
        return;
      }

      case "ArrayPattern": {
        const source = Array.isArray(value)
          ? value
          : typeof value === "string"
            ? value.split("")
            : this.fail("TypeError", `${describeValue(value)} is not iterable`);
        const elements = pattern.elements as (Node | null)[];
        for (let i = 0; i < elements.length; i++) {
          const element = elements[i];
          if (!element) continue;
          if (element.type === "RestElement") {
            yield* this.bindPattern(element.argument as Node, source.slice(i), scope, kind);
            return;
          }
          yield* this.bindPattern(element, source[i], scope, kind);
        }
        return;
      }

      case "ObjectPattern": {
        if (value === null || value === undefined) {
          this.fail("TypeError", `Cannot destructure ${describeValue(value)}`);
        }
        const taken = new Set<string>();
        for (const property of pattern.properties as Node[]) {
          const key = property.key as string;
          taken.add(key);
          yield* this.bindPattern(
            property.value as Node,
            getMember(this, value, key),
            scope,
            kind,
          );
        }
        if (pattern.rest) {
          const rest: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            if (!taken.has(k)) rest[k] = v;
          }
          yield* this.bindPattern(pattern.rest as Node, rest, scope, kind);
        }
        return;
      }

      default:
        this.fail("SyntaxError", `Unsupported binding pattern: ${pattern.type}`);
    }
  }

  // -- statements ----------------------------------------------------------

  private *execStatements(
    statements: Node[],
    scope: Scope,
    thisArg?: unknown,
  ): Generator<Suspend, Completion> {
    for (const statement of statements) {
      const completion = yield* this.execute(statement, scope, thisArg);
      if (completion.type !== "normal") return completion;
    }
    return NORMAL;
  }

  private *execute(node: Node, scope: Scope, thisArg?: unknown): Generator<Suspend, Completion> {
    const machine = this.machine;
    machine.tickStep();
    machine.setLine(node.line);

    switch (node.type) {
      case "EmptyStatement":
      case "FunctionDeclaration":
        // Both were handled during hoisting.
        return NORMAL;

      case "VariableDeclaration": {
        for (const declarator of node.declarations as Node[]) {
          const value = declarator.init
            ? yield* this.evaluate(declarator.init as Node, scope, thisArg)
            : undefined;
          yield* this.bindPattern(
            declarator.id as Node,
            value,
            scope,
            node.kind as "var" | "let" | "const",
          );
        }
        return NORMAL;
      }

      case "ExpressionStatement": {
        const expression = node.expression as Node;
        yield* this.evaluate(expression, scope, thisArg);
        // Calls, awaits and assignments record their own, more specific
        // snapshots; a second generic one here would just be noise.
        if (
          expression.type !== "CallExpression" &&
          expression.type !== "AwaitExpression" &&
          expression.type !== "AssignmentExpression"
        ) {
          machine.snap(`Line ${node.line} runs`, "sync", node.line);
        }
        return NORMAL;
      }

      case "BlockStatement":
        return yield* this.execStatements(node.body as Node[], new Scope(scope), thisArg);

      case "IfStatement": {
        const test = yield* this.evaluate(node.test as Node, scope, thisArg);
        if (truthy(test)) return yield* this.execute(node.consequent as Node, scope, thisArg);
        if (node.alternate) return yield* this.execute(node.alternate as Node, scope, thisArg);
        return NORMAL;
      }

      case "WhileStatement": {
        for (;;) {
          machine.tickStep();
          if (!truthy(yield* this.evaluate(node.test as Node, scope, thisArg))) break;
          const completion = yield* this.execute(node.body as Node, scope, thisArg);
          if (completion.type === "break") break;
          if (completion.type === "return") return completion;
        }
        return NORMAL;
      }

      case "DoWhileStatement": {
        for (;;) {
          machine.tickStep();
          const completion = yield* this.execute(node.body as Node, scope, thisArg);
          if (completion.type === "break") break;
          if (completion.type === "return") return completion;
          if (!truthy(yield* this.evaluate(node.test as Node, scope, thisArg))) break;
        }
        return NORMAL;
      }

      case "ForStatement":
        return yield* this.execFor(node, scope, thisArg);

      case "ForOfStatement":
        return yield* this.execForOf(node, scope, thisArg);

      case "ReturnStatement": {
        const value = node.argument
          ? yield* this.evaluate(node.argument as Node, scope, thisArg)
          : undefined;
        return { type: "return", value };
      }

      case "BreakStatement":
        return { type: "break" };

      case "ContinueStatement":
        return { type: "continue" };

      case "ThrowStatement": {
        const value = yield* this.evaluate(node.argument as Node, scope, thisArg);
        machine.snap(`throw — unwinding the stack`, "error", node.line);
        throw new VThrow(value);
      }

      case "TryStatement":
        return yield* this.execTry(node, scope, thisArg);

      default:
        this.fail("SyntaxError", `Unsupported statement: ${node.type}`);
    }
  }

  /**
   * `for` with per-iteration bindings for `let`/`const`, which is what makes
   * `for (let i …) setTimeout(() => log(i))` print 0,1,2 while `var` prints
   * 3,3,3. That difference is one of the headline demos, so it has to be real.
   */
  private *execFor(node: Node, scope: Scope, thisArg: unknown): Generator<Suspend, Completion> {
    const machine = this.machine;
    const init = node.init as Node | null;
    const perIteration =
      init?.type === "VariableDeclaration" && (init.kind === "let" || init.kind === "const");

    let loopScope = new Scope(scope);
    if (init) yield* this.execute(init, loopScope, thisArg);

    const loopNames = perIteration ? loopScope.ownNames() : [];

    /** Fresh environment per iteration, seeded from the previous one. */
    const copyBindings = (from: Scope): Scope => {
      const next = new Scope(scope);
      for (const name of loopNames) next.declare(name, from.lookup(name)?.value, "let");
      return next;
    };

    if (perIteration) loopScope = copyBindings(loopScope);

    for (;;) {
      machine.tickStep();
      if (node.test && !truthy(yield* this.evaluate(node.test as Node, loopScope, thisArg))) break;

      const completion = yield* this.execute(node.body as Node, new Scope(loopScope), thisArg);
      if (completion.type === "break") break;
      if (completion.type === "return") return completion;

      // The update runs in the *next* iteration's environment, so each
      // closure created in the body keeps the value it saw.
      if (perIteration) loopScope = copyBindings(loopScope);
      if (node.update) yield* this.evaluate(node.update as Node, loopScope, thisArg);
    }
    return NORMAL;
  }

  private *execForOf(node: Node, scope: Scope, thisArg: unknown): Generator<Suspend, Completion> {
    const machine = this.machine;
    const iterable = yield* this.evaluate(node.right as Node, scope, thisArg);

    const items = Array.isArray(iterable)
      ? iterable.slice()
      : typeof iterable === "string"
        ? iterable.split("")
        : this.fail("TypeError", `${describeValue(iterable)} is not iterable`);

    const left = node.left as Node;
    const declaration = left.type === "VariableDeclaration" ? left : null;
    const pattern = declaration
      ? ((declaration.declarations as Node[])[0].id as Node)
      : ((left.expression as Node) ?? left);

    for (const item of items) {
      machine.tickStep();
      const iterationScope = new Scope(scope);
      if (declaration) {
        yield* this.bindPattern(
          pattern,
          item,
          iterationScope,
          declaration.kind as "var" | "let" | "const",
        );
      } else {
        yield* this.assignTo(pattern, item, scope, thisArg);
      }

      const completion = yield* this.execute(node.body as Node, iterationScope, thisArg);
      if (completion.type === "break") break;
      if (completion.type === "return") return completion;
    }
    return NORMAL;
  }

  private *execTry(node: Node, scope: Scope, thisArg: unknown): Generator<Suspend, Completion> {
    const machine = this.machine;
    const depth = machine.frameDepth;
    let completion: Completion = NORMAL;
    let pendingError: unknown = null;

    try {
      completion = yield* this.execute(node.block as Node, scope, thisArg);
    } catch (err) {
      if (err instanceof BudgetExceeded || !(err instanceof VThrow)) throw err;

      const handler = node.handler as Node | null;
      if (handler) {
        // Frames unwound past by the throw are gone for good.
        machine.truncateFrames(depth);
        const catchScope = new Scope(scope);
        if (handler.param) {
          yield* this.bindPattern(handler.param as Node, err.value, catchScope, "let");
        }
        machine.snap(`Caught by catch on line ${handler.line}`, "sync", handler.line);
        try {
          completion = yield* this.execute(handler.body as Node, catchScope, thisArg);
        } catch (nested) {
          if (nested instanceof BudgetExceeded) throw nested;
          pendingError = nested;
        }
      } else {
        pendingError = err;
      }
    }

    if (node.finalizer) {
      const finalCompletion = yield* this.execute(node.finalizer as Node, scope, thisArg);
      // A `return` or `break` inside `finally` wins over everything else.
      if (finalCompletion.type !== "normal") return finalCompletion;
    }

    if (pendingError) throw pendingError;
    return completion;
  }

  // -- expressions ---------------------------------------------------------

  private *evaluate(node: Node, scope: Scope, thisArg?: unknown): Generator<Suspend, unknown> {
    const machine = this.machine;
    machine.tickStep();

    switch (node.type) {
      case "Literal":
        return node.value;

      case "ThisExpression":
        return thisArg;

      case "Identifier": {
        const name = node.name as string;
        const binding = scope.lookup(name);
        if (!binding) this.fail("ReferenceError", `${name} is not defined`);
        return binding.value;
      }

      case "TemplateLiteral": {
        const quasis = node.quasis as string[];
        const expressions = node.expressions as Node[];
        let out = quasis[0] ?? "";
        for (let i = 0; i < expressions.length; i++) {
          out += toStringValue(yield* this.evaluate(expressions[i], scope, thisArg));
          out += quasis[i + 1] ?? "";
        }
        return out;
      }

      case "ArrayExpression": {
        const values: unknown[] = [];
        for (const element of node.elements as Node[]) {
          if (element.type === "SpreadElement") {
            const spread = yield* this.evaluate(element.argument as Node, scope, thisArg);
            if (!Array.isArray(spread)) this.fail("TypeError", "Only arrays can be spread here");
            values.push(...spread);
          } else {
            values.push(yield* this.evaluate(element, scope, thisArg));
          }
        }
        return values;
      }

      case "ObjectExpression": {
        const object: Record<string, unknown> = {};
        for (const property of node.properties as Node[]) {
          if (property.type === "SpreadElement") {
            const spread = yield* this.evaluate(property.argument as Node, scope, thisArg);
            if (spread && typeof spread === "object") Object.assign(object, spread);
            continue;
          }
          const key = property.computed
            ? toStringValue(yield* this.evaluate(property.key as Node, scope, thisArg))
            : (property.key as string);
          object[key] = yield* this.evaluate(property.value as Node, scope, thisArg);
        }
        return object;
      }

      case "FunctionExpression":
      case "ArrowFunctionExpression":
        return makeFunction(node, scope, thisArg);

      case "UnaryExpression": {
        const operator = node.operator as string;
        if (operator === "typeof") {
          // `typeof undeclared` is the one read that must not throw.
          const argument = node.argument as Node;
          if (argument.type === "Identifier" && !scope.has(argument.name as string)) {
            return "undefined";
          }
        }
        const value = yield* this.evaluate(node.argument as Node, scope, thisArg);
        switch (operator) {
          case "!": return !truthy(value);
          case "-": return -(value as number);
          case "+": return +(value as number);
          case "~": return ~(value as number);
          case "void": return undefined;
          case "typeof": return typeOf(value);
          case "delete": return true;
        }
        this.fail("SyntaxError", `Unsupported operator ${operator}`);
        break;
      }

      case "UpdateExpression": {
        const target = node.argument as Node;
        const before = Number(yield* this.evaluate(target, scope, thisArg));
        const after = node.operator === "++" ? before + 1 : before - 1;
        yield* this.assignTo(target, after, scope, thisArg);
        return node.prefix ? after : before;
      }

      case "BinaryExpression": {
        const left = yield* this.evaluate(node.left as Node, scope, thisArg);
        const right = yield* this.evaluate(node.right as Node, scope, thisArg);
        return binary(node.operator as string, left, right, this);
      }

      case "LogicalExpression": {
        const operator = node.operator as string;
        const left = yield* this.evaluate(node.left as Node, scope, thisArg);
        if (operator === "&&" && !truthy(left)) return left;
        if (operator === "||" && truthy(left)) return left;
        if (operator === "??" && left !== null && left !== undefined) return left;
        return yield* this.evaluate(node.right as Node, scope, thisArg);
      }

      case "ConditionalExpression": {
        const test = yield* this.evaluate(node.test as Node, scope, thisArg);
        return yield* this.evaluate(
          (truthy(test) ? node.consequent : node.alternate) as Node,
          scope,
          thisArg,
        );
      }

      case "SequenceExpression": {
        let last: unknown;
        for (const expression of node.expressions as Node[]) {
          last = yield* this.evaluate(expression, scope, thisArg);
        }
        return last;
      }

      case "AssignmentExpression": {
        const operator = node.operator as string;
        const left = node.left as Node;

        if (operator === "=") {
          const value = yield* this.evaluate(node.right as Node, scope, thisArg);
          yield* this.assignTo(left, value, scope, thisArg);
          return value;
        }

        // Logical assignment short-circuits: it does not evaluate the right
        // side, and does not assign at all, when the test already passes.
        if (operator === "&&=" || operator === "||=" || operator === "??=") {
          const current = yield* this.evaluate(left, scope, thisArg);
          const shouldAssign =
            operator === "&&="
              ? truthy(current)
              : operator === "||="
                ? !truthy(current)
                : current === null || current === undefined;
          if (!shouldAssign) return current;
          const value = yield* this.evaluate(node.right as Node, scope, thisArg);
          yield* this.assignTo(left, value, scope, thisArg);
          return value;
        }

        const current = yield* this.evaluate(left, scope, thisArg);
        const operand = yield* this.evaluate(node.right as Node, scope, thisArg);
        const value = binary(operator.slice(0, -1), current, operand, this);
        yield* this.assignTo(left, value, scope, thisArg);
        return value;
      }

      case "MemberExpression": {
        const object = yield* this.evaluate(node.object as Node, scope, thisArg);
        if (node.optional && (object === null || object === undefined)) return undefined;
        const key = node.computed
          ? toStringValue(yield* this.evaluate(node.property as Node, scope, thisArg))
          : (node.property as string);
        return getMember(this, object, key);
      }

      case "CallExpression":
        return yield* this.evalCall(node, scope, thisArg);

      case "NewExpression": {
        const callee = yield* this.evaluate(node.callee as Node, scope, thisArg);
        const args = yield* this.evalArguments(node.arguments as Node[], scope, thisArg);
        if (!isCallable(callee) || callee.__kind !== "native" || !callee.construct) {
          this.fail("TypeError", `${describeValue(callee)} is not a constructor`);
        }
        this.machine.setLine(node.line);
        return callee.construct(args, node.line);
      }

      case "AwaitExpression": {
        const value = yield* this.evaluate(node.argument as Node, scope, thisArg);
        const promise = this.toPromise(value, node.line);
        this.machine.setLine(node.line);
        // Handing control back to `stepAsync`, which parks the continuation on
        // the awaited promise. Everything after this line is a microtask.
        return yield { promise };
      }

      default:
        this.fail("SyntaxError", `Unsupported expression: ${node.type}`);
    }
  }

  private *evalArguments(
    nodes: Node[],
    scope: Scope,
    thisArg: unknown,
  ): Generator<Suspend, unknown[]> {
    const args: unknown[] = [];
    for (const node of nodes) {
      if (node.type === "SpreadElement") {
        const spread = yield* this.evaluate(node.argument as Node, scope, thisArg);
        if (!Array.isArray(spread)) this.fail("TypeError", "Only arrays can be spread here");
        args.push(...spread);
      } else {
        args.push(yield* this.evaluate(node, scope, thisArg));
      }
    }
    return args;
  }

  private *evalCall(node: Node, scope: Scope, thisArg: unknown): Generator<Suspend, unknown> {
    const callee = node.callee as Node;

    // A method call has to keep its receiver, so `obj.fn()` sees `this`.
    let target: unknown;
    let receiver: unknown;

    if (callee.type === "MemberExpression") {
      receiver = yield* this.evaluate(callee.object as Node, scope, thisArg);
      if (callee.optional && (receiver === null || receiver === undefined)) return undefined;
      const key = callee.computed
        ? toStringValue(yield* this.evaluate(callee.property as Node, scope, thisArg))
        : (callee.property as string);
      target = getMember(this, receiver, key);
    } else {
      target = yield* this.evaluate(callee, scope, thisArg);
    }

    if (node.optional && (target === null || target === undefined)) return undefined;

    const args = yield* this.evalArguments(node.arguments as Node[], scope, thisArg);
    this.machine.setLine(node.line);

    if (!isCallable(target)) {
      this.fail("TypeError", `${describeCallee(callee)} is not a function`);
    }
    return yield* this.callFunction(target, args, receiver, node.line);
  }

  /** Writes to an assignment target: a name, or a member of an object. */
  private *assignTo(
    target: Node,
    value: unknown,
    scope: Scope,
    thisArg: unknown,
  ): Generator<Suspend, void> {
    if (target.type === "Identifier") {
      const name = target.name as string;
      const result = scope.assign(name, value);
      if (result === "const") this.fail("TypeError", `Assignment to constant variable '${name}'`);
      // Assigning to an undeclared name creates a global, as sloppy mode does.
      if (result === "undeclared") this.globalScope.declare(name, value, "var");
      return;
    }

    if (target.type === "MemberExpression") {
      const object = yield* this.evaluate(target.object as Node, scope, thisArg);
      const key = target.computed
        ? toStringValue(yield* this.evaluate(target.property as Node, scope, thisArg))
        : (target.property as string);
      setMember(this, object, key, value);
      return;
    }

    this.fail("SyntaxError", `Cannot assign to ${target.type}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFunction(node: Node, scope: Scope, thisArg: unknown): VFunction {
  const isArrow = node.type === "ArrowFunctionExpression";
  return {
    __kind: "function",
    name: (node.name as string | null) ?? null,
    params: (node.params as Node[]) ?? [],
    body: node.body as Node,
    isExpressionBody: Boolean(node.expression),
    isAsync: Boolean(node.async),
    isArrow,
    closure: scope,
    boundThis: isArrow ? thisArg : undefined,
  };
}

function functionLabel(fn: VFunction): string {
  if (fn.name) return `${fn.name}()`;
  return fn.isArrow ? "(arrow)()" : "(anonymous)()";
}

/**
 * Hoists function declarations and `var` bindings into `scope` before the body
 * runs, so a function can be called from above its definition.
 */
function hoist(statements: Node[], scope: Scope, interp: Interpreter) {
  for (const statement of statements) {
    switch (statement.type) {
      case "FunctionDeclaration":
        scope.declare(statement.name as string, makeFunction(statement, scope, undefined), "var");
        break;
      case "VariableDeclaration":
        if (statement.kind === "var") {
          for (const declarator of statement.declarations as Node[]) {
            for (const name of patternNames(declarator.id as Node)) {
              if (!scope.has(name)) scope.declare(name, undefined, "var");
            }
          }
        }
        break;
      // `var` is function-scoped, so hoisting descends through blocks and
      // loops — but never into a nested function, which has its own scope.
      case "BlockStatement":
        hoist(statement.body as Node[], scope, interp);
        break;
      case "IfStatement":
        hoist([statement.consequent as Node], scope, interp);
        if (statement.alternate) hoist([statement.alternate as Node], scope, interp);
        break;
      case "ForStatement":
      case "ForOfStatement":
      case "WhileStatement":
      case "DoWhileStatement":
        hoist([statement.body as Node], scope, interp);
        break;
      case "TryStatement":
        hoist([statement.block as Node], scope, interp);
        if (statement.handler) hoist([(statement.handler as Node).body as Node], scope, interp);
        if (statement.finalizer) hoist([statement.finalizer as Node], scope, interp);
        break;
    }
  }
}

function patternNames(pattern: Node): string[] {
  switch (pattern.type) {
    case "Identifier":
      return [pattern.name as string];
    case "AssignmentPattern":
      return patternNames(pattern.left as Node);
    case "RestElement":
      return patternNames(pattern.argument as Node);
    case "ArrayPattern":
      return (pattern.elements as (Node | null)[]).flatMap((e) => (e ? patternNames(e) : []));
    case "ObjectPattern": {
      const names = (pattern.properties as Node[]).flatMap((p) => patternNames(p.value as Node));
      return pattern.rest ? [...names, ...patternNames(pattern.rest as Node)] : names;
    }
    default:
      return [];
  }
}

function truthy(value: unknown): boolean {
  if (isPromise(value) || isCallable(value) || isVError(value)) return true;
  return Boolean(value);
}

function typeOf(value: unknown): string {
  if (value === null) return "object";
  if (isCallable(value)) return "function";
  if (isPromise(value) || isVError(value)) return "object";
  return typeof value;
}

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  if (isPromise(value)) return "a Promise";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "object") return "an object";
  return String(value);
}

function describeCallee(callee: Node): string {
  if (callee.type === "Identifier") return String(callee.name);
  if (callee.type === "MemberExpression" && !callee.computed) {
    const object = callee.object as Node;
    const prefix = object.type === "Identifier" ? `${String(object.name)}.` : "";
    return `${prefix}${String(callee.property)}`;
  }
  return "expression";
}

function binary(operator: string, left: unknown, right: unknown, interp: Interpreter): unknown {
  const l = left as number;
  const r = right as number;

  switch (operator) {
    case "+":
      if (typeof left === "string" || typeof right === "string") {
        return toStringValue(left) + toStringValue(right);
      }
      return l + r;
    case "-": return l - r;
    case "*": return l * r;
    case "/": return l / r;
    case "%": return l % r;
    case "**": return l ** r;
    case "==": return left == right;
    case "!=": return left != right;
    case "===": return left === right;
    case "!==": return left !== right;
    case "<": return (left as number) < (right as number);
    case ">": return (left as number) > (right as number);
    case "<=": return (left as number) <= (right as number);
    case ">=": return (left as number) >= (right as number);
    case "&": return l & r;
    case "|": return l | r;
    case "^": return l ^ r;
    case "instanceof": return isVError(left) && isCallable(right);
    case "in": return typeof right === "object" && right !== null && toStringValue(left) in right;
  }
  interp.fail("SyntaxError", `Unsupported operator ${operator}`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses and runs `source`, returning the recorded trace. Never throws:
 * failures are reported inside the trace so the UI can show them in place.
 */
export function buildTrace(source: string, runtime: Runtime): Trace {
  resetPromiseIds();

  let program: Node;
  try {
    program = parse(source);
  } catch (err) {
    const message =
      err instanceof ParseError ? `Line ${err.line}: ${err.message}` : String(err);
    return { runtime, snapshots: [], logs: [], error: message, truncated: false };
  }

  const interpreter = new Interpreter(runtime);
  interpreter.run(program);

  const machine = interpreter.machine;
  return {
    runtime,
    snapshots: machine.snapshots,
    logs: machine.logs,
    error: machine.error,
    truncated: machine.truncated,
  };
}
