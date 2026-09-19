"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { buildTrace } from "@/lib/event-loop/interpreter";
import { SAMPLES } from "@/lib/event-loop/samples";
import type { Runtime } from "@/lib/event-loop/types";
import { ConsolePanel, Narration, PhaseStrip, QueueColumn, StackColumn } from "./panels";
import { SPEEDS, Transport } from "./Transport";

/**
 * CodeMirror is client-only and chunky, so it loads on demand. The fallback
 * keeps the editor from collapsing while it arrives.
 */
const CodeEditor = dynamic(() => import("./CodeEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center font-mono text-[11px] text-subtle">
      loading editor…
    </div>
  ),
});

const COPY: Record<Runtime, { title: string; blurb: string; file: string }> = {
  browser: {
    title: "JavaScript event loop",
    blurb: "The call stack, the microtask queue and the task queue, as a browser runs them.",
    file: "app.js",
  },
  node: {
    title: "Node.js event loop",
    blurb: "process.nextTick, microtasks and libuv’s phases, as Node runs them.",
    file: "server.js",
  },
};

/**
 * One complete, independent playground for a single runtime: editor, controls
 * and visualiser. The page renders one per runtime, so each keeps its own
 * code, trace and playback position.
 */
export function EventLoopSection({ runtime }: { runtime: Runtime }) {
  const copy = COPY[runtime];

  const [source, setSource] = useState(SAMPLES[runtime]);
  /**
   * The exact source the visible trace was built from. The trace is a pure
   * function of it, which is what lets you edit freely without the visualiser
   * thrashing underneath — nothing changes until you press Run.
   */
  const [committed, setCommitted] = useState(SAMPLES[runtime]);
  const trace = useMemo(() => buildTrace(committed, runtime), [committed, runtime]);

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(1);

  const stale = committed !== source;
  const snapshots = trace.snapshots;
  const total = snapshots.length;
  const current = total > 0 ? snapshots[Math.min(index, total - 1)] : null;

  const run = (next: string) => {
    setCommitted(next);
    setIndex(0);
    setPlaying(true);
  };

  const reset = () => {
    setSource(SAMPLES[runtime]);
    setCommitted(SAMPLES[runtime]);
    setIndex(0);
    setPlaying(false);
  };

  const seek = useCallback(
    (next: number) => {
      setPlaying(false);
      setIndex(Math.max(0, Math.min(next, Math.max(0, total - 1))));
    },
    [total],
  );

  // Pauses at the end rather than looping: a trace has a real ending, and
  // restarting silently would hide it.
  useEffect(() => {
    if (!playing || total === 0) return;
    const timer = window.setInterval(() => {
      setIndex((i) => {
        if (i >= total - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, SPEEDS[speedIndex].ms);
    return () => window.clearInterval(timer);
  }, [playing, speedIndex, total]);

  const togglePlay = () => {
    if (total === 0) return;
    if (playing) {
      setPlaying(false);
      return;
    }
    // Pressing play at the end starts over, which is what you want.
    if (index >= total - 1) setIndex(0);
    setPlaying(true);
  };

  /**
   * Shortcuts are scoped to this section rather than the window, so the two
   * labs on the page never step each other — and never while typing code.
   */
  const onKeyDown = (event: React.KeyboardEvent) => {
    if ((event.target as HTMLElement).closest(".cm-editor")) return;
    if (event.key === " ") {
      event.preventDefault();
      togglePlay();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      seek(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      seek(index - 1);
    }
  };

  const queues = current?.queues;
  const clock = current?.clock ?? 0;
  const headingId = `${runtime}-loop-title`;

  return (
    <section
      aria-labelledby={headingId}
      onKeyDown={onKeyDown}
      className="mx-auto w-full max-w-[1500px] px-4 py-10 sm:px-6"
    >
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id={headingId} className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {copy.title}
        </h2>
        <p className="text-sm text-muted">{copy.blurb}</p>
      </header>

      {/* ---- code + output ---- */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex h-[390px] flex-col overflow-hidden rounded-xl border border-border bg-surface">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <h3 className="flex-1 font-mono text-[11px] font-semibold text-foreground">{copy.file}</h3>
            <button
              type="button"
              onClick={reset}
              disabled={source === SAMPLES[runtime] && !stale}
              className="rounded-lg px-2.5 py-1 font-mono text-[11px] text-subtle transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => run(source)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1 font-mono text-[11px] font-semibold transition-opacity hover:opacity-90"
              style={{ background: stale ? "var(--q-micro)" : "var(--q-io)", color: "var(--chip-ink)" }}
            >
              <svg viewBox="0 0 16 16" className="size-3" aria-hidden>
                <path d="M4.5 3 12.5 8 4.5 13z" fill="currentColor" />
              </svg>
              {stale ? "Run changes" : "Run"}
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <CodeEditor value={source} onChange={setSource} stepLine={current?.line ?? null} />
          </div>
        </div>

        <div className="h-48 lg:h-[390px]">
          <ConsolePanel logs={trace.logs} visibleCount={current?.logCount ?? 0} />
        </div>
      </div>

      {trace.error ? (
        <p
          className="mt-3 rounded-xl border px-3 py-2 font-mono text-[11.5px] leading-relaxed"
          style={{
            borderColor: "color-mix(in oklab, var(--danger) 40%, transparent)",
            background: "color-mix(in oklab, var(--danger) 10%, transparent)",
            color: "var(--danger)",
          }}
        >
          {trace.error}
        </p>
      ) : null}

      {/* ---- controls ---- */}
      <div className="mt-3 flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-3">
        <Transport
          snapshots={snapshots}
          index={index}
          playing={playing}
          speedIndex={speedIndex}
          onSeek={seek}
          onTogglePlay={togglePlay}
          onSpeedChange={setSpeedIndex}
        />
        <Narration snapshot={current} />
        {runtime === "node" ? <PhaseStrip phase={current?.phase ?? null} /> : null}
      </div>

      {/* ---- the loop itself ---- */}
      {runtime === "browser" ? (
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StackColumn frames={current?.stack ?? []} />
          <QueueColumn title="Microtasks" color="var(--q-micro)" items={queues?.microtask ?? []} />
          <QueueColumn
            title="Task queue"
            color="var(--q-timer)"
            items={[...(queues?.timer ?? []), ...(queues?.io ?? [])]}
          />
          <QueueColumn
            title="Web APIs"
            color="var(--q-pending)"
            items={current?.pending ?? []}
            showDue
            clock={clock}
          />
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <StackColumn frames={current?.stack ?? []} />
          <QueueColumn title="nextTick" color="var(--q-tick)" items={queues?.nextTick ?? []} />
          <QueueColumn title="Microtasks" color="var(--q-micro)" items={queues?.microtask ?? []} />
          <QueueColumn title="Timers" color="var(--q-timer)" items={queues?.timer ?? []} />
          <QueueColumn title="Poll · I/O" color="var(--q-io)" items={queues?.io ?? []} />
          <QueueColumn title="Check" color="var(--q-check)" items={queues?.immediate ?? []} />
          <QueueColumn
            title="libuv (waiting)"
            color="var(--q-pending)"
            items={current?.pending ?? []}
            showDue
            clock={clock}
          />
        </div>
      )}
    </section>
  );
}
