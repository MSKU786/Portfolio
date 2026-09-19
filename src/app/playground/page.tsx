import type { Metadata } from "next";
import Link from "next/link";
import { EventLoopSection } from "@/components/playground/EventLoopSection";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export const metadata: Metadata = {
  title: "Event loop playground — Manish Singh",
  description:
    "Write JavaScript, run it, and watch the call stack and every queue move step by step — in the browser's event loop and in Node's.",
  openGraph: {
    title: "Event loop playground",
    description:
      "Run your own JavaScript and step through the call stack, microtasks, and task queues — for both the browser and Node.js.",
    type: "website",
  },
};

export default function PlaygroundPage() {
  return (
    <>
      <header className="relative border-b border-border">
        <div aria-hidden className="pointer-events-none absolute inset-0 aurora opacity-40" />
        <div className="relative mx-auto w-full max-w-[1500px] px-4 pt-6 pb-6 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 font-mono text-xs text-subtle transition-colors hover:text-foreground"
            >
              <span aria-hidden>←</span> manish<span className="text-gradient-accent">.dev</span>
            </Link>
            <ThemeToggle />
          </div>

          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            The event loop, <span className="font-display text-gradient-accent">one step</span> at a
            time
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Edit the code, press Run, and step through it.
          </p>
        </div>
      </header>

      <main className="flex-1 pb-10">
        <EventLoopSection runtime="browser" />
        <div className="mx-auto w-full max-w-[1500px] px-4 sm:px-6">
          <div className="rule-fade" />
        </div>
        <EventLoopSection runtime="node" />
      </main>
    </>
  );
}
