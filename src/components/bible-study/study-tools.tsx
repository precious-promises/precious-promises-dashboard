"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  buildWhatsAppTransform,
  type WhatsAppBibleStudyFormat,
} from "@/lib/bible-study/whatsapp";
import type { CanonicalBibleStudy } from "@/lib/bible-study/types";

function spokenText(study: CanonicalBibleStudy): string {
  return [
    study.title,
    `${study.main_passage.reference}. ${study.main_passage.text}`,
    study.main_truth,
    study.opening_overview,
    study.historical_context,
    study.literary_context,
    study.situational_context,
    ...study.verse_breakdown.flatMap((item) => [item.phrase, item.explanation]),
    study.why_this_matters,
    ...study.practical_application,
    ...study.key_takeaways,
    study.final_summary,
  ].join("\n\n");
}

export function StudyTools({
  study,
  revisionId,
}: {
  study: CanonicalBibleStudy;
  revisionId: string;
}) {
  const segments = useMemo(
    () =>
      spokenText(study)
        .split(/\n{2,}/)
        .filter(Boolean),
    [study],
  );
  const storageKey = `pp-bible-study-listen-${revisionId}`;
  const [segment, setSegment] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [format, setFormat] =
    useState<WhatsAppBibleStudyFormat>("whatsapp_short");
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(storageKey) ?? "0");
    const timer =
      Number.isFinite(saved) && saved >= 0 && saved < segments.length
        ? window.setTimeout(() => setSegment(saved), 0)
        : null;
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.speechSynthesis?.cancel();
    };
  }, [segments.length, storageKey]);

  function speakFrom(index: number) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const text = segments[index];
    if (!text) {
      setSpeaking(false);
      return;
    }
    const next = new SpeechSynthesisUtterance(text);
    utterance.current = next;
    next.onend = () => {
      const following = index + 1;
      if (following < segments.length) {
        setSegment(following);
        window.localStorage.setItem(storageKey, String(following));
        speakFrom(following);
      } else {
        setSpeaking(false);
        setSegment(0);
        window.localStorage.setItem(storageKey, "0");
      }
    };
    setSpeaking(true);
    window.speechSynthesis.speak(next);
  }

  function pauseResume() {
    if (!("speechSynthesis" in window)) return;
    if (!speaking) {
      speakFrom(segment);
      return;
    }
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    } else {
      window.speechSynthesis.pause();
    }
  }

  const whatsapp = buildWhatsAppTransform(study, format);
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(whatsapp)}`;

  function listenWhatsApp() {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const next = new SpeechSynthesisUtterance(whatsapp);
    next.onend = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(next);
  }

  function printWhatsApp() {
    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) return;
    const safe = whatsapp
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
    popup.document.write(
      `<!doctype html><html><head><title>${study.title}</title><style>body{font-family:Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 24px;white-space:pre-wrap;line-height:1.55}h1{font-size:22px}</style></head><body><h1>${study.title}</h1>${safe}</body></html>`,
    );
    popup.document.close();
    popup.focus();
    popup.print();
  }

  return (
    <div className="space-y-3 rounded-2xl border border-edge/80 bg-[#0a0f1d]/90 p-4 print:hidden">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={pauseResume}
          className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#080b12]"
        >
          {speaking
            ? "Pause / Resume"
            : segment > 0
              ? "Resume listening"
              : "Listen"}
        </button>
        <button
          type="button"
          onClick={() => {
            window.speechSynthesis?.cancel();
            setSpeaking(false);
            setSegment(0);
            window.localStorage.setItem(storageKey, "0");
          }}
          className="rounded-lg border border-edge px-3 py-2 text-xs font-semibold text-ink-primary"
        >
          Restart
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg border border-edge px-3 py-2 text-xs font-semibold text-ink-primary"
        >
          PDF / Print
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
        <select
          value={format}
          onChange={(event) =>
            setFormat(event.target.value as WhatsAppBibleStudyFormat)
          }
          className="rounded-lg border border-edge bg-[#070b14] px-3 py-2 text-xs text-ink-primary"
        >
          <option value="whatsapp_short">WhatsApp Short</option>
          <option value="whatsapp_study">WhatsApp Study</option>
          <option value="whatsapp_teaching">WhatsApp Teaching</option>
        </select>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(whatsapp)}
            className="rounded-lg border border-edge px-3 py-2 text-xs font-semibold text-ink-primary"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={listenWhatsApp}
            className="rounded-lg border border-edge px-3 py-2 text-xs font-semibold text-ink-primary"
          >
            Listen to WhatsApp
          </button>
          <button
            type="button"
            onClick={printWhatsApp}
            className="rounded-lg border border-edge px-3 py-2 text-xs font-semibold text-ink-primary"
          >
            WhatsApp PDF / Print
          </button>
          <a
            href={whatsappHref}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-edge px-3 py-2 text-xs font-semibold text-ink-primary"
          >
            Send to WhatsApp
          </a>
        </div>
      </div>
      <p className="text-[11px] leading-5 text-ink-muted">
        Listening progress is kept on this device. WhatsApp versions are
        compressed from this saved canonical study, so they do not spend more AI
        tokens.
      </p>
    </div>
  );
}
