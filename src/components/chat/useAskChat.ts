"use client";

import { useCallback, useRef, useState } from "react";
import type {
  ChatEvent,
  ChatStats,
  RetrievalTrace,
  SourceRef,
} from "@/lib/chat-protocol";

export type ChatTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceRef[];
  trace?: RetrievalTrace;
  stats?: ChatStats;
  error?: string;
  streaming?: boolean;
};

let turnCounter = 0;
const nextId = () => `turn-${++turnCounter}`;

/**
 * Reads the chat route's SSE stream and folds each event into the turn list.
 *
 * The server frames every event as a single `data:` line, so a newline-
 * delimited scan over the decoded text is enough - no SSE library required.
 */
export function useAskChat() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const updateTurn = useCallback(
    (id: string, patch: Partial<ChatTurn> | ((prev: ChatTurn) => ChatTurn)) => {
      setTurns((current) =>
        current.map((turn) =>
          turn.id !== id
            ? turn
            : typeof patch === "function"
              ? patch(turn)
              : { ...turn, ...patch },
        ),
      );
    },
    [],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const reset = useCallback(() => {
    stop();
    setTurns([]);
  }, [stop]);

  const send = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || abortRef.current) return;

      const userTurn: ChatTurn = {
        id: nextId(),
        role: "user",
        content: trimmed,
      };
      const answerTurn: ChatTurn = {
        id: nextId(),
        role: "assistant",
        content: "",
        streaming: true,
      };

      // Snapshot the history the request will carry before React re-renders.
      const history = [...turns, userTurn]
        .filter((turn) => !turn.error)
        .map((turn) => ({ role: turn.role, content: turn.content }))
        .filter((message) => message.content.length > 0);

      setTurns((current) => [...current, userTurn, answerTurn]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: history }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const detail = await response
            .json()
            .then((body: { error?: string }) => body.error)
            .catch(() => null);
          updateTurn(answerTurn.id, {
            streaming: false,
            error: detail ?? `Request failed (${response.status}).`,
          });
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Events are separated by a blank line; keep any partial tail.
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const line = frame.trim();
            if (!line.startsWith("data:")) continue;

            let event: ChatEvent;
            try {
              event = JSON.parse(line.slice(5).trim()) as ChatEvent;
            } catch {
              continue;
            }

            switch (event.type) {
              case "meta":
                updateTurn(answerTurn.id, {
                  sources: event.sources,
                  trace: event.trace,
                });
                break;
              case "delta":
                updateTurn(answerTurn.id, (prev) => ({
                  ...prev,
                  content: prev.content + event.text,
                }));
                break;
              case "done":
                updateTurn(answerTurn.id, {
                  stats: event.stats,
                  streaming: false,
                });
                break;
              case "error":
                updateTurn(answerTurn.id, {
                  error: event.message,
                  streaming: false,
                });
                break;
            }
          }
        }

        updateTurn(answerTurn.id, { streaming: false });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          updateTurn(answerTurn.id, {
            streaming: false,
            error: "Could not reach the assistant. Check your connection.",
          });
        } else {
          updateTurn(answerTurn.id, { streaming: false });
        }
      } finally {
        abortRef.current = null;
        setIsStreaming(false);
      }
    },
    [turns, updateTurn],
  );

  return { turns, isStreaming, send, stop, reset };
}
