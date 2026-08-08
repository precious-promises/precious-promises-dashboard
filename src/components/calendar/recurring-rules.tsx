import {
  createPresetRules,
  saveRecurringRule,
  toggleRecurringRule,
} from "@/app/dashboard/calendar/actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { CONTENT_TYPES, CONTENT_TYPE_LABELS } from "@/lib/content/types";
import { nextOccurrences } from "@/lib/schedule/recurrence";
import { formatInTimeZone, DEFAULT_TIMEZONE } from "@/lib/schedule/timezone";
import {
  shortLocalTime,
  SCHEDULE_PRESETS,
  WEEKDAYS,
  weekdayLabel,
  type RecurringScheduleRule,
} from "@/lib/schedule/types";
import { PLATFORM_LABELS, VARIANT_PLATFORMS } from "@/lib/variants/types";

/**
 * Recurring slots, and the schedule settings around them.
 *
 * A rule says **when** something could go out. It never says what, it never
 * creates a scheduled post, and it arrives disabled. Approved content is put
 * into a slot by a person — a rule that could fill itself would be publishing
 * on nobody's authority.
 */

const FIELD =
  "w-full rounded-lg border border-edge bg-panel-raised/50 px-3 py-2 text-sm text-ink-primary outline-none focus-visible:border-highlight focus-visible:ring-2 focus-visible:ring-highlight/35";
const LABEL = "mb-1 block text-xs font-medium text-ink-secondary";

export function RecurringRules({
  rules,
  now,
}: {
  rules: RecurringScheduleRule[];
  now: Date;
}) {
  const presetsMissing = SCHEDULE_PRESETS.filter(
    (preset) => !rules.some((rule) => rule.name === preset.name),
  );

  return (
    <div className="flex flex-col gap-5">
      {rules.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No recurring slots yet. A slot is a time in the week you intend to
          post — creating one schedules nothing.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rules.map((rule) => {
            const upcoming = nextOccurrences(rule, now, 2);
            return (
              <li
                key={rule.id}
                className="rounded-lg border border-edge/70 bg-panel-raised/30 px-3.5 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink-primary">
                      {rule.name}
                    </span>
                    <span className="block text-xs text-ink-muted">
                      {weekdayLabel(rule.day_of_week)}{" "}
                      {shortLocalTime(rule.local_time)} · {rule.timezone} ·{" "}
                      {PLATFORM_LABELS[rule.platform]}
                      {rule.content_type
                        ? ` · ${CONTENT_TYPE_LABELS[rule.content_type]}`
                        : ""}
                    </span>
                  </span>
                  <StatusBadge tone={rule.enabled ? "configured" : "inactive"}>
                    {rule.enabled ? "Enabled" : "Disabled"}
                  </StatusBadge>
                </div>

                <p className="mt-2 text-[11px] text-ink-muted">
                  {rule.enabled && upcoming.length > 0
                    ? `Next slots: ${upcoming
                        .map((occurrence) =>
                          formatInTimeZone(occurrence.instant, rule.timezone),
                        )
                        .join(" · ")}`
                    : "Disabled, so it has no upcoming slots."}
                </p>

                <form action={toggleRecurringRule} className="mt-2">
                  <input type="hidden" name="rule_id" value={rule.id} />
                  <button
                    type="submit"
                    className="text-xs text-highlight underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                  >
                    {rule.enabled ? "Disable this slot" : "Enable this slot"}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      {presetsMissing.length > 0 ? (
        <form
          action={createPresetRules}
          className="rounded-lg border border-edge/70 bg-panel-raised/30 px-3.5 py-3"
        >
          <p className="text-sm font-medium text-ink-primary">
            The Precious Promises rhythm
          </p>
          <ul className="mt-1.5 flex flex-col gap-0.5 text-xs text-ink-muted">
            {SCHEDULE_PRESETS.map((preset) => (
              <li key={preset.name}>
                {weekdayLabel(preset.dayOfWeek)} {preset.localTime} —{" "}
                {preset.name}
              </li>
            ))}
          </ul>
          <button
            type="submit"
            className="mt-2.5 rounded-lg border border-edge-strong bg-panel-raised/60 px-3.5 py-1.5 text-xs font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
          >
            Create these as slots
          </button>
          <p className="mt-1.5 text-[11px] text-ink-muted">
            Created disabled and empty. Nothing is scheduled, and no content is
            chosen.
          </p>
        </form>
      ) : null}

      <form
        action={saveRecurringRule}
        className="flex flex-col gap-3 border-t border-edge/70 pt-4"
      >
        <p className="text-sm font-medium text-ink-primary">Add a slot</p>

        <div>
          <label htmlFor="name" className={LABEL}>
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            maxLength={120}
            className={FIELD}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="platform" className={LABEL}>
              Platform
            </label>
            <select id="platform" name="platform" className={FIELD}>
              {VARIANT_PLATFORMS.map((platform) => (
                <option key={platform} value={platform}>
                  {PLATFORM_LABELS[platform]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="content_type" className={LABEL}>
              Content type (optional)
            </label>
            <select id="content_type" name="content_type" className={FIELD}>
              <option value="">Any</option>
              {CONTENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {CONTENT_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="day_of_week" className={LABEL}>
              Day
            </label>
            <select id="day_of_week" name="day_of_week" className={FIELD}>
              {WEEKDAYS.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="local_time" className={LABEL}>
              Local time
            </label>
            <input
              id="local_time"
              name="local_time"
              type="time"
              className={FIELD}
            />
          </div>
        </div>

        <div>
          <label htmlFor="rule_timezone" className={LABEL}>
            Timezone
          </label>
          <input
            id="rule_timezone"
            name="timezone"
            type="text"
            defaultValue={DEFAULT_TIMEZONE}
            className={FIELD}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-secondary">
          <input type="checkbox" name="enabled" className="accent-highlight" />
          Enable this slot straight away
        </label>

        <button
          type="submit"
          className="w-fit rounded-lg border border-edge-strong bg-panel-raised/60 px-4 py-2 text-sm font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
        >
          Save slot
        </button>
      </form>
    </div>
  );
}
