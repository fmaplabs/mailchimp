import type { Validator } from "convex/values";

/**
 * Verify a Mandrill webhook signature using HMAC-SHA1.
 *
 * Mandrill signs: url + sorted(keys).map(k => k + params[k])
 * See: https://mailchimp.com/developer/transactional/guides/track-respond-activity-with-webhooks/#authenticating-webhook-requests
 */
export async function verifyMandrillSignature(
  webhookKey: string,
  url: string,
  params: Record<string, string>,
  signature: string,
): Promise<boolean> {
  const sortedKeys = Object.keys(params).sort();
  let signedData = url;
  for (const key of sortedKeys) {
    signedData += key + params[key];
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(webhookKey),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(signedData));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return expected === signature;
}

/**
 * Exhaustiveness check helper for switch/if-else chains.
 */
export function assertExhaustive(_value: never): never {
  throw new Error(`Unexpected value: ${String(_value)}`);
}

/**
 * Safely attempt to parse a value against a Convex validator.
 * Returns { kind: "ok", data } on success, { kind: "error", error } on failure.
 */
export function attemptToParse<T>(
  validator: Validator<T, "required", string>,
  value: unknown,
): { kind: "ok"; data: T } | { kind: "error"; error: string } {
  try {
    // Convex validators throw on invalid input when used with v.parse (convex-helpers)
    // We do a structural check here instead
    const parsed = value as T;
    // If the validator has a parse method (convex-helpers), use it
    if (
      typeof validator === "object" &&
      validator !== null &&
      "parse" in validator &&
      typeof validator.parse === "function"
    ) {
      return { kind: "ok", data: validator.parse(value) as T };
    }
    return { kind: "ok", data: parsed };
  } catch (e) {
    return {
      kind: "error",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
