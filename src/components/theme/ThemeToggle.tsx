"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_THEME, THEME_STORAGE_KEY, type Theme, isTheme } from "@/lib/theme";

/**
 * The theme lives on `document.documentElement`, not in React state.
 *
 * The inline script in `<head>` has already stamped it before React exists, so
 * treating the DOM as the source of truth means the server and the client can
 * never disagree about it — and the toggle below needs no state at all.
 */

const listeners = new Set<() => void>();

function readTheme(): Theme {
  if (typeof document === "undefined") return DEFAULT_THEME;
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function setTheme(next: Theme) {
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = next;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Private mode: the choice just won't survive a reload.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  // Keep other tabs in step when the choice changes here.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY || !isTheme(event.newValue)) return;
    document.documentElement.dataset.theme = event.newValue;
    document.documentElement.style.colorScheme = event.newValue;
    listener();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Only safe inside components that never server-render — the value comes from
 * the DOM, which the server cannot know. `CodeEditor` qualifies: it is loaded
 * with `ssr: false`.
 */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, () => DEFAULT_THEME);
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      // Reading the current theme at click time, rather than from state, is
      // what keeps this component free of hydration concerns.
      onClick={() => setTheme(readTheme() === "dark" ? "light" : "dark")}
      className={`inline-flex size-8 items-center justify-center rounded-lg border border-border-strong text-subtle transition-colors hover:border-accent hover:text-foreground ${className}`}
    >
      {/*
        Both states are rendered and CSS picks one off `data-theme`. That way
        the right icon is correct in the very first painted frame, before any
        JavaScript has run, and the accessible name follows it because a
        `display: none` label is excluded from the name computation.
      */}
      <span className="theme-when-light contents">
        <MoonIcon />
        <span className="sr-only">Switch to dark theme</span>
      </span>
      <span className="theme-when-dark contents">
        <SunIcon />
        <span className="sr-only">Switch to light theme</span>
      </span>
    </button>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path
        d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <circle cx="8" cy="8" r="3.1" />
      <path
        d="M8 1.2v1.6M8 13.2v1.6M14.8 8h-1.6M2.8 8H1.2M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1M12.8 12.8l-1.1-1.1M4.3 4.3 3.2 3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
