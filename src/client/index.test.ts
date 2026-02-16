import { describe, expect, test } from "vitest";
import { MailchimpTransactional } from "./index.js";
import { components } from "./setup.test.js";

describe("MailchimpTransactional client", () => {
  test("constructor creates instance", () => {
    const mailchimp = new MailchimpTransactional(components.mailchimp, {
      apiKey: "test-key-123",
    });
    expect(mailchimp).toBeDefined();
    expect(mailchimp.component).toBeDefined();
  });

  test("sendEmail throws without API key", async () => {
    const mailchimp = new MailchimpTransactional(components.mailchimp, {
      apiKey: "",
    });
    const mockCtx = {
      runMutation: async () => "fake-id",
      runQuery: async () => null,
    };
    await expect(
      mailchimp.sendEmail(mockCtx, {
        from_email: "test@example.com",
        to: [{ email: "user@example.com" }],
        html: "<p>Hello</p>",
      }),
    ).rejects.toThrow("Mandrill API key not set");
  });

  test("static defineOnEmailEvent returns the handler", () => {
    const handler = MailchimpTransactional.defineOnEmailEvent(
      async (_ctx, args) => {
        console.log(args.id, args.event);
      },
    );
    expect(handler).toBeTypeOf("function");
  });
});
