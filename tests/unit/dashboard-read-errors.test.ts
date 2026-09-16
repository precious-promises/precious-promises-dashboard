// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) },
    from,
  }),
}));
import { loadSocialAccounts } from "@/lib/accounts/repository";
import { listScheduleEntries } from "@/lib/schedule/repository";
import { loadReviewRows } from "@/lib/approvals/repository";
import { loadSnapshots } from "@/lib/analytics/repository";
import { getContentCounts } from "@/lib/content/repository";
function resultQuery(result: object) {
  const promise = Promise.resolve(result);
  return Object.assign(promise, {
    select: () => promise,
    eq: () => promise,
    order: () => promise,
    limit: () => promise,
    not: () => promise,
    in: () => promise,
  });
}
describe("Failed reads are not genuine empty states", () => {
  beforeEach(() => {
    from.mockImplementation(() =>
      resultQuery({
        data: null,
        count: null,
        error: { message: "private provider error" },
      }),
    );
  });
  for (const [name, load] of [
    ["accounts", loadSocialAccounts],
    ["schedules", listScheduleEntries],
    ["approvals", loadReviewRows],
    ["analytics", loadSnapshots],
    ["content counts", getContentCounts],
  ] as const) {
    it(`rejects unavailable ${name} instead of returning empty data`, async () => {
      await expect(load()).rejects.toThrow(/unavailable/);
    });
  }
  it("keeps a successful empty schedule as an empty list", async () => {
    from.mockImplementation(() => resultQuery({ data: [], error: null }));
    await expect(listScheduleEntries()).resolves.toEqual([]);
  });
});
