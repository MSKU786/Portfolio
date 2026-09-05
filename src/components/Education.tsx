import { Section } from "@/components/Section";
import { education } from "@/data/resume";

export function Education() {
  return (
    <Section id="education" eyebrow="05." title="Education">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border border-border bg-surface p-5">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {education.school}
          </h3>
          <p className="mt-1 text-sm text-muted">{education.degree}</p>
          <p className="mt-1 text-sm text-muted">
            {education.location} · {education.detail}
          </p>
        </div>
        <span className="font-mono text-xs text-muted">{education.period}</span>
      </div>
    </Section>
  );
}
