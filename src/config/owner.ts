/**
 * Private owner identity.
 *
 * Used only inside the authenticated dashboard shell. These values must never
 * be rendered on `/`, `/login`, or any other public surface — see
 * docs/design-system.md.
 *
 * There are no placeholder identities anywhere in this product. This is the
 * real owner, shown privately to himself.
 */
export const OWNER_NAME = "Dave";
export const OWNER_ROLE = "Founder & Creator";

/** Avatar fallback. Initials, never stock imagery. */
export const OWNER_INITIALS = "DB";
