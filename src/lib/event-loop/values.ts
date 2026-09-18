/**
 * Runtime values for the interpreter.
 *
 * Primitives, plain objects, and arrays are represented as their real
 * JavaScript counterparts — that keeps arithmetic and property access cheap
 * and correct. Only the three things the visualiser needs to *own* get custom
 * representations: functions (so we can step into them), promises (so the
 * machine, not V8, decides when reactions run), and errors.
 */

import type { Node } from "./parser";

/** A function defined in the user's code. */
export type VFunction = {
  __kind: "function";
  name: string | null;
  params: Node[];
  body: Node;
  /** Arrow bodies that are a bare expression, e.g. `x => x * 2`. */
  isExpressionBody: boolean;
  isAsync: boolean;
  isArrow: boolean;
  closure: Scope;
  /** `this` captured at definition time, for arrows. */
  boundThis?: unknown;
};

/** A function provided by the host (console.log, setTimeout, Promise.all…). */
export type NativeFunction = {
  __kind: "native";
  name: string;
  /**
   * Natives are generators so that a few of them (`Promise.all`, array
   * callbacks like `.map`) can call back into interpreted code, which may
   * itself suspend.
   */
  call: (args: unknown[], thisArg: unknown, line: number) => Generator<Suspend, unknown>;
  /** Set on natives usable with `new`, e.g. `Promise` and `Error`. */
  construct?: (args: unknown[], line: number) => unknown;
  /** Static members, e.g. `Promise.all` or `Math.max`. */
  props?: Record<string, unknown>;
};

export type Callable = VFunction | NativeFunction;

/** The one thing a generator in this interpreter ever yields: "I hit an await". */
export type Suspend = { promise: VPromise };

export type PromiseState = "pending" | "fulfilled" | "rejected";

export type Reaction = {
  onFulfilled: ((value: unknown) => void) | null;
  onRejected: ((reason: unknown) => void) | null;
};

let nextPromiseId = 1;

export function resetPromiseIds() {
  nextPromiseId = 1;
}

/**
 * A promise whose reactions are queued on the machine's microtask queue
 * rather than the host's. Everything about ordering that the playground
 * teaches depends on owning this.
 */
export class VPromise {
  readonly __kind = "promise" as const;
  readonly id = nextPromiseId++;
  state: PromiseState = "pending";
  value: unknown = undefined;
  /** Drained into the microtask queue the moment the promise settles. */
  reactions: Reaction[] = [];
  /** Tracks whether a rejection ever got a handler, for unhandled warnings. */
  handled = false;
  /** Set when this promise came from an async function, purely for labels. */
  originLabel: string | null = null;
}

/** A thrown value travelling through interpreted code. */
export class VThrow {
  constructor(readonly value: unknown) {}
}

/** An `Error` object as the interpreter models it. */
export type VError = {
  __kind: "error";
  name: string;
  message: string;
};

export function makeError(name: string, message: string): VError {
  return { __kind: "error", name, message };
}

export function isCallable(v: unknown): v is Callable {
  return (
    typeof v === "object" &&
    v !== null &&
    ((v as { __kind?: string }).__kind === "function" ||
      (v as { __kind?: string }).__kind === "native")
  );
}

export function isPromise(v: unknown): v is VPromise {
  return v instanceof VPromise;
}

export function isVError(v: unknown): v is VError {
  return typeof v === "object" && v !== null && (v as { __kind?: string }).__kind === "error";
}

// ---------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------

export type Binding = { value: unknown; kind: "var" | "let" | "const" | "param" };

export class Scope {
  private readonly bindings = new Map<string, Binding>();

  constructor(readonly parent: Scope | null = null) {}

  declare(name: string, value: unknown, kind: Binding["kind"]) {
    this.bindings.set(name, { value, kind });
  }

  /** Names bound directly in this scope, used to copy per-iteration `let`s. */
  ownNames(): string[] {
    return Array.from(this.bindings.keys());
  }

  has(name: string): boolean {
    return this.bindings.has(name) || (this.parent?.has(name) ?? false);
  }

  lookup(name: string): Binding | undefined {
    return this.bindings.get(name) ?? this.parent?.lookup(name);
  }

  /** Returns false when the name was never declared, so callers can throw. */
  assign(name: string, value: unknown): "ok" | "const" | "undeclared" {
    const own = this.bindings.get(name);
    if (own) {
      if (own.kind === "const") return "const";
      own.value = value;
      return "ok";
    }
    return this.parent ? this.parent.assign(name, value) : "undeclared";
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function functionLabel(fn: Callable): string {
  const name = fn.name;
  if (fn.__kind === "native") return `ƒ ${name}()`;
  return name ? `ƒ ${name}()` : "ƒ (anonymous)";
}

/**
 * Renders a value the way `console.log` would, with a depth limit so a cyclic
 * or deep structure cannot lock up the trace builder.
 */
export function formatValue(value: unknown, depth = 0, seen = new Set<object>()): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";

  const type = typeof value;
  if (type === "number" || type === "boolean") return String(value);
  if (type === "string") return depth === 0 ? (value as string) : JSON.stringify(value);

  if (isPromise(value)) {
    if (value.state === "pending") return `Promise { <pending> }`;
    if (value.state === "rejected") {
      return `Promise { <rejected> ${formatValue(value.value, depth + 1, seen)} }`;
    }
    return `Promise { ${formatValue(value.value, depth + 1, seen)} }`;
  }
  if (isCallable(value)) return functionLabel(value);
  if (isVError(value)) return `${value.name}: ${value.message}`;

  if (typeof value === "object") {
    const obj = value as object;
    if (seen.has(obj)) return "[Circular]";
    if (depth > 4) return Array.isArray(obj) ? "[Array]" : "[Object]";
    seen.add(obj);

    try {
      if (Array.isArray(obj)) {
        const parts = obj.map((item) => formatValue(item, depth + 1, seen));
        const body = parts.join(", ");
        return body.length > 72 ? `[\n  ${parts.join(",\n  ")}\n]` : `[ ${body} ]`;
      }

      const entries = Object.entries(obj as Record<string, unknown>);
      if (entries.length === 0) return "{}";
      const parts = entries.map(([k, v]) => `${k}: ${formatValue(v, depth + 1, seen)}`);
      const body = parts.join(", ");
      return body.length > 72 ? `{\n  ${parts.join(",\n  ")}\n}` : `{ ${body} }`;
    } finally {
      seen.delete(obj);
    }
  }

  return String(value);
}

/**
 * JavaScript's `String(value)` coercion, as opposed to `formatValue`'s
 * console-style rendering. Template holes, `join`, and `+` use this — which is
 * why `` `${{}}` `` gives "[object Object]" here exactly as it does for real.
 */
export function toStringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (isVError(value)) return `${value.name}: ${value.message}`;
  if (isPromise(value)) return "[object Promise]";
  if (isCallable(value)) return `function ${value.name ?? ""}`;
  if (Array.isArray(value)) return value.map(toStringValue).join(",");
  return "[object Object]";
}

/** Short one-line form used inside queue chips and narration sentences. */
export function shortValue(value: unknown): string {
  const text = formatValue(value, 1).replace(/\s+/g, " ");
  return text.length > 28 ? `${text.slice(0, 27)}…` : text;
}

/** Best-effort name for a callback, used to label queued jobs. */
export function callableName(fn: unknown, fallback: string): string {
  if (!isCallable(fn)) return fallback;
  return fn.name ?? fallback;
}
