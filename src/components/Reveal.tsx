"use client";

import { useEffect, useRef } from "react";

/**
 * Fades and lifts its children into view once, the first time they intersect.
 *
 * Visibility is a DOM attribute rather than React state: it flips exactly once
 * and nothing else reads it, so there is no reason to re-render the subtree.
 * Elements start hidden via CSS; if IntersectionObserver is unavailable the
 * content is shown immediately rather than left blank.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  /** Stagger in milliseconds. */
  delay?: number;
  className?: string;
  as?: "div" | "li" | "section";
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const show = () => {
      node.dataset.visible = "true";
    };

    if (typeof IntersectionObserver === "undefined") {
      show();
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          show();
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      // One generic ref for the three element types this renders as.
      ref={ref as React.Ref<never>}
      data-visible="false"
      className={`reveal ${className ?? ""}`}
      style={{ "--reveal-delay": `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </Tag>
  );
}
