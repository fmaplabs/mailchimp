import { mutation, query, internalMutation } from "./_generated/server.js";
import { components } from "./_generated/api.js";
import { MailchimpTransactional } from "@fmaplabs/mailchimp";
import { v } from "convex/values";

// Initialize the component
const mailchimp = new MailchimpTransactional(components.mailchimp, {
  // apiKey defaults to process.env.MANDRILL_API_KEY
  // webhookKey defaults to process.env.MANDRILL_WEBHOOK_KEY
});

// ── Send an HTML email ──────────────────────────────────────────────────────

export const sendWelcomeEmail = mutation({
  args: { email: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const emailId = await mailchimp.sendEmail(ctx, {
      from_email: "hello@example.com",
      from_name: "My App",
      to: [{ email: args.email, name: args.name }],
      subject: `Welcome, ${args.name}!`,
      html: `<h1>Welcome to our app, ${args.name}!</h1><p>We're glad you're here.</p>`,
      tags: ["welcome"],
    });
    return emailId;
  },
});

// ── Send a template email ───────────────────────────────────────────────────

export const sendTemplateEmail = mutation({
  args: { email: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const emailId = await mailchimp.sendEmail(ctx, {
      from_email: "hello@example.com",
      to: [{ email: args.email, name: args.name }],
      template: {
        name: "welcome-template",
        content: [{ name: "main", content: "<p>Template body</p>" }],
      },
      globalMergeVars: [
        { name: "FNAME", content: args.name },
      ],
    });
    return emailId;
  },
});

// ── Check email status ──────────────────────────────────────────────────────

export const checkEmailStatus = query({
  args: { emailId: v.string() },
  handler: async (ctx, args) => {
    return await mailchimp.status(ctx, args.emailId as never);
  },
});

// ── Email event callback ────────────────────────────────────────────────────

export const onEmailEvent = internalMutation({
  args: { id: v.string(), event: v.string() },
  handler: async (_ctx, args) => {
    console.log(`Email ${args.id} received event: ${args.event}`);
  },
});
