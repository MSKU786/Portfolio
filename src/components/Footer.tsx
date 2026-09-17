import { personal } from "@/data/resume";

export function Footer() {
  return (
    <footer className="border-t border-border px-6 py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-2 text-center font-mono text-xs text-subtle sm:flex-row sm:justify-between sm:text-left">
        <p>
          &copy; {new Date().getFullYear()} {personal.name}
        </p>
        <p>
          Next.js · Tailwind · BM25 retrieval · Claude
        </p>
      </div>
    </footer>
  );
}
