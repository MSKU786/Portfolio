/**
 * Shared vocabulary between the interpreter, the two runtime hosts, and the UI.
 *
 * The engine runs a program to completion up front and emits an immutable
 * array of `Snapshot`s. The UI never executes anything — it scrubs that array.
 * That split is what makes stepping backwards free and the playback controls
 * trivial.
 */

export type Runtime = "node" | "browser";

/**
 * The libuv phases, in the order the loop walks them. `idle/prepare` is
 * internal to libuv and never runs user code, so it is folded away.
 */
export type NodePhase = "timers" | "pending" | "poll" | "check" | "close";

export const NODE_PHASES: NodePhase[] = [
  "timers",
  "pending",
  "poll",
  "check",
  "close",
];

/** Where a queued job lives. Drives both grouping and colour in the UI. */
export type QueueKind =
  | "nextTick"
  | "microtask"
  | "timer"
  | "immediate"
  | "io"
  | "close";

/** A job as rendered in a queue panel. Plain data, safe to freeze. */
export type QueueItem = {
  id: number;
  /** Short human label, e.g. `setTimeout #1` or `.then(onFulfilled)`. */
  label: string;
  /** Source line that *created* this job, so the UI can point back at it. */
  line: number | null;
  /** Virtual ms at which a timer/IO job becomes eligible. */
  dueAt?: number;
  /** Extra detail shown on hover, e.g. `delay 0ms` or `readFile data.txt`. */
  detail?: string;
};

export type StackFrame = {
  name: string;
  line: number | null;
  /** `async` frames are ones that can suspend at an `await`. */
  kind: "sync" | "async";
};

export type LogEntry = {
  id: number;
  method: "log" | "warn" | "error";
  text: string;
  /** Virtual clock time at which it was printed. */
  at: number;
};

/**
 * Why the engine paused here. The UI uses this to colour the narration line
 * and to let you jump between "interesting" steps only.
 */
export type StepKind =
  | "start"
  | "sync"
  | "enqueue"
  | "dequeue"
  | "log"
  | "phase"
  | "suspend"
  | "resume"
  | "settle"
  | "idle"
  | "error"
  | "done";

export type Snapshot = {
  /** Index into the trace; also the scrubber position. */
  i: number;
  /** Virtual clock in ms. Never advances while synchronous code runs. */
  clock: number;
  /** 1-based source line to highlight, or null when no user line applies. */
  line: number | null;
  /** One sentence explaining what just happened. This is the whole point. */
  note: string;
  kind: StepKind;
  /** null in the browser runtime, which has no phases. */
  phase: NodePhase | null;
  /** Which turn of the event loop this is; 0 while the script is still running. */
  turn: number;
  stack: StackFrame[];
  queues: Record<QueueKind, QueueItem[]>;
  /**
   * Timers and IO still parked outside the loop — "Web APIs" in the browser
   * mental model, the libuv thread pool / kernel in Node's.
   */
  pending: QueueItem[];
  /** How many entries of the trace's `logs` array exist at this point. */
  logCount: number;
};

export type Trace = {
  runtime: Runtime;
  snapshots: Snapshot[];
  logs: LogEntry[];
  /** Set when the program threw, or blew a budget. */
  error: string | null;
  /** True when execution was cut short by the step/snapshot budget. */
  truncated: boolean;
};

export const EMPTY_QUEUES = (): Record<QueueKind, QueueItem[]> => ({
  nextTick: [],
  microtask: [],
  timer: [],
  immediate: [],
  io: [],
  close: [],
});
