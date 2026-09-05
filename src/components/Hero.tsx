import { personal } from "@/data/resume";
import {
  GitHubIcon,
  LinkedInIcon,
  LeetCodeIcon,
  MailIcon,
  DownloadIcon,
} from "@/components/icons";

export function Hero() {
  return (
    <section
      id="top"
      className="scroll-mt-24 border-b border-border px-6 py-24 sm:py-32"
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <p className="font-mono text-sm text-accent">Hi, my name is</p>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
          {personal.name}.
        </h1>
        <h2 className="text-2xl font-semibold tracking-tight text-muted sm:text-4xl">
          I build backend systems that talk to LLMs.
        </h2>
        <p className="max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
          {personal.summary}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <a
            href="#projects"
            className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            View my work
          </a>
          <a
            href={personal.resumeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
          >
            <DownloadIcon className="size-4" />
            Resume
          </a>
        </div>

        <div className="mt-4 flex items-center gap-5">
          <a
            href={personal.social.github}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="text-muted transition-colors hover:text-accent"
          >
            <GitHubIcon className="size-5" />
          </a>
          <a
            href={personal.social.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
            className="text-muted transition-colors hover:text-accent"
          >
            <LinkedInIcon className="size-5" />
          </a>
          <a
            href={personal.social.leetcode}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LeetCode"
            className="text-muted transition-colors hover:text-accent"
          >
            <LeetCodeIcon className="size-5" />
          </a>
          <a
            href={personal.social.email}
            aria-label="Email"
            className="text-muted transition-colors hover:text-accent"
          >
            <MailIcon className="size-5" />
          </a>
        </div>
      </div>
    </section>
  );
}
