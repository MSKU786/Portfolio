/** Wire format shared by the chat route and the client panel. */

export type SourceRef = {
  id: string;
  /** Breadcrumb, e.g. "Experience › Interface AI". */
  label: string;
  /** Page section to scroll to when the chip is clicked. */
  anchor: string;
  /** BM25 relevance score. */
  score: number;
  preview: string;
};

export type RetrievalTrace = {
  /** Query terms after stopword removal and alias expansion. */
  terms: string[];
  /** Chunks sharing at least one term with the query. */
  candidates: number;
  /** Total chunks in the index. */
  corpus: number;
  retrievalMs: number;
  model: string;
};

export type ChatStats = {
  inputTokens: number;
  outputTokens: number;
  /** Time to first streamed token. */
  firstTokenMs: number;
  totalMs: number;
};

export type ChatEvent =
  | { type: "meta"; sources: SourceRef[]; trace: RetrievalTrace }
  | { type: "delta"; text: string }
  | { type: "done"; stats: ChatStats }
  | { type: "error"; message: string };

export type ChatRequestMessage = {
  role: "user" | "assistant";
  content: string;
};

export const MAX_QUESTION_LENGTH = 500;
export const MAX_HISTORY_MESSAGES = 10;
