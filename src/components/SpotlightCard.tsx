"use client";

import { useCallback, useRef } from "react";

/**
 * A card whose gradient highlight follows the cursor.
 *
 * The position is written straight to CSS custom properties on the node, so
 * pointer movement never triggers a React render.
 */
export function SpotlightCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const node = ref.current;
    if (!node) return;

    const bounds = node.getBoundingClientRect();
    node.style.setProperty("--mx", `${event.clientX - bounds.left}px`);
    node.style.setProperty("--my", `${event.clientY - bounds.top}px`);
  }, []);

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      className={`card card-spotlight ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
