import { Section } from "@/components/Section";
import { Reveal } from "@/components/Reveal";
import { experience } from "@/data/resume";

export function Experience() {
  return (
    <Section id="experience" eyebrow="02" title="Experience">
      <ol className="relative space-y-14">
        {/* Timeline spine, fading out past the last role. */}
        <span
          aria-hidden
          className="absolute bottom-0 left-1.25 top-2 w-px bg-linear-to-b from-accent via-accent-2/40 to-transparent"
        />

        {experience.map((job, index) => (
          <Reveal
            as="li"
            key={`${job.company}-${job.role}`}
            delay={index * 80}
            className="relative pl-8"
          >
            <span className="absolute left-0 top-1.5 size-2.75 rounded-full border-2 border-background bg-accent ring-1 ring-accent/40" />

            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="text-lg font-semibold text-foreground">
                {job.role}{" "}
                <span className="text-subtle">·</span>{" "}
                <span className="text-gradient-accent">{job.company}</span>
              </h3>
              <span className="font-mono text-xs text-subtle">
                {job.period}
              </span>
            </div>
            <p className="mt-1 font-mono text-xs text-subtle">{job.location}</p>

            <ul className="mt-5 space-y-3">
              {job.highlights.map((point) => (
                <li
                  key={point}
                  className="flex gap-3 text-sm leading-relaxed text-muted"
                >
                  <span className="mt-2 h-px w-3 shrink-0 bg-border-strong" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex flex-wrap gap-1.5">
              {job.skills.map((skill) => (
                <span
                  key={skill}
                  className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-[11px] text-muted"
                >
                  {skill}
                </span>
              ))}
            </div>
          </Reveal>
        ))}
      </ol>
    </Section>
  );
}
