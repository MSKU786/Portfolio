"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { personal } from "@/data/resume";
import { MAX_QUESTION_LENGTH, type SourceRef } from "@/lib/chat-protocol";
import { useAskChat, type ChatTurn } from "@/components/chat/useAskChat";
import {
  ChevronIcon,
  CloseIcon,
  SendIcon,
  SparkIcon,
  StopIcon,
} from "@/components/icons";

/** Dispatched by `AskTrigger` so server components can open the panel. */
export const ASK_EVENT = "portfolio:ask";

const SUGGESTIONS = [
  "What's his experience with RAG?",
  "Has he led a team?",
  "How did he improve performance?",
  "Does he know Kubernetes?",
];

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Scrolls to the page section a passage came from and flashes it, so an answer
 * can be checked against the resume it was drawn from.
 */
function revealSource(anchor: string): boolean {
  const target = document.getElementById(anchor);
  if (!target) return false;

  target.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "start",
  });

  target.classList.remove("cited");
  // Force a reflow so the animation restarts when the same chip is re-clicked.
  void target.offsetWidth;
  target.classList.add("cited");
  window.setTimeout(() => target.classList.remove("cited"), 2600);
  return true;
}

/**
 * Renders the model's plain-text answer: blank lines become paragraphs and
 * leading dashes become a list. Text is never interpreted as HTML.
 */
function AnswerText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter((block) => block.trim());

  return (
    <>
      {blocks.map((block, blockIndex) => {
        const lines = block.split("\n").filter(Boolean);
        const isList = lines.every((line) => /^\s*[-*•]\s+/.test(line));

        if (isList) {
          return (
            <ul key={blockIndex} className="space-y-1.5 pl-1">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex} className="flex gap-2.5">
                  <span className="mt-[7px] size-1 shrink-0 rounded-full bg-accent-soft" />
                  <span>{line.replace(/^\s*[-*•]\s+/, "")}</span>
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={blockIndex} className="whitespace-pre-wrap">
            {block}
          </p>
        );
      })}
    </>
  );
}

function SourceChip({
  source,
  onSelect,
}: {
  source: SourceRef;
  onSelect: (anchor: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(source.anchor)}
      title={source.preview}
      className="group/chip inline-flex max-w-full items-center gap-1.5 rounded-full border border-border-strong bg-surface-raised px-2.5 py-1 text-left font-mono text-[11px] text-muted transition-colors hover:border-accent hover:text-foreground"
    >
      <span className="size-1.5 shrink-0 rounded-full bg-accent transition-transform group-hover/chip:scale-125" />
      <span className="truncate">{source.label}</span>
    </button>
  );
}

/**
 * The engineering exhibit: what retrieval actually did, and what the request
 * cost. Collapsed by default so it never competes with the answer itself.
 */
function TracePanel({ turn }: { turn: ChatTurn }) {
  const [open, setOpen] = useState(false);
  const { trace, stats, sources } = turn;

  if (!trace) return null;

  const topScore = sources?.[0]?.score ?? 1;

  return (
    <div className="mt-2.5 overflow-hidden rounded-lg border border-border bg-background/60">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-wider text-subtle transition-colors hover:text-muted"
      >
        <ChevronIcon
          className={`size-3 transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
        />
        trace
        <span className="ml-auto normal-case tracking-normal">
          {trace.retrievalMs.toFixed(2)}ms retrieval
          {stats ? ` · ${(stats.totalMs / 1000).toFixed(1)}s total` : ""}
        </span>
      </button>

      {open && (
        <dl className="space-y-2.5 border-t border-border px-3 py-3 font-mono text-[11px]">
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-subtle">query</dt>
            <dd className="flex flex-wrap gap-1">
              {trace.terms.length ? (
                trace.terms.map((term) => (
                  <span
                    key={term}
                    className="rounded bg-surface-raised px-1.5 py-0.5 text-accent-soft"
                  >
                    {term}
                  </span>
                ))
              ) : (
                <span className="text-muted">—</span>
              )}
            </dd>
          </div>

          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-subtle">retrieval</dt>
            <dd className="text-muted">
              BM25 · {trace.candidates}/{trace.corpus} chunks matched ·{" "}
              {trace.retrievalMs.toFixed(2)}ms
            </dd>
          </div>

          {sources && sources.length > 0 && (
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 text-subtle">ranked</dt>
              <dd className="min-w-0 flex-1 space-y-1.5">
                {sources.map((source) => (
                  <div key={source.id} className="flex items-center gap-2">
                    <span className="w-9 shrink-0 text-right text-accent-2">
                      {source.score.toFixed(2)}
                    </span>
                    <span
                      className="h-1 shrink-0 rounded-full bg-linear-to-r from-accent to-accent-2"
                      style={{
                        width: `${Math.max(6, (source.score / topScore) * 52)}px`,
                      }}
                    />
                    <span className="truncate text-muted">{source.label}</span>
                  </div>
                ))}
              </dd>
            </div>
          )}

          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-subtle">model</dt>
            <dd className="text-muted">{trace.model}</dd>
          </div>

          {stats && (
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 text-subtle">tokens</dt>
              <dd className="text-muted">
                {stats.inputTokens} in · {stats.outputTokens} out ·{" "}
                {stats.firstTokenMs}ms to first token
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

function Turn({
  turn,
  onSelectSource,
}: {
  turn: ChatTurn;
  onSelectSource: (anchor: string) => void;
}) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="rise-in max-w-[85%] rounded-2xl rounded-br-sm bg-accent/15 px-3.5 py-2 text-sm text-foreground ring-1 ring-accent/25">
          {turn.content}
        </p>
      </div>
    );
  }

  const waiting = turn.streaming && !turn.content;

  return (
    <div className="rise-in">
      <div className="space-y-2.5 text-sm leading-relaxed text-muted">
        {waiting ? (
          <div className="flex items-center gap-1.5 py-1" aria-label="Thinking">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className="thinking-dot size-1.5 rounded-full bg-accent-soft"
                style={{ animationDelay: `${index * 160}ms` }}
              />
            ))}
          </div>
        ) : (
          <AnswerText text={turn.content} />
        )}

        {turn.streaming && turn.content && (
          <span className="caret ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-accent-soft" />
        )}
      </div>

      {turn.error && (
        <p className="mt-2 rounded-lg border border-border-strong bg-surface px-3 py-2 text-xs text-muted">
          {turn.error}
        </p>
      )}

      {!turn.streaming && turn.sources && turn.sources.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 font-mono text-[10.5px] uppercase tracking-wider text-subtle">
            Grounded in
          </p>
          <div className="flex flex-wrap gap-1.5">
            {turn.sources.map((source) => (
              <SourceChip
                key={source.id}
                source={source}
                onSelect={onSelectSource}
              />
            ))}
          </div>
        </div>
      )}

      {!turn.streaming && <TracePanel turn={turn} />}
    </div>
  );
}

export function AskPanel({
  showLauncher = true,
}: {
  /**
   * The floating "Ask about me" button. Pages whose content runs to the
   * bottom-right corner (the playground's queue columns) turn it off and rely
   * on the nav's Ask button and ⌘K instead.
   */
  showLauncher?: boolean;
} = {}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const { turns, isStreaming, send, stop, reset } = useAskChat();

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Global shortcut + the hero's "Ask" button both route through here.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };

    const onAsk = () => setOpen(true);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(ASK_EVENT, onAsk);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(ASK_EVENT, onAsk);
    };
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Pin to the newest content as tokens stream in.
  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [turns]);

  const submit = useCallback(
    (question: string) => {
      if (!question.trim() || isStreaming) return;
      setDraft("");
      void send(question);
    },
    [isStreaming, send],
  );

  const router = useRouter();
  const onSelectSource = useCallback(
    (anchor: string) => {
      // On phones the panel covers the page, so step out of the way first.
      if (window.innerWidth < 768) setOpen(false);
      window.setTimeout(() => {
        // Resume sections only exist on the homepage. From anywhere else (the
        // playground), a citation takes you there rather than doing nothing.
        if (!revealSource(anchor)) router.push(`/#${anchor}`);
      }, 60);
    },
    [router],
  );

  return (
    <>
      {!open && showLauncher && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Ask a question about ${personal.name}`}
          className="group fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full border border-border-strong bg-surface/90 py-2.5 pl-3.5 pr-4 text-sm text-foreground shadow-lg shadow-black/40 backdrop-blur transition-colors hover:border-accent sm:bottom-6 sm:right-6"
        >
          <SparkIcon className="size-4 text-accent-soft transition-transform group-hover:rotate-12" />
          <span className="font-medium">Ask about me</span>
          <kbd className="hidden rounded border border-border-strong px-1.5 py-0.5 font-mono text-[10px] text-subtle sm:inline">
            ⌘K
          </kbd>
        </button>
      )}

      {open && (
        <>
          <button
            type="button"
            aria-label="Close assistant"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm md:hidden"
          />

          <div
            role="dialog"
            aria-modal="false"
            aria-label="Ask about Manish"
            className="rise-in fixed inset-x-0 bottom-0 z-50 flex h-[85vh] flex-col overflow-hidden border-t border-border-strong bg-surface shadow-2xl shadow-black/60 md:inset-x-auto md:bottom-6 md:right-6 md:h-[min(38rem,80vh)] md:w-[26rem] md:rounded-2xl md:border"
          >
            <header className="flex items-center gap-3 border-b border-border px-4 py-3">
              <span className="relative flex size-8 items-center justify-center rounded-full bg-accent/15 ring-1 ring-accent/30">
                <SparkIcon className="size-4 text-accent-soft" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  Ask this résumé
                </p>
                <p className="flex items-center gap-1.5 font-mono text-[10.5px] text-subtle">
                  <span className="live-dot size-1.5 shrink-0 rounded-full bg-live" />
                  <span className="truncate">retrieval-grounded</span>
                </p>
              </div>
              {turns.length > 0 && (
                <button
                  type="button"
                  onClick={reset}
                  className="font-mono text-[10.5px] uppercase tracking-wider text-subtle transition-colors hover:text-muted"
                >
                  clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-subtle transition-colors hover:text-foreground"
              >
                <CloseIcon className="size-4" />
              </button>
            </header>

            <div
              ref={scrollRef}
              className="flex-1 space-y-5 overflow-y-auto px-4 py-4"
            >
              {turns.length === 0 ? (
                <div className="space-y-4">
                  <p className="text-sm leading-relaxed text-muted">
                    Ask anything about {personal.name.split(" ")[0]}&apos;s
                    experience. Questions are matched against his resume with
                    BM25, and only the passages that match are sent to the
                    model — so every answer can be traced back to a section of
                    this page.
                  </p>
                  <div className="space-y-1.5">
                    {SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => submit(suggestion)}
                        className="block w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-left text-sm text-muted transition-colors hover:border-accent/60 hover:text-foreground"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                turns.map((turn) => (
                  <Turn
                    key={turn.id}
                    turn={turn}
                    onSelectSource={onSelectSource}
                  />
                ))
              )}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                submit(draft);
              }}
              className="border-t border-border p-3"
            >
              <div className="flex items-end gap-2 rounded-xl border border-border-strong bg-background px-3 py-2 transition-colors focus-within:border-accent/70">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={draft}
                  maxLength={MAX_QUESTION_LENGTH}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      submit(draft);
                    }
                  }}
                  placeholder="Ask about his experience…"
                  className="max-h-28 min-h-[1.5rem] flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-subtle focus:outline-none"
                />

                {isStreaming ? (
                  <button
                    type="button"
                    onClick={stop}
                    aria-label="Stop generating"
                    className="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:text-foreground"
                  >
                    <StopIcon className="size-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!draft.trim()}
                    aria-label="Send question"
                    className="shrink-0 rounded-lg bg-accent p-1.5 text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <SendIcon className="size-4" />
                  </button>
                )}
              </div>
              <p className="mt-1.5 px-1 font-mono text-[10px] text-subtle">
                Answers come from the resume only. Verify anything that matters.
              </p>
            </form>
          </div>
        </>
      )}
    </>
  );
}
