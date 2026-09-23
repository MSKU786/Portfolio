"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { personal } from "@/data/resume";
import { GitHubIcon, LinkedInIcon, SparkIcon } from "@/components/icons";
import { ASK_EVENT } from "@/components/chat/AskPanel";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const LINKS = [
  { href: "#about", label: "About", id: "about" },
  { href: "#experience", label: "Experience", id: "experience" },
  { href: "#projects", label: "Projects", id: "projects" },
  { href: "#skills", label: "Skills", id: "skills" },
  { href: "#contact", label: "Contact", id: "contact" },
];

export function Nav() {
  // The nav is shared by the homepage and the playground. Section links are
  // in-page anchors on the homepage and must route back to it from elsewhere.
  const pathname = usePathname();
  const onHome = pathname === "/";
  const onPlayground = pathname.startsWith("/playground");

  const [activeId, setActiveId] = useState<string>("");
  const [progress, setProgress] = useState(0);

  // Scroll-spy: the topmost section intersecting the upper band of the
  // viewport wins, which keeps the highlight stable while scrolling.
  useEffect(() => {
    const sections = LINKS.map((link) =>
      document.getElementById(link.id),
    ).filter((node): node is HTMLElement => node !== null);

    if (sections.length === 0) return;

    // A callback only reports sections whose intersection *changed*, so the
    // running set is kept here and the topmost intersecting one wins. Over the
    // hero nothing is in the band and the highlight clears, rather than
    // leaving whichever section was last seen lit up.
    const intersecting = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) intersecting.add(entry.target.id);
          else intersecting.delete(entry.target.id);
        }

        const topmost = LINKS.find((link) => intersecting.has(link.id));
        setActiveId(topmost?.id ?? "");
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );

    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const scrollable =
        document.documentElement.scrollHeight - window.innerHeight;
      setProgress(scrollable > 0 ? window.scrollY / scrollable : 0);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-3.5">
        <Link
          href={onHome ? "#top" : "/"}
          className="font-mono text-sm font-semibold tracking-tight text-foreground"
        >
          manish<span className="text-gradient-accent">.dev</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => {
            const active = activeId === link.id;
            return (
              <Link
                key={link.href}
                href={onHome ? link.href : `/${link.href}`}
                aria-current={active ? "true" : undefined}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-surface text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}

          {/* Leaves the one-pager, so it is set apart from the scroll-spy links. */}
          <span aria-hidden className="mx-1 h-4 w-px bg-border-strong" />
          <Link
            href="/playground"
            aria-current={onPlayground ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              onPlayground ? "bg-surface text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            Playground
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <ThemeToggle />

          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(ASK_EVENT))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-foreground"
          >
            <SparkIcon className="size-3.5 text-accent-soft" />
            <span className="hidden sm:inline">Ask</span>
            <kbd className="hidden font-mono text-[10px] text-subtle lg:inline">
              ⌘K
            </kbd>
          </button>

          <a
            href={personal.social.github}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="text-subtle transition-colors hover:text-foreground"
          >
            <GitHubIcon className="size-4.5" />
          </a>
          <a
            href={personal.social.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
            className="text-subtle transition-colors hover:text-foreground"
          >
            <LinkedInIcon className="size-4.5" />
          </a>
        </div>
      </div>

      {/* Reading progress */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px origin-left bg-linear-to-r from-accent to-accent-2"
        style={{ transform: `scaleX(${progress})` }}
      />
    </header>
  );
}
