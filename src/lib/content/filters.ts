import {
  CONTENT_STATUSES,
  CONTENT_TYPES,
  SCRIPTURE_VERIFICATION_STATUSES,
  type ContentStatus,
  type ContentType,
  type ScriptureVerificationStatus,
} from "./types";

/**
 * Library filter parsing.
 *
 * Pure functions over the raw query string, so filter behaviour is testable
 * without a database. An unrecognised value is dropped rather than passed
 * through to a query.
 */

export interface ContentFilters {
  search: string;
  contentType: ContentType | null;
  topic: string;
  status: ContentStatus | null;
  verification: ScriptureVerificationStatus | null;
}

export const EMPTY_FILTERS: ContentFilters = {
  search: "",
  contentType: null,
  topic: "",
  status: null,
  verification: null,
};

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function oneOf<T extends string>(
  value: string,
  allowed: readonly T[],
): T | null {
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** Build filters from Next.js `searchParams`. */
export function parseContentFilters(
  params: Record<string, string | string[] | undefined>,
): ContentFilters {
  return {
    search: first(params.q).trim().slice(0, 120),
    contentType: oneOf(first(params.type), CONTENT_TYPES),
    topic: first(params.topic).trim().slice(0, 120),
    status: oneOf(first(params.status), CONTENT_STATUSES),
    verification: oneOf(
      first(params.verification),
      SCRIPTURE_VERIFICATION_STATUSES,
    ),
  };
}

/** True when any filter is narrowing the list. */
export function hasActiveFilters(filters: ContentFilters): boolean {
  return (
    filters.search !== "" ||
    filters.contentType !== null ||
    filters.topic !== "" ||
    filters.status !== null ||
    filters.verification !== null
  );
}

/**
 * Escape a value for use inside a PostgREST `ilike` pattern.
 *
 * `%` and `_` are wildcards there; a title containing one would otherwise
 * silently widen the search. The comma and parenthesis matter because
 * PostgREST parses `or=(...)` lists positionally.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[%_,()\\]/g, (match) => `\\${match}`);
}
