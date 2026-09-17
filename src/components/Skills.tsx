import { Section } from "@/components/Section";
import { Reveal } from "@/components/Reveal";
import { skills } from "@/data/resume";

export function Skills() {
  return (
    <Section id="skills" eyebrow="04" title="Skills">
      <div className="grid gap-x-10 gap-y-9 md:grid-cols-2">
        {skills.map((group, index) => (
          <Reveal key={group.category} delay={index * 60}>
            <h3 className="mb-3 flex items-center gap-2.5 text-sm font-semibold text-foreground">
              <span className="size-1.5 rounded-full bg-accent" />
              {group.category}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {group.items.map((item) => (
                <span
                  key={item}
                  className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-muted transition-colors hover:border-accent/50 hover:text-foreground"
                >
                  {item}
                </span>
              ))}
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
