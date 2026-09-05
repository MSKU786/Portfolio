export function Section({
  id,
  title,
  eyebrow,
  children,
}: {
  id: string;
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 py-20 sm:py-24">
      <div className="mx-auto w-full max-w-4xl px-6">
        <div className="mb-10 flex items-baseline gap-4">
          <span className="font-mono text-sm text-accent">{eyebrow}</span>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        {children}
      </div>
    </section>
  );
}
