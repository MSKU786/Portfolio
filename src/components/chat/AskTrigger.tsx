"use client";

import { ASK_EVENT } from "@/components/chat/AskPanel";
import { SparkIcon } from "@/components/icons";

/**
 * Opens the assistant from anywhere in the (otherwise server-rendered) page by
 * dispatching a window event the panel listens for.
 */
export function AskTrigger({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(ASK_EVENT))}
      className={className}
    >
      <SparkIcon className="size-4" />
      {children}
    </button>
  );
}
