import { personal, experience } from "@/data/resume";
import { RotatingRoles } from "@/components/RotatingRoles";
import { AskTrigger } from "@/components/chat/AskTrigger";
import { Reveal } from "@/components/Reveal";
import {
  ArrowDownIcon,
  DownloadIcon,
  GitHubIcon,
  LeetCodeIcon,
  LinkedInIcon,
  MailIcon,
} from "@/components/icons";

const PHRASES = [
  "talk to LLMs.",
  "retrieve before they answer.",
  "run on event-driven rails.",
  "hold up under enterprise load.",
];

const SOCIALS = [
  { href: personal.social.github, label: "GitHub", Icon: GitHubIcon },
  { href: personal.social.linkedin, label: "LinkedIn", Icon: LinkedInIcon },
  { href: personal.social.leetcode, label: "LeetCode", Icon: LeetCodeIcon },
  { href: personal.social.email, label: "Email", Icon: MailIcon },
];

export function Hero() {
  const current = experience[0];

  return (
    <section id="top" className="relative scroll-mt-24 overflow-hidden">
      {/* Layered backdrop: drifting glow under a masked grid. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="aurora absolute inset-0" />
        <div className="grid-backdrop absolute inset-0" />
      </div>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-7 px-6 py-28 sm:py-36">
        <Reveal>
          <p className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface/70 px-3 py-1 font-mono text-xs text-muted backdrop-blur">
            <span className="live-dot size-1.5 rounded-full bg-live" />
            {current.role} @ {current.company} · {personal.location}
          </p>
        </Reveal>

        <Reveal delay={80}>
          <h1 className="text-gradient text-5xl font-semibold leading-[0.95] tracking-tight sm:text-7xl">
            {personal.name}
          </h1>
        </Reveal>

        <Reveal delay={160}>
          <h2 className="max-w-3xl text-2xl font-medium leading-tight tracking-tight text-foreground sm:text-4xl">
            I build <span className="font-display text-muted">backend systems</span>{" "}
            that{" "}
            <RotatingRoles phrases={PHRASES} />
          </h2>
        </Reveal>

        <Reveal delay={240}>
          <p className="max-w-2xl text-base leading-relaxed text-muted">
            {personal.summary}
          </p>
        </Reveal>

        <Reveal delay={320}>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <AskTrigger className="group inline-flex items-center gap-2 rounded-lg bg-linear-to-r from-accent to-accent-2 px-5 py-2.5 text-sm font-semibold text-background transition-transform hover:-translate-y-0.5">
              Ask about my work
            </AskTrigger>

            <a
              href="#projects"
              className="rounded-lg border border-border-strong px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent hover:text-accent-soft"
            >
              View my work
            </a>

            <a
              href={personal.resumeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-2 py-2.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
            >
              <DownloadIcon className="size-4" />
              Resume
            </a>
          </div>
        </Reveal>

        <Reveal delay={400}>
          <div className="mt-2 flex items-center gap-5">
            {SOCIALS.map(({ href, label, Icon }) => (
              <a
                key={label}
                href={href}
                target={href.startsWith("mailto:") ? undefined : "_blank"}
                rel="noopener noreferrer"
                aria-label={label}
                className="text-subtle transition-colors hover:text-accent-soft"
              >
                <Icon className="size-5" />
              </a>
            ))}
          </div>
        </Reveal>
      </div>

      <a
        href="#about"
        aria-label="Scroll to about"
        className="mx-auto mb-10 hidden w-fit text-subtle transition-colors hover:text-accent-soft sm:block"
      >
        <ArrowDownIcon className="size-5 animate-bounce" />
      </a>
    </section>
  );
}
