import { KeyRound } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { RecoveryPasswordForm } from "./recovery-password-form";

export const metadata: Metadata = {
  title: "Set new password · Precious Promises",
  robots: { index: false, follow: false },
};

export default async function UpdatePasswordPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?recovery=expired");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-5 py-12 text-ink-primary">
      <section className="w-full max-w-md rounded-3xl border border-edge bg-panel px-5 py-7 shadow-2xl sm:px-7 sm:py-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-edge-strong bg-panel-raised text-highlight">
            <KeyRound aria-hidden="true" className="size-5" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">
            Choose a new password
          </h1>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            Your recovery link has been verified. Set the new password you want
            to use for the Precious Promises dashboard.
          </p>
        </div>

        <RecoveryPasswordForm />
      </section>
    </main>
  );
}
