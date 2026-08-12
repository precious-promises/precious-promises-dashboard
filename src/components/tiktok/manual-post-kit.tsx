"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import type { ManualPostKit } from "@/lib/tiktok/manual";

/**
 * The manual posting kit, shown on a queue row waiting to be posted by hand.
 *
 * Every value here was approved. The copy button exists so the caption reaches
 * TikTok by clipboard rather than by retyping — a retyped Scripture quotation
 * is a silently altered one, which is the thing this project most needs not to
 * happen.
 *
 * There is no download link. The file stays in Drive, where it is already
 * reachable by the person signed into that account; minting a URL here would
 * either be a link that only works for someone already signed in, or a public
 * one this application refuses to create.
 */
export function ManualPostKitPanel({ kit }: { kit: ManualPostKit }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(kit.caption);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused. The caption is on screen either way,
      // so this fails quietly rather than claiming a copy that did not happen.
      setCopied(false);
    }
  };

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-[11px] font-medium text-ink-secondary hover:text-ink-primary">
        Everything you need to post this by hand
      </summary>

      <div className="mt-2 flex flex-col gap-3 rounded-lg border border-edge/70 bg-panel/50 px-3 py-2.5">
        <section>
          <h4 className="text-[11px] font-semibold text-ink-primary">Media</h4>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            {kit.media.filename ? (
              <span className="font-mono text-ink-secondary">
                {kit.media.filename}
              </span>
            ) : null}
            {kit.media.filename ? " — " : ""}
            {kit.media.location}
          </p>
          {kit.media.ready ? null : (
            <p className="mt-0.5 text-[11px] text-gold">
              {kit.media.reason ?? "This file cannot be located."}
            </p>
          )}
        </section>

        <section>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-[11px] font-semibold text-ink-primary">
              Caption
            </h4>
            {kit.caption.trim() === "" ? null : (
              <button
                type="button"
                onClick={copy}
                className="inline-flex items-center gap-1 rounded border border-edge px-2 py-1 text-[11px] text-ink-secondary transition-colors hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                {copied ? (
                  <Check aria-hidden="true" className="size-3" />
                ) : (
                  <Copy aria-hidden="true" className="size-3" />
                )}
                {copied ? "Copied" : "Copy caption"}
              </button>
            )}
          </div>
          {kit.caption.trim() === "" ? (
            <p className="mt-1 text-[11px] text-gold">
              No caption has been written for this variant.
            </p>
          ) : (
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-edge/60 bg-panel-raised/40 px-2.5 py-2 font-sans text-[11px] leading-5 text-ink-secondary">
              {kit.caption}
            </pre>
          )}
          {kit.hashtags.length > 0 ? (
            <p className="mt-1 text-[11px] text-ink-muted">
              Hashtags, already included above:{" "}
              {kit.hashtags.map((tag) => `#${tag}`).join(" ")}
            </p>
          ) : null}
        </section>

        {kit.settings.length > 0 ? (
          <section>
            <h4 className="text-[11px] font-semibold text-ink-primary">
              Settings to match in TikTok
            </h4>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
              {kit.settings.map((setting) => (
                <div key={setting.label} className="contents">
                  <dt className="text-ink-muted">{setting.label}</dt>
                  <dd
                    className={
                      setting.declaration ? "text-gold" : "text-ink-secondary"
                    }
                  >
                    {setting.value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <section>
          <h4 className="text-[11px] font-semibold text-ink-primary">
            Checklist
          </h4>
          <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[11px] leading-5 text-ink-muted">
            {kit.checklist.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <p className="text-[11px] leading-5 text-ink-muted">
          Nothing on this panel has been sent to TikTok, and nothing will be.
          This dashboard cannot confirm a post it did not make.
        </p>
      </div>
    </details>
  );
}
