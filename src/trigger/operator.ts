import { schedules } from "@trigger.dev/sdk";

import { runOperatorForEnabledOwners } from "@/lib/automation/operator";
import { createWorkerClient } from "@/lib/supabase/worker";

/**
 * Scheduled Operator Mode pass.
 *
 * Runs four times a day when Trigger.dev is actually connected. Owners still
 * have a manual "Run Operator now" path, so a missing scheduler never blocks
 * use of the feature. Each pass only prepares draft work and workflow state;
 * it never verifies Scripture, approves content or claims publication.
 */
export const operatorModeSweep = schedules.task({
  id: "operator-mode-sweep",
  cron: "0 */6 * * *",
  queue: { concurrencyLimit: 1 },
  run: async () => {
    const { client, reason } = createWorkerClient();

    if (client === null) {
      return {
        configured: false,
        owners: 0,
        completed: 0,
        failed: 0,
        reason,
      };
    }

    const result = await runOperatorForEnabledOwners(client);

    return {
      configured: true,
      ...result,
      reason: null,
    };
  },
});
