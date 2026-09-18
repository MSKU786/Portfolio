# Portfolio

Manish Singh's personal portfolio — built with [Next.js](https://nextjs.org) (App Router), TypeScript, and Tailwind CSS.

Beyond the usual resume sections, the site ships an **"Ask this résumé" assistant**: a retrieval-grounded chat that answers questions about Manish's background, cites the section each answer came from, and exposes the retrieval trace behind it.

## Development

```bash
npm install
cp .env.example .env.local   # then add your Anthropic API key
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view it.

## Environment

| Variable            | Required | Purpose                                             |
| ------------------- | -------- | --------------------------------------------------- |
| `ANTHROPIC_API_KEY` | For chat | Authenticates `/api/chat`. Get one from the [Anthropic Console](https://console.anthropic.com/settings/keys). |

The key is only read server-side in the route handler and is never exposed to
the browser. Without it the site builds and renders normally — `/api/chat`
returns `503` and the panel shows a "not configured on this deployment"
message, so a keyless preview deploy degrades gracefully instead of breaking.

## The assistant

A question is answered in three steps, all visible in the panel's `trace`
disclosure:

1. **Chunk** — `src/lib/knowledge.ts` flattens `resume.ts` into ~27 passages
   (one per experience bullet, project, skill group, …). Each carries the page
   anchor it came from, which is what makes answers clickable.
2. **Retrieve** — `src/lib/retrieval.ts` scores the question against those
   passages with [Okapi BM25](https://en.wikipedia.org/wiki/Okapi_BM25), after
   stopword removal, light stemming, and an alias pass that maps how people
   actually phrase things onto the resume's vocabulary (`k8s` → `kubernetes`,
   `rag` → `retrieval`/`embedding`/`vector`). Typically sub-millisecond.
3. **Generate** — `src/app/api/chat/route.ts` sends only the top 5 passages to
   Claude and streams the answer back over SSE, followed by token counts and
   timings.

Retrieval is **sparse, not embedding-based** — deliberately. The corpus is one
resume, so BM25 is both accurate enough and free: no embedding provider, no
vector database, no index to rebuild when `resume.ts` changes. If the corpus
ever grows (blog posts, project write-ups), swap step 2 for dense embeddings —
`retrieve()` is the only function the route calls.

The system prompt restricts answers to the retrieved passages and instructs the
model to say when something isn't in the resume, so off-topic questions get a
decline rather than an invention.

### Guardrails

- **Rate limiting** — `src/lib/rate-limit.ts`, 15 requests per IP per 15
  minutes. In-memory and therefore per-instance; fine for a personal site, but
  swap in a shared store if it ever needs to be authoritative.
- **Input validation** — request shape, role sequence, and a 500-character cap
  per message; history is trimmed to the last 10 turns.
- **Cost** — `effort: "low"` and an 800-token ceiling keep answers fast and
  spend predictable.

## Structure

```
src/
  app/
    api/chat/route.ts   Streaming SSE endpoint (retrieve → Claude)
    layout.tsx          Fonts + metadata
    page.tsx            Section composition
    globals.css         Design tokens, animations, card/reveal styles
  components/
    chat/               AskPanel (UI), useAskChat (SSE client), AskTrigger
    Hero, Experience, Projects, ...   One component per section
    Reveal, RotatingRoles, SpotlightCard   Motion primitives
  data/resume.ts        All resume content — edit this to update the site
  lib/
    knowledge.ts        resume.ts → retrievable chunks
    retrieval.ts        BM25 index + scoring
    chat-protocol.ts    Wire types shared by route and client
    rate-limit.ts       Per-IP fixed window
public/resume.pdf       Downloadable resume, linked from the hero
```

**To update content**, edit `src/data/resume.ts` — the page sections *and* the
assistant's knowledge base are both derived from it, so they can't drift apart.

## Accessibility & motion

All animation is gated behind `prefers-reduced-motion`: the reduced-motion
block in `globals.css` collapses transitions, and `RotatingRoles` renders a
single static phrase instead of typing. The site commits to one dark theme
rather than shipping a light variant.

## Deployment

Deployed on [Vercel](https://vercel.com). Pushing to `main` triggers a new
deployment once the project is linked. Set `ANTHROPIC_API_KEY` in the Vercel
project's environment variables to enable the assistant.
