import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createContent } from "@/app/dashboard/content/actions";
import { ContentForm } from "@/components/content/content-form";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "New content · Precious Promises",
  robots: { index: false, follow: false },
};

export default async function NewContentPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  return (
    <DashboardShell
      title="New content"
      pathname="/dashboard/content"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div>
          <Link
            href="/dashboard/content"
            className="inline-flex items-center gap-1.5 text-sm text-ink-secondary transition-colors hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Content Library
          </Link>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink-primary">
            Create content
          </h2>
          <p className="mt-1.5 text-sm text-ink-secondary">
            Saved as a draft. Nothing is published from here.
          </p>
        </div>

        <ContentForm action={createContent} submitLabel="Create draft" />
      </div>
    </DashboardShell>
  );
}
