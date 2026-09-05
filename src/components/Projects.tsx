import { Section } from "@/components/Section";
import { projects } from "@/data/resume";
import { ExternalLinkIcon } from "@/components/icons";

export function Projects() {
  return (
    <Section id="projects" eyebrow="03." title="Projects">
      <div className="grid gap-5 sm:grid-cols-2">
        {projects.map((project) => (
          <article
            key={project.name}
            className="flex flex-col rounded-lg border border-border bg-surface p-5 transition-colors hover:border-accent/60"
          >
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
                  className="text-muted transition-colors hover:text-accent"
                >
                  <ExternalLinkIcon className="size-4" />
                </a>
              )}
            </div>

            {project.period && (
              <p className="mt-1 font-mono text-xs text-muted">{project.period}</p>
            )}

            <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">
              {project.description}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {project.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-border px-2.5 py-1 font-mono text-xs text-muted"
                >
                  {tag}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}
