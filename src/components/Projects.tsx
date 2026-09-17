import { Section } from "@/components/Section";
import { Reveal } from "@/components/Reveal";
import { SpotlightCard } from "@/components/SpotlightCard";
import { projects } from "@/data/resume";
import { ExternalLinkIcon } from "@/components/icons";

export function Projects() {
  return (
    <Section id="projects" eyebrow="03" title="Projects">
      <div className="grid gap-5 md:grid-cols-2">
        {projects.map((project, index) => (
          <Reveal key={project.name} delay={index * 70}>
            <SpotlightCard className="flex h-full flex-col p-6">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-mono text-base font-semibold text-foreground">
                  {project.name}
                </h3>
                {project.url && (
                  <a
                    href={project.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${project.name} on GitHub`}
                    className="shrink-0 text-subtle transition-colors hover:text-accent-soft"
                  >
                    <ExternalLinkIcon className="size-4" />
                  </a>
                )}
              </div>

              {project.period && (
                <p className="mt-1 font-mono text-[11px] text-subtle">
                  {project.period}
                </p>
              )}

              <p className="mt-4 flex-1 text-sm leading-relaxed text-muted">
                {project.description}
              </p>

              <div className="mt-5 flex flex-wrap gap-1.5">
                {project.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md border border-border bg-background/60 px-2 py-1 font-mono text-[11px] text-subtle"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </SpotlightCard>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
