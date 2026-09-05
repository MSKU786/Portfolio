# Portfolio

Manish Singh's personal portfolio — built with [Next.js](https://nextjs.org) (App Router), TypeScript, and Tailwind CSS.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view it.

## Structure

- `src/data/resume.ts` — all resume/profile content (experience, projects, skills, etc.). Edit this file to update the site's content.
- `src/components/` — one component per section (`Hero`, `Experience`, `Projects`, `Skills`, ...).
- `src/app/` — App Router entry (`layout.tsx`, `page.tsx`, `globals.css`).
- `public/resume.pdf` — downloadable resume, linked from the hero section.

## Deployment

Deployed on [Vercel](https://vercel.com). Pushing to `main`/`master` triggers a new deployment once the project is linked.
