/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { verifyMandrillSignature } from "./utils.js";

describe("verifyMandrillSignature", () => {
  test("verifies a valid signature", async () => {
    const webhookKey = "test-secret-key";
    const url = "https://example.com/webhook";
    const params = {
      mandrill_events: '[{"event":"send"}]',
    };

    // Generate expected signature
    const encoder = new TextEncoder();
    let signedData = url;
    const sortedKeys = Object.keys(params).sort();
    for (const key of sortedKeys) {
      signedData += key + params[key as keyof typeof params];
    }

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(webhookKey),
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(signedData),
    );
    const signature = btoa(String.fromCharCode(...new Uint8Array(sig)));

    const result = await verifyMandrillSignature(
      webhookKey,
      url,
      params,
      signature,
    );
    expect(result).toBe(true);
  });

  test("rejects an invalid signature", async () => {
    const result = await verifyMandrillSignature(
      "test-key",
      "https://example.com/webhook",
      { mandrill_events: "[]" },
      "invalid-signature",
    );
    expect(result).toBe(false);
  });

  test("handles multiple params sorted correctly", async () => {
    const webhookKey = "my-key";
    const url = "https://example.com/hook";
    const params = {
      z_param: "last",
      a_param: "first",
      mandrill_events: "[]",
    };

    // Build expected: url + a_param + first + mandrill_events + [] + z_param + last
    const encoder = new TextEncoder();
    const signedData = url + "a_param" + "first" + "mandrill_events" + "[]" + "z_param" + "last";

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(webhookKey),
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(signedData),
    );
    const signature = btoa(String.fromCharCode(...new Uint8Array(sig)));

    const result = await verifyMandrillSignature(
      webhookKey,
      url,
      params,
      signature,
    );
    expect(result).toBe(true);
  });
});
