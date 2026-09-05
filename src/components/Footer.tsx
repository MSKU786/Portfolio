import { personal } from "@/data/resume";

export function Footer() {
  return (
    <footer className="border-t border-border px-6 py-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-2 text-center font-mono text-xs text-muted sm:flex-row sm:justify-between sm:text-left">
        <p>
          &copy; {new Date().getFullYear()} {personal.name}
        </p>
        <p>Built with Next.js &amp; Tailwind CSS</p>
      </div>
    </footer>
  );
}
