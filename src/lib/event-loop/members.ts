/**
 * Property and method access on runtime values.
 *
 * Only an explicit allow-list of methods resolves. Reaching a real prototype
 * would both leak the host environment into the sandbox and let a snippet do
 * things the visualiser cannot describe, so anything unlisted is a clear
 * "not supported here" error instead.
 */

import type { Host } from "./host";
import {
  type NativeFunction,
  type Suspend,
  VPromise,
  isCallable,
  isPromise,
  isVError,
  toStringValue,
} from "./values";

/** Wraps a plain function as a native, since every native is a generator. */
export function nativeSync(
  name: string,
  impl: (args: unknown[], thisArg: unknown, line: number) => unknown,
): NativeFunction {
  return {
    __kind: "native",
    name,
    *call(args, thisArg, line) {
      return impl(args, thisArg, line);
    },
  };
}

/** A native that may call back into interpreted code, and so may suspend. */
export function nativeGen(
  name: string,
  impl: (args: unknown[], thisArg: unknown, line: number) => Generator<Suspend, unknown>,
): NativeFunction {
  return { __kind: "native", name, call: impl };
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v));

// ---------------------------------------------------------------------------
// Arrays
// ---------------------------------------------------------------------------

function arrayMember(host: Host, arr: unknown[], key: string): unknown {
  switch (key) {
    case "length":
      return arr.length;

    case "push":
      return nativeSync("push", (args) => arr.push(...args));
    case "pop":
      return nativeSync("pop", () => arr.pop());
    case "shift":
      return nativeSync("shift", () => arr.shift());
    case "unshift":
      return nativeSync("unshift", (args) => arr.unshift(...args));
    case "slice":
      return nativeSync("slice", (args) => arr.slice(args[0] as number, args[1] as number));
    case "splice":
      return nativeSync("splice", (args) =>
        arr.splice(num(args[0]), args.length > 1 ? num(args[1]) : arr.length, ...args.slice(2)),
      );
    case "concat":
      return nativeSync("concat", (args) => arr.concat(...(args as unknown[][])));
    case "join":
      // `join` skips null/undefined entirely, as the real method does.
      return nativeSync("join", (args) =>
        arr
          .map((v) => (v === null || v === undefined ? "" : toStringValue(v)))
          .join(args[0] === undefined ? "," : String(args[0])),
      );
    case "indexOf":
      return nativeSync("indexOf", (args) => arr.indexOf(args[0]));
    case "includes":
      return nativeSync("includes", (args) => arr.includes(args[0]));
    case "reverse":
      return nativeSync("reverse", () => arr.reverse());
    case "at":
      return nativeSync("at", (args) => arr[num(args[0]) < 0 ? arr.length + num(args[0]) : num(args[0])]);
    case "flat":
      return nativeSync("flat", () => arr.flat(Infinity));

    case "forEach":
      return nativeGen("forEach", function* (args, _thisArg, line) {
        for (let i = 0; i < arr.length; i++) yield* host.call(args[0], [arr[i], i, arr], undefined, line);
        return undefined;
      });
    case "map":
      return nativeGen("map", function* (args, _thisArg, line) {
        const out: unknown[] = [];
        for (let i = 0; i < arr.length; i++) {
          out.push(yield* host.call(args[0], [arr[i], i, arr], undefined, line));
        }
        return out;
      });
    case "filter":
      return nativeGen("filter", function* (args, _thisArg, line) {
        const out: unknown[] = [];
        for (let i = 0; i < arr.length; i++) {
          if (yield* host.call(args[0], [arr[i], i, arr], undefined, line)) out.push(arr[i]);
        }
        return out;
      });
    case "find":
      return nativeGen("find", function* (args, _thisArg, line) {
        for (let i = 0; i < arr.length; i++) {
          if (yield* host.call(args[0], [arr[i], i, arr], undefined, line)) return arr[i];
        }
        return undefined;
      });
    case "findIndex":
      return nativeGen("findIndex", function* (args, _thisArg, line) {
        for (let i = 0; i < arr.length; i++) {
          if (yield* host.call(args[0], [arr[i], i, arr], undefined, line)) return i;
        }
        return -1;
      });
    case "some":
      return nativeGen("some", function* (args, _thisArg, line) {
        for (let i = 0; i < arr.length; i++) {
          if (yield* host.call(args[0], [arr[i], i, arr], undefined, line)) return true;
        }
        return false;
      });
    case "every":
      return nativeGen("every", function* (args, _thisArg, line) {
        for (let i = 0; i < arr.length; i++) {
          if (!(yield* host.call(args[0], [arr[i], i, arr], undefined, line))) return false;
        }
        return true;
      });
    case "reduce":
      return nativeGen("reduce", function* (args, _thisArg, line) {
        let acc = args[1];
        let start = 0;
        if (args.length < 2) {
          if (arr.length === 0) host.fail("TypeError", "Reduce of empty array with no initial value");
          acc = arr[0];
          start = 1;
        }
        for (let i = start; i < arr.length; i++) {
          acc = yield* host.call(args[0], [acc, arr[i], i, arr], undefined, line);
        }
        return acc;
      });
    case "sort":
      // Insertion sort so the comparator can be interpreted code (and suspend).
      return nativeGen("sort", function* (args, _thisArg, line) {
        const comparator = args[0];
        for (let i = 1; i < arr.length; i++) {
          const item = arr[i];
          let j = i - 1;
          while (j >= 0) {
            const order = isCallable(comparator)
              ? num(yield* host.call(comparator, [arr[j], item], undefined, line))
              : String(arr[j]) > String(item)
                ? 1
                : -1;
            if (order <= 0) break;
            arr[j + 1] = arr[j];
            j--;
          }
          arr[j + 1] = item;
        }
        return arr;
      });
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Strings
// ---------------------------------------------------------------------------

function stringMember(str: string, key: string): unknown {
  switch (key) {
    case "length":
      return str.length;
    case "toUpperCase":
      return nativeSync("toUpperCase", () => str.toUpperCase());
    case "toLowerCase":
      return nativeSync("toLowerCase", () => str.toLowerCase());
    case "trim":
      return nativeSync("trim", () => str.trim());
    case "includes":
      return nativeSync("includes", (a) => str.includes(String(a[0])));
    case "startsWith":
      return nativeSync("startsWith", (a) => str.startsWith(String(a[0])));
    case "endsWith":
      return nativeSync("endsWith", (a) => str.endsWith(String(a[0])));
    case "indexOf":
      return nativeSync("indexOf", (a) => str.indexOf(String(a[0])));
    case "slice":
      return nativeSync("slice", (a) => str.slice(a[0] as number, a[1] as number));
    case "substring":
      return nativeSync("substring", (a) => str.substring(num(a[0]), a[1] === undefined ? undefined : num(a[1])));
    case "split":
      return nativeSync("split", (a) => str.split(a[0] === undefined ? "" : String(a[0])));
    case "repeat":
      return nativeSync("repeat", (a) => str.repeat(num(a[0])));
    case "padStart":
      return nativeSync("padStart", (a) => str.padStart(num(a[0]), a[1] === undefined ? " " : String(a[1])));
    case "padEnd":
      return nativeSync("padEnd", (a) => str.padEnd(num(a[0]), a[1] === undefined ? " " : String(a[1])));
    case "charAt":
      return nativeSync("charAt", (a) => str.charAt(num(a[0])));
    case "at":
      return nativeSync("at", (a) => str.at(num(a[0])));
    case "replace":
      return nativeSync("replace", (a) => str.split(String(a[0])).join(String(a[1])));
    case "replaceAll":
      return nativeSync("replaceAll", (a) => str.split(String(a[0])).join(String(a[1])));
    case "toString":
      return nativeSync("toString", () => str);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Promises
// ---------------------------------------------------------------------------

function promiseMember(host: Host, promise: VPromise, key: string): unknown {
  const machine = host.machine;

  const chain = (name: "then" | "catch" | "finally"): NativeFunction =>
    nativeGen(name, function* (args, _thisArg, line) {
      const derived = host.makePromise(`.${name}() result`);

      /**
       * Runs `handler` with the settled value and resolves `derived` with
       * whatever it produced. `passthrough` is what happens when there is no
       * handler for this outcome — the settlement simply flows onward.
       */
      const react =
        (handler: unknown, passthrough: "fulfilled" | "rejected") =>
        (value: unknown) => {
          if (!isCallable(handler)) {
            machine.settle(derived, passthrough, value, line);
            return;
          }
          try {
            // `finally` gets no argument and its result is discarded: the
            // original settlement passes straight through.
            const result = drain(
              host.call(handler, name === "finally" ? [] : [value], undefined, line),
            );
            if (name === "finally") {
              machine.settle(derived, passthrough, value, line);
              return;
            }
            if (isPromise(result)) {
              // Adopting another promise costs an extra microtask tick, same
              // as the real thing.
              machine.subscribe(
                result,
                (v) => machine.settle(derived, "fulfilled", v, line),
                (e) => machine.settle(derived, "rejected", e, line),
                "adopt chained promise",
                line,
              );
              return;
            }
            machine.settle(derived, "fulfilled", result, line);
          } catch (err) {
            machine.settle(derived, "rejected", unwrapThrow(err), line);
          }
        };

      const onFulfilled = name === "then" ? args[0] : name === "finally" ? args[0] : undefined;
      const onRejected = name === "then" ? args[1] : args[0];

      machine.subscribe(
        promise,
        react(onFulfilled, "fulfilled"),
        react(onRejected, "rejected"),
        name === "catch" ? ".catch callback" : `.${name} callback`,
        line,
      );

      return derived;
    });

  switch (key) {
    case "then":
      return chain("then");
    case "catch":
      return chain("catch");
    case "finally":
      return chain("finally");
  }
  return undefined;
}

/**
 * Runs a native generator that is known not to await. Promise reaction
 * handlers are invoked from microtasks, outside any async function, so a
 * suspension there has nowhere to go — that is exactly the situation real
 * JavaScript describes as "you cannot await outside an async function".
 */
export function drain(gen: Generator<Suspend, unknown>): unknown {
  const result = gen.next();
  if (!result.done) {
    throw new Error("`await` is only allowed inside an async function");
  }
  return result.value;
}

function unwrapThrow(err: unknown): unknown {
  return err && typeof err === "object" && "value" in (err as object)
    ? (err as { value: unknown }).value
    : err;
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/** Reads `object[key]`, dispatching to the right allow-list. */
export function getMember(host: Host, object: unknown, key: string): unknown {
  if (object === null || object === undefined) {
    host.fail("TypeError", `Cannot read properties of ${object === null ? "null" : "undefined"} (reading '${key}')`);
  }

  if (Array.isArray(object)) {
    const index = Number(key);
    if (Number.isInteger(index) && String(index) === key) return object[index];
    const member = arrayMember(host, object, key);
    if (member !== undefined || key === "length") return member;
    host.fail("TypeError", `Array method '${key}' is not available in the playground`);
  }

  if (typeof object === "string") {
    const index = Number(key);
    if (Number.isInteger(index) && String(index) === key) return object[index];
    const member = stringMember(object, key);
    if (member !== undefined || key === "length") return member;
    host.fail("TypeError", `String method '${key}' is not available in the playground`);
  }

  if (typeof object === "number") {
    if (key === "toFixed") return nativeSync("toFixed", (a) => object.toFixed(num(a[0]) || 0));
    if (key === "toString") return nativeSync("toString", () => String(object));
    host.fail("TypeError", `Number method '${key}' is not available in the playground`);
  }

  if (isPromise(object)) {
    const member = promiseMember(host, object, key);
    if (member !== undefined) return member;
    host.fail("TypeError", `Promise has no method '${key}'`);
  }

  if (isVError(object)) {
    if (key === "message") return object.message;
    if (key === "name") return object.name;
    if (key === "stack") return `${object.name}: ${object.message}`;
    if (key === "toString") return nativeSync("toString", () => `${object.name}: ${object.message}`);
    return undefined;
  }

  if (isCallable(object)) {
    if (object.__kind === "native" && object.props && key in object.props) {
      return object.props[key];
    }
    if (key === "name") return object.name ?? "";
    host.fail("TypeError", `Functions have no property '${key}' in the playground`);
  }

  if (typeof object === "object") {
    return (object as Record<string, unknown>)[key];
  }

  if (typeof object === "boolean") {
    host.fail("TypeError", `Cannot read properties of a boolean (reading '${key}')`);
  }

  return undefined;
}

/** Writes `object[key] = value`. */
export function setMember(host: Host, object: unknown, key: string, value: unknown): void {
  if (object === null || object === undefined) {
    host.fail("TypeError", `Cannot set properties of ${object === null ? "null" : "undefined"}`);
  }
  if (Array.isArray(object)) {
    const index = Number(key);
    if (Number.isInteger(index) && String(index) === key) {
      object[index] = value;
      return;
    }
    if (key === "length") {
      object.length = num(value);
      return;
    }
    host.fail("TypeError", `Cannot assign '${key}' on an array`);
  }
  if (typeof object === "object") {
    (object as Record<string, unknown>)[key] = value;
    return;
  }
  host.fail("TypeError", `Cannot assign '${key}' on ${typeof object}`);
}
