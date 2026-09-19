"use client";

import type { LogEntry, NodePhase, QueueItem, Snapshot, StackFrame } from "@/lib/event-loop/types";
import { NODE_PHASES } from "@/lib/event-loop/types";

/**
 * The read-only views over a single `Snapshot`. Everything here is pure: given
 * the same snapshot it renders the same thing, which is what lets the scrubber
 * jump anywhere in the trace instantly.
 */

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

/**
 * One tall column per queue. The colour is the column's identity: a solid bar
 * on top, a faint wash behind, and solid chips inside — so a job is readable
 * at a glance and keeps its colour wherever it appears.
 */
function Column({
  title,
  color,
  count,
  children,
}: {
  title: string;
  color: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section
      className="flex h-56 min-w-0 flex-col overflow-hidden rounded-xl border border-border lg:h-72"
      style={{
        borderTop: `3px solid ${color}`,
        background: `color-mix(in oklab, ${color} 7%, var(--surface))`,
      }}
    >
      <header className="flex items-center gap-2 px-2.5 py-2">
        <h3 className="min-w-0 flex-1 truncate font-mono text-[11px] font-semibold text-foreground">
          {title}
        </h3>
        <span
          className="shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums"
          style={
            count > 0
              ? { background: color, color: "var(--chip-ink)" }
              : { color: "var(--subtle)" }
          }
        >
          {count}
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">{children}</div>
    </section>
  );
}

function Chip({
  label,
  meta,
  color,
  emphasis = false,
  title,
}: {
  label: string;
  meta?: string;
  color: string;
  /** The running frame: gets a ring so it stands out from the rest. */
  emphasis?: boolean;
  title?: string;
}) {
  return (
    <li
      className="job-chip flex items-baseline gap-2 rounded-md px-2 py-1.5 shadow-sm"
      style={{
        background: color,
        color: "var(--chip-ink)",
        boxShadow: emphasis ? `0 0 0 2px var(--background), 0 0 0 4px ${color}` : undefined,
      }}
      title={title}
    >
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-medium">{label}</span>
      {meta ? (
        <span className="shrink-0 font-mono text-[10px] tabular-nums opacity-80">{meta}</span>
      ) : null}
    </li>
  );
}

export function QueueColumn({
  title,
  color,
  items,
  showDue = false,
  clock = 0,
}: {
  title: string;
  color: string;
  items: QueueItem[];
  /** Show a countdown instead of the source line (for parked timers and I/O). */
  showDue?: boolean;
  clock?: number;
}) {
  return (
    <Column title={title} color={color} count={items.length}>
      <ul className="flex flex-col gap-1.5 pt-0.5">
        {items.map((item) => {
          const meta = showDue
            ? (item.dueAt ?? clock) - clock <= 0
              ? "due"
              : `${(item.dueAt ?? clock) - clock}ms`
            : item.line !== null
              ? `L${item.line}`
              : undefined;
          return (
            <Chip key={item.id} label={item.label} meta={meta} color={color} title={item.detail} />
          );
        })}
      </ul>
    </Column>
  );
}

/** Frames stack upward from the bottom, like the stack they are. */
export function StackColumn({ frames }: { frames: StackFrame[] }) {
  return (
    <Column title="Call stack" color="var(--q-stack)" count={frames.length}>
      <ul className="flex h-full flex-col-reverse gap-1.5 pb-0.5">
        {frames.map((frame, i) => (
          <Chip
            key={`${frame.name}-${i}`}
            label={frame.kind === "async" ? `${frame.name} · async` : frame.name}
            meta={frame.line !== null ? `L${frame.line}` : undefined}
            color="var(--q-stack)"
            emphasis={i === frames.length - 1}
          />
        ))}
      </ul>
    </Column>
  );
}

// ---------------------------------------------------------------------------
// Node phase strip
// ---------------------------------------------------------------------------

export function PhaseStrip({ phase }: { phase: NodePhase | null }) {
  return (
    <ol className="flex gap-1" aria-label="Event loop phase">
      {NODE_PHASES.map((name) => {
        const active = phase === name;
        return (
          <li
            key={name}
            aria-current={active ? "step" : undefined}
            className="flex-1 rounded-md px-2 py-1 text-center font-mono text-[10.5px] font-medium transition-colors"
            style={
              active
                ? { background: "var(--accent-2)", color: "var(--chip-ink)" }
                : { background: "var(--background)", color: "var(--subtle)" }
            }
          >
            {name}
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Console
// ---------------------------------------------------------------------------

const LOG_COLOR: Record<LogEntry["method"], string> = {
  log: "var(--foreground)",
  warn: "var(--q-timer)",
  error: "var(--danger)",
};

export function ConsolePanel({
  logs,
  visibleCount,
}: {
  logs: LogEntry[];
  /** How many entries exist at the current step; later ones are dimmed. */
  visibleCount: number;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <h3 className="flex-1 font-mono text-[11px] font-semibold text-foreground">Console</h3>
        <span className="font-mono text-[10px] tabular-nums text-subtle">{visibleCount}</span>
      </header>
      <ul className="min-h-0 flex-1 overflow-y-auto p-2">
        {logs.map((entry, i) => (
          <li
            key={entry.id}
            className="flex items-baseline gap-2 rounded px-1 py-0.5 transition-opacity"
            // Lines that have not been printed yet at this step stay faintly
            // visible, so you can see what is still coming.
            style={{ opacity: i < visibleCount ? 1 : 0.2 }}
          >
            <span className="w-11 shrink-0 text-right font-mono text-[10px] tabular-nums text-subtle">
              {entry.at}ms
            </span>
            <span
              className="min-w-0 flex-1 break-words whitespace-pre-wrap font-mono text-[11.5px]"
              style={{ color: LOG_COLOR[entry.method] }}
            >
              {entry.text}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Narration
// ---------------------------------------------------------------------------

const KIND_STYLE: Record<Snapshot["kind"], { color: string; label: string }> = {
  start: { color: "var(--subtle)", label: "start" },
  sync: { color: "var(--q-stack)", label: "sync" },
  enqueue: { color: "var(--q-timer)", label: "queued" },
  dequeue: { color: "var(--accent-2)", label: "running" },
  log: { color: "var(--q-io)", label: "output" },
  phase: { color: "var(--accent-2)", label: "phase" },
  suspend: { color: "var(--q-micro)", label: "await" },
  resume: { color: "var(--q-micro)", label: "resume" },
  settle: { color: "var(--q-micro)", label: "settled" },
  idle: { color: "var(--subtle)", label: "waiting" },
  error: { color: "var(--danger)", label: "error" },
  done: { color: "var(--live)", label: "done" },
};

export function Narration({ snapshot }: { snapshot: Snapshot | null }) {
  if (!snapshot) return null;
  const style = KIND_STYLE[snapshot.kind];
  return (
    <div className="flex min-w-0 items-baseline gap-2.5">
      <span
        className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold"
        style={{ background: style.color, color: "var(--chip-ink)" }}
      >
        {style.label}
      </span>
      <p className="min-w-0 flex-1 text-[13px] leading-snug text-foreground">{snapshot.note}</p>
      <span className="shrink-0 font-mono text-[10px] tabular-nums text-subtle">
        {snapshot.clock}ms
      </span>
    </div>
  );
}
