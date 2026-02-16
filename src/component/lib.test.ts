/// <reference types="vite/client" />

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api.js";
import { initConvexTest } from "./setup.test.js";

const TEST_OPTIONS = {
  apiKey: "test-api-key",
  initialBackoffMs: 1000,
  retryAttempts: 3,
};

describe("component lib", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("sendEmail stores email with waiting status", async () => {
    const t = initConvexTest();
    const emailId = await t.mutation(api.lib.sendEmail, {
      options: TEST_OPTIONS,
      from_email: "sender@example.com",
      to: [{ email: "recipient@example.com" }],
      subject: "Test Subject",
      html: "<p>Hello</p>",
    });
    expect(emailId).toBeDefined();

    const status = await t.query(api.lib.getStatus, { emailId });
    expect(status).not.toBeNull();
    expect(status!.status).toBe("waiting");
    expect(status!.bounced).toBe(false);
    expect(status!.opened).toBe(false);
    expect(status!.clicked).toBe(false);
    expect(status!.complained).toBe(false);
  });

  test("sendEmail requires html/text or template", async () => {
    const t = initConvexTest();
    await expect(
      t.mutation(api.lib.sendEmail, {
        options: TEST_OPTIONS,
        from_email: "sender@example.com",
        to: [{ email: "recipient@example.com" }],
        subject: "No content",
      }),
    ).rejects.toThrow("Either html/text or template must be provided");
  });

  test("sendEmail with template succeeds", async () => {
    const t = initConvexTest();
    const emailId = await t.mutation(api.lib.sendEmail, {
      options: TEST_OPTIONS,
      from_email: "sender@example.com",
      to: [{ email: "recipient@example.com" }],
      template: {
        name: "my-template",
        content: [{ name: "main", content: "<p>Body</p>" }],
      },
    });
    expect(emailId).toBeDefined();
  });

  test("get returns email with decoded content", async () => {
    const t = initConvexTest();
    const emailId = await t.mutation(api.lib.sendEmail, {
      options: TEST_OPTIONS,
      from_email: "sender@example.com",
      from_name: "Sender",
      to: [{ email: "recipient@example.com", name: "Recipient" }],
      subject: "Test",
      html: "<h1>Hello</h1>",
      text: "Hello",
    });

    const email = await t.query(api.lib.get, { emailId });
    expect(email).not.toBeNull();
    expect(email!.html).toBe("<h1>Hello</h1>");
    expect(email!.text).toBe("Hello");
    expect(email!.from_email).toBe("sender@example.com");
    expect(email!.from_name).toBe("Sender");
    expect(email!.status).toBe("waiting");
  });

  test("cancelEmail cancels a waiting email", async () => {
    const t = initConvexTest();
    const emailId = await t.mutation(api.lib.sendEmail, {
      options: TEST_OPTIONS,
      from_email: "sender@example.com",
      to: [{ email: "recipient@example.com" }],
      subject: "Test",
      html: "<p>Cancel me</p>",
    });

    await t.mutation(api.lib.cancelEmail, { emailId });

    const status = await t.query(api.lib.getStatus, { emailId });
    expect(status!.status).toBe("cancelled");
  });

  test("cancelEmail throws on already-sent email", async () => {
    const t = initConvexTest();
    const emailId = await t.mutation(api.lib.createManualEmail, {
      from_email: "sender@example.com",
      to: [{ email: "recipient@example.com" }],
      subject: "Test",
    });

    // Manually mark as sent
    await t.mutation(api.lib.updateManualEmail, {
      emailId,
      status: "sent",
      mandrillId: "abc123",
    });

    await expect(
      t.mutation(api.lib.cancelEmail, { emailId }),
    ).rejects.toThrow('Cannot cancel email with status "sent"');
  });

  test("handleEmailEvent updates email on hard_bounce", async () => {
    const t = initConvexTest();
    const emailId = await t.mutation(api.lib.createManualEmail, {
      from_email: "sender@example.com",
      to: [{ email: "recipient@example.com" }],
      subject: "Test",
    });

    await t.mutation(api.lib.updateManualEmail, {
      emailId,
      status: "sent",
      mandrillId: "mandrill-123",
    });

    await t.mutation(api.lib.handleEmailEvent, {
      eventType: "hard_bounce",
      mandrillId: "mandrill-123",
      ts: 1700000000,
      message: "550 User not found",
    });

    const status = await t.query(api.lib.getStatus, { emailId });
    expect(status!.status).toBe("bounced");
    expect(status!.bounced).toBe(true);
    expect(status!.errorMessage).toBe("550 User not found");
  });

  test("handleEmailEvent updates email on open", async () => {
    const t = initConvexTest();
    const emailId = await t.mutation(api.lib.createManualEmail, {
      from_email: "sender@example.com",
      to: [{ email: "recipient@example.com" }],
    });

    await t.mutation(api.lib.updateManualEmail, {
      emailId,
      status: "sent",
      mandrillId: "mandrill-456",
    });

    await t.mutation(api.lib.handleEmailEvent, {
      eventType: "open",
      mandrillId: "mandrill-456",
      ts: 1700000000,
    });

    const status = await t.query(api.lib.getStatus, { emailId });
    expect(status!.opened).toBe(true);
  });

  test("handleEmailEvent updates email on click", async () => {
    const t = initConvexTest();
    const emailId = await t.mutation(api.lib.createManualEmail, {
      from_email: "sender@example.com",
      to: [{ email: "recipient@example.com" }],
    });

    await t.mutation(api.lib.updateManualEmail, {
      emailId,
      status: "sent",
      mandrillId: "mandrill-789",
    });

    await t.mutation(api.lib.handleEmailEvent, {
      eventType: "click",
      mandrillId: "mandrill-789",
      ts: 1700000000,
    });

    const status = await t.query(api.lib.getStatus, { emailId });
    expect(status!.clicked).toBe(true);
  });

  test("handleEmailEvent updates email on spam", async () => {
    const t = initConvexTest();
    const emailId = await t.mutation(api.lib.createManualEmail, {
      from_email: "sender@example.com",
      to: [{ email: "recipient@example.com" }],
    });

    await t.mutation(api.lib.updateManualEmail, {
      emailId,
      status: "sent",
      mandrillId: "mandrill-spam",
    });

    await t.mutation(api.lib.handleEmailEvent, {
      eventType: "spam",
      mandrillId: "mandrill-spam",
      ts: 1700000000,
    });

    const status = await t.query(api.lib.getStatus, { emailId });
    expect(status!.complained).toBe(true);
  });

  test("handleEmailEvent rejects unknown mandrillId", async () => {
    const t = initConvexTest();
    // Should not throw, just log and return
    await t.mutation(api.lib.handleEmailEvent, {
      eventType: "send",
      mandrillId: "unknown-id",
      ts: 1700000000,
    });
  });

  test("handleEmailEvent updates email on reject", async () => {
    const t = initConvexTest();
    const emailId = await t.mutation(api.lib.createManualEmail, {
      from_email: "sender@example.com",
      to: [{ email: "recipient@example.com" }],
    });

    await t.mutation(api.lib.updateManualEmail, {
      emailId,
      status: "sent",
      mandrillId: "mandrill-reject",
    });

    await t.mutation(api.lib.handleEmailEvent, {
      eventType: "reject",
      mandrillId: "mandrill-reject",
      ts: 1700000000,
      message: "recipient blacklisted",
    });

    const status = await t.query(api.lib.getStatus, { emailId });
    expect(status!.status).toBe("rejected");
    expect(status!.rejectReason).toBe("recipient blacklisted");
  });

  test("handleEmailEvent send event marks as delivered", async () => {
    const t = initConvexTest();
    const emailId = await t.mutation(api.lib.createManualEmail, {
      from_email: "sender@example.com",
      to: [{ email: "recipient@example.com" }],
    });

    await t.mutation(api.lib.updateManualEmail, {
      emailId,
      status: "sent",
      mandrillId: "mandrill-send",
    });

    await t.mutation(api.lib.handleEmailEvent, {
      eventType: "send",
      mandrillId: "mandrill-send",
      ts: 1700000000,
    });

    const status = await t.query(api.lib.getStatus, { emailId });
    expect(status!.status).toBe("delivered");
  });

  test("createManualEmail and updateManualEmail", async () => {
    const t = initConvexTest();
    const emailId = await t.mutation(api.lib.createManualEmail, {
      from_email: "manual@example.com",
      to: [{ email: "user@example.com" }],
      subject: "Manual email",
    });

    let status = await t.query(api.lib.getStatus, { emailId });
    expect(status!.status).toBe("queued");

    await t.mutation(api.lib.updateManualEmail, {
      emailId,
      status: "sent",
      mandrillId: "manual-id-123",
    });

    status = await t.query(api.lib.getStatus, { emailId });
    expect(status!.status).toBe("sent");
  });

  test("soft_bounce sets bounced flag without status change", async () => {
    const t = initConvexTest();
    const emailId = await t.mutation(api.lib.createManualEmail, {
      from_email: "sender@example.com",
      to: [{ email: "recipient@example.com" }],
    });

    await t.mutation(api.lib.updateManualEmail, {
      emailId,
      status: "sent",
      mandrillId: "mandrill-soft",
    });

    await t.mutation(api.lib.handleEmailEvent, {
      eventType: "soft_bounce",
      mandrillId: "mandrill-soft",
      ts: 1700000000,
      message: "Mailbox full",
    });

    const status = await t.query(api.lib.getStatus, { emailId });
    // soft_bounce sets bounced flag but doesn't change status to "bounced"
    expect(status!.bounced).toBe(true);
    expect(status!.status).toBe("sent");
  });
});
