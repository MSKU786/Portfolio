import { Section } from "@/components/Section";
import { Reveal } from "@/components/Reveal";
import { personal } from "@/data/resume";
import { AskTrigger } from "@/components/chat/AskTrigger";
import { GitHubIcon, LeetCodeIcon, LinkedInIcon } from "@/components/icons";

const SOCIALS = [
  { href: personal.social.github, label: "GitHub", Icon: GitHubIcon },
  { href: personal.social.linkedin, label: "LinkedIn", Icon: LinkedInIcon },
  { href: personal.social.leetcode, label: "LeetCode", Icon: LeetCodeIcon },
];

export function Contact() {
  return (
    <Section id="contact" eyebrow="06" title="Get in touch">
      <Reveal>
        <div className="relative overflow-hidden rounded-2xl border border-border-strong bg-surface px-6 py-12 text-center sm:px-12">
          <div
            aria-hidden
            className="aurora pointer-events-none absolute inset-0 opacity-50"
          />

          <div className="relative flex flex-col items-center gap-6">
            <h3 className="max-w-xl text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Let&apos;s talk about{" "}
              <span className="font-display text-accent-soft">
                backend architecture
              </span>{" "}
              or AI-native product work.
            </h3>

            <p className="max-w-md text-sm leading-relaxed text-muted">
              Open to senior engineering roles and interesting problems. Drop me
              a line — or ask the assistant anything first.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <a
                href={personal.social.email}
                className="rounded-lg bg-linear-to-r from-accent to-accent-2 px-6 py-3 text-sm font-semibold text-background transition-transform hover:-translate-y-0.5"
              >
                {personal.email}
              </a>
              <AskTrigger className="inline-flex items-center gap-2 rounded-lg border border-border-strong px-5 py-3 text-sm font-medium text-foreground transition-colors hover:border-accent hover:text-accent-soft">
                Ask about my work
              </AskTrigger>
            </div>

            <div className="flex items-center gap-5 pt-2">
              {SOCIALS.map(({ href, label, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="text-subtle transition-colors hover:text-accent-soft"
                >
                  <Icon className="size-5" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
