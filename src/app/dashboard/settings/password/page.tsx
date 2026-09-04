import { KeyRound, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { PasswordForm } from "@/components/settings/password-form";
import { SectionCard } from "@/components/ui/section-card";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Change password · Precious Promises",
  robots: { index: false, follow: false },
};

export default async function ChangePasswordPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  return (
    <DashboardShell
      title="Change password"
      pathname="/dashboard/settings"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <section className="overflow-hidden rounded-3xl border border-edge bg-[radial-gradient(circle_at_top_right,rgba(250,204,21,0.13),transparent_34%),linear-gradient(135deg,rgba(30,22,58,0.96),rgba(17,15,31,0.98))] px-5 py-6 shadow-xl sm:px-7 sm:py-8">
          <div className="flex items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-highlight-soft">
              <KeyRound aria-hidden="true" className="size-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-highlight-soft">
                Owner security
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Change password
              </h2>
              <p className="mt-3 text-sm leading-6 text-white/70 sm:text-base">
                Change the password used to sign in to the Precious Promises
                administration dashboard.
              </p>
            </div>
          </div>
        </section>

        <SectionCard
          title="Dashboard password"
          description="Confirm your current password, then choose and confirm a new one."
        >
          <PasswordForm />
        </SectionCard>

        <div className="rounded-2xl border border-edge bg-panel-raised/35 px-5 py-4">
          <div className="flex items-start gap-3">
            <ShieldCheck
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-highlight"
            />
            <div>
              <p className="text-sm font-semibold text-ink-primary">
                Password handling
              </p>
              <p className="mt-1 text-xs leading-5 text-ink-muted">
                Precious Promises does not store a readable copy of your
                password. Supabase Auth handles the password change and stores
                only its password hash.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
