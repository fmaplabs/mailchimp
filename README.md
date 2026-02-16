# @fmaplabs/mailchimp

Transactional email for [Convex](https://convex.dev) via Mailchimp/Mandrill.

[![npm version](https://badge.fury.io/js/@fmaplabs%2Fmailchimp.svg)](https://www.npmjs.com/package/@fmaplabs/mailchimp)

## Quick Start

Install the package:

```sh
npm install @fmaplabs/mailchimp
```

Set the `MANDRILL_API_KEY` environment variable in your
[Convex dashboard](https://dashboard.convex.dev) (Settings → Environment Variables).

Register the component in `convex/convex.config.ts`:

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import mailchimp from "@fmaplabs/mailchimp/convex.config.js";

const app = defineApp();
app.use(mailchimp);

export default app;
```

Send an email:

```ts
import { mutation } from "./_generated/server";
import { components } from "./_generated/api";
import { MailchimpTransactional } from "@fmaplabs/mailchimp";
import { v } from "convex/values";

const mailchimp = new MailchimpTransactional(components.mailchimp);

export const sendWelcome = mutation({
  args: { email: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    return await mailchimp.sendEmail(ctx, {
      from_email: "hello@example.com",
      from_name: "My App",
      to: [{ email: args.email, name: args.name }],
      subject: `Welcome, ${args.name}!`,
      html: "<h1>Welcome!</h1><p>We're glad you're here.</p>",
    });
  },
});
```

## How-To Guide

### Send an HTML email

Pass `html` (and optionally `text` as a plain-text fallback) to `sendEmail`:

```ts
const emailId = await mailchimp.sendEmail(ctx, {
  from_email: "hello@example.com",
  from_name: "My App",
  to: [{ email: "user@example.com", name: "Jane" }],
  subject: "Hello!",
  html: "<h1>Hello, Jane!</h1>",
  text: "Hello, Jane!",
  tags: ["greeting"],
});
```

`sendEmail` returns an `EmailId` you can use to check status or cancel the email later.

### Send a template email

Use the `template` field to send with a Mandrill template. Merge variables are
passed via `globalMergeVars` (apply to all recipients) or `mergeVars`
(per-recipient):

```ts
const emailId = await mailchimp.sendEmail(ctx, {
  from_email: "hello@example.com",
  to: [{ email: "user@example.com", name: "Jane" }],
  template: {
    name: "welcome-template",
    content: [{ name: "main", content: "<p>Template body</p>" }],
  },
  globalMergeVars: [
    { name: "FNAME", content: "Jane" },
  ],
});
```

### Check email status

Use `status()` to get delivery state and engagement flags, or `get()` to
retrieve the full email record:

```ts
// In a query
const emailStatus = await mailchimp.status(ctx, emailId);
// → { status: "delivered", bounced: false, complained: false, opened: true, clicked: false, ... }

// Full record
const email = await mailchimp.get(ctx, emailId);
```

`status()` returns an `EmailStatus` object with the fields: `status`,
`errorMessage`, `rejectReason`, `bounced`, `complained`, `opened`, `clicked`.

Possible `status` values: `waiting`, `queued`, `cancelled`, `sent`,
`delivered`, `bounced`, `rejected`, `failed`.

### Cancel a pending email

Cancel an email that hasn't been sent yet:

```ts
await mailchimp.cancelEmail(ctx, emailId);
```

Only emails with `waiting` or `queued` status can be cancelled.

### Handle webhooks

Webhooks let Mandrill push delivery events (bounces, opens, clicks, etc.) back
to your app.

1. Set the `MANDRILL_WEBHOOK_KEY` environment variable in your Convex dashboard.

2. Register the webhook routes in `convex/http.ts`:

```ts
// convex/http.ts
import { httpRouter } from "convex/server";
import { components } from "./_generated/api";
import { MailchimpTransactional } from "@fmaplabs/mailchimp";

const http = httpRouter();

const mailchimp = new MailchimpTransactional(components.mailchimp);

mailchimp.registerRoutes(http, {
  path: "/mandrill/webhook", // default path, can be customized
});

export default http;
```

3. In your Mandrill settings, point the webhook URL to
   `https://<your-deployment>.convex.site/mandrill/webhook`.

### React to email events

Use the `onEmailEvent` option to run a mutation whenever an email event is
received via webhook:

```ts
// convex/example.ts
import { internalMutation } from "./_generated/server";
import { components } from "./_generated/api";
import { MailchimpTransactional } from "@fmaplabs/mailchimp";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const mailchimp = new MailchimpTransactional(components.mailchimp, {
  onEmailEvent: internal.example.onEmailEvent,
});

export const onEmailEvent = internalMutation({
  args: { id: v.string(), event: v.string() },
  handler: async (_ctx, args) => {
    console.log(`Email ${args.id} received event: ${args.event}`);
  },
});
```

The `defineOnEmailEvent` static helper provides type safety for the handler:

```ts
import { MailchimpTransactional } from "@fmaplabs/mailchimp";

const handler = MailchimpTransactional.defineOnEmailEvent(async (ctx, args) => {
  // args.id — the internal email ID
  // args.event — the EventType (e.g. "send", "open", "hard_bounce")
  console.log(`Email ${args.id}: ${args.event}`);
});
```

## Configuration

All options are optional and passed to the `MailchimpTransactional` constructor:

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | `process.env.MANDRILL_API_KEY` | Mandrill API key |
| `webhookKey` | `string` | `process.env.MANDRILL_WEBHOOK_KEY` | Webhook signing key for signature verification |
| `initialBackoffMs` | `number` | `30000` | Initial backoff for retrying failed sends |
| `retryAttempts` | `number` | `5` | Number of retry attempts for failed sends |
| `onEmailEvent` | `FunctionReference<"mutation", "internal">` | — | Internal mutation called on webhook events |

## API Reference

### `MailchimpTransactional` methods

| Method | Description |
|---|---|
| `sendEmail(ctx, options)` | Send an email. Returns `EmailId`. |
| `sendEmailManually(ctx, options, callback)` | Create an email record and send via a custom callback. Returns `EmailId`. |
| `cancelEmail(ctx, emailId)` | Cancel a pending email. |
| `status(ctx, emailId)` | Get delivery status and engagement flags. Returns `EmailStatus \| null`. |
| `get(ctx, emailId)` | Get the full email record. |
| `registerRoutes(http, { path? })` | Register webhook HTTP routes on a router. |
| `handleMandrillWebhook(ctx, req)` | Manually handle a webhook request. Returns `Response`. |
| `defineOnEmailEvent(handler)` | Static. Type helper for email event callback handlers. |

### Exported types

`MailchimpTransactional`, `MailchimpTransactionalOptions`, `SendEmailOptions`,
`EmailId`, `EmailStatus`, `Recipient`, `Template`, `MergeVar`,
`RecipientMergeVar`, `Status`, `EventType`

## License

[MIT](./LICENSE)

Found a bug? Feature request? [File it here](https://github.com/fmaplabs/mailchimp/issues).
