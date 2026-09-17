import { Reveal } from "@/components/Reveal";

export function Section({
  id,
  title,
  eyebrow,
  children,
}: {
  id: string;
  title: string;
  /** Two-digit index, e.g. "01". */
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto w-full max-w-5xl px-6">
        <Reveal>
          <div className="mb-12">
            <div className="flex items-center gap-4">
              <span className="font-mono text-xs text-accent-2">{eyebrow}</span>
              <div className="rule-fade flex-1" />
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {title}
            </h2>
          </div>
        </Reveal>
        {children}
      </div>
    </section>
  );
}
