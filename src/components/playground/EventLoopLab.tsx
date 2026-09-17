"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { buildTrace } from "@/lib/event-loop/interpreter";
import { SCENARIOS, type Scenario } from "@/lib/event-loop/scenarios";
import type { Runtime, Trace } from "@/lib/event-loop/types";
import {
  CallStackPanel,
  ConsolePanel,
  Narration,
  PendingPanel,
  PhaseTrack,
  QueuePanel,
} from "./panels";
import { SPEEDS, Transport } from "./Transport";

/**
 * CodeMirror is client-only and chunky, so it loads on demand. The fallback
 * keeps the editor column from collapsing while it arrives.
 */
const CodeEditor = dynamic(() => import("./CodeEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center font-mono text-[11px] text-subtle">
      loading editor…
    </div>
  ),
});

const RUNTIMES: { id: Runtime; label: string; sub: string }[] = [
  { id: "node", label: "Node.js", sub: "phases, nextTick, setImmediate, fs" },
  { id: "browser", label: "Browser", sub: "task queue, microtasks, fetch" },
];

type CodeState = Record<Runtime, string>;

export function EventLoopLab() {
  const [runtime, setRuntime] = useState<Runtime>("node");
  const [scenarioId, setScenarioId] = useState<Record<Runtime, string>>({
    node: SCENARIOS.node[0].id,
    browser: SCENARIOS.browser[0].id,
  });
  const [code, setCode] = useState<CodeState>({
    node: SCENARIOS.node[0].code,
    browser: SCENARIOS.browser[0].code,
  });

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(1);

  /**
   * The exact input the visible trace was built from. Keeping it in state,
   * rather than tracing whatever is in the editor right now, is what lets the
   * code be edited without the panels thrashing underneath — and the trace
   * itself is then just a pure function of it.
   */
  const [committed, setCommitted] = useState<{ source: string; runtime: Runtime }>({
    source: SCENARIOS.node[0].code,
    runtime: "node",
  });

  const trace: Trace = useMemo(
    () => buildTrace(committed.source, committed.runtime),
    [committed],
  );

  const source = code[runtime];
  const stale = committed.source !== source;

  /** Re-traces from `nextSource` and rewinds the scrubber to the start. */
  const run = useCallback((nextSource: string, nextRuntime: Runtime, autoplay: boolean) => {
    setCommitted({ source: nextSource, runtime: nextRuntime });
    setIndex(0);
    setPlaying(autoplay);
  }, []);

  const switchRuntime = (next: Runtime) => {
    setRuntime(next);
    // Each tab keeps its own edits; switching re-traces whatever that tab holds.
    run(code[next], next, false);
  };

  const snapshots = trace.snapshots;
  const total = snapshots.length;
  const current = total > 0 ? snapshots[Math.min(index, total - 1)] : null;

  const seek = useCallback(
    (next: number) => {
      setIndex((current) => {
        const clamped = Math.max(0, Math.min(next, Math.max(0, total - 1)));
        if (clamped !== current) setPlaying(false);
        return clamped;
      });
    },
    [total],
  );

  // Playback. Pausing at the end rather than looping: a trace has a real
  // ending, and restarting silently would hide it.
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

  const togglePlay = useCallback(() => {
    if (total === 0) return;
    setPlaying((p) => {
      if (p) return false;
      // Pressing play at the end starts over, which is what you want.
      setIndex((i) => (i >= total - 1 ? 0 : i));
      return true;
    });
  }, [total]);

  // Keyboard shortcuts, but never while the user is typing in the editor.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".cm-editor") || target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") {
        return;
      }
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
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, seek, togglePlay]);

  const scenarios = SCENARIOS[runtime];
  const activeScenario = useMemo(
    () => scenarios.find((s) => s.id === scenarioId[runtime]) ?? scenarios[0],
    [scenarios, scenarioId, runtime],
  );

  const loadScenario = (scenario: Scenario) => {
    setScenarioId((prev) => ({ ...prev, [runtime]: scenario.id }));
    setCode((prev) => ({ ...prev, [runtime]: scenario.code }));
    run(scenario.code, runtime, false);
  };

  const onCodeChange = (next: string) => {
    setCode((prev) => ({ ...prev, [runtime]: next }));
  };

  const queues = current?.queues;
  const logs = trace.logs;

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 pb-10 sm:px-6">
      {/* ---- runtime tabs + scenario picker ---- */}
      <div className="flex flex-col gap-3 pt-5 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div
          role="tablist"
          aria-label="Runtime"
          className="inline-flex rounded-xl border border-border bg-surface/60 p-1"
        >
          {RUNTIMES.map((option) => {
            const active = option.id === runtime;
            return (
              <button
                key={option.id}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => switchRuntime(option.id)}
                className={`rounded-lg px-3.5 py-2 text-left transition-colors ${
                  active ? "bg-surface-raised" : "hover:bg-surface-raised/50"
                }`}
              >
                <span
                  className={`block text-[13px] font-medium ${active ? "text-foreground" : "text-muted"}`}
                >
                  {option.label}
                </span>
                <span className="mt-0.5 hidden font-mono text-[10px] text-subtle sm:block">
                  {option.sub}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5 lg:max-w-[52%]">
          <div className="flex flex-wrap gap-1.5">
            {scenarios.map((scenario) => {
              const active = scenario.id === activeScenario.id;
              return (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => loadScenario(scenario)}
                  className={`rounded-lg border px-2.5 py-1.5 text-[11.5px] transition-colors ${
                    active
                      ? "border-accent/60 bg-accent/10 text-foreground"
                      : "border-border text-muted hover:border-border-strong hover:text-foreground"
                  }`}
                >
                  {scenario.title}
                </button>
              );
            })}
          </div>
          <p className="text-[11.5px] leading-snug text-subtle">{activeScenario.blurb}</p>
        </div>
      </div>

      {/* ---- transport + narration ---- */}
      <div className="sticky top-0 z-20 -mx-4 mb-3 border-y border-border bg-background/85 px-4 py-2.5 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <Transport
          snapshots={snapshots}
          index={index}
          playing={playing}
          speedIndex={speedIndex}
          onSeek={seek}
          onTogglePlay={togglePlay}
          onSpeedChange={setSpeedIndex}
        />
        <div className="mt-2 min-h-[1.5rem]">
          <Narration snapshot={current} />
        </div>
      </div>

      {/* ---- main grid ---- */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* Editor column */}
        <div className="flex min-h-0 flex-col gap-3">
          <div className="flex min-h-[340px] flex-col overflow-hidden rounded-xl border border-border bg-surface/60 lg:h-[clamp(340px,52vh,620px)]">
            <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-accent-soft" />
              <h3 className="font-mono text-[11px] font-medium text-foreground">
                {runtime === "node" ? "script.js" : "app.js"}
              </h3>
              <p className="truncate text-[10px] text-subtle">editable</p>

              <button
                type="button"
                onClick={() => run(source, runtime, true)}
                className={`ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                  stale
                    ? "border-accent bg-accent/15 text-foreground"
                    : "border-border-strong text-muted hover:border-accent hover:text-foreground"
                }`}
              >
                <span
                  aria-hidden
                  className={`size-1.5 rounded-full ${stale ? "bg-accent-soft" : "bg-live"}`}
                />
                {stale ? "Run changes" : "Run"}
              </button>
            </div>

            <div className="min-h-0 flex-1">
              <CodeEditor value={source} onChange={onCodeChange} stepLine={current?.line ?? null} />
            </div>
          </div>

          {trace.error ? (
            <p className="rounded-xl border border-[#f87171]/40 bg-[#f87171]/10 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-[#fca5a5]">
              {trace.error}
            </p>
          ) : null}

          <ConsolePanel
            logs={logs}
            visibleCount={current?.logCount ?? 0}
            className="min-h-[160px] lg:h-[clamp(160px,26vh,280px)]"
          />
        </div>

        {/* Visualiser column */}
        <div className="flex min-h-0 flex-col gap-3">
          {runtime === "node" ? (
            <PhaseTrack phase={current?.phase ?? null} turn={current?.turn ?? 0} />
          ) : null}

          <CallStackPanel
            frames={current?.stack ?? []}
            className="min-h-[124px] lg:h-[clamp(124px,17vh,190px)]"
          />

          <div className="grid gap-3 sm:grid-cols-2">
            {runtime === "node" ? (
              <QueuePanel
                title="nextTick queue"
                hint="highest priority"
                accent="var(--q-tick)"
                items={queues?.nextTick ?? []}
                empty="empty"
                className="min-h-[104px] lg:h-[clamp(104px,15vh,170px)]"
              />
            ) : null}
            <QueuePanel
              title="microtask queue"
              hint="promises, await"
              accent="var(--q-micro)"
              items={queues?.microtask ?? []}
              empty="empty"
              className={`min-h-[104px] lg:h-[clamp(104px,15vh,170px)] ${
                runtime === "browser" ? "sm:col-span-2" : ""
              }`}
            />
          </div>

          {runtime === "node" ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <QueuePanel
                title="timers"
                hint="phase 1"
                accent="var(--q-timer)"
                items={queues?.timer ?? []}
                empty="—"
                numbered={false}
                className="min-h-[92px] lg:h-[clamp(92px,13vh,150px)]"
              />
              <QueuePanel
                title="poll (I/O)"
                hint="phase 3"
                accent="var(--q-io)"
                items={queues?.io ?? []}
                empty="—"
                numbered={false}
                className="min-h-[92px] lg:h-[clamp(92px,13vh,150px)]"
              />
              <QueuePanel
                title="check"
                hint="setImmediate"
                accent="var(--q-check)"
                items={queues?.immediate ?? []}
                empty="—"
                numbered={false}
                className="min-h-[92px] lg:h-[clamp(92px,13vh,150px)]"
              />
            </div>
          ) : (
            <QueuePanel
              title="task queue"
              hint="one per loop turn"
              accent="var(--q-timer)"
              items={[...(queues?.timer ?? []), ...(queues?.io ?? [])]}
              empty="empty — the loop has nothing to pick up"
              className="min-h-[104px] lg:h-[clamp(104px,15vh,180px)]"
            />
          )}

          <PendingPanel
            items={current?.pending ?? []}
            runtime={runtime}
            clock={current?.clock ?? 0}
            className="min-h-[104px] flex-1 lg:h-[clamp(104px,16vh,200px)]"
          />
        </div>
      </div>
    </div>
  );
}
