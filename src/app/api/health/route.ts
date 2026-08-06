/**
 * Liveness probe.
 *
 * The response is a fixed, non-sensitive shape. Do not add environment values,
 * versions, build identifiers, file paths, dependency lists, database state or
 * any other infrastructure detail — this endpoint is unauthenticated, so
 * anything returned here is public.
 */
export async function GET(): Promise<Response> {
  return Response.json({
    status: "ok",
    service: "precious-promises-dashboard",
  });
}
