import { CHUNKS, type Chunk } from "@/lib/knowledge";

export type ScoredChunk = {
  chunk: Chunk;
  score: number;
};

export type RetrievalResult = {
  matches: ScoredChunk[];
  /** Query terms after stopword removal and alias normalization. */
  terms: string[];
  /** Chunks that shared at least one term with the query. */
  candidates: number;
  durationMs: number;
};

const STOPWORDS = new Set([
  "a", "about", "an", "and", "any", "are", "as", "at", "be", "been", "but",
  "by", "can", "did", "do", "does", "doing", "done", "for", "from", "had",
  "has", "have", "he", "her", "him", "his", "how", "i", "in", "is", "it",
  "its", "know", "me", "much", "my", "of", "on", "or", "she", "so", "some",
  "tell", "that", "the", "their", "them", "then", "there", "these", "they",
  "this", "to", "up", "us", "was", "we", "were", "what", "when", "where",
  "which", "who", "why", "will", "with", "work", "worked", "would", "you",
  "your",
]);

/**
 * Maps the many ways a recruiter might phrase something onto the vocabulary
 * the resume actually uses. Applied to documents and queries alike, so "k8s"
 * in a question matches "Kubernetes" in a bullet.
 */
const ALIASES: Record<string, string[]> = {
  ai: ["llm"],
  agent: ["agentic"],
  agents: ["agentic"],
  agentic: ["agentic", "llm"],
  bengaluru: ["bangalore"],
  bangalore: ["bengaluru"],
  banking: ["bank", "financial", "fintech"],
  chatbot: ["bot", "conversation"],
  cicd: ["jenkins", "pipeline", "deployment"],
  cloud: ["aws", "gcp"],
  db: ["database"],
  devops: ["docker", "kubernetes", "jenkins"],
  embedding: ["embeddings", "vector"],
  embeddings: ["embedding", "vector"],
  gcp: ["google", "cloud"],
  genai: ["llm", "ai"],
  gpt: ["llm", "openai"],
  js: ["javascript"],
  k8s: ["kubernetes"],
  llm: ["ai", "openai", "vertex", "gpt"],
  ml: ["ai", "llm"],
  nodejs: ["node"],
  postgres: ["postgresql", "sql"],
  postgresql: ["postgres", "sql"],
  rag: ["retrieval", "embedding", "vector", "semantic"],
  search: ["semantic", "retrieval", "discovery"],
  ts: ["typescript"],
  vector: ["embedding", "pinecone", "semantic"],
  leadership: ["led", "lead", "mentor", "team"],
  lead: ["led", "mentor", "team", "leadership"],
  manage: ["led", "lead", "mentor", "team"],
  mentor: ["mentored", "team", "lead"],
  scale: ["scaling", "performance", "latency"],
  performance: ["latency", "optimize", "faster", "cut", "time", "speed", "response"],
  improve: ["optimize", "reduce", "cut", "faster", "performance"],
  optimize: ["improve", "performance", "faster", "cut"],
  faster: ["performance", "latency", "speed", "time"],
  latency: ["performance", "time", "response", "speed"],
  impact: ["improve", "performance", "result"],
  study: ["education", "degree", "college", "university"],
  school: ["education", "degree", "college"],
  college: ["education", "degree", "university"],
  university: ["education", "degree", "college"],
  experience: ["years", "role", "engineer"],
  contact: ["email", "reach", "hire"],
  hire: ["contact", "email", "opportunity"],
};

/**
 * Collapses trivial morphological variants so "pipelines"/"pipeline" and
 * "improving"/"improve" land on the same term. Deliberately conservative — a
 * full stemmer would over-merge on a corpus this small.
 *
 * Order matters: suffix stripping runs before the doubled-consonant and
 * trailing-`e` passes, which exist to keep the inflected and base forms
 * symmetric ("cutting" → "cut", "improving" → "improv" ← "improve").
 */
function normalize(token: string): string {
  let term = token;

  if (term.length > 4 && term.endsWith("ies")) term = `${term.slice(0, -3)}y`;
  else if (term.length > 4 && term.endsWith("ing")) term = term.slice(0, -3);
  // "-eed" is part of the stem, not a suffix: "speed" must not become "spe".
  else if (term.length > 4 && term.endsWith("ed") && !term.endsWith("eed"))
    term = term.slice(0, -2);
  else if (term.length > 3 && term.endsWith("s") && !term.endsWith("ss"))
    term = term.slice(0, -1);

  // "cutting" → "cutt" → "cut"; leaves "ll"/"ss" words like "call" alone.
  if (term.length > 3 && /([bcdfgmnpt])$/.test(term)) term = term.slice(0, -1);

  // "improve" → "improv" so it meets "improving"; "response" → "respons".
  if (term.length > 4 && term.endsWith("e")) term = term.slice(0, -1);

  return term;
}

function tokenize(input: string): string[] {
  const raw = input
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const terms: string[] = [];
  for (const token of raw) {
    // Keep "node.js" and "c++" intact, but drop trailing sentence punctuation.
    const cleaned = token.replace(/\.$/, "").replace(/\./g, "");
    if (!cleaned || STOPWORDS.has(cleaned)) continue;

    const stem = normalize(cleaned);
    if (STOPWORDS.has(stem)) continue;
    terms.push(stem);

    for (const alias of ALIASES[cleaned] ?? ALIASES[stem] ?? []) {
      terms.push(normalize(alias));
    }
  }
  return terms;
}

type IndexedChunk = {
  chunk: Chunk;
  termFrequency: Map<string, number>;
  length: number;
};

type Index = {
  docs: IndexedChunk[];
  documentFrequency: Map<string, number>;
  averageLength: number;
};

function buildIndex(chunks: Chunk[]): Index {
  const documentFrequency = new Map<string, number>();

  const docs = chunks.map((chunk) => {
    // The label is indexed alongside the body so "projects" or a company name
    // matches even when the sentence itself never repeats it.
    const terms = tokenize(`${chunk.label} ${chunk.text}`);
    const termFrequency = new Map<string, number>();
    for (const term of terms) {
      termFrequency.set(term, (termFrequency.get(term) ?? 0) + 1);
    }
    for (const term of termFrequency.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
    return { chunk, termFrequency, length: terms.length };
  });

  const averageLength =
    docs.reduce((total, doc) => total + doc.length, 0) / (docs.length || 1);

  return { docs, documentFrequency, averageLength };
}

const INDEX = buildIndex(CHUNKS);

const K1 = 1.5;
const B = 0.75;

/** Okapi BM25 over the resume chunks. */
export function retrieve(query: string, topK = 5): RetrievalResult {
  const startedAt = performance.now();
  const terms = tokenize(query);
  const uniqueTerms = [...new Set(terms)];
  const totalDocs = INDEX.docs.length;

  const scored: ScoredChunk[] = [];

  for (const doc of INDEX.docs) {
    let score = 0;
    for (const term of uniqueTerms) {
      const frequency = doc.termFrequency.get(term);
      if (!frequency) continue;

      const docsWithTerm = INDEX.documentFrequency.get(term) ?? 0;
      const idf = Math.log(
        1 + (totalDocs - docsWithTerm + 0.5) / (docsWithTerm + 0.5),
      );
      const denominator =
        frequency + K1 * (1 - B + (B * doc.length) / INDEX.averageLength);
      score += idf * ((frequency * (K1 + 1)) / denominator);
    }
    if (score > 0) scored.push({ chunk: doc.chunk, score });
  }

  scored.sort((a, b) => b.score - a.score);

  return {
    matches: scored.slice(0, topK),
    terms: uniqueTerms,
    candidates: scored.length,
    durationMs: performance.now() - startedAt,
  };
}
