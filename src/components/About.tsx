import { Section } from "@/components/Section";
import { Reveal } from "@/components/Reveal";
import { personal, stats } from "@/data/resume";

export function About() {
  return (
    <Section id="about" eyebrow="01" title="About">
      <div className="grid gap-12 lg:grid-cols-[1.6fr_1fr]">
        <Reveal className="space-y-5">
          <p className="text-lg leading-relaxed text-foreground">
            I&apos;m a {personal.role.toLowerCase()} in {personal.location},
            working where{" "}
            <span className="font-display text-accent-soft">
              backend engineering meets applied AI
            </span>
            .
          </p>
          <p className="leading-relaxed text-muted">
            Most of my work lives in the unglamorous middle: the retrieval
            pipeline behind a search box, the cron job that repairs stale
            traces, the cache layer that lets a conversation survive a channel
            switch. Over the last few years I&apos;ve shipped RAG pipelines,
            vector search, and LLM-driven agentic workflows into production for
            enterprise financial clients.
          </p>
          <p className="leading-relaxed text-muted">
            Alongside that I lead and mentor engineers across the full delivery
            lifecycle — architecture reviews, release coordination, and the
            client conversations that come with shipping to regulated
            industries.
          </p>
        </Reveal>

        <Reveal delay={120}>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-1">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-surface p-5">
                <dt className="font-mono text-3xl font-semibold text-gradient-accent">
                  {stat.value}
                </dt>
                <dd className="mt-1.5 text-sm leading-snug text-muted">
                  {stat.label}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </Section>
  );
}
