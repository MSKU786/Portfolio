"use client";

import { useMemo } from "react";
import type { Snapshot, StepKind } from "@/lib/event-loop/types";

/** Playback speeds, in milliseconds per step. */
export const SPEEDS = [
  { label: "0.5×", ms: 900 },
  { label: "1×", ms: 450 },
  { label: "2×", ms: 200 },
  { label: "4×", ms: 80 },
];

/** Steps worth jumping between: everything that is not plain sync execution. */
const EVENT_KINDS = new Set<StepKind>([
  "enqueue",
  "dequeue",
  "log",
  "phase",
  "suspend",
  "resume",
  "settle",
  "idle",
  "error",
  "done",
]);

const KIND_COLOR: Record<StepKind, string> = {
  start: "var(--border-strong)",
  sync: "var(--border-strong)",
  enqueue: "var(--q-timer)",
  dequeue: "var(--accent-2)",
  log: "var(--q-io)",
  phase: "var(--accent-2)",
  suspend: "var(--q-micro)",
  resume: "var(--q-micro)",
  settle: "var(--q-micro)",
  idle: "var(--subtle)",
  error: "#f87171",
  done: "var(--live)",
};

/** At most this many columns in the strip, whatever the trace length. */
const MAX_BUCKETS = 260;

function Button({
  label,
  onClick,
  disabled,
  children,
  wide = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`inline-flex ${wide ? "size-9" : "size-8"} items-center justify-center rounded-lg border border-border-strong text-muted transition-colors hover:border-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35`}
    >
      {children}
    </button>
  );
}

export function Transport({
  snapshots,
  index,
  playing,
  speedIndex,
  onSeek,
  onTogglePlay,
  onSpeedChange,
}: {
  snapshots: Snapshot[];
  index: number;
  playing: boolean;
  speedIndex: number;
  onSeek: (next: number) => void;
  onTogglePlay: () => void;
  onSpeedChange: (next: number) => void;
}) {
  const total = snapshots.length;
  const atEnd = index >= total - 1;

  /**
   * Buckets keep the strip a fixed cost no matter how long the trace is. Each
   * bucket takes the most "interesting" kind it covers, so a single log inside
   * a run of sync steps still shows up as a mark.
   */
  const buckets = useMemo(() => {
    if (total === 0) return [];
    const size = Math.max(1, Math.ceil(total / MAX_BUCKETS));
    const out: { start: number; kind: StepKind }[] = [];
    for (let start = 0; start < total; start += size) {
      let kind: StepKind = snapshots[start].kind;
      for (let i = start; i < Math.min(start + size, total); i++) {
        if (EVENT_KINDS.has(snapshots[i].kind)) {
          kind = snapshots[i].kind;
          break;
        }
      }
      out.push({ start, kind });
    }
    return out;
  }, [snapshots, total]);

  const activeBucket = useMemo(() => {
    if (buckets.length === 0) return -1;
    const size = Math.max(1, Math.ceil(total / MAX_BUCKETS));
    return Math.min(buckets.length - 1, Math.floor(index / size));
  }, [buckets.length, index, total]);

  const seekEvent = (direction: 1 | -1) => {
    for (let i = index + direction; i >= 0 && i < total; i += direction) {
      if (EVENT_KINDS.has(snapshots[i].kind)) {
        onSeek(i);
        return;
      }
    }
    onSeek(direction === 1 ? total - 1 : 0);
  };

  const disabled = total === 0;

  return (
    <div className="flex flex-col gap-2">
      {/* Timeline strip. Each column is a slice of the trace, coloured by what
          happens in it, so the shape of the run is visible at a glance. */}
      <div
        className="flex h-7 items-stretch gap-px overflow-hidden rounded-md border border-border bg-background/60 px-px"
        role="group"
        aria-label="Trace timeline"
      >
        {buckets.length === 0 ? (
          <div className="flex-1" />
        ) : (
          buckets.map((bucket, i) => (
            <button
              key={bucket.start}
              type="button"
              onClick={() => onSeek(bucket.start)}
              aria-label={`Jump to step ${bucket.start + 1}`}
              className="min-w-0 flex-1 cursor-pointer rounded-[1px] transition-opacity hover:opacity-100"
              style={{
                background: KIND_COLOR[bucket.kind],
                opacity: i === activeBucket ? 1 : i < activeBucket ? 0.55 : 0.2,
                outline: i === activeBucket ? "1px solid var(--foreground)" : "none",
              }}
            />
          ))
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button label="Back to start" onClick={() => onSeek(0)} disabled={disabled || index === 0}>
          <SkipIcon direction="start" />
        </Button>
        <Button
          label="Previous event"
          onClick={() => seekEvent(-1)}
          disabled={disabled || index === 0}
        >
          <ChevronsIcon direction="left" />
        </Button>
        <Button
          label="Previous step"
          onClick={() => onSeek(index - 1)}
          disabled={disabled || index === 0}
        >
          <ChevronIcon direction="left" />
        </Button>

        <Button label={playing ? "Pause" : "Play"} onClick={onTogglePlay} disabled={disabled} wide>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </Button>

        <Button label="Next step" onClick={() => onSeek(index + 1)} disabled={disabled || atEnd}>
          <ChevronIcon direction="right" />
        </Button>
        <Button label="Next event" onClick={() => seekEvent(1)} disabled={disabled || atEnd}>
          <ChevronsIcon direction="right" />
        </Button>
        <Button
          label="Jump to end"
          onClick={() => onSeek(total - 1)}
          disabled={disabled || atEnd}
        >
          <SkipIcon direction="end" />
        </Button>

        <span className="ml-1 font-mono text-[11px] tabular-nums text-subtle">
          {total === 0 ? "0 / 0" : `${index + 1} / ${total}`}
        </span>

        <div className="ml-auto flex items-center gap-1">
          {SPEEDS.map((speed, i) => (
            <button
              key={speed.label}
              type="button"
              onClick={() => onSpeedChange(i)}
              aria-pressed={i === speedIndex}
              className={`rounded-md px-2 py-1 font-mono text-[10px] transition-colors ${
                i === speedIndex
                  ? "bg-surface-raised text-foreground"
                  : "text-subtle hover:text-muted"
              }`}
            >
              {speed.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// -- icons -------------------------------------------------------------------

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path
        d={direction === "left" ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronsIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path
        d={direction === "left" ? "M7.5 3 3 8l4.5 5M13 3 8.5 8l4.5 5" : "M3 3l4.5 5L3 13M8.5 3 13 8l-4.5 5"}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SkipIcon({ direction }: { direction: "start" | "end" }) {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      {direction === "start" ? (
        <>
          <path d="M4 3v10" strokeLinecap="round" />
          <path d="M12.5 3.5 6 8l6.5 4.5z" fill="currentColor" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <path d="M12 3v10" strokeLinecap="round" />
          <path d="M3.5 3.5 10 8l-6.5 4.5z" fill="currentColor" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
      <path d="M5 3.2 12.5 8 5 12.8z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
      <rect x="4.5" y="3.5" width="2.6" height="9" rx="0.8" fill="currentColor" />
      <rect x="8.9" y="3.5" width="2.6" height="9" rx="0.8" fill="currentColor" />
    </svg>
  );
}
