/**
 * The single branded Scripture detail in the workspace.
 *
 * The verse text and reference are fixed strings, quoted exactly, and must not
 * be edited, paraphrased or reformatted — see the Scripture rules in AGENTS.md.
 * Nothing generates or reconstructs this text at runtime.
 */
const VERSE_TEXT =
  "Whereby are given unto us exceeding great and precious promises...";
const VERSE_REFERENCE = "2 Peter 1:4 KJV";

export function ScripturePanel() {
  return (
    <figure className="rounded-lg border border-edge/60 bg-panel-raised/30 px-4 py-4">
      <blockquote className="text-[13px] leading-6 text-ink-secondary">
        <p>&ldquo;{VERSE_TEXT}&rdquo;</p>
      </blockquote>
      <figcaption className="mt-2 text-xs font-medium tracking-wide text-gold">
        {VERSE_REFERENCE}
      </figcaption>
    </figure>
  );
}
