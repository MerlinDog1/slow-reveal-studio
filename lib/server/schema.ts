import { z } from "zod";
import type { RenderSettings } from "../renderers/types";
import type { PrivateAsset } from "./assets";

export const cropSchema = z
  .object({
    zoom: z.number().min(1).max(4),
    x: z.number().min(-1).max(1),
    y: z.number().min(-1).max(1),
    rotation: z.union([
      z.literal(0),
      z.literal(90),
      z.literal(180),
      z.literal(270),
    ]),
  })
  .strict();
export const settingsSchema = z.object({
  mode: z.enum(["dots", "mosaic", "contour", "line-amplification"]),
  widthMm: z.number().positive().max(1500),
  heightMm: z.number().positive().max(1500),
  spacingMm: z.number().min(0.5).max(30),
  minDiameterMm: z.number().min(0.3).max(20),
  maxDiameterMm: z.number().min(0.3).max(25),
  contrast: z.number().min(0.1).max(4),
  brightness: z.number().min(-1).max(1),
  gamma: z.number().min(0.2).max(4),
  threshold: z.number().min(0).max(0.95),
  edgeEmphasis: z.number().min(0).max(2),
  density: z.number().min(0.25).max(3),
  invert: z.boolean(),
  inkColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  guideOpacity: z.number().min(0.05).max(1),
  safeMarginMm: z.number().min(0).max(100),
  guideWidthMm: z.number().min(0.05).max(0.5).optional(),
  autoExposure: z.boolean().optional(),
  text: z
    .object({
      value: z.string().max(80),
      fontFamily: z.enum(["serif", "sans-serif"]).optional(),
      sizeMm: z.number().min(2).max(18).optional(),
      placement: z
        .enum(["bottom-center", "bottom-left", "bottom-right", "top-center"])
        .optional(),
    })
    .optional(),
  palette: z
    .array(z.string().regex(/^#[0-9a-f]{6}$/i))
    .min(2)
    .max(8)
    .optional(),
  cellShape: z.enum(["square", "rounded", "hexagon"]).optional(),
});
export const sourceInputSchema = z.union([
  z
    .object({
      dataUrl: z.string().max(12 * 1024 * 1024),
      name: z.string().max(180).optional(),
    })
    .strict(),
  z
    .object({ uploadId: z.string().uuid(), token: z.string().min(32).max(256) })
    .strict(),
]);
export const designSchema = z
  .object({
    mode: z.enum(["dots", "mosaic", "contour", "line-amplification"]),
    productId: z.string().max(40),
    finishId: z.string().max(40),
    inkId: z.string().max(40),
    crop: cropSchema,
    settings: settingsSchema,
    source: sourceInputSchema,
    rightsConfirmed: z.literal(true),
    marketingConsent: z.boolean().default(false),
    email: z.string().email().max(254).optional(),
  })
  .strict();
export type Crop = z.infer<typeof cropSchema>;
export type Design = {
  id: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  mode: RenderSettings["mode"];
  productId: string;
  finishId: string;
  inkId: string;
  crop: Crop;
  settings: RenderSettings;
  source: PrivateAsset;
  rightsConfirmed: true;
  marketingConsent: boolean;
  email?: string;
  warnings: string[];
  rendererVersion: string;
};
export type Package = {
  archive: PrivateAsset;
  templateSvg: PrivateAsset;
  finishedSvg: PrivateAsset;
  source: PrivateAsset;
  manifest: Record<string, unknown>;
  snapshotHash: string;
};
export type Checkout = {
  id: string;
  createdAt: string;
  tokenHash: string;
  design: Design;
  package: Package;
  amountPence: number;
  shippingId: string;
  sessionId?: string;
  analyticsSessionHash?: string;
  accessKeyId?: string;
};
export type Revision = {
  id: string;
  createdAt: string;
  package: Package;
  settings: RenderSettings;
  crop: Crop;
  note: string;
  origin?: "customer-replacement" | "admin-regeneration";
  submissionId?: string;
  replacementRequestId?: string;
  replacementInputHash?: string;
  customerProofRequired?: boolean;
};
export type Order = {
  id: string;
  createdAt: string;
  tokenHash: string;
  stripeSessionId: string;
  stripePaymentIntentId?: string;
  paymentStatus: "paid";
  amountPence: number;
  currency: "gbp";
  originalSnapshot: Checkout;
  reviewStatus:
    | "awaiting-review"
    | "approved"
    | "hold"
    | "alternate-photo-requested"
    | "dispatched";
  revisions: Revision[];
  currentRevisionId: string;
  approvedRevisionId?: string;
  audit: { at: string; action: string; note: string; revisionId: string }[];
  customerEmail?: string;
  delivery?: unknown;
  tracking?: string;
  confirmationSent?: boolean;
  dataDeletedAt?: string;
  notifications?: OrderNotification[];
  photoRequest?: {
    id: string;
    revisionId: string;
    requestedAt: string;
    note: string;
    submittedRevisionId?: string;
    fulfilledAt?: string;
  };
  replacementIntake?: {
    submissionId: string;
    requestId: string;
    baseRevisionId: string;
    inputHash: string;
    leaseId: string;
    startedAt: string;
    source: PrivateAsset;
  };
  customerProofApprovals?: {
    revisionId: string;
    snapshotHash: string;
    approvedAt: string;
  }[];
};

export type OrderNotification = {
  id: string;
  type: "confirmation" | "dispatch" | "request-photo";
  templateVersion: 1 | 2;
  createdAt: string;
  status: "pending" | "sending" | "sent";
  attempts: number;
  lastAttemptAt?: string;
  sentAt?: string;
  note?: string;
  tracking?: string;
};
