import { Section } from "@/components/Section";
import { personal } from "@/data/resume";
import { GitHubIcon, LinkedInIcon, LeetCodeIcon } from "@/components/icons";

export function Contact() {
  return (
    <Section id="contact" eyebrow="06." title="Get in touch">
      <div className="flex flex-col items-start gap-6 rounded-lg border border-border bg-surface p-8 sm:items-center sm:text-center">
        <p className="max-w-md text-sm leading-relaxed text-muted sm:mx-auto">
          I&apos;m always open to discussing backend architecture, AI-native
          product work, or new opportunities. Drop me a line — I&apos;ll get
          back to you.
        </p>
        <a
          href={personal.social.email}
          className="rounded-md bg-accent px-6 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          {personal.email}
        </a>
        <div className="flex items-center gap-5">
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
        </div>
      </div>
    </Section>
  );
}
