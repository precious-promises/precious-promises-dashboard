/**
 * Time-of-day greeting.
 *
 * Takes the hour as an argument rather than reading the clock, so it is
 * deterministic and testable. The caller decides which clock to use.
 */
export type GreetingPeriod = "morning" | "afternoon" | "evening";

export function greetingPeriodForHour(hour: number): GreetingPeriod {
  // A non-finite hour means the caller passed something broken. Fall back to
  // the neutral option rather than letting NaN comparisons pick one silently.
  if (!Number.isFinite(hour)) {
    return "morning";
  }

  // Wrap into 0–23 so out-of-range or negative input still lands somewhere sane.
  const normalised = ((Math.floor(hour) % 24) + 24) % 24;

  if (normalised < 12) {
    return "morning";
  }
  if (normalised < 18) {
    return "afternoon";
  }
  return "evening";
}

/** "Good afternoon, Dave" */
export function greetingFor(hour: number, name: string): string {
  return `Good ${greetingPeriodForHour(hour)}, ${name}`;
}
