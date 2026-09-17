import { Section } from "@/components/Section";
import { Reveal } from "@/components/Reveal";
import { education } from "@/data/resume";

export function Education() {
  return (
    <Section id="education" eyebrow="05" title="Education">
      <Reveal>
        <div className="card flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 p-6">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              {education.school}
            </h3>
            <p className="mt-1.5 text-sm text-muted">{education.degree}</p>
            <p className="mt-1 font-mono text-xs text-subtle">
              {education.location} · {education.detail}
            </p>
          </div>
          <span className="font-mono text-xs text-subtle">
            {education.period}
          </span>
        </div>
      </Reveal>
    </Section>
  );
}
