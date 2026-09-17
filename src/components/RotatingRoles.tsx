"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const TYPE_MS = 55;
const DELETE_MS = 28;
const HOLD_MS = 1800;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToMotionPreference(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Tracks the OS motion setting, including changes made while the page is open. */
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToMotionPreference,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    // Server render: assume motion is fine, then correct on hydration.
    () => false,
  );
}

type TypeState = {
  index: number;
  /** Characters of the current phrase currently shown. */
  length: number;
  deleting: boolean;
};

/**
 * Types each phrase out, holds, deletes, and moves to the next.
 *
 * Every transition happens inside the timer callback rather than the effect
 * body, so a frame is never rendered just to advance the machine. With reduced
 * motion the first phrase is rendered statically.
 */
export function RotatingRoles({ phrases }: { phrases: string[] }) {
  const reducedMotion = usePrefersReducedMotion();
  const [state, setState] = useState<TypeState>({
    index: 0,
    length: 0,
    deleting: false,
  });

  useEffect(() => {
    if (reducedMotion) return;

    const phrase = phrases[state.index % phrases.length];
    const finishedTyping = !state.deleting && state.length === phrase.length;
    const finishedDeleting = state.deleting && state.length === 0;

    const delay = finishedTyping
      ? HOLD_MS
      : finishedDeleting
        ? 0
        : state.deleting
          ? DELETE_MS
          : TYPE_MS;

    const timer = window.setTimeout(() => {
      setState((previous) => {
        const current = phrases[previous.index % phrases.length];

        if (!previous.deleting && previous.length === current.length) {
          return { ...previous, deleting: true };
        }
        if (previous.deleting && previous.length === 0) {
          return {
            index: (previous.index + 1) % phrases.length,
            length: 0,
            deleting: false,
          };
        }
        return {
          ...previous,
          length: previous.length + (previous.deleting ? -1 : 1),
        };
      });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [phrases, reducedMotion, state]);

  const phrase = phrases[state.index % phrases.length];
  const longest = phrases.reduce((a, b) => (a.length >= b.length ? a : b));

  return (
    <span className="relative inline-block align-bottom">
      {/* Reserves the widest line so the heading height stays fixed. */}
      <span aria-hidden className="invisible block">
        {longest}
      </span>
      <span className="absolute inset-0 block text-gradient-accent">
        {reducedMotion ? phrases[0] : phrase.slice(0, state.length)}
        {!reducedMotion && (
          <span className="caret ml-0.5 inline-block h-[0.85em] w-0.75 translate-y-[0.08em] bg-accent-2 align-baseline" />
        )}
      </span>
    </span>
  );
}
