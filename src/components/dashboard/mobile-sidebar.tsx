"use client";

import { Menu, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { BrandMark } from "./brand-mark";
import { ScripturePanel } from "./scripture-panel";
import { SidebarNav } from "./sidebar-nav";

/**
 * Navigation drawer for tablet and mobile.
 *
 * Built directly rather than pulled from a component library, because the
 * behaviour it needs is small and specific: open on button, close on Escape,
 * close on backdrop, close after navigating, restore focus to the trigger, and
 * keep focus inside while open.
 *
 * Focus handling is the part that matters. A drawer that leaves focus behind on
 * the page is unusable with a keyboard or a screen reader, and that is exactly
 * the failure mode that goes unnoticed when you only test with a mouse.
 */
export function MobileSidebar({ pathname }: { pathname: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Escape closes from anywhere, including from inside the panel.
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

  // Stop the page behind the drawer from scrolling.
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

  // Move focus into the drawer on open, and back to the trigger on close, so
  // the keyboard position never gets stranded on the page underneath.
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
        className="inline-flex size-10 items-center justify-center rounded-lg border border-edge text-ink-secondary transition-colors hover:bg-panel-hover/60 hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight lg:hidden"
      >
        <Menu aria-hidden="true" className="size-5" />
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/*
            The backdrop is a button so it is reachable and operable without a
            pointer, rather than a div with an onClick that only a mouse finds.
          */}
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={close}
            className="absolute inset-0 size-full cursor-default bg-ink/90 backdrop-blur-sm"
          />

          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Dashboard navigation"
            tabIndex={-1}
            className="absolute inset-y-0 left-0 flex w-[17rem] max-w-[85vw] flex-col border-r border-edge bg-panel shadow-[24px_0_70px_rgba(0,0,0,0.5)] focus:outline-none"
          >
            <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-4">
              <BrandMark />
              <button
                type="button"
                onClick={close}
                aria-label="Close navigation menu"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-edge text-ink-secondary transition-colors hover:bg-panel-hover/60 hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-4">
              <SidebarNav pathname={pathname} onNavigate={close} />
            </div>

            <div className="border-t border-edge px-4 py-4">
              <ScripturePanel />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
