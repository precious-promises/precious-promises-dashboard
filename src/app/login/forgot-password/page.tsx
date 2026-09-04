import { KeyRound } from "lucide-react";
import type { Metadata } from "next";

import { ResetRequestForm } from "./reset-request-form";

export const metadata: Metadata = {
  title: "Reset password · Precious Promises",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-5 py-12 text-ink-primary">
      <section className="w-full max-w-md rounded-3xl border border-edge bg-panel px-5 py-7 shadow-2xl sm:px-7 sm:py-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-edge-strong bg-panel-raised text-highlight">
            <KeyRound aria-hidden="true" className="size-5" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">
            Reset dashboard password
          </h1>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            Enter the owner email address and Precious Promises will send a
            secure password-recovery link.
          </p>
        </div>

        <ResetRequestForm />
      </section>
    </main>
  );
}
