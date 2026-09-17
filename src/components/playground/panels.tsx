"use client";

import type { LogEntry, NodePhase, QueueItem, Snapshot, StackFrame } from "@/lib/event-loop/types";
import { NODE_PHASES } from "@/lib/event-loop/types";

/**
 * The read-only views over a single `Snapshot`. Everything here is pure: given
 * the same snapshot it renders the same thing, which is what lets the scrubber
 * jump anywhere in the trace instantly.
 */

// ---------------------------------------------------------------------------
// Shared shell
// ---------------------------------------------------------------------------

function Panel({
  title,
  hint,
  accent,
  count,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  /** CSS colour driving the rail, dot and count badge. */
  accent: string;
  count?: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex min-h-0 flex-col rounded-xl border border-border bg-surface/60 ${className}`}
      style={{ ["--panel-accent" as string]: accent }}
    >
      <header className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full"
          style={{ background: "var(--panel-accent)" }}
        />
        <h3 className="font-mono text-[11px] font-medium tracking-wide text-foreground">{title}</h3>
        {hint ? <p className="truncate text-[10px] text-subtle">{hint}</p> : null}
        {count !== undefined ? (
          <span
            className="ml-auto shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums"
            style={{
              background:
                count > 0 ? "color-mix(in oklab, var(--panel-accent) 18%, transparent)" : "transparent",
              color: count > 0 ? "var(--panel-accent)" : "var(--subtle)",
            }}
          >
            {count}
          </span>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1 py-1.5 font-mono text-[11px] text-subtle/70 italic">{children}</p>
  );
}

// ---------------------------------------------------------------------------
// Queues
// ---------------------------------------------------------------------------

function JobChip({ item, accent, index }: { item: QueueItem; accent: string; index?: number }) {
  return (
    <li
      // Keyed animation: a chip re-animates only when it is genuinely new.
      className="job-chip flex items-baseline gap-2 rounded-md px-2 py-1.5"
      style={{ background: `color-mix(in oklab, ${accent} 10%, transparent)` }}
      title={item.detail}
    >
      {index !== undefined ? (
        <span className="font-mono text-[10px] tabular-nums text-subtle">{index + 1}</span>
      ) : null}
      <span className="min-w-0 flex-1 truncate font-mono text-[11px]" style={{ color: accent }}>
        {item.label}
      </span>
      {item.dueAt !== undefined ? (
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-subtle">
          {item.dueAt}ms
        </span>
      ) : item.line !== null ? (
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-subtle">
          L{item.line}
        </span>
      ) : null}
    </li>
  );
}

export function QueuePanel({
  title,
  hint,
  accent,
  items,
  empty,
  numbered = true,
  className,
}: {
  title: string;
  hint?: string;
  accent: string;
  items: QueueItem[];
  empty: string;
  numbered?: boolean;
  className?: string;
}) {
  return (
    <Panel title={title} hint={hint} accent={accent} count={items.length} className={className}>
      {items.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item, i) => (
            <JobChip key={item.id} item={item} accent={accent} index={numbered ? i : undefined} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Call stack
// ---------------------------------------------------------------------------

export function CallStackPanel({
  frames,
  className,
}: {
  frames: StackFrame[];
  className?: string;
}) {
  return (
    <Panel
      title="Call stack"
      hint="top frame runs"
      accent="var(--q-stack)"
      count={frames.length}
      className={className}
    >
      {frames.length === 0 ? (
        <Empty>empty — the loop is free to pick up queued work</Empty>
      ) : (
        <ul className="flex flex-col-reverse gap-1">
          {frames.map((frame, i) => {
            const isTop = i === frames.length - 1;
            return (
              <li
                key={`${frame.name}-${i}`}
                className="job-chip flex items-baseline gap-2 rounded-md border px-2 py-1.5"
                style={{
                  borderColor: isTop ? "color-mix(in oklab, var(--accent-soft) 45%, transparent)" : "transparent",
                  background: isTop
                    ? "color-mix(in oklab, var(--accent) 14%, transparent)"
                    : "color-mix(in oklab, var(--foreground) 5%, transparent)",
                }}
              >
                <span
                  className="min-w-0 flex-1 truncate font-mono text-[11px]"
                  style={{ color: isTop ? "var(--foreground)" : "var(--muted)" }}
                >
                  {frame.name}
                </span>
                {frame.kind === "async" ? (
                  <span className="shrink-0 rounded px-1 font-mono text-[9px] tracking-wide text-q-micro">
                    async
                  </span>
                ) : null}
                {frame.line !== null ? (
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-subtle">
                    L{frame.line}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Node phase track
// ---------------------------------------------------------------------------

const PHASE_LABELS: Record<NodePhase, { label: string; hint: string }> = {
  timers: { label: "timers", hint: "expired setTimeout / setInterval" },
  pending: { label: "pending", hint: "deferred system callbacks" },
  poll: { label: "poll", hint: "completed I/O — the loop waits here" },
  check: { label: "check", hint: "setImmediate" },
  close: { label: "close", hint: "'close' events" },
};

export function PhaseTrack({ phase, turn }: { phase: NodePhase | null; turn: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-2.5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="font-mono text-[11px] font-medium text-foreground">libuv phases</h3>
        <span className="font-mono text-[10px] tabular-nums text-subtle">
          {turn > 0 ? `turn ${turn}` : "not started"}
        </span>
      </div>
      <ol className="flex flex-wrap items-stretch gap-1">
        {NODE_PHASES.map((name) => {
          const active = phase === name;
          return (
            <li
              key={name}
              title={PHASE_LABELS[name].hint}
              className="flex-1 rounded-md border px-1.5 py-1 text-center transition-colors"
              style={{
                borderColor: active
                  ? "color-mix(in oklab, var(--accent-2) 55%, transparent)"
                  : "var(--border)",
                background: active
                  ? "color-mix(in oklab, var(--accent-2) 16%, transparent)"
                  : "transparent",
              }}
            >
              <span
                className="font-mono text-[10px]"
                style={{ color: active ? "var(--accent-2)" : "var(--subtle)" }}
              >
                {PHASE_LABELS[name].label}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 font-mono text-[10px] leading-relaxed text-subtle">
        nextTick + microtasks drain between <em className="not-italic text-muted">every</em> phase.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Console
// ---------------------------------------------------------------------------

const LOG_COLOR: Record<LogEntry["method"], string> = {
  log: "var(--foreground)",
  warn: "#fbbf24",
  error: "#f87171",
};

export function ConsolePanel({
  logs,
  visibleCount,
  className,
}: {
  logs: LogEntry[];
  /** How many entries exist at the current step; later ones are dimmed. */
  visibleCount: number;
  className?: string;
}) {
  return (
    <Panel
      title="console"
      hint="output so far"
      accent="var(--q-io)"
      count={visibleCount}
      className={className}
    >
      {logs.length === 0 ? (
        <Empty>nothing printed yet</Empty>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {logs.map((entry, i) => {
            const printed = i < visibleCount;
            return (
              <li
                key={entry.id}
                className="flex items-baseline gap-2 rounded px-1 py-0.5 transition-opacity"
                style={{ opacity: printed ? 1 : 0.22 }}
              >
                <span className="w-12 shrink-0 text-right font-mono text-[10px] tabular-nums text-subtle">
                  {entry.at}ms
                </span>
                <span
                  className="min-w-0 flex-1 font-mono text-[11px] break-words whitespace-pre-wrap"
                  style={{ color: LOG_COLOR[entry.method] }}
                >
                  {entry.text}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Pending / parked work
// ---------------------------------------------------------------------------

export function PendingPanel({
  items,
  runtime,
  clock,
  className,
}: {
  items: QueueItem[];
  runtime: "node" | "browser";
  clock: number;
  className?: string;
}) {
  return (
    <Panel
      title={runtime === "node" ? "timer heap + thread pool" : "Web APIs"}
      hint="outside the loop"
      accent="var(--q-timer)"
      count={items.length}
      className={className}
    >
      {items.length === 0 ? (
        <Empty>nothing in flight</Empty>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const remaining = (item.dueAt ?? clock) - clock;
            return (
              <li
                key={item.id}
                className="job-chip rounded-md px-2 py-1.5"
                style={{ background: "color-mix(in oklab, var(--q-timer) 10%, transparent)" }}
                title={item.detail}
              >
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-q-timer">
                    {item.label}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-subtle">
                    {remaining <= 0 ? "due" : `in ${remaining}ms`}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Narration
// ---------------------------------------------------------------------------

const KIND_STYLE: Record<Snapshot["kind"], { color: string; label: string }> = {
  start: { color: "var(--muted)", label: "start" },
  sync: { color: "var(--q-stack)", label: "sync" },
  enqueue: { color: "var(--q-timer)", label: "queued" },
  dequeue: { color: "var(--accent-2)", label: "running" },
  log: { color: "var(--q-io)", label: "output" },
  phase: { color: "var(--accent-2)", label: "phase" },
  suspend: { color: "var(--q-micro)", label: "await" },
  resume: { color: "var(--q-micro)", label: "resume" },
  settle: { color: "var(--q-micro)", label: "settled" },
  idle: { color: "var(--muted)", label: "waiting" },
  error: { color: "#f87171", label: "error" },
  done: { color: "var(--live)", label: "done" },
};

export function Narration({ snapshot }: { snapshot: Snapshot | null }) {
  if (!snapshot) {
    return (
      <p className="font-mono text-[12px] text-subtle">
        Press <span className="text-muted">Run</span> to build a trace, then step through it.
      </p>
    );
  }

  const style = KIND_STYLE[snapshot.kind];
  return (
    <div className="flex min-w-0 items-baseline gap-2.5">
      <span
        className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] tracking-wide"
        style={{
          background: `color-mix(in oklab, ${style.color} 16%, transparent)`,
          color: style.color,
        }}
      >
        {style.label}
      </span>
      <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-foreground">{snapshot.note}</p>
      <span className="shrink-0 font-mono text-[10px] tabular-nums text-subtle">
        {snapshot.clock}ms
      </span>
    </div>
  );
}
