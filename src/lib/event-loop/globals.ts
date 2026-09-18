/**
 * The built-in library, split by runtime.
 *
 * Every asynchronous API here routes through the machine rather than doing
 * anything itself — `setTimeout` parks a job, `fs.readFile` parks a job with a
 * latency, `process.nextTick` pushes onto the tick queue. That is what makes
 * the ordering on screen the *reason* for the output rather than a re-telling
 * of it.
 */

import type { Host } from "./host";
import { drain, nativeSync } from "./members";
import {
  Scope,
  VPromise,
  type NativeFunction,
  callableName,
  isCallable,
  isPromise,
  makeError,
  toStringValue,
} from "./values";

/** Default simulated latencies, overridable per call via `{ latency: n }`. */
const DEFAULT_LATENCY = { readFile: 30, fetch: 200 };

/** Contents `fs.readFile` pretends to find on disk. */
const FAKE_FILES: Record<string, string> = {
  "data.txt": "the quick brown fox",
  "config.json": '{"retries":3,"timeout":5000}',
  "users.json": '[{"name":"ada"},{"name":"grace"}]',
};

function optionLatency(value: unknown, fallback: number): number {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const latency = (value as Record<string, unknown>).latency;
    if (typeof latency === "number") return latency;
  }
  return fallback;
}

export function createGlobals(host: Host): Scope {
  const machine = host.machine;
  const scope = new Scope(null);

  const define = (name: string, value: unknown) => scope.declare(name, value, "const");

  /** Runs a queued user callback. Frames are pushed by `host.call`. */
  const invoke = (fn: unknown, args: unknown[], line: number) => {
    drain(host.call(fn, args, undefined, line));
  };

  // -- console -------------------------------------------------------------

  define("console", {
    log: nativeSync("log", (args, _t, line) => {
      machine.log("log", args, line);
      return undefined;
    }),
    warn: nativeSync("warn", (args, _t, line) => {
      machine.log("warn", args, line);
      return undefined;
    }),
    error: nativeSync("error", (args, _t, line) => {
      machine.log("error", args, line);
      return undefined;
    }),
    info: nativeSync("info", (args, _t, line) => {
      machine.log("log", args, line);
      return undefined;
    }),
  });

  // -- timers --------------------------------------------------------------

  const makeTimer = (name: "setTimeout" | "setInterval") =>
    nativeSync(name, (args, _t, line) => {
      const [callback, delayArg, ...rest] = args;
      if (!isCallable(callback)) host.fail("TypeError", `${name} needs a function as its first argument`);
      const delay = typeof delayArg === "number" ? delayArg : 0;
      const label = `${name}(${callableName(callback, "fn")}, ${delay}ms)`;
      return machine.scheduleTimer(
        label,
        line,
        delay,
        () => invoke(callback, rest, line),
        name === "setInterval" ? Math.max(1, delay) : undefined,
      );
    });

  define("setTimeout", makeTimer("setTimeout"));
  define("setInterval", makeTimer("setInterval"));

  const clearTimer = (name: string) =>
    nativeSync(name, (args, _t, line) => {
      const id = typeof args[0] === "number" ? args[0] : -1;
      machine.markCancelled(id);
      machine.cancelTimer(id, line);
      return undefined;
    });

  define("clearTimeout", clearTimer("clearTimeout"));
  define("clearInterval", clearTimer("clearInterval"));

  define(
    "queueMicrotask",
    nativeSync("queueMicrotask", (args, _t, line) => {
      if (!isCallable(args[0])) host.fail("TypeError", "queueMicrotask needs a function");
      machine.scheduleMicrotask(
        `queueMicrotask(${callableName(args[0], "fn")})`,
        line,
        () => invoke(args[0], [], line),
      );
      return undefined;
    }),
  );

  // -- Promise -------------------------------------------------------------

  /** Settles `promise` with `value`, adopting it first if it is itself a promise. */
  const resolveWith = (promise: VPromise, value: unknown, line: number) => {
    if (isPromise(value)) {
      machine.subscribe(
        value,
        (v) => machine.settle(promise, "fulfilled", v, line),
        (e) => machine.settle(promise, "rejected", e, line),
        "adopt resolved promise",
        line,
      );
      return;
    }
    machine.settle(promise, "fulfilled", value, line);
  };

  /** Normalises a `Promise.all`-style argument list into promises. */
  const asPromiseList = (value: unknown, line: number, method: string): VPromise[] => {
    if (!Array.isArray(value)) host.fail("TypeError", `Promise.${method} needs an array`);
    return value.map((item) => host.toPromise(item, line));
  };

  const promiseStatics: Record<string, unknown> = {
    resolve: nativeSync("resolve", (args, _t, line) => {
      if (isPromise(args[0])) return args[0];
      const promise = host.makePromise("Promise.resolve()");
      machine.settle(promise, "fulfilled", args[0], line);
      return promise;
    }),

    reject: nativeSync("reject", (args, _t, line) => {
      const promise = host.makePromise("Promise.reject()");
      machine.settle(promise, "rejected", args[0], line);
      return promise;
    }),

    all: nativeSync("all", (args, _t, line) => {
      const inputs = asPromiseList(args[0], line, "all");
      const result = host.makePromise("Promise.all()");
      const values = new Array<unknown>(inputs.length);
      let remaining = inputs.length;
      if (remaining === 0) machine.settle(result, "fulfilled", [], line);
      inputs.forEach((input, index) => {
        machine.subscribe(
          input,
          (value) => {
            values[index] = value;
            // `all` settles only once every input has, which is why one slow
            // member sets the pace for the whole group.
            if (--remaining === 0) machine.settle(result, "fulfilled", values, line);
          },
          (reason) => machine.settle(result, "rejected", reason, line),
          "Promise.all member settled",
          line,
        );
      });
      return result;
    }),

    allSettled: nativeSync("allSettled", (args, _t, line) => {
      const inputs = asPromiseList(args[0], line, "allSettled");
      const result = host.makePromise("Promise.allSettled()");
      const values = new Array<unknown>(inputs.length);
      let remaining = inputs.length;
      if (remaining === 0) machine.settle(result, "fulfilled", [], line);
      inputs.forEach((input, index) => {
        const finish = (entry: unknown) => {
          values[index] = entry;
          if (--remaining === 0) machine.settle(result, "fulfilled", values, line);
        };
        machine.subscribe(
          input,
          (value) => finish({ status: "fulfilled", value }),
          (reason) => finish({ status: "rejected", reason }),
          "Promise.allSettled member settled",
          line,
        );
      });
      return result;
    }),

    race: nativeSync("race", (args, _t, line) => {
      const inputs = asPromiseList(args[0], line, "race");
      const result = host.makePromise("Promise.race()");
      for (const input of inputs) {
        machine.subscribe(
          input,
          (value) => machine.settle(result, "fulfilled", value, line),
          (reason) => machine.settle(result, "rejected", reason, line),
          "Promise.race member settled",
          line,
        );
      }
      return result;
    }),

    any: nativeSync("any", (args, _t, line) => {
      const inputs = asPromiseList(args[0], line, "any");
      const result = host.makePromise("Promise.any()");
      let remaining = inputs.length;
      for (const input of inputs) {
        machine.subscribe(
          input,
          (value) => machine.settle(result, "fulfilled", value, line),
          () => {
            if (--remaining === 0) {
              machine.settle(result, "rejected", makeError("AggregateError", "All promises were rejected"), line);
            }
          },
          "Promise.any member settled",
          line,
        );
      }
      return result;
    }),
  };

  const promiseConstructor: NativeFunction = {
    __kind: "native",
    name: "Promise",
    *call() {
      host.fail("TypeError", "Promise constructor cannot be invoked without 'new'");
    },
    construct(args, line) {
      const promise = host.makePromise("new Promise");
      const executor = args[0];
      if (!isCallable(executor)) host.fail("TypeError", "Promise resolver is not a function");

      const resolve = nativeSync("resolve", (a) => {
        resolveWith(promise, a[0], line);
        return undefined;
      });
      const reject = nativeSync("reject", (a) => {
        machine.settle(promise, "rejected", a[0], line);
        return undefined;
      });

      machine.snap(
        "new Promise — the executor runs synchronously, right now, not later",
        "sync",
        line,
      );
      try {
        drain(host.call(executor, [resolve, reject], undefined, line));
      } catch (err) {
        machine.settle(promise, "rejected", unwrap(err), line);
      }
      return promise;
    },
    props: promiseStatics,
  };

  define("Promise", promiseConstructor);

  // -- errors --------------------------------------------------------------

  for (const name of ["Error", "TypeError", "RangeError"]) {
    const constructor: NativeFunction = {
      __kind: "native",
      name,
      *call(args) {
        return makeError(name, args[0] === undefined ? "" : String(args[0]));
      },
      construct(args) {
        return makeError(name, args[0] === undefined ? "" : String(args[0]));
      },
    };
    define(name, constructor);
  }

  // -- plain utilities -----------------------------------------------------

  define("Math", {
    floor: nativeSync("floor", (a) => Math.floor(Number(a[0]))),
    ceil: nativeSync("ceil", (a) => Math.ceil(Number(a[0]))),
    round: nativeSync("round", (a) => Math.round(Number(a[0]))),
    abs: nativeSync("abs", (a) => Math.abs(Number(a[0]))),
    max: nativeSync("max", (a) => Math.max(...a.map(Number))),
    min: nativeSync("min", (a) => Math.min(...a.map(Number))),
    pow: nativeSync("pow", (a) => Number(a[0]) ** Number(a[1])),
    sqrt: nativeSync("sqrt", (a) => Math.sqrt(Number(a[0]))),
    // Deterministic, so a trace is reproducible and shareable.
    random: nativeSync("random", () => 0.5),
    PI: Math.PI,
  });

  define("JSON", {
    stringify: nativeSync("stringify", (a) => {
      try {
        return JSON.stringify(a[0], null, typeof a[2] === "number" ? a[2] : undefined) ?? "undefined";
      } catch {
        host.fail("TypeError", "Converting circular structure to JSON");
      }
    }),
    parse: nativeSync("parse", (a) => {
      try {
        return JSON.parse(String(a[0]));
      } catch {
        host.fail("SyntaxError", `Unexpected token in JSON: ${String(a[0]).slice(0, 20)}`);
      }
    }),
  });

  define("Object", {
    keys: nativeSync("keys", (a) => Object.keys((a[0] ?? {}) as object)),
    values: nativeSync("values", (a) => Object.values((a[0] ?? {}) as object)),
    entries: nativeSync("entries", (a) => Object.entries((a[0] ?? {}) as object)),
    assign: nativeSync("assign", (a) => Object.assign(a[0] as object, ...(a.slice(1) as object[]))),
    freeze: nativeSync("freeze", (a) => Object.freeze(a[0] as object)),
    fromEntries: nativeSync("fromEntries", (a) => Object.fromEntries(a[0] as [string, unknown][])),
  });

  define("Array", {
    isArray: nativeSync("isArray", (a) => Array.isArray(a[0])),
    from: nativeSync("from", (a) => {
      const source = a[0];
      if (Array.isArray(source)) return source.slice();
      if (typeof source === "string") return source.split("");
      if (source && typeof source === "object" && "length" in (source as object)) {
        return new Array(Number((source as { length: unknown }).length)).fill(undefined);
      }
      return [];
    }),
  });

  define("Number", {
    isInteger: nativeSync("isInteger", (a) => Number.isInteger(a[0])),
    isNaN: nativeSync("isNaN", (a) => Number.isNaN(a[0])),
    parseFloat: nativeSync("parseFloat", (a) => Number.parseFloat(String(a[0]))),
    MAX_SAFE_INTEGER: Number.MAX_SAFE_INTEGER,
  });

  define("String", nativeSync("String", (a) => (a[0] === undefined ? "" : toStringValue(a[0]))));
  define("Boolean", nativeSync("Boolean", (a) => Boolean(a[0])));
  define("parseInt", nativeSync("parseInt", (a) => Number.parseInt(String(a[0]), Number(a[1]) || 10)));
  define("parseFloat", nativeSync("parseFloat", (a) => Number.parseFloat(String(a[0]))));
  define("isNaN", nativeSync("isNaN", (a) => Number.isNaN(Number(a[0]))));

  // The clock is virtual, so `Date.now()` reports loop time, not wall time.
  define("Date", {
    now: nativeSync("now", () => machine.clock),
  });

  // -- runtime-specific ----------------------------------------------------

  if (host.runtime === "node") {
    defineNodeGlobals(host, define, invoke);
  } else {
    defineBrowserGlobals(host, define);
  }

  return scope;
}

// ---------------------------------------------------------------------------
// Node
// ---------------------------------------------------------------------------

function defineNodeGlobals(
  host: Host,
  define: (name: string, value: unknown) => void,
  invoke: (fn: unknown, args: unknown[], line: number) => void,
) {
  const machine = host.machine;

  define("process", {
    nextTick: nativeSync("nextTick", (args, _t, line) => {
      const [callback, ...rest] = args;
      if (!isCallable(callback)) host.fail("TypeError", "process.nextTick needs a function");
      machine.scheduleNextTick(
        `process.nextTick(${callableName(callback, "fn")})`,
        line,
        () => invoke(callback, rest, line),
        "jumps ahead of every microtask",
      );
      return undefined;
    }),
    argv: ["node", "playground.js"],
    platform: "linux",
    version: "v22.0.0",
    env: {},
  });

  define(
    "setImmediate",
    nativeSync("setImmediate", (args, _t, line) => {
      const [callback, ...rest] = args;
      if (!isCallable(callback)) host.fail("TypeError", "setImmediate needs a function");
      machine.scheduleImmediate(
        `setImmediate(${callableName(callback, "fn")})`,
        line,
        () => invoke(callback, rest, line),
      );
      return undefined;
    }),
  );

  /** Resolves a path against the fake disk, or produces an ENOENT-style error. */
  const readFakeFile = (path: unknown) => {
    const key = String(path).replace(/^\.\//, "");
    const contents = FAKE_FILES[key];
    if (contents === undefined) {
      return {
        error: makeError("Error", `ENOENT: no such file or directory, open '${key}'`),
        contents: null,
      };
    }
    return { error: null, contents };
  };

  const fsPromises = {
    readFile: nativeSync("readFile", (args, _t, line) => {
      const latency = optionLatency(args[1], DEFAULT_LATENCY.readFile);
      const promise = host.makePromise(`fs.promises.readFile('${String(args[0])}')`);
      machine.scheduleIO(
        `readFile('${String(args[0])}')`,
        line,
        latency,
        () => {
          const { error, contents } = readFakeFile(args[0]);
          if (error) machine.settle(promise, "rejected", error, line);
          else machine.settle(promise, "fulfilled", contents, line);
        },
        `${latency}ms of simulated disk I/O`,
      );
      return promise;
    }),
  };

  define("fs", {
    readFile: nativeSync("readFile", (args, _t, line) => {
      // Signature is (path, callback) or (path, options, callback).
      const callback = isCallable(args[2]) ? args[2] : args[1];
      if (!isCallable(callback)) host.fail("TypeError", "fs.readFile needs a callback");
      const latency = optionLatency(args[1], DEFAULT_LATENCY.readFile);

      machine.scheduleIO(
        `readFile('${String(args[0])}')`,
        line,
        latency,
        () => {
          const { error, contents } = readFakeFile(args[0]);
          invoke(callback, [error, contents], line);
        },
        `${latency}ms of simulated disk I/O`,
      );
      return undefined;
    }),
    promises: fsPromises,
  });
}

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

function defineBrowserGlobals(host: Host, define: (name: string, value: unknown) => void) {
  const machine = host.machine;

  define(
    "fetch",
    nativeSync("fetch", (args, _t, line) => {
      const url = String(args[0] ?? "");
      const latency = optionLatency(args[1], DEFAULT_LATENCY.fetch);
      const promise = host.makePromise(`fetch('${url}')`);

      machine.scheduleIO(
        `fetch('${url}')`,
        line,
        latency,
        () => {
          // The response arrives as a task; reading its body is a further
          // promise, exactly as in a browser.
          const body = { url, ok: true, source: "playground" };
          const response = {
            ok: true,
            status: 200,
            url,
            json: nativeSync("json", (_a, _t2, jsonLine) => {
              const jsonPromise = host.makePromise(`response.json()`);
              machine.settle(jsonPromise, "fulfilled", body, jsonLine);
              return jsonPromise;
            }),
            text: nativeSync("text", (_a, _t2, textLine) => {
              const textPromise = host.makePromise(`response.text()`);
              machine.settle(textPromise, "fulfilled", JSON.stringify(body), textLine);
              return textPromise;
            }),
          };
          machine.settle(promise, "fulfilled", response, line);
        },
        `${latency}ms of simulated network`,
      );

      return promise;
    }),
  );

  // A couple of window-ish niceties so browser snippets read naturally.
  define("globalThis", { name: "window" });
}

function unwrap(err: unknown): unknown {
  return err && typeof err === "object" && "value" in (err as object)
    ? (err as { value: unknown }).value
    : err;
}

// Re-exported so the UI can describe the sandbox honestly in its help panel.
export const SANDBOX_FILES = Object.keys(FAKE_FILES);
export const SANDBOX_LATENCY = DEFAULT_LATENCY;
