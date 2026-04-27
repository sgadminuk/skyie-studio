import type { NextRequest } from "next/server";

/**
 * Stub analytics endpoint (per brief §2 / §11).
 *
 * Logs the JSON body to the server console. Returns 204 always so the
 * client doesn't surface a network error if the body is malformed.
 *
 * No vendor. No persistence. The console is the analytics.
 */
export async function POST(req: NextRequest) {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = { error: "non-json body" };
  }

  // eslint-disable-next-line no-console
  console.log(
    "[skyie:event]",
    JSON.stringify({ at: new Date().toISOString(), source: "client", body }),
  );

  return new Response(null, { status: 204 });
}

// Allow `navigator.sendBeacon` which sends as application/x-www-form-urlencoded
export const runtime = "nodejs";
