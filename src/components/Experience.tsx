import { Section } from "@/components/Section";
import { experience } from "@/data/resume";

export function Experience() {
  return (
    <Section id="experience" eyebrow="02." title="Experience">
      <ol className="relative space-y-12 border-l border-border pl-8">
        {experience.map((job) => (
          <li key={`${job.company}-${job.role}`} className="relative">
            <span className="absolute -left-[calc(2rem+5px)] top-1.5 size-2.5 rounded-full bg-accent" />

            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="text-lg font-semibold text-foreground">
                {job.role} · <span className="text-accent">{job.company}</span>
              </h3>
              <span className="font-mono text-xs text-muted">{job.period}</span>
            </div>
            <p className="mt-0.5 text-sm text-muted">{job.location}</p>

            <ul className="mt-4 space-y-2.5">
              {job.highlights.map((point) => (
                <li
                  key={point}
                  className="flex gap-2.5 text-sm leading-relaxed text-muted"
                >
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex flex-wrap gap-2">
              {job.skills.map((skill) => (
                <span
                  key={skill}
                  className="rounded-full border border-border px-2.5 py-1 font-mono text-xs text-muted"
                >
                  {skill}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}
