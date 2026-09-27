import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getCatalogue } from "./catalog";
import { anonymousHash, takeQuota } from "./rate-limit";
import { listRecords, putRecord } from "./store";
import { ApiError } from "./security";
import type { Checkout } from "./schema";

export const EVENT_NAMES = [
  "builder_opened",
  "upload_started",
  "upload_completed",
  "crop_completed",
  "renderer_selected",
  "preset_selected",
  "template_viewed",
  "finished_preview_viewed",
  "personalisation_added",
  "product_size_selected",
  "add_to_basket",
  "checkout_started",
  "abandonment_step",
] as const;
const eventSchema = z
  .object({
    event: z.enum(EVENT_NAMES),
    mode: z
      .enum(["dots", "mosaic", "contour", "line-amplification"])
      .optional(),
    productId: z.string().min(1).max(40).optional(),
    step: z
      .enum([
        "photo",
        "style",
        "detail",
        "colour",
        "personalise",
        "size",
        "finish",
        "review",
        "basket",
        "checkout",
        "lab",
      ])
      .optional(),
    preset: z
      .enum(["easy", "standard", "detailed", "bold", "portrait"])
      .optional(),
    timestamp: z.string().datetime(),
  })
  .strict();
export const analyticsSchema = z
  .object({
    consent: z.literal(true),
    sessionId: z.string().uuid(),
    events: z.array(eventSchema).min(1).max(20),
  })
  .strict();
type AnalyticsEvent = Omit<z.infer<typeof eventSchema>, "event"> & {
  event: z.infer<typeof eventSchema>["event"] | "payment_completed";
};
export type AnalyticsRecord = {
  id: string;
  type: "analytics";
  sessionHash: string;
  createdAt: string;
  events: AnalyticsEvent[];
};
export async function collectAnalytics(input: unknown) {
  const parsed = analyticsSchema.parse(input);
  await takeQuota(parsed.sessionId, "analytics-session", 10, 86400); // 20 events × 10 batches maximum.
  const catalogue = await getCatalogue();
  for (const event of parsed.events) {
    if (
      event.productId &&
      !catalogue.products.some((product) => product.id === event.productId)
    )
      throw new ApiError(400, "Unknown analytics product.");
    if (Math.abs(Date.now() - Date.parse(event.timestamp)) > 86400_000)
      throw new ApiError(400, "Analytics events must be recent.");
  }
  const id = randomUUID();
  await putRecord<AnalyticsRecord>(
    "events",
    id,
    {
      id,
      type: "analytics",
      sessionHash: anonymousHash(parsed.sessionId),
      createdAt: new Date().toISOString(),
      events: parsed.events,
    },
    true,
  );
  return { accepted: parsed.events.length };
}
export async function recordPaymentAnalytics(checkout: Checkout) {
  if (!checkout.analyticsSessionHash) return;
  const id = `payment-${checkout.id}`;
  await putRecord<AnalyticsRecord>(
    "events",
    id,
    {
      id,
      type: "analytics",
      sessionHash: checkout.analyticsSessionHash,
      createdAt: new Date().toISOString(),
      events: [
        {
          event: "payment_completed",
          mode: checkout.design.mode,
          productId: checkout.design.productId,
          timestamp: new Date().toISOString(),
        },
      ],
    },
    true,
  );
}
export async function analyticsSummary() {
  const records = (await listRecords<AnalyticsRecord>("events")).filter(
    (record) =>
      record.type === "analytics" &&
      Date.parse(record.createdAt) >= Date.now() - 30 * 86400_000,
  );
  const groups = new Map<
    string,
    {
      mode: string;
      productId: string;
      event: string;
      count: number;
      sessions: Set<string>;
    }
  >();
  for (const record of records)
    for (const event of record.events) {
      const key = `${event.mode ?? "all"}:${event.productId ?? "all"}:${event.event}`;
      const group = groups.get(key) ?? {
        mode: event.mode ?? "all",
        productId: event.productId ?? "all",
        event: event.event,
        count: 0,
        sessions: new Set<string>(),
      };
      group.count++;
      group.sessions.add(record.sessionHash);
      groups.set(key, group);
    }
  return {
    windowDays: 30,
    consentOnly: true,
    rows: [...groups.values()].map(({ sessions, ...group }) => ({
      ...group,
      sessions: sessions.size,
    })),
  };
}
