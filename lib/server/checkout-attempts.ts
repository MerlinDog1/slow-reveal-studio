import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { checkoutAttemptId } from "../checkout-intent";
import { getCatalogue, quote } from "./catalog";
import { authorizedDesign } from "./designs";
import { launchGates } from "./config";
import { createProductionPackage } from "./production";
import { ApiError, digest, tokenMatches } from "./security";
import {
  getRecord,
  putRecord,
  publishCheckoutAttempt,
  replaceCheckoutAttempt,
} from "./store";
import type { Checkout, CheckoutAttempt, Design, Package } from "./schema";
import { anonymousHash, takeQuota } from "./rate-limit";
import { activeOrderAccessKey, orderAccessToken } from "./order-access";
import { assertProductDimensions } from "./commerce";

const checkoutSchema = z
  .object({
    attemptId: z.string().uuid(),
    designId: z.string().uuid(),
    token: z.string().min(32).max(256),
    shippingId: z.enum(["standard", "express"]).default("standard"),
    proofApproved: z.literal(true),
    proofHash: z.string().regex(/^[a-f0-9]{64}$/),
    analyticsSessionId: z.string().uuid().optional(),
    analyticsConsent: z.boolean().optional(),
  })
  .strict();

type Session = Stripe.Checkout.Session;
/** Internal dependency seam for provider-free fault/concurrency tests; never accepted from HTTP. */
export type CheckoutDependencies = {
  now: () => number;
  gates: typeof launchGates;
  catalogue: typeof getCatalogue;
  produce: typeof createProductionPackage;
  createSession: (
    params: Stripe.Checkout.SessionCreateParams,
    key: string,
  ) => Promise<Session>;
  retrieveSession: (id: string) => Promise<Session>;
  credentialHash: () => string;
};
function stripe() {
  if (!process.env.STRIPE_SECRET_KEY)
    throw new ApiError(503, "Stripe is not configured.");
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    timeout: 30_000,
    maxNetworkRetries: 0,
  });
}
const defaults: CheckoutDependencies = {
  now: Date.now,
  gates: launchGates,
  catalogue: getCatalogue,
  produce: createProductionPackage,
  createSession: (params, key) =>
    stripe().checkout.sessions.create(params, { idempotencyKey: key }),
  retrieveSession: (id) => stripe().checkout.sessions.retrieve(id),
  credentialHash: () => digest(process.env.STRIPE_SECRET_KEY || ""),
};
const stripeLeaseMs = 90_000;
function iso(time: number) {
  return new Date(time).toISOString();
}
function processing(attempt: CheckoutAttempt) {
  return {
    status: "processing" as const,
    orderId: attempt.orderId,
    retryAfterSeconds: 3,
  };
}
function stopped(attempt: CheckoutAttempt): never {
  throw new ApiError(
    409,
    attempt.state === "closed"
      ? "This checkout attempt is closed. Contact the studio before starting another checkout."
      : "This checkout needs payment reconciliation. Contact the studio; do not start another payment.",
    {
      attemptStatus: attempt.state,
      restartAllowed: false,
      orderId: attempt.orderId,
    },
  );
}
async function transition(attempt: CheckoutAttempt, next: CheckoutAttempt) {
  await replaceCheckoutAttempt(attempt, next);
  return next;
}
function checkoutFor(
  attempt: CheckoutAttempt,
  design: Design,
  production: Package,
): Checkout {
  return {
    id: attempt.orderId,
    attemptId: attempt.id,
    createdAt: attempt.createdAt,
    tokenHash: attempt.tokenHash,
    accessKeyId: attempt.accessKeyId,
    design: {
      ...design,
      email: undefined,
      source: production.source,
      subjectMask: production.subjectMask,
    },
    package: production,
    amountPence: attempt.amountPence,
    shippingId: attempt.shippingId,
    analyticsSessionHash: attempt.analyticsSessionHash,
  };
}
function assertCheckout(attempt: CheckoutAttempt, checkout: Checkout) {
  if (
    checkout.attemptId !== attempt.id ||
    checkout.id !== attempt.orderId ||
    checkout.package.snapshotHash !== attempt.proofHash ||
    checkout.tokenHash !== attempt.tokenHash ||
    checkout.design.id !== attempt.designId ||
    checkout.amountPence !== attempt.amountPence
  )
    throw new ApiError(
      409,
      "The checkout snapshot needs administrator review.",
    );
}

export async function beginCheckout(
  input: unknown,
  overrides: Partial<CheckoutDependencies> = {},
) {
  const body = checkoutSchema.parse(input);
  const deps = { ...defaults, ...overrides };
  // Existing and new attempts both require current launch permission and the original design capability.
  const gates = deps.gates();
  if (gates.some((gate) => !gate.passed))
    throw new ApiError(
      503,
      "Checkout opens after physical trials and production services are approved. Your design can still be saved.",
      { gates },
    );
  const design = await authorizedDesign(body.designId, body.token);
  if (
    body.attemptId.toLowerCase() !==
    (await checkoutAttemptId(design.id, body.proofHash, body.shippingId))
  )
    throw new ApiError(
      409,
      "Retry the original checkout attempt for this saved proof and delivery choice.",
    );
  const inputHash = digest(
    JSON.stringify([
      design.id,
      design.tokenHash,
      body.proofHash,
      body.shippingId,
    ]),
  );
  let attempt = await getRecord<CheckoutAttempt>(
    "checkout-attempts",
    body.attemptId.toLowerCase(),
  );
  let inserted = false;
  if (!attempt) {
    const catalogue = await deps.catalogue();
    if (catalogue.prototype)
      throw new ApiError(
        503,
        "Checkout opens after physical trials and production services are approved. Your design can still be saved.",
        { catalogueApproved: false },
      );
    if (
      !(process.env.PHYSICALLY_VALIDATED_MODES || "dots")
        .split(",")
        .includes(design.mode) ||
      design.settings.invert
    )
      throw new ApiError(
        409,
        "This mode or inverted substrate is still in physical testing.",
      );
    const price = quote(
      catalogue,
      design.productId,
      design.finishId,
      body.shippingId,
    );
    assertProductDimensions(design.settings, price.product);
    await takeQuota(design.id, "checkout-design", 3, 3600);
    const now = deps.now();
    const orderId = randomUUID();
    const accessKeyId = activeOrderAccessKey();
    const token = orderAccessToken(orderId, accessKeyId);
    const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL!).origin;
    attempt = {
      id: body.attemptId.toLowerCase(),
      version: 1,
      orderId,
      designId: design.id,
      designTokenHash: design.tokenHash,
      inputHash,
      proofHash: body.proofHash,
      createdAt: iso(now),
      productionExpiresAt: iso(now + 20 * 60_000),
      expiresAt: iso(now + 23 * 3600_000),
      accessKeyId,
      tokenHash: digest(token),
      amountPence: price.totalPence,
      shippingId: body.shippingId,
      analyticsSessionHash:
        body.analyticsConsent && body.analyticsSessionId
          ? anonymousHash(body.analyticsSessionId)
          : undefined,
      sourceAssets: [
        design.source,
        ...(design.subjectMask ? [design.subjectMask] : []),
      ],
      origin,
      stripeCredentialHash: deps.credentialHash(),
      idempotencyKey: `checkout-${orderId}`,
      stripeParams: {
        mode: "payment",
        client_reference_id: orderId,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "gbp",
              unit_amount: price.itemPence,
              product_data: {
                name: `Slow Reveal ${design.mode} · ${price.product.label}`,
                description: price.finish.label,
              },
            },
          },
        ],
        shipping_address_collection: { allowed_countries: ["GB"] },
        shipping_options: [
          {
            shipping_rate_data: {
              type: "fixed_amount",
              fixed_amount: {
                amount: price.shipping.pricePence,
                currency: "gbp",
              },
              display_name: price.shipping.label,
            },
          },
        ],
        allow_promotion_codes: true,
        metadata: { orderId, snapshotHash: body.proofHash },
        customer_email: design.email,
        expires_at: Math.floor((now + 23 * 3600_000) / 1000),
      },
      state: "producing",
      assets: [],
    };
    inserted = await putRecord("checkout-attempts", attempt.id, attempt, true);
    if (!inserted)
      attempt = (await getRecord<CheckoutAttempt>(
        "checkout-attempts",
        attempt.id,
      ))!;
  }
  if (
    !attempt ||
    attempt.inputHash !== inputHash ||
    !tokenMatches(body.token, attempt.designTokenHash)
  )
    throw new ApiError(
      409,
      "This checkout attempt belongs to a different saved proof.",
    );
  if (attempt.stripeCredentialHash !== deps.credentialHash())
    throw new ApiError(
      409,
      "The payment configuration changed. This checkout needs administrator review.",
      { attemptStatus: "needs-review", restartAllowed: false },
    );
  if (attempt.state === "closed") stopped(attempt);

  let checkout = await getRecord<Checkout>("checkouts", attempt.orderId);
  if (attempt.state === "producing") {
    if (checkout) {
      // Recover the local two-file publication crash without rendering/writing another package.
      assertCheckout(attempt, checkout);
      attempt = await transition(attempt, {
        ...attempt,
        state: "prepared",
        publishedAt: attempt.publishedAt || iso(deps.now()),
      });
    } else if (!inserted) {
      if (Date.parse(attempt.productionExpiresAt) <= deps.now()) {
        attempt = await transition(attempt, {
          ...attempt,
          state: "closed",
          closedAt: iso(deps.now()),
        });
        stopped(attempt);
      }
      return processing(attempt);
    } else {
      const production = await deps.produce(
        design,
        attempt.orderId,
        design.settings,
        design.crop,
        attempt.proofHash,
        {
          beforeWrite: async (assets) => {
            if (Date.parse(attempt!.productionExpiresAt) <= deps.now())
              throw new ApiError(
                409,
                "Checkout production timed out before writing files.",
              );
            attempt = await transition(attempt!, { ...attempt!, assets });
          },
        },
      );
      if (Date.parse(attempt.productionExpiresAt) <= deps.now())
        throw new ApiError(
          409,
          "Checkout production timed out. Retry the same attempt to check its state.",
        );
      checkout = checkoutFor(attempt, design, production);
      const prepared = {
        ...attempt,
        state: "prepared" as const,
        publishedAt: iso(deps.now()),
      };
      await publishCheckoutAttempt(attempt, prepared, checkout);
      attempt = prepared;
    }
  }
  if (!checkout)
    throw new ApiError(
      503,
      "The checkout snapshot is unavailable. Retry the same attempt.",
    );
  assertCheckout(attempt, checkout);
  // A webhook can recover a response lost before the session ID was stored on the attempt.
  const sessionId = attempt.sessionId || checkout.sessionId;
  if (sessionId) {
    let session: Session;
    try {
      session = await deps.retrieveSession(sessionId);
    } catch {
      throw new ApiError(
        503,
        "Could not check the existing payment session. Retry this same attempt.",
      );
    }
    return acceptSession(attempt, checkout, session, deps);
  }
  if (attempt.state === "needs-review") stopped(attempt);
  const now = deps.now();
  const deadline = Math.min(
    Date.parse(attempt.expiresAt) - 31 * 60_000,
    attempt.stripeStartedAt
      ? Date.parse(attempt.stripeStartedAt) + 23 * 3600_000
      : Infinity,
  );
  if (now >= deadline) {
    attempt = await transition(attempt, {
      ...attempt,
      state: attempt.stripeStartedAt ? "needs-review" : "closed",
      closedAt: attempt.stripeStartedAt ? undefined : iso(now),
    });
    stopped(attempt);
  }
  if (
    attempt.stripeLeaseAt &&
    now - Date.parse(attempt.stripeLeaseAt) < stripeLeaseMs
  )
    return processing(attempt);
  const claimed: CheckoutAttempt = {
    ...attempt,
    state: "submitting",
    stripeStartedAt: attempt.stripeStartedAt || iso(now),
    stripeLeaseId: randomUUID(),
    stripeLeaseAt: iso(now),
  };
  try {
    await replaceCheckoutAttempt(attempt, claimed);
  } catch (error) {
    if (error instanceof ApiError && error.status === 409)
      return processing(attempt);
    throw error;
  }
  const token = orderAccessToken(claimed.orderId, claimed.accessKeyId);
  if (!tokenMatches(token, claimed.tokenHash))
    throw new ApiError(
      503,
      "The retained private order access key does not match this checkout.",
    );
  let session: Session;
  try {
    session = await deps.createSession(
      {
        ...claimed.stripeParams,
        success_url: `${claimed.origin}/order/${claimed.orderId}#token=${token}`,
        cancel_url: `${claimed.origin}/design/${claimed.designId}#token=${body.token}`,
      },
      claimed.idempotencyKey,
    );
  } catch {
    // Any provider exception can be an unknown outcome. Keep the same key and immutable parameters.
    await replaceCheckoutAttempt(claimed, {
      ...claimed,
      stripeLeaseId: undefined,
      stripeLeaseAt: undefined,
    }).catch(() => {});
    throw new ApiError(
      503,
      "The payment response was interrupted. Retry this same checkout attempt; do not start another payment.",
    );
  }
  return acceptSession(claimed, checkout, session, deps);
}

async function acceptSession(
  attempt: CheckoutAttempt,
  checkout: Checkout,
  session: Session,
  deps: CheckoutDependencies,
) {
  if (
    session.client_reference_id !== attempt.orderId ||
    session.metadata?.orderId !== attempt.orderId ||
    session.metadata?.snapshotHash !== attempt.proofHash ||
    session.mode !== "payment" ||
    (attempt.sessionId && attempt.sessionId !== session.id) ||
    (checkout.sessionId && checkout.sessionId !== session.id)
  )
    throw new ApiError(
      409,
      "The payment session does not match this checkout. Contact the studio.",
    );
  // Save the session ID first: if later CAS acknowledgement is lost, retrieve instead of creating again.
  if (!checkout.sessionId)
    await putRecord("checkouts", checkout.id, {
      ...checkout,
      sessionId: session.id,
    });
  if (session.status === "expired" && session.payment_status === "unpaid") {
    await replaceCheckoutAttempt(attempt, {
      ...attempt,
      state: "closed",
      sessionId: session.id,
      stripeLeaseId: undefined,
      stripeLeaseAt: undefined,
      closedAt: iso(deps.now()),
    });
    stopped({ ...attempt, state: "closed" });
  }
  if (session.status !== "open" && session.status !== "complete")
    throw new ApiError(409, "This payment session needs administrator review.");
  const next: CheckoutAttempt = {
    ...attempt,
    state: "ready",
    sessionId: session.id,
    sessionUrl: session.url ?? undefined,
    stripeLeaseId: undefined,
    stripeLeaseAt: undefined,
  };
  try {
    await replaceCheckoutAttempt(attempt, next);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 409) throw error;
    const current = await getRecord<CheckoutAttempt>(
      "checkout-attempts",
      attempt.id,
    );
    if (
      !current ||
      current.state !== "ready" ||
      current.sessionId !== session.id
    )
      throw error;
  }
  const token = orderAccessToken(attempt.orderId, attempt.accessKeyId);
  if (!tokenMatches(token, attempt.tokenHash))
    throw new ApiError(
      503,
      "The retained private order access key does not match this checkout.",
    );
  const url =
    session.status === "complete"
      ? `${attempt.origin}/order/${attempt.orderId}#token=${token}`
      : session.url;
  if (!url)
    throw new ApiError(
      503,
      "The payment session has no checkout link. Retry this same attempt.",
    );
  return { status: "ready" as const, url, orderId: attempt.orderId, token };
}
