"use client";

import { useEffect, useMemo, useRef } from "react";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import {
  HighlightStyle,
  bracketMatching,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { Compartment, EditorState, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  type DecorationSet,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { useTheme } from "@/components/theme/ThemeToggle";

/**
 * Loaded only on the client, via `next/dynamic`, so none of CodeMirror lands
 * in the shared bundle and nothing here has to survive server rendering.
 */

// -- current-step highlight --------------------------------------------------

const setStepLine = StateEffect.define<number | null>();
const stepLineDecoration = Decoration.line({ class: "cm-step-line" });

/**
 * Holds the single line decoration marking the statement the visualiser is
 * paused on. Keeping it in a `StateField` means it survives edits and maps
 * through document changes correctly.
 */
const stepLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let next = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setStepLine)) continue;
      const line = effect.value;
      next =
        line === null || line < 1 || line > transaction.state.doc.lines
          ? Decoration.none
          : Decoration.set([stepLineDecoration.range(transaction.state.doc.line(line).from)]);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

// -- theme -------------------------------------------------------------------

const themeSpec = {
  "&": {
    color: "var(--foreground)",
    backgroundColor: "transparent",
    fontSize: "13px",
    height: "100%",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-mono), ui-monospace, monospace",
    lineHeight: "1.65",
    padding: "12px 0 24px",
  },
  ".cm-content": { caretColor: "var(--accent-soft)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent-soft)" },
  "&.cm-focused": { outline: "none" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in oklab, var(--accent) 32%, transparent)",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--subtle)",
    border: "none",
    paddingRight: "4px",
  },
  ".cm-lineNumbers .cm-gutterElement": { minWidth: "34px", paddingRight: "10px" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--muted)" },
  // The executing line. A left bar rather than a wash, so the code stays
  // readable underneath it.
  ".cm-step-line": {
    backgroundColor: "color-mix(in oklab, var(--accent) 16%, transparent)",
    boxShadow: "inset 2px 0 0 0 var(--accent-soft)",
  },
  ".cm-matchingBracket": {
  backgroundColor: "color-mix(in oklab, var(--accent-2) 24%, transparent)",
  outline: "none",
  },
};

/**
 * Every colour above is a CSS variable, so the palette follows the page for
 * free. What does not follow for free is CodeMirror's `dark` flag, which
 * drives its own built-in styling — so the theme extension lives in a
 * compartment and gets reconfigured when the site theme changes.
 */
function editorTheme(dark: boolean) {
  return EditorView.theme(themeSpec, { dark });
}

const highlightStyle = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--subtle)", fontStyle: "italic" },
  { tag: [t.keyword, t.moduleKeyword, t.controlKeyword], color: "var(--accent-soft)" },
  { tag: [t.definitionKeyword, t.operatorKeyword], color: "var(--accent-soft)" },
  { tag: [t.string, t.special(t.string)], color: "var(--live)" },
  { tag: [t.number, t.bool, t.null], color: "var(--cm-number)" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--accent-2)" },
  { tag: [t.propertyName], color: "var(--cm-property)" },
  { tag: [t.variableName, t.definition(t.variableName)], color: "var(--foreground)" },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket], color: "var(--muted)" },
  { tag: [t.typeName, t.className, t.namespace], color: "var(--accent-2)" },
  { tag: t.invalid, color: "var(--cm-invalid)" },
]);

// -- component ---------------------------------------------------------------

export default function CodeEditor({
  value,
  onChange,
  stepLine,
}: {
  value: string;
  onChange: (next: string) => void;
  /** 1-based line to mark as currently executing, or null for none. */
  stepLine: number | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);

  // Safe here because this component is loaded with `ssr: false`, so it only
  // ever renders once the inline script has settled the theme.
  const theme = useTheme();
  const themeSlot = useMemo(() => new Compartment(), []);

  // The editor is created once and never torn down on re-render — doing so
  // would lose the cursor and the undo history. So the change handler reaches
  // it through a ref that is kept current after each commit.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!host.current) return;

    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          bracketMatching(),
          indentUnit.of("  "),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          javascript(),
          syntaxHighlighting(highlightStyle),
          stepLineField,
          themeSlot.of(editorTheme(theme === "dark")),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });

    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
    // Mount once. `value` is synced by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    editor.dispatch({ effects: themeSlot.reconfigure(editorTheme(theme === "dark")) });
  }, [theme, themeSlot]);

  // Pull in external edits (a preset being loaded) without clobbering typing.
  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === value) return;
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: value },
    });
  }, [value]);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;

    const effects: StateEffect<unknown>[] = [setStepLine.of(stepLine)];

    // Keep the executing line in view while stepping, but never yank the
    // viewport around when there is nothing to show.
    if (stepLine !== null && stepLine >= 1 && stepLine <= editor.state.doc.lines) {
      effects.push(
        EditorView.scrollIntoView(editor.state.doc.line(stepLine).from, { y: "nearest" }),
      );
    }
    editor.dispatch({ effects });
  }, [stepLine]);

  return <div ref={host} className="h-full overflow-hidden text-[13px]" />;
}
