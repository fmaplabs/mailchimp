import { httpActionGeneric, type FunctionReference } from "convex/server";
import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  HttpRouter,
} from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";
import { verifyMandrillSignature } from "../component/utils.js";
import type {
  EventType,
  MergeVar,
  Recipient,
  RecipientMergeVar,
  Status,
  Template,
} from "../component/shared.js";

// Re-export types for consumers
export type {
  EventType,
  MergeVar,
  Recipient,
  RecipientMergeVar,
  Status,
  Template,
};

// ── Type helpers ────────────────────────────────────────────────────────────

type RunMutationCtx = Pick<
  GenericMutationCtx<GenericDataModel>,
  "runMutation" | "runQuery"
>;
type RunQueryCtx = Pick<GenericQueryCtx<GenericDataModel>, "runQuery">;
type _RunActionCtx = Pick<
  GenericActionCtx<GenericDataModel>,
  "runMutation" | "runQuery" | "runAction"
>;

export type EmailId = string & { __brand: "EmailId" };

export interface EmailStatus {
  status: Status;
  errorMessage: string | null;
  rejectReason: string | null;
  bounced: boolean;
  complained: boolean;
  opened: boolean;
  clicked: boolean;
}

export interface SendEmailOptions {
  from_email: string;
  from_name?: string;
  to: Recipient[];
  subject?: string;
  html?: string;
  text?: string;
  template?: Template;
  headers?: Record<string, string>;
  tags?: string[];
  metadata?: Record<string, string>;
  globalMergeVars?: MergeVar[];
  mergeVars?: RecipientMergeVar[];
  trackOpens?: boolean;
  trackClicks?: boolean;
}

export interface MailchimpTransactionalOptions {
  apiKey?: string;
  webhookKey?: string;
  initialBackoffMs?: number;
  retryAttempts?: number;
  onEmailEvent?: FunctionReference<"mutation", "internal"> | null;
}

interface RuntimeConfig {
  apiKey: string;
  initialBackoffMs: number;
  retryAttempts: number;
  onEmailEvent?: { fnHandle: string };
}

// ── Main class ──────────────────────────────────────────────────────────────

export class MailchimpTransactional {
  private apiKey: string;
  private webhookKey: string;
  private initialBackoffMs: number;
  private retryAttempts: number;
  private onEmailEventRef?: FunctionReference<"mutation", "internal"> | null;
  private cachedRuntimeConfig?: RuntimeConfig;

  constructor(
    public component: ComponentApi,
    options?: MailchimpTransactionalOptions,
  ) {
    this.apiKey = options?.apiKey ?? process.env.MANDRILL_API_KEY ?? "";
    this.webhookKey =
      options?.webhookKey ?? process.env.MANDRILL_WEBHOOK_KEY ?? "";
    this.initialBackoffMs = options?.initialBackoffMs ?? 30000;
    this.retryAttempts = options?.retryAttempts ?? 5;
    this.onEmailEventRef = options?.onEmailEvent;
  }

  private async getRuntimeConfig(ctx: RunMutationCtx): Promise<RuntimeConfig> {
    if (this.cachedRuntimeConfig) return this.cachedRuntimeConfig;

    let onEmailEvent: { fnHandle: string } | undefined;
    if (this.onEmailEventRef) {
      const handle = await (
        ctx as unknown as {
          getFunctionHandle: (
            ref: FunctionReference<"mutation", "internal">,
          ) => Promise<string>;
        }
      ).getFunctionHandle(this.onEmailEventRef);
      onEmailEvent = { fnHandle: handle };
    }

    this.cachedRuntimeConfig = {
      apiKey: this.apiKey,
      initialBackoffMs: this.initialBackoffMs,
      retryAttempts: this.retryAttempts,
      onEmailEvent,
    };
    return this.cachedRuntimeConfig;
  }

  async sendEmail(
    ctx: RunMutationCtx,
    options: SendEmailOptions,
  ): Promise<EmailId> {
    if (!this.apiKey) {
      throw new Error(
        "Mandrill API key not set. Pass apiKey in constructor or set MANDRILL_API_KEY env var.",
      );
    }

    const runtimeConfig = await this.getRuntimeConfig(ctx);

    const id = await ctx.runMutation(this.component.lib.sendEmail, {
      options: runtimeConfig,
      from_email: options.from_email,
      from_name: options.from_name,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      template: options.template,
      headers: options.headers,
      tags: options.tags,
      metadata: options.metadata,
      globalMergeVars: options.globalMergeVars,
      mergeVars: options.mergeVars,
      trackOpens: options.trackOpens,
      trackClicks: options.trackClicks,
    });
    return id as unknown as EmailId;
  }

  async sendEmailManually(
    ctx: RunMutationCtx,
    options: Pick<
      SendEmailOptions,
      "from_email" | "from_name" | "to" | "subject"
    >,
    callback: (emailId: EmailId) => Promise<{
      mandrillId?: string;
      status: Status;
      errorMessage?: string;
    }>,
  ): Promise<EmailId> {
    const id = await ctx.runMutation(this.component.lib.createManualEmail, {
      from_email: options.from_email,
      from_name: options.from_name,
      to: options.to,
      subject: options.subject,
    });
    const emailId = id as unknown as EmailId;

    try {
      const result = await callback(emailId);
      await ctx.runMutation(this.component.lib.updateManualEmail, {
        emailId: id,
        status: result.status,
        mandrillId: result.mandrillId,
        errorMessage: result.errorMessage,
      });
    } catch (e) {
      await ctx.runMutation(this.component.lib.updateManualEmail, {
        emailId: id,
        status: "failed",
        errorMessage: e instanceof Error ? e.message : String(e),
      });
    }

    return emailId;
  }

  async cancelEmail(ctx: RunMutationCtx, emailId: EmailId): Promise<void> {
    await ctx.runMutation(this.component.lib.cancelEmail, {
      emailId: emailId as unknown as string,
    });
  }

  async status(
    ctx: RunQueryCtx,
    emailId: EmailId,
  ): Promise<EmailStatus | null> {
    return await ctx.runQuery(this.component.lib.getStatus, {
      emailId: emailId as unknown as string,
    });
  }

  async get(ctx: RunQueryCtx, emailId: EmailId) {
    return await ctx.runQuery(this.component.lib.get, {
      emailId: emailId as unknown as string,
    });
  }

  async handleMandrillWebhook(
    ctx: RunMutationCtx,
    req: Request,
  ): Promise<Response> {
    // HEAD requests are used by Mandrill to verify the webhook URL
    if (req.method === "HEAD") {
      return new Response(null, { status: 200 });
    }

    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      const body = await req.text();
      const params = new URLSearchParams(body);
      const eventsRaw = params.get("mandrill_events");

      if (!eventsRaw) {
        return new Response("Missing mandrill_events", { status: 400 });
      }

      // Verify signature if webhook key is configured
      if (this.webhookKey) {
        const signature = req.headers.get("X-Mandrill-Signature") ?? "";
        const url = req.url;
        const paramsObj: Record<string, string> = {};
        for (const [key, value] of params.entries()) {
          paramsObj[key] = value;
        }

        const valid = await verifyMandrillSignature(
          this.webhookKey,
          url,
          paramsObj,
          signature,
        );

        if (!valid) {
          console.warn("Invalid Mandrill webhook signature");
          return new Response("Invalid signature", { status: 401 });
        }
      }

      const events = JSON.parse(eventsRaw) as Array<{
        event: string;
        _id?: string;
        ts?: number;
        msg?: {
          _id?: string;
          email?: string;
          bounce_description?: string;
          diag?: string;
          reject?: { reason?: string };
        };
      }>;

      for (const event of events) {
        const mandrillId = event.msg?._id ?? event._id;
        if (!mandrillId) continue;

        const eventType = event.event as EventType;
        const message =
          event.msg?.bounce_description ??
          event.msg?.diag ??
          event.msg?.reject?.reason;

        await ctx.runMutation(this.component.lib.handleEmailEvent, {
          eventType,
          mandrillId,
          ts: event.ts ?? Math.floor(Date.now() / 1000),
          message,
        });
      }

      return new Response(null, { status: 200 });
    } catch (e) {
      console.error("Error handling Mandrill webhook:", e);
      return new Response("Internal error", { status: 500 });
    }
  }

  /**
   * Register webhook routes on an HTTP router.
   */
  registerRoutes(
    http: HttpRouter,
    { path = "/mandrill/webhook" }: { path?: string } = {},
  ) {
    const handleWebhook = this.handleMandrillWebhook.bind(this);
    http.route({
      path,
      method: "POST",
      handler: httpActionGeneric(async (ctx, req) => {
        return await handleWebhook(ctx, req);
      }),
    });
    // Mandrill sends HEAD requests to verify webhook URL.
    // Convex doesn't support HEAD directly, but GET handles HEAD automatically.
    http.route({
      path,
      method: "GET",
      handler: httpActionGeneric(async () => {
        return new Response(null, { status: 200 });
      }),
    });
  }

  /**
   * Helper to create a typed mutation handler for email event callbacks.
   */
  static defineOnEmailEvent(
    handler: (
      ctx: GenericMutationCtx<GenericDataModel>,
      args: { id: string; event: EventType },
    ) => Promise<void>,
  ) {
    return handler;
  }
}
