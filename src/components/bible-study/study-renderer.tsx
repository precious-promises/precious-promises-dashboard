import type { CanonicalBibleStudy, ScriptureEvidence } from "@/lib/bible-study/types";
import { blueLetterBibleLexiconUrl, youVersionSearchUrl } from "@/lib/bible-study/links";

function ScriptureBlock({
  item,
  label,
}: {
  item: ScriptureEvidence;
  label?: string;
}) {
  return (
    <article className="rounded-xl border border-edge/70 bg-white/[0.018] p-4">
      {label ? (
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold">
          {label}
        </p>
      ) : null}
      <h4 className="text-sm font-semibold text-ink-primary">
        {item.reference} · {item.translation}
      </h4>
      <blockquote className="mt-2 border-l-2 border-[#7d39e6] pl-3 text-sm leading-6 text-ink-secondary">
        {item.text}
      </blockquote>
      <p className="mt-3 text-xs leading-5 text-ink-muted">
        <strong className="text-ink-secondary">Immediate context:</strong>{" "}
        {item.immediate_context}
      </p>
      <p className="mt-2 text-xs leading-5 text-ink-muted">
        <strong className="text-ink-secondary">Why it supports the point:</strong>{" "}
        {item.relevance}
      </p>
      <a
        href={youVersionSearchUrl(item.reference)}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-block text-xs font-semibold text-[#bda7ff]"
      >
        Find in YouVersion
      </a>
    </article>
  );
}

export function BibleStudyRenderer({ study }: { study: CanonicalBibleStudy }) {
  const sections = [
    ["Main Truth", study.main_truth],
    ["Opening / Overview", study.opening_overview],
    ["Historical Context", study.historical_context],
    ["Literary Context", study.literary_context],
    ["Situational Context", study.situational_context],
  ] as const;

  return (
    <article className="space-y-6 text-ink-secondary">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight text-ink-primary">
          {study.title}
        </h2>
      </header>

      <section>
        <h3 className="mb-3 text-base font-semibold text-ink-primary">Main Passage</h3>
        <ScriptureBlock item={study.main_passage} />
      </section>

      {sections.map(([title, body]) => (
        <section key={title}>
          <h3 className="text-base font-semibold text-ink-primary">{title}</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-7">{body}</p>
        </section>
      ))}

      <section>
        <h3 className="text-base font-semibold text-ink-primary">
          Verse-by-Verse / Phrase-by-Phrase Breakdown
        </h3>
        <div className="mt-3 space-y-3">
          {study.verse_breakdown.map((item, index) => (
            <div key={index} className="rounded-xl border border-edge/70 p-4">
              <h4 className="text-sm font-semibold text-ink-primary">{item.phrase}</h4>
              <p className="mt-2 text-sm leading-7">{item.explanation}</p>
            </div>
          ))}
        </div>
      </section>

      {study.original_language.length ? (
        <section>
          <h3 className="text-base font-semibold text-ink-primary">Original Language</h3>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {study.original_language.map((item, index) => {
              const lexicon = blueLetterBibleLexiconUrl(item.strongs_number);
              return (
                <div key={index} className="rounded-xl border border-edge/70 p-4 text-sm leading-6">
                  <h4 className="font-semibold text-ink-primary">
                    {item.original_word || item.lemma} · {item.transliteration}
                  </h4>
                  <p className="mt-2"><strong>Form:</strong> {item.form_in_verse || "Not supplied"}</p>
                  <p><strong>Lemma:</strong> {item.lemma || "Not supplied"}</p>
                  <p><strong>Strong’s:</strong> {item.strongs_number || "Not supplied"}</p>
                  <p><strong>Lexical range:</strong> {item.lexical_meaning || item.grounding_note}</p>
                  <p><strong>Meaning here:</strong> {item.contextual_meaning || item.grounding_note}</p>
                  {item.grammar ? <p><strong>Grammar:</strong> {item.grammar}</p> : null}
                  <p><strong>Why it matters:</strong> {item.why_it_matters}</p>
                  {lexicon ? (
                    <a href={lexicon} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-[#bda7ff]">
                      Blue Letter Bible lexicon
                    </a>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {[
        ["Direct Cross References", study.direct_cross_references],
        ["Supporting Cross References", study.supporting_cross_references],
        ["Biblical Examples", study.biblical_examples],
      ].map(([title, items]) => (
        <section key={title as string}>
          <h3 className="text-base font-semibold text-ink-primary">{title as string}</h3>
          <div className="mt-3 space-y-3">
            {(items as ScriptureEvidence[]).map((item, index) => (
              <ScriptureBlock key={index} item={item} />
            ))}
          </div>
        </section>
      ))}

      <section>
        <h3 className="text-base font-semibold text-ink-primary">Major Biblical / Doctrinal Themes</h3>
        <div className="mt-3 space-y-2">
          {study.major_themes.map((item, index) => (
            <div key={index} className="rounded-xl border border-edge/70 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gold">
                {item.claim_level.replaceAll("_", " ")}
              </p>
              <h4 className="mt-1 text-sm font-semibold text-ink-primary">{item.label}</h4>
              <p className="mt-2 text-sm leading-6">{item.explanation}</p>
            </div>
          ))}
        </div>
      </section>

      {[
        ["What This Passage Does Not Mean", study.what_this_passage_does_not_mean],
        ["Practical Application", study.practical_application],
        ["Study / Reflection Questions", study.study_reflection_questions],
        ["Key Takeaways", study.key_takeaways],
      ].map(([title, items]) => (
        <section key={title as string}>
          <h3 className="text-base font-semibold text-ink-primary">{title as string}</h3>
          <ul className="mt-2 space-y-2 pl-5 text-sm leading-6">
            {(items as string[]).map((item, index) => (
              <li key={index} className="list-disc">{item}</li>
            ))}
          </ul>
        </section>
      ))}

      <section>
        <h3 className="text-base font-semibold text-ink-primary">Why This Matters</h3>
        <p className="mt-2 text-sm leading-7">{study.why_this_matters}</p>
      </section>

      {study.apologetics.length ? (
        <section>
          <h3 className="text-base font-semibold text-ink-primary">Apologetics</h3>
          <div className="mt-3 space-y-4">
            {study.apologetics.map((item, index) => (
              <div key={index} className="rounded-xl border border-edge/70 p-4 text-sm leading-6">
                <p><strong>Objection:</strong> {item.objection}</p>
                {item.claim ? <p><strong>Claim:</strong> {item.claim}</p> : null}
                <p><strong>Biblical response:</strong> {item.biblical_response}</p>
                {item.alternative_interpretation ? <p><strong>Alternative interpretation:</strong> {item.alternative_interpretation}</p> : null}
                {item.response_to_alternative ? <p><strong>Response:</strong> {item.response_to_alternative}</p> : null}
                <p><strong>Discussion takeaway:</strong> {item.practical_takeaway}</p>
                <div className="mt-3 space-y-2">
                  {item.supporting_scripture.map((verse, verseIndex) => (
                    <ScriptureBlock key={verseIndex} item={verse} label="Apologetics evidence" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h3 className="text-base font-semibold text-ink-primary">Final Summary</h3>
        <p className="mt-2 text-sm leading-7">{study.final_summary}</p>
      </section>

      <section>
        <h3 className="text-base font-semibold text-ink-primary">Classifications</h3>
        <ul className="mt-2 space-y-2 text-sm leading-6">
          {study.classifications.map((item, index) => (
            <li key={index}><strong>{item.type.replaceAll("_", " ")}:</strong> {item.explanation}</li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-base font-semibold text-ink-primary">Source / Translation Notes</h3>
        <ul className="mt-2 space-y-2 text-sm leading-6">
          {study.source_translation_notes.map((item, index) => <li key={index}>• {item}</li>)}
        </ul>
      </section>
    </article>
  );
}
