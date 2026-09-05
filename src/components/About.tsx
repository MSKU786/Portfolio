import { Section } from "@/components/Section";
import { personal, stats } from "@/data/resume";

export function About() {
  return (
    <Section id="about" eyebrow="01." title="About">
      <div className="grid gap-10 sm:grid-cols-[2fr_1fr]">
        <p className="text-base leading-relaxed text-muted">
          I&apos;m a {personal.role.toLowerCase()} based in {personal.location},
          focused on Node.js/TypeScript backend systems and AI-native product
          development. Over the last few years I&apos;ve shipped RAG pipelines,
          vector search, and LLM-driven agentic workflows in production for
          enterprise financial clients, while leading and mentoring engineers
          across the full delivery lifecycle.
        </p>

        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-1">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt className="font-mono text-2xl font-semibold text-accent">
                {stat.value}
              </dt>
              <dd className="mt-1 text-sm text-muted">{stat.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}
