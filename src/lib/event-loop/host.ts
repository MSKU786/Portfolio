/**
 * The seam between the evaluator and the built-in library.
 *
 * `globals.ts` and `members.ts` implement natives that sometimes need to call
 * back into interpreted code (`arr.map(fn)`, `Promise.all([…])`). They reach
 * the evaluator through this interface rather than importing it, which keeps
 * the module graph acyclic.
 */

import type { Machine } from "./machine";
import type { Runtime } from "./types";
import type { Suspend, VPromise } from "./values";

export interface Host {
  readonly runtime: Runtime;
  readonly machine: Machine;

  /** Calls any callable value — interpreted or native — with these arguments. */
  call(fn: unknown, args: unknown[], thisArg: unknown, line: number): Generator<Suspend, unknown>;

  /** Raises an interpreter-level error that user `try/catch` can catch. */
  fail(name: string, message: string): never;

  /** Wraps a value in a promise, or returns it unchanged if it already is one. */
  toPromise(value: unknown, line: number): VPromise;

  /** Creates a fresh pending promise, optionally labelled for the queue chips. */
  makePromise(label?: string): VPromise;
}
