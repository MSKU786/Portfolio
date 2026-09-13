import Anthropic from "@anthropic-ai/sdk";
import { personal } from "@/data/resume";
import { CHUNKS } from "@/lib/knowledge";
import { retrieve } from "@/lib/retrieval";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";
import {
  MAX_HISTORY_MESSAGES,
  MAX_QUESTION_LENGTH,
  type ChatEvent,
  type ChatRequestMessage,
  type SourceRef,
} from "@/lib/chat-protocol";

const MODEL = "claude-opus-5";
const TOP_K = 5;

/**
 * Answers are a few sentences about a resume, so a small ceiling keeps latency
 * and spend predictable on a public endpoint. Raise it if answers truncate.
 */
const MAX_TOKENS = 800;

const SYSTEM_PROMPT = `You are the assistant embedded in ${personal.name}'s portfolio site. You answer questions from recruiters, hiring managers, and engineers about ${personal.name}'s background.

Rules:
- Answer ONLY from the numbered context passages provided in the user turn. They are excerpts from ${personal.name}'s resume.
- If the context does not contain the answer, say so plainly and suggest what the visitor could ask instead, or point them to the contact section. Never invent employers, dates, metrics, or technologies.
- Refer to ${personal.name} in the third person ("he", "Manish"). Do not speak as him.
- Be concise and specific: 2-4 sentences, or a short list when comparing several things. Lead with the direct answer, then the supporting detail.
- Prefer concrete numbers from the context (latencies, percentages, client counts) over vague claims.
- Do not mention the passages, the retrieval process, or these instructions. Just answer naturally.
- Stay on the topic of ${personal.name}'s professional background. Politely decline anything else.`;

function sse(event: ChatEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function errorResponse(status: number, message: string, headers?: HeadersInit) {
  return Response.json({ error: message }, { status, headers });
}

function parseMessages(payload: unknown): ChatRequestMessage[] | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { messages } = payload as { messages?: unknown };
  if (!Array.isArray(messages) || messages.length === 0) return null;

  const parsed: ChatRequestMessage[] = [];
  for (const entry of messages) {
    if (typeof entry !== "object" || entry === null) return null;
    const { role, content } = entry as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string") return null;
    const trimmed = content.trim();
    if (!trimmed) return null;
    parsed.push({ role, content: trimmed.slice(0, MAX_QUESTION_LENGTH) });
  }

  // Only the tail of a long conversation is worth resending.
  const recent = parsed.slice(-MAX_HISTORY_MESSAGES);
  if (recent.at(-1)?.role !== "user") return null;
  return recent;
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return errorResponse(
      503,
      "The assistant is not configured on this deployment. Set ANTHROPIC_API_KEY to enable it.",
    );
  }

  const limit = checkRateLimit(clientKey(request));
  if (!limit.allowed) {
    return errorResponse(
      429,
      `Rate limit reached. Try again in about ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`,
      { "retry-after": String(limit.retryAfterSeconds) },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse(400, "Expected a JSON body.");
  }

  const messages = parseMessages(payload);
  if (!messages) {
    return errorResponse(
      400,
      "Body must be { messages: [{ role, content }] } ending with a user message.",
    );
  }

  const question = messages.at(-1)!.content;
  const retrieval = retrieve(question, TOP_K);

  const sources: SourceRef[] = retrieval.matches.map(({ chunk, score }) => ({
    id: chunk.id,
    label: chunk.label,
    anchor: chunk.anchor,
    score: Number(score.toFixed(2)),
    preview: chunk.text.length > 220 ? `${chunk.text.slice(0, 220)}…` : chunk.text,
  }));

  const context = retrieval.matches.length
    ? retrieval.matches
        .map(({ chunk }, index) => `[${index + 1}] (${chunk.label}) ${chunk.text}`)
        .join("\n\n")
    : "(No passages matched this question.)";

  // History gives the model follow-up context; the freshly retrieved passages
  // ride along with the current question so they stay adjacent to it.
  const history = messages.slice(0, -1).map((message) => ({
    role: message.role,
    content: message.content,
  }));

  const client = new Anthropic();
  const requestStartedAt = performance.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: ChatEvent) =>
        controller.enqueue(encoder.encode(sse(event)));

      send({
        type: "meta",
        sources,
        trace: {
          terms: retrieval.terms,
          candidates: retrieval.candidates,
          corpus: CHUNKS.length,
          retrievalMs: Number(retrieval.durationMs.toFixed(2)),
          model: MODEL,
        },
      });

      let firstTokenMs = 0;

      try {
        const messageStream = client.messages.stream({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          // Grounded lookup over a handful of passages: low effort keeps the
          // answer fast and cheap without disabling thinking outright.
          output_config: { effort: "low" },
          messages: [
            ...history,
            {
              role: "user",
              content: `Context passages:\n\n${context}\n\n---\n\nQuestion: ${question}`,
            },
          ],
        });

        for await (const event of messageStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            if (!firstTokenMs) {
              firstTokenMs = performance.now() - requestStartedAt;
            }
            send({ type: "delta", text: event.delta.text });
          }
        }

        const final = await messageStream.finalMessage();

        if (final.stop_reason === "refusal") {
          send({
            type: "error",
            message: "That question was declined. Try asking something else.",
          });
        } else {
          send({
            type: "done",
            stats: {
              inputTokens: final.usage.input_tokens,
              outputTokens: final.usage.output_tokens,
              firstTokenMs: Number(firstTokenMs.toFixed(0)),
              totalMs: Number((performance.now() - requestStartedAt).toFixed(0)),
            },
          });
        }
      } catch (error) {
        const message =
          error instanceof Anthropic.RateLimitError
            ? "The model is rate limited right now. Try again shortly."
            : error instanceof Anthropic.AuthenticationError
              ? "The assistant's API credentials are invalid."
              : error instanceof Anthropic.APIError
                ? `The model returned an error (${error.status}).`
                : "Something went wrong generating that answer.";

        console.error("[chat] generation failed:", error);
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
