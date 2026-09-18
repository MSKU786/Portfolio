import type { Metadata } from "next";
import Link from "next/link";
import { EventLoopLab } from "@/components/playground/EventLoopLab";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { SANDBOX_FILES } from "@/lib/event-loop/globals";

export const metadata: Metadata = {
  title: "Event loop playground — Manish Singh",
  description:
    "Write JavaScript, run it, and watch the call stack, microtask queue, nextTick queue and libuv phases move step by step — for both Node.js and the browser.",
  openGraph: {
    title: "Event loop playground",
    description:
      "An interpreter that runs your JavaScript one step at a time so you can see the call stack drain, the queues fill, and await take frames off the stack.",
    type: "website",
  },
};

export default function PlaygroundPage() {
  return (
    <>
      <header className="relative border-b border-border">
        <div aria-hidden className="pointer-events-none absolute inset-0 aurora opacity-40" />
        <div className="relative mx-auto w-full max-w-[1500px] px-4 pt-6 pb-5 sm:px-6">
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
            Write JavaScript on the left and step through it on the right. This is not a recording:
            a small interpreter runs your code and records what the call stack and every queue
            looked like at each step, so you can scrub forwards and backwards through the whole
            program.
          </p>
        </div>
      </header>

      <main className="flex-1">
        <EventLoopLab />
        <Notes />
      </main>
    </>
  );
}

/**
 * Being explicit about what the sandbox is and is not. A visualiser people are
 * meant to learn from has to say where it stops being the real thing.
 */
function Notes() {
  return (
    <section className="mx-auto w-full max-w-[1500px] px-4 pb-16 sm:px-6">
      <div className="rule-fade mb-6" />
      <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
        <Note title="How it runs">
          <p>
            Your code is parsed and executed by a tree-walking interpreter written for this page —
            no <code className="text-muted">eval</code>, no worker, nothing leaves the browser. It
            owns its own promises and its own clock, which is the only way the ordering on screen
            can be the <em>cause</em> of the output rather than a retelling of it.
          </p>
        </Note>

        <Note title="The clock is virtual">
          <p>
            Nothing actually waits. When no callback is ready the clock jumps straight to the next
            due timer, so a 5-second <code className="text-muted">setTimeout</code> costs you
            nothing. <code className="text-muted">Date.now()</code> reports that virtual time, which
            makes the timings exact rather than approximate.
          </p>
        </Note>

        <Note title="Language supported">
          <p>
            Functions, arrow functions, <code className="text-muted">async</code>/
            <code className="text-muted">await</code>, promises, closures, destructuring, template
            literals, loops, <code className="text-muted">try</code>/
            <code className="text-muted">catch</code>/<code className="text-muted">finally</code>,
            spread, and the common array and string methods.
          </p>
          <p className="mt-2">
            Not supported: classes, generators, regular expressions,{" "}
            <code className="text-muted">import</code>, labelled statements, and top-level{" "}
            <code className="text-muted">await</code>. Anything unsupported fails with a message
            rather than running incorrectly.
          </p>
        </Note>

        <Note title="Node APIs">
          <p>
            <code className="text-muted">process.nextTick</code>,{" "}
            <code className="text-muted">setImmediate</code>,{" "}
            <code className="text-muted">setTimeout</code>/
            <code className="text-muted">setInterval</code>,{" "}
            <code className="text-muted">queueMicrotask</code>, and{" "}
            <code className="text-muted">fs.readFile</code> /{" "}
            <code className="text-muted">fs.promises.readFile</code> over a fake disk holding{" "}
            {SANDBOX_FILES.map((name, i) => (
              <span key={name}>
                {i > 0 ? ", " : ""}
                <code className="text-muted">{name}</code>
              </span>
            ))}
            . No <code className="text-muted">require</code> — the globals are already there.
          </p>
        </Note>

        <Note title="Browser APIs">
          <p>
            <code className="text-muted">setTimeout</code>/
            <code className="text-muted">setInterval</code>,{" "}
            <code className="text-muted">queueMicrotask</code>, promises, and a simulated{" "}
            <code className="text-muted">fetch</code> that resolves to a response with{" "}
            <code className="text-muted">.json()</code> and <code className="text-muted">.text()</code>.
          </p>
          <p className="mt-2">
            There is no rendering step here: no{" "}
            <code className="text-muted">requestAnimationFrame</code>, no layout or paint, and no
            DOM.
          </p>
        </Note>

        <Note title="Set the latency yourself">
          <p>
            Both <code className="text-muted">fs.readFile</code> and{" "}
            <code className="text-muted">fetch</code> take an options object with a{" "}
            <code className="text-muted">latency</code> in milliseconds — a playground extra, not a
            real API. Change it and watch the callback land in a different loop turn.
          </p>
        </Note>
      </div>

      <p className="mt-8 text-xs leading-relaxed text-subtle">
        Where the real runtimes are genuinely non-deterministic — most famously{" "}
        <code className="text-muted">setTimeout(fn, 0)</code> against{" "}
        <code className="text-muted">setImmediate</code> at the top level of a Node script — this
        page picks one order and says so rather than pretending the question has a settled answer.
      </p>
    </section>
  );
}

function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-1.5 font-mono text-[11px] tracking-wide text-accent-2">{title}</h2>
      <div className="text-[12.5px] leading-relaxed text-muted">{children}</div>
    </div>
  );
}
