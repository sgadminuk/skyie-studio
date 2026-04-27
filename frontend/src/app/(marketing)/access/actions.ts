"use server";

/**
 * /access · Server Actions.
 *
 * `requestAccess` accepts an email + optional plan id and returns a
 * generated 6-character alphanumeric code. Per brief §4.1 and §4.4 the
 * code is non-functional placeholder — ceremony, not auth.
 *
 * The action also POSTs to /api/event so the access request appears in
 * the dev console (the only analytics the site has, per §11).
 */

export type RequestAccessResult =
  | { ok: true; code: string }
  | { ok: false; reason: "invalid-email" | "rate-limit" };

const CODE_GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 — readability

export async function requestAccess(formData: FormData): Promise<RequestAccessResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const plan = String(formData.get("plan") ?? "").trim() || null;

  if (!isPlausibleEmail(email)) {
    return { ok: false, reason: "invalid-email" };
  }

  // Crypto-strong code so the value is at least cosmetically credible.
  const code = generateCode(6);

  logEvent({ type: "access.requested", email, plan, code });
  return { ok: true, code };
}

function isPlausibleEmail(value: string): boolean {
  // Deliberately permissive — the studio reviews the queue manually.
  // Reject only the obviously broken inputs.
  if (value.length < 3 || value.length > 254) return false;
  const at = value.indexOf("@");
  if (at <= 0 || at === value.length - 1) return false;
  if (value.indexOf("@", at + 1) !== -1) return false;
  if (!value.includes(".", at)) return false;
  return true;
}

function generateCode(len: number): string {
  // Use Web Crypto when available (server runtime supports globalThis.crypto).
  const out: string[] = [];
  const buf = new Uint8Array(len);
  globalThis.crypto.getRandomValues(buf);
  for (let i = 0; i < len; i++) {
    const idx = buf[i]! % CODE_GLYPHS.length;
    out.push(CODE_GLYPHS[idx]!);
  }
  return out.join("");
}

function logEvent(payload: Record<string, unknown>): void {
  // No vendor — log to the server console (per brief §11). For
  // client-originated events, the /api/event endpoint exists separately.
  // eslint-disable-next-line no-console
  console.log("[skyie:event]", JSON.stringify({ at: new Date().toISOString(), ...payload }));
}
