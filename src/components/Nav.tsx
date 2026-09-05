import Link from "next/link";
import { personal } from "@/data/resume";
import { GitHubIcon, LinkedInIcon, MailIcon } from "@/components/icons";

const links = [
  { href: "#about", label: "About" },
  { href: "#experience", label: "Experience" },
  { href: "#projects", label: "Projects" },
  { href: "#skills", label: "Skills" },
  { href: "#contact", label: "Contact" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-4">
        <Link
          href="#top"
          className="font-mono text-sm font-semibold text-foreground"
        >
          manish<span className="text-accent">.dev</span>
        </Link>

        <nav className="hidden items-center gap-6 sm:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-muted transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <a
            href={personal.social.github}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="text-muted transition-colors hover:text-foreground"
          >
            <GitHubIcon className="size-5" />
          </a>
          <a
            href={personal.social.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
            className="text-muted transition-colors hover:text-foreground"
          >
            <LinkedInIcon className="size-5" />
          </a>
          <a
            href={personal.social.email}
            aria-label="Email"
            className="text-muted transition-colors hover:text-foreground"
          >
            <MailIcon className="size-5" />
          </a>
        </div>
      </div>
    </header>
  );
}
