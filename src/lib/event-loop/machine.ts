/**
 * The host: virtual clock, every queue, and the two event-loop drivers.
 *
 * Nothing here knows how to *evaluate* code. Callers hand the machine opaque
 * `run` thunks; the machine decides when they execute and records a snapshot
 * of the whole world every time something interesting happens. That recording
 * is the artefact the UI scrubs.
 */

import {
  EMPTY_QUEUES,
  type LogEntry,
  type NodePhase,
  type QueueItem,
  type QueueKind,
  type Runtime,
  type Snapshot,
  type StackFrame,
  type StepKind,
} from "./types";
import { VPromise, formatValue, shortValue } from "./values";

/** Guard rails. A playground snippet that trips one of these is a bug, not a program. */
export const LIMITS = {
  /** Statements executed. Catches `while (true) {}`. */
  steps: 150_000,
  /** Recorded snapshots. Keeps the scrubber responsive and memory bounded. */
  snapshots: 4_000,
  /** Full turns of the event loop. Catches a `setImmediate` that re-arms forever. */
  loopTurns: 5_000,
  /** Virtual milliseconds. Stops an unbounded `setInterval` from running to infinity. */
  clock: 120_000,
};

export class BudgetExceeded extends Error {}

type Job = {
  id: number;
  label: string;
  line: number | null;
  detail?: string;
  /** Virtual time at which a timer or IO completion becomes eligible. */
  dueAt?: number;
  /** Insertion order, for FIFO tie-breaking between equally-due tasks. */
  seq: number;
  /** For intervals: re-arm with this period after running. */
  repeatEvery?: number;
  /** Which phase claims this job once it comes due. Only set while parked. */
  parked?: "timer" | "io";
  run: () => void;
};

export class Machine {
  readonly runtime: Runtime;

  clock = 0;
  phase: NodePhase | null = null;
  loopTurn = 0;

  readonly snapshots: Snapshot[] = [];
  readonly logs: LogEntry[] = [];

  error: string | null = null;
  truncated = false;

  private readonly frames: StackFrame[] = [];

  /** Ready-to-run jobs, keyed by the queue they sit in. */
  private readonly queues: Record<QueueKind, Job[]> = {
    nextTick: [],
    microtask: [],
    timer: [],
    immediate: [],
    io: [],
    close: [],
  };

  /**
   * Work parked *outside* the loop: timers counting down, IO in flight. In
   * browser terms these live in "Web APIs"; in Node, the timer heap and the
   * thread pool.
   */
  private pending: Job[] = [];

  private nextJobId = 1;
  private seq = 0;
  private steps = 0;
  private nextLogId = 1;

  constructor(runtime: Runtime) {
    this.runtime = runtime;
  }

  // -- budget ---------------------------------------------------------------

  /** Called once per statement. Throws once the program has clearly run away. */
  tickStep() {
    if (++this.steps > LIMITS.steps) {
      throw new BudgetExceeded(
        `Stopped after ${LIMITS.steps.toLocaleString()} steps — this looks like an infinite loop.`,
      );
    }
  }

  // -- call stack -----------------------------------------------------------

  pushFrame(name: string, kind: StackFrame["kind"], line: number | null) {
    this.frames.push({ name, kind, line });
  }

  popFrame() {
    this.frames.pop();
  }

  get frameDepth() {
    return this.frames.length;
  }

  /** Rewinds the stack after an error unwound past the interpreter's control. */
  truncateFrames(depth: number) {
    this.frames.length = Math.min(this.frames.length, depth);
  }

  /**
   * Lifts an async function's frames off the stack when it suspends at an
   * `await`. This is the visual heart of the whole thing: the stack really
   * does empty out, which is why other work gets a turn.
   */
  detachFrames(depth: number): StackFrame[] {
    return this.frames.splice(depth);
  }

  /** Puts a suspended function's frames back when its await resumes. */
  attachFrames(frames: StackFrame[]) {
    for (const frame of frames) this.frames.push(frame);
  }

  setLine(line: number | null) {
    const top = this.frames[this.frames.length - 1];
    if (top && line !== null) top.line = line;
  }

  // -- recording ------------------------------------------------------------

  private toItem(job: Job): QueueItem {
    return {
      id: job.id,
      label: job.label,
      line: job.line,
      dueAt: job.dueAt,
      detail: job.detail,
    };
  }

  /**
   * Freezes the current state of the world into the trace. This is the only
   * way anything reaches the UI.
   */
  snap(note: string, kind: StepKind, line?: number | null) {
    if (this.snapshots.length >= LIMITS.snapshots) {
      this.truncated = true;
      throw new BudgetExceeded(
        `Stopped after ${LIMITS.snapshots.toLocaleString()} recorded steps — the trace got too long to show.`,
      );
    }

    const queues = EMPTY_QUEUES();
    for (const key of Object.keys(this.queues) as QueueKind[]) {
      queues[key] = this.queues[key].map((job) => this.toItem(job));
    }

    const topLine = this.frames[this.frames.length - 1]?.line ?? null;

    this.snapshots.push({
      i: this.snapshots.length,
      clock: this.clock,
      line: line === undefined ? topLine : line,
      note,
      kind,
      phase: this.runtime === "node" ? this.phase : null,
      turn: this.loopTurn,
      stack: this.frames.map((f) => ({ ...f })),
      queues,
      pending: this.pending
        .slice()
        .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0) || a.seq - b.seq)
        .map((job) => this.toItem(job)),
      logCount: this.logs.length,
    });
  }

  log(method: LogEntry["method"], args: unknown[], line: number | null) {
    const text = args.map((a) => formatValue(a)).join(" ");
    this.logs.push({ id: this.nextLogId++, method, text, at: this.clock });
    this.snap(`console.${method}("${truncate(text)}")`, "log", line);
  }

  // -- scheduling -----------------------------------------------------------

  private makeJob(
    label: string,
    line: number | null,
    run: () => void,
    extra: Partial<Job> = {},
  ): Job {
    return { id: this.nextJobId++, seq: this.seq++, label, line, run, ...extra };
  }

  /** Promise reactions, `queueMicrotask`, and `await` resumptions land here. */
  scheduleMicrotask(label: string, line: number | null, run: () => void, detail?: string) {
    const job = this.makeJob(label, line, run, { detail });
    this.queues.microtask.push(job);
    this.snap(`Queued microtask: ${label}`, "enqueue", line);
  }

  /** Node only. Drains ahead of the microtask queue, between every phase. */
  scheduleNextTick(label: string, line: number | null, run: () => void, detail?: string) {
    const job = this.makeJob(label, line, run, { detail });
    this.queues.nextTick.push(job);
    this.snap(`Queued on the nextTick queue: ${label}`, "enqueue", line);
  }

  /** Node only. Runs in the `check` phase, after `poll`. */
  scheduleImmediate(label: string, line: number | null, run: () => void) {
    const job = this.makeJob(label, line, run);
    this.queues.immediate.push(job);
    this.snap(`Queued for the check phase: ${label}`, "enqueue", line);
  }

  /**
   * Parks a timer outside the loop. `repeatEvery` re-arms it after each run,
   * which is how `setInterval` is modelled.
   */
  scheduleTimer(
    label: string,
    line: number | null,
    delay: number,
    run: () => void,
    repeatEvery?: number,
  ): number {
    // Browsers and Node both clamp a 0ms timer up to 1ms.
    const effective = Math.max(1, Math.floor(delay) || 0);
    const job = this.makeJob(label, line, run, {
      dueAt: this.clock + effective,
      detail: `${repeatEvery === undefined ? "fires" : "repeats"} at ${this.clock + effective}ms`,
      repeatEvery,
      parked: "timer",
    });
    this.pending.push(job);
    this.snap(
      `${label} parked outside the loop — due at ${job.dueAt}ms`,
      "enqueue",
      line,
    );
    return job.id;
  }

  /** Async IO: its callback lands in the poll phase once the latency elapses. */
  scheduleIO(label: string, line: number | null, latency: number, run: () => void, detail?: string) {
    const job = this.makeJob(label, line, run, {
      dueAt: this.clock + Math.max(1, Math.floor(latency)),
      detail: detail ?? `completes at ${this.clock + Math.max(1, Math.floor(latency))}ms`,
      parked: "io",
    });
    this.pending.push(job);
    this.snap(
      `${label} handed off — the loop does not wait, it completes at ${job.dueAt}ms`,
      "enqueue",
      line,
    );
  }

  /** Backs `clearTimeout` / `clearInterval`. Returns true if anything was cancelled. */
  cancelTimer(id: number, line: number | null): boolean {
    const index = this.pending.findIndex((job) => job.id === id);
    if (index === -1) return false;
    const [job] = this.pending.splice(index, 1);
    this.snap(`Cancelled ${job.label} before it could fire`, "dequeue", line);
    return true;
  }

  // -- promises -------------------------------------------------------------

  /**
   * Settles a promise and moves its reactions onto the microtask queue. This
   * is the hinge the whole visualisation turns on: settling never runs a
   * callback directly, it only ever *queues* one.
   */
  settle(promise: VPromise, state: "fulfilled" | "rejected", value: unknown, line: number | null) {
    if (promise.state !== "pending") return;
    promise.state = state;
    promise.value = value;

    const verb = state === "fulfilled" ? "resolved" : "rejected";
    const label = promise.originLabel ?? `Promise #${promise.id}`;

    if (promise.reactions.length === 0) {
      this.snap(`${label} ${verb} with ${shortValue(value)} — nothing is waiting on it yet`, "settle", line);
      return;
    }

    this.snap(`${label} ${verb} with ${shortValue(value)}`, "settle", line);

    const reactions = promise.reactions;
    promise.reactions = [];
    for (const reaction of reactions) {
      const handler = state === "fulfilled" ? reaction.onFulfilled : reaction.onRejected;
      if (!handler) continue;
      const name = state === "fulfilled" ? ".then callback" : ".catch callback";
      this.scheduleMicrotask(name, line, () => handler(value), `for ${label}`);
    }
  }

  /**
   * Registers a reaction. If the promise has already settled, the reaction is
   * queued immediately — which is why `.then` on a resolved promise still
   * costs one microtask tick.
   */
  subscribe(
    promise: VPromise,
    onFulfilled: ((v: unknown) => void) | null,
    onRejected: ((v: unknown) => void) | null,
    label: string,
    line: number | null,
  ) {
    if (onRejected) promise.handled = true;

    if (promise.state === "pending") {
      promise.reactions.push({ onFulfilled, onRejected });
      return;
    }

    const handler = promise.state === "fulfilled" ? onFulfilled : onRejected;
    if (!handler) return;
    const value = promise.value;
    this.scheduleMicrotask(label, line, () => handler(value), "promise already settled");
  }

  // -- draining -------------------------------------------------------------

  private runJob(job: Job, queue: QueueKind, verb: string) {
    this.snap(`${verb}: ${job.label}`, "dequeue", job.line);
    job.run();
    // Intervals re-arm only if they were not cleared while running.
    if (job.repeatEvery !== undefined && !this.cancelled.has(job.id)) {
      const next: Job = {
        ...job,
        seq: this.seq++,
        dueAt: this.clock + job.repeatEvery,
        detail: `repeats at ${this.clock + job.repeatEvery}ms`,
      };
      this.pending.push(next);
      this.snap(`${job.label} re-armed for ${next.dueAt}ms`, "enqueue", job.line);
    }
    void queue;
  }

  private readonly cancelled = new Set<number>();

  markCancelled(id: number) {
    this.cancelled.add(id);
  }

  /** Empties the microtask queue. In Node, nextTick jumps the queue every time. */
  drainMicrotasks(context: string) {
    if (this.runtime === "node") {
      this.drainNodeQueues(context);
      return;
    }
    if (this.queues.microtask.length === 0) return;

    this.snap(
      `${context} — draining the microtask queue before anything else runs`,
      "phase",
      null,
    );
    while (this.queues.microtask.length > 0) {
      const job = this.queues.microtask.shift()!;
      this.runJob(job, "microtask", "Running microtask");
    }
  }

  /**
   * Node's ordering, as `processTicksAndRejections` actually implements it:
   * drain the whole nextTick queue, then hand over to V8 which drains the
   * whole microtask queue — including microtasks queued while it drains — and
   * only then come back for any nextTicks those microtasks added.
   *
   * The common shorthand "nextTick is checked between every microtask" is
   * wrong, and gets the ordering of this exact pattern backwards:
   *
   *   Promise.resolve().then(() => { log('m1'); process.nextTick(t); });
   *   Promise.resolve().then(() => log('m2'));
   *
   * m2 runs before t, not after.
   */
  private drainNodeQueues(context: string) {
    if (this.queues.nextTick.length === 0 && this.queues.microtask.length === 0) return;

    this.snap(`${context} — nextTick queue drains first, then microtasks`, "phase", null);

    do {
      while (this.queues.nextTick.length > 0) {
        const job = this.queues.nextTick.shift()!;
        this.runJob(job, "nextTick", "Running nextTick callback");
      }
      while (this.queues.microtask.length > 0) {
        const job = this.queues.microtask.shift()!;
        this.runJob(job, "microtask", "Running microtask");
      }
      // A microtask may have queued a nextTick, which now gets its turn.
    } while (this.queues.nextTick.length > 0);
  }

  // -- the loop -------------------------------------------------------------

  private moveDue(kind: QueueKind, predicate: (job: Job) => boolean) {
    const ready = this.pending.filter((job) => job.dueAt !== undefined && job.dueAt <= this.clock && predicate(job));
    if (ready.length === 0) return;
    ready.sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0) || a.seq - b.seq);
    this.pending = this.pending.filter((job) => !ready.includes(job));
    for (const job of ready) this.queues[kind].push(job);
  }

  private hasReadyWork(): boolean {
    return (
      this.queues.nextTick.length > 0 ||
      this.queues.microtask.length > 0 ||
      this.queues.timer.length > 0 ||
      this.queues.immediate.length > 0 ||
      this.queues.io.length > 0 ||
      this.queues.close.length > 0 ||
      this.pending.some((job) => (job.dueAt ?? 0) <= this.clock)
    );
  }

  private hasAnyWork(): boolean {
    return this.hasReadyWork() || this.pending.length > 0;
  }

  private earliestDue(): number | null {
    let earliest: number | null = null;
    for (const job of this.pending) {
      if (job.dueAt === undefined) continue;
      if (earliest === null || job.dueAt < earliest) earliest = job.dueAt;
    }
    return earliest;
  }

  private enterPhase(phase: NodePhase, note: string) {
    this.phase = phase;
    this.snap(note, "phase", null);
  }

  /**
   * Walks the libuv phases until there is no work left. `isTimerJob`
   * distinguishes timer callbacks from IO completions, both of which sit in
   * `pending` until their virtual due time.
   */
  private runNodeLoop() {
    while (this.hasAnyWork()) {
      if (++this.loopTurn > LIMITS.loopTurns) {
        throw new BudgetExceeded(
          `Stopped after ${LIMITS.loopTurns.toLocaleString()} turns of the event loop — something is re-queueing itself forever.`,
        );
      }

      // --- timers -------------------------------------------------------
      this.moveDue("timer", (job) => job.parked === "timer");
      if (this.queues.timer.length > 0) {
        this.enterPhase("timers", `Loop turn ${this.loopTurn} · timers phase — expired setTimeout/setInterval callbacks run here`);
        while (this.queues.timer.length > 0) {
          const job = this.queues.timer.shift()!;
          this.runJob(job, "timer", "Running timer callback");
          this.drainMicrotasks("After that timer callback");
        }
      }

      // --- pending callbacks --------------------------------------------
      // Deferred system-level callbacks (e.g. some TCP errors). Nothing in
      // the playground's API surface can land here, so it is never entered.

      // --- poll ---------------------------------------------------------
      this.moveDue("io", (job) => job.parked === "io");
      if (this.queues.io.length > 0) {
        this.enterPhase("poll", `Loop turn ${this.loopTurn} · poll phase — completed I/O callbacks run here`);
        while (this.queues.io.length > 0) {
          const job = this.queues.io.shift()!;
          this.runJob(job, "io", "Running I/O callback");
          this.drainMicrotasks("After that I/O callback");
        }
      } else if (!this.hasReadyWork() && this.queues.immediate.length === 0) {
        // Nothing to run right now. A real loop would block in poll waiting
        // for the kernel; here we simply fast-forward the virtual clock.
        const next = this.earliestDue();
        if (next === null) break;
        this.phase = "poll";
        this.clock = Math.min(next, LIMITS.clock);
        this.snap(
          `poll phase — nothing is ready, so the loop blocks here. Clock jumps to ${this.clock}ms.`,
          "idle",
          null,
        );
        if (this.clock >= LIMITS.clock) break;
        continue;
      }

      // --- check --------------------------------------------------------
      if (this.queues.immediate.length > 0) {
        this.enterPhase("check", `Loop turn ${this.loopTurn} · check phase — setImmediate callbacks run here`);
        // Only the immediates queued *before* this phase began run in it;
        // anything queued during the phase waits for the next turn.
        let remaining = this.queues.immediate.length;
        while (remaining-- > 0 && this.queues.immediate.length > 0) {
          const job = this.queues.immediate.shift()!;
          this.runJob(job, "immediate", "Running setImmediate callback");
          this.drainMicrotasks("After that setImmediate callback");
        }
      }

      // --- close --------------------------------------------------------
      if (this.queues.close.length > 0) {
        this.enterPhase("close", `Loop turn ${this.loopTurn} · close phase`);
        while (this.queues.close.length > 0) {
          const job = this.queues.close.shift()!;
          this.runJob(job, "close", "Running close callback");
          this.drainMicrotasks("After that close callback");
        }
      }
    }
  }

  /**
   * The browser has no phases: pick the single earliest-due task, run it to
   * completion, drain microtasks, repeat.
   */
  private runBrowserLoop() {
    while (this.hasAnyWork()) {
      if (++this.loopTurn > LIMITS.loopTurns) {
        throw new BudgetExceeded(
          `Stopped after ${LIMITS.loopTurns.toLocaleString()} turns of the event loop — something is re-queueing itself forever.`,
        );
      }

      this.moveDue("timer", () => true);

      if (this.queues.timer.length === 0) {
        const next = this.earliestDue();
        if (next === null) break;
        this.clock = Math.min(next, LIMITS.clock);
        this.snap(
          `Call stack empty, task queue empty — waiting. Clock jumps to ${this.clock}ms.`,
          "idle",
          null,
        );
        if (this.clock >= LIMITS.clock) break;
        continue;
      }

      // One task per turn, then microtasks. This is the rule people get wrong.
      this.queues.timer.sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0) || a.seq - b.seq);
      const job = this.queues.timer.shift()!;
      this.runJob(job, "timer", "Call stack is empty — taking one task from the task queue");
      this.drainMicrotasks("That task finished");
    }
  }

  runLoop() {
    if (this.runtime === "node") this.runNodeLoop();
    else this.runBrowserLoop();
    this.phase = null;
  }
}

function truncate(text: string): string {
  const oneLine = text.replace(/\s+/g, " ");
  return oneLine.length > 48 ? `${oneLine.slice(0, 47)}…` : oneLine;
}
