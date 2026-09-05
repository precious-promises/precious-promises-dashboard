"use client";

import { Menu, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { BrandMark } from "./brand-mark";
import { ScripturePanel } from "./scripture-panel";
import { SidebarNav } from "./sidebar-nav";

export function MobileSidebar({ pathname }: { pathname: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, close]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      panelRef.current?.focus();
    } else {
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setIsOpen(true);
        }}
        aria-label="Open navigation menu"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="inline-flex size-10 items-center justify-center rounded-xl border border-edge/80 bg-white/[0.025] text-ink-secondary transition-colors hover:bg-white/[0.06] hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight lg:hidden"
      >
        <Menu aria-hidden="true" className="size-5" />
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Dismiss navigation menu"
            onClick={close}
            className="absolute inset-0 size-full cursor-default bg-black/85 backdrop-blur-sm"
          />

          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Dashboard navigation"
            tabIndex={-1}
            className="absolute inset-y-0 left-0 flex w-[18rem] max-w-[88vw] flex-col border-r border-edge/80 bg-[#060a15] shadow-[30px_0_90px_rgba(0,0,0,0.62)] focus:outline-none"
          >
            <div className="flex items-center justify-between gap-3 border-b border-edge/70 px-4 py-4">
              <BrandMark />
              <button
                type="button"
                onClick={close}
                aria-label="Close navigation menu"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-edge/80 bg-white/[0.025] text-ink-secondary transition-colors hover:bg-white/[0.06] hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-4">
              <SidebarNav pathname={pathname} onNavigate={close} />
            </div>

            <div className="px-3 pb-4">
              <ScripturePanel />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
