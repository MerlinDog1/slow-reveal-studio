import { checkoutAttemptId } from "../lib/checkout-intent";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import JSZip from "jszip";
import Stripe from "stripe";
import {
  digest,
  newToken,
  tokenMatches,
  requireAdmin,
  requireSameOrigin,
  ApiError,
} from "../lib/server/security";
import { decodeSource } from "../lib/server/assets";
import {
  saveDesign,
  authorizedDesign,
  deleteDesign,
} from "../lib/server/designs";
import { quote, getCatalogue } from "../lib/server/catalog";
import {
  beginCheckout,
  validatePaidSession,
  fulfillVerifiedSession,
  assertProductDimensions,
} from "../lib/server/commerce";
import { applyReviewAction, updateOrder } from "../lib/server/admin";
import {
  cropRaster,
  createProductionPackage,
  renderDesign,
  proofHash,
} from "../lib/server/production";
import { getAsset } from "../lib/server/assets";
import { getRecord, putRecord, replaceOrder } from "../lib/server/store";
import { DEFAULT_SETTINGS } from "../lib/renderers";
import type { Checkout, Order } from "../lib/server/schema";
import { POST as webhook } from "../app/api/stripe/webhook/route";
import { GET as orderStatus } from "../app/api/orders/[id]/route";
import {
  analyticsSchema,
  collectAnalytics,
  analyticsSummary,
} from "../lib/server/analytics";
import { anonymousHash, takeQuota } from "../lib/server/rate-limit";
import { uploadedSource } from "../lib/server/uploads";
import { eraseOrderArtwork, runRetention } from "../lib/server/retention";
import { POST as collectEventRoute } from "../app/api/analytics/route";
import { POST as checkoutRoute } from "../app/api/checkout/route";
import { orderAccessToken, orderStatusLink } from "../lib/server/order-access";

test("guest capabilities do not authorize by ID, prefix, or wrong token", () => {
  const token = newToken();
  assert.equal(token.length, 43);
  assert.equal(tokenMatches(token, digest(token)), true);
  assert.equal(tokenMatches(token.slice(0, 32), digest(token)), false);
  assert.equal(tokenMatches(newToken(), digest(token)), false);
  assert.equal(tokenMatches(null, digest(token)), false);
});
test("no unauthenticated admin fallback and cross-origin mutations fail", async () => {
  const previous = process.env.ADMIN_API_TOKEN;
  delete process.env.ADMIN_API_TOKEN;
  try {
    await assert.rejects(
      () => requireAdmin(new Request("http://localhost/api/admin")),
      ApiError,
    );
  } finally {
    if (previous !== undefined) process.env.ADMIN_API_TOKEN = previous;
  }
  assert.throws(
    () =>
      requireSameOrigin(
        new Request("http://localhost/api/designs", {
          headers: { Origin: "https://attacker.example" },
        }),
      ),
    ApiError,
  );
});
test("image upload detects MIME spoofing and rejects active SVG", () => {
  assert.throws(
    () => decodeSource("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="),
    ApiError,
  );
  assert.throws(
    () =>
      decodeSource(
        `data:image/png;base64,${Buffer.from("not really a png image").toString("base64")}`,
      ),
    ApiError,
  );
});
test("analytics schema rejects personal metadata and forged client payment", () => {
  const event = {
    event: "upload_completed",
    mode: "dots",
    timestamp: new Date().toISOString(),
  };
  const body = {
    consent: true,
    sessionId: "1a555bee-c1b4-486a-a3d5-52eb3eabdb99",
    events: [event],
  };
  assert.equal(analyticsSchema.safeParse(body).success, true);
  assert.equal(
    analyticsSchema.safeParse({ ...body, consent: false }).success,
    false,
  );
  assert.equal(
    analyticsSchema.safeParse({ ...body, email: "not-collected@example.test" })
      .success,
    false,
  );
  assert.equal(
    analyticsSchema.safeParse({
      ...body,
      events: [{ ...event, text: "Never record this caption" }],
    }).success,
    false,
  );
  assert.equal(
    analyticsSchema.safeParse({
      ...body,
      events: [{ ...event, event: "payment_completed" }],
    }).success,
    false,
  );
  assert.equal(anonymousHash("192.0.2.1").includes("192.0.2.1"), false);
});
test("local persistence, checkout gates, immutable payment fulfilment and physical package", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "slow-reveal-test-"));
  const keys = [
    "STUDIO_DATA_DIR",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "R2_ACCOUNT_ID",
    "LIVE_CHECKOUT_ENABLED",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "ALLOW_LOCAL_DEVELOPMENT_STORAGE",
    "ORDER_ACCESS_KEYS",
    "ORDER_ACCESS_KEY_ID",
    "NEXT_PUBLIC_SITE_URL",
  ];
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  for (const key of keys) delete process.env[key];
  process.env.STUDIO_DATA_DIR = directory;
  process.env.ALLOW_LOCAL_DEVELOPMENT_STORAGE = "true";
  process.env.ORDER_ACCESS_KEYS = JSON.stringify({
    v1: "isolated-test-only-order-access-secret-123456789",
  });
  process.env.ORDER_ACCESS_KEY_ID = "v1";
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost";
  try {
    const image = await sharp({
      create: { width: 80, height: 100, channels: 3, background: "#777777" },
    })
      .png()
      .toBuffer();
    await takeQuota("isolated-test", "test-quota", 1, 900);
    await assert.rejects(
      takeQuota("isolated-test", "test-quota", 1, 900),
      (error) => error instanceof ApiError && error.status === 429,
    );
    await assert.rejects(
      uploadedSource("1a555bee-c1b4-486a-a3d5-52eb3eabdb99", newToken()),
      /invalid or expired/,
    );
    const analyticsInput = {
      consent: true,
      sessionId: "1a555bee-c1b4-486a-a3d5-52eb3eabdb99",
      events: [
        {
          event: "upload_completed",
          mode: "dots",
          productId: "30x40",
          timestamp: new Date().toISOString(),
        },
      ],
    };
    await collectAnalytics(analyticsInput);
    const summary = await analyticsSummary();
    assert.equal(summary.rows[0].count, 1);
    assert.equal(
      JSON.stringify(summary).includes(analyticsInput.sessionId),
      false,
    );
    const rejectedAnalytics = await collectEventRoute(
      new Request("http://localhost/api/analytics", {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...analyticsInput,
          events: [{ ...analyticsInput.events[0], source: "secret-photo" }],
        }),
      }),
    );
    assert.equal(rejectedAnalytics.status, 400);
    assert.equal(
      (await rejectedAnalytics.text()).includes("secret-photo"),
      false,
    );
    const input = {
      mode: "dots",
      productId: "30x40",
      finishId: "rolled",
      inkId: "black",
      crop: { zoom: 1, x: 0, y: 0, rotation: 0 },
      settings: { ...DEFAULT_SETTINGS, widthMm: 800, heightMm: 800 },
      source: { dataUrl: `data:image/png;base64,${image.toString("base64")}` },
      rightsConfirmed: true,
      marketingConsent: false,
    };
    await assert.rejects(
      saveDesign({ ...input, paymentStatus: "paid", pricePence: 1 }),
    );
    const saved = await saveDesign(input);
    await assert.rejects(authorizedDesign(saved.id, newToken()), /not found/);
    const design = await authorizedDesign(saved.id, saved.token);
    assert.equal(
      design.settings.widthMm,
      300,
      "authoritative product dimensions replace submitted dimensions",
    );
    assert.equal(design.settings.heightMm, 400);
    assert.equal(design.settings.inkColor, "#1e1e1c");
    const landscapeSaved = await saveDesign({
      ...input,
      settings: {
        ...input.settings,
        widthMm: 400,
        heightMm: 300,
        inkColor: "#ff0000",
      },
    });
    const landscapeDesign = await authorizedDesign(
      landscapeSaved.id,
      landscapeSaved.token,
    );
    assert.equal(landscapeDesign.settings.widthMm, 400);
    assert.equal(landscapeDesign.settings.heightMm, 300);
    assert.equal(
      landscapeDesign.settings.inkColor,
      "#1e1e1c",
      "submitted colours cannot change the selected kit ink",
    );
    await deleteDesign(landscapeSaved.id, landscapeSaved.token);
    assert.equal(JSON.stringify(design).includes("data:image"), false);
    const catalogue = await getCatalogue();
    assert.doesNotThrow(() =>
      assertProductDimensions(
        { widthMm: 300, heightMm: 400 },
        catalogue.products[0],
      ),
    );
    assert.doesNotThrow(() =>
      assertProductDimensions(
        { widthMm: 400, heightMm: 300 },
        catalogue.products[0],
      ),
    );
    assert.throws(
      () =>
        assertProductDimensions(
          { widthMm: 300, heightMm: 400 },
          { ...catalogue.products[0], heightMm: 450 },
        ),
      /size has changed/,
    );
    assert.equal(
      quote(catalogue, "30x40", "rolled", "standard").totalPence,
      5495,
    );
    await assert.rejects(
      beginCheckout({
        attemptId: await checkoutAttemptId(
          design.id,
          "0".repeat(64),
          "standard",
        ),
        designId: design.id,
        token: saved.token,
        shippingId: "standard",
        proofApproved: true,
        proofHash: "0".repeat(64),
      }),
      /physical trials/,
    );
    for (let attempt = 0; attempt < 6; attempt++) {
      const response = await checkoutRoute(
        new Request("http://localhost/api/checkout", {
          method: "POST",
          headers: {
            Origin: "http://localhost",
            "Content-Type": "application/json",
            "x-real-ip": "isolated-checkout-quota-test",
          },
          body: JSON.stringify({
            attemptId: await checkoutAttemptId(
              design.id,
              "0".repeat(64),
              "standard",
            ),
            designId: design.id,
            token: saved.token,
            shippingId: "standard",
            proofApproved: true,
            proofHash: "0".repeat(64),
          }),
        }),
      );
      assert.equal(
        response.status,
        attempt < 5 ? 503 : 429,
        "checkout quota is enforced before expensive production work",
      );
    }
    const cropped = await cropRaster(
      image,
      { zoom: 2, x: 1, y: -1, rotation: 90 },
      300,
      400,
    );
    assert.equal(cropped.raster.width, 750);
    assert.equal(cropped.raster.height, 1000);
    assert.equal(cropped.raster.data.length, 750 * 1000 * 4);
    const approvedProofHash = proofHash(
      design,
      (await renderDesign(design)).geometry,
    );
    await assert.rejects(
      createProductionPackage(
        design,
        "test-order",
        design.settings,
        design.crop,
        "0".repeat(64),
      ),
      /proof has changed/,
    );
    const production = await createProductionPackage(
      design,
      "test-order",
      design.settings,
      design.crop,
      approvedProofHash,
    );
    assert.equal(production.snapshotHash, approvedProofHash);
    const zip = await JSZip.loadAsync(await getAsset(production.archive));
    assert.ok(zip.file("source/original.png"));
    assert.ok(zip.file("geometry.json"));
    const svgName = Object.keys(zip.files).find((name) =>
      name.endsWith("_template.svg"),
    )!;
    assert.match(await zip.file(svgName)!.async("string"), /width="300mm"/);
    const pdfName = Object.keys(zip.files).find((name) =>
      name.endsWith("_template.pdf"),
    )!;
    const pdfText = (await zip.file(pdfName)!.async("nodebuffer")).toString(
      "latin1",
    );
    const media = pdfText.match(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/);
    assert.ok(media);
    assert.ok(Math.abs((Number(media[1]) / 72) * 25.4 - 300) < 0.01);
    assert.ok(Math.abs((Number(media[2]) / 72) * 25.4 - 400) < 0.01);
    const pngName = Object.keys(zip.files).find((name) =>
      name.endsWith("_template.png"),
    )!;
    const pngMeta = await sharp(
      await zip.file(pngName)!.async("nodebuffer"),
    ).metadata();
    assert.ok(Math.abs(pngMeta.width! - (300 / 25.4) * 300) <= 1);
    const orderId = saved.id;
    const orderToken = orderAccessToken(orderId);
    const checkout: Checkout = {
      id: orderId,
      createdAt: new Date().toISOString(),
      tokenHash: digest(orderToken),
      accessKeyId: "v1",
      design,
      package: production,
      amountPence: 5495,
      shippingId: "standard",
      sessionId: "cs_test_trusted",
    };
    const session = {
      id: checkout.sessionId,
      mode: "payment",
      payment_status: "paid",
      currency: "gbp",
      amount_total: 5495,
      client_reference_id: orderId,
      metadata: { orderId, snapshotHash: production.snapshotHash },
      total_details: { amount_discount: 0 },
      customer_details: { email: "customer@example.test" },
    } as unknown as Stripe.Checkout.Session;
    validatePaidSession(session, checkout);
    assert.throws(() =>
      validatePaidSession({ ...session, amount_total: 1 }, checkout),
    );
    assert.throws(() =>
      validatePaidSession({ ...session, payment_status: "unpaid" }, checkout),
    );
    assert.throws(() =>
      validatePaidSession(
        { ...session, metadata: { orderId, snapshotHash: "tampered" } },
        checkout,
      ),
    );
    await putRecord("checkouts", orderId, checkout, true);
    const context = { params: Promise.resolve({ id: orderId }) };
    const pending = await orderStatus(
      new Request(`http://localhost/api/orders/${orderId}`, {
        headers: { authorization: `Bearer ${orderToken}` },
      }),
      context,
    );
    assert.equal(
      (await pending.json()).paymentStatus,
      "pending",
      "opening a success URL cannot mark an order paid",
    );
    assert.equal(
      (
        await orderStatus(
          new Request(`http://localhost/api/orders/${orderId}`),
          context,
        )
      ).status,
      404,
    );
    const mail: {
      to: string | undefined;
      subject: string;
      text: string;
      key: string;
    }[] = [];
    const fakeMail = async (
      to: string | undefined,
      subject: string,
      text: string,
      key: string,
    ) => {
      mail.push({ to, subject, text, key });
      return true;
    };
    assert.equal(
      (await fulfillVerifiedSession(session, fakeMail)).inserted,
      true,
    );
    assert.equal(
      (await fulfillVerifiedSession(session, fakeMail)).inserted,
      false,
    );
    assert.equal(
      mail.length,
      1,
      "persisted sent state prevents duplicate confirmation after provider idempotency expires",
    );
    const privateLink = orderStatusLink(checkout);
    assert.ok(mail[0].text.includes(privateLink));
    assert.equal(new URL(privateLink).search, "");
    assert.equal(
      new URLSearchParams(new URL(privateLink).hash.slice(1)).get("token"),
      orderToken,
    );
    assert.equal(
      (
        await orderStatus(
          new Request(new URL(privateLink).origin + `/api/orders/${orderId}`, {
            headers: { authorization: `Bearer ${orderToken}` },
          }),
          context,
        )
      ).status,
      200,
      "mailed capability grants genuine private order access",
    );
    process.env.ORDER_ACCESS_KEYS = JSON.stringify({
      v1: "isolated-test-only-order-access-secret-123456789",
      v2: "new-isolated-test-only-order-access-secret-987654321",
    });
    process.env.ORDER_ACCESS_KEY_ID = "v2";
    assert.equal(
      orderStatusLink(checkout),
      privateLink,
      "retained key IDs keep old order links stable after rotation",
    );
    process.env.ORDER_ACCESS_KEY_ID = "v1";
    const order = (await getRecord<Order>("orders", orderId))!;
    assert.equal(
      JSON.stringify(order).includes(orderToken),
      false,
      "only capability hashes and key IDs are persisted",
    );
    assert.equal(
      JSON.stringify(order).includes(privateLink),
      false,
      "notification outbox never persists plaintext private links",
    );
    await assert.rejects(
      putRecord("orders", orderId, { ...order, amountPence: 1 }),
      /immutable/,
    );
    await assert.rejects(
      putRecord("orders", orderId, {
        ...order,
        originalSnapshot: {
          ...order.originalSnapshot,
          design: { ...design, crop: { ...design.crop, zoom: 3 } },
        },
      }),
      /immutable/,
    );
    assert.equal(order.paymentStatus, "paid");
    assert.equal(order.reviewStatus, "awaiting-review");
    assert.throws(
      () => applyReviewAction(order, "dispatch", "", "test123"),
      /Approve/,
    );
    const approved = applyReviewAction(order, "approve", "sample checked");
    assert.deepEqual(approved.originalSnapshot, order.originalSnapshot);
    assert.equal(approved.approvedRevisionId, order.currentRevisionId);
    await replaceOrder(order, approved);
    await assert.rejects(
      replaceOrder(order, applyReviewAction(order, "hold", "stale reviewer")),
      /changed during review/,
    );
    await assert.rejects(
      deleteDesign(design.id, saved.token),
      /attached to an order/,
    );
    process.env.STRIPE_SECRET_KEY = "sk_test_not_a_real_key";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const forged = await webhook(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: {
          "stripe-signature": "t=1,v1=fake",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          type: "checkout.session.completed",
          data: { object: session },
        }),
      }),
    );
    assert.equal(forged.status, 400);
    const missing = await webhook(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: "{}",
      }),
    );
    assert.equal(missing.status, 400);
    const signedBody = JSON.stringify({
      id: "evt_test_verified",
      type: "checkout.session.completed",
      livemode: false,
      data: { object: session },
    });
    const validSignature = new Stripe(
      process.env.STRIPE_SECRET_KEY,
    ).webhooks.generateTestHeaderString({
      payload: signedBody,
      secret: process.env.STRIPE_WEBHOOK_SECRET,
    });
    assert.equal(
      (
        await webhook(
          new Request("http://localhost/api/stripe/webhook", {
            method: "POST",
            headers: { "stripe-signature": validSignature },
            body: signedBody,
          }),
        )
      ).status,
      200,
    );
    let failedMail: { text: string; key: string } | undefined;
    const dispatchResult = await updateOrder(
      orderId,
      {
        action: "dispatch",
        note: "test fulfilment",
        tracking: "test-carrier",
        revision: approved.currentRevisionId,
      },
      async (_to, _subject, text, key) => {
        failedMail = { text, key };
        return false;
      },
    );
    assert.equal(dispatchResult.order.reviewStatus, "dispatched");
    assert.equal(dispatchResult.notification?.status, "pending");
    assert.match(dispatchResult.notification!.message, /order update is saved/);
    const retried = await updateOrder(
      orderId,
      {
        action: "retry-notification",
        notificationId: dispatchResult.notification!.id,
      },
      fakeMail,
    );
    assert.equal(
      retried.order.reviewStatus,
      "dispatched",
      "notification retry does not repeat fulfilment",
    );
    assert.equal(retried.notification?.status, "sent");
    assert.equal(mail.length, 2);
    assert.ok(mail[1].text.includes(privateLink));
    assert.equal(
      mail[1].key,
      failedMail?.key,
      "retries reuse the same provider idempotency key",
    );
    assert.equal(
      mail[1].text,
      failedMail?.text,
      "retries reconstruct the same private status link and message",
    );
    await updateOrder(
      orderId,
      {
        action: "retry-notification",
        notificationId: dispatchResult.notification!.id,
      },
      fakeMail,
    );
    assert.equal(
      mail.length,
      2,
      "a sent dispatch notification is never resent",
    );
    assert.equal(
      JSON.stringify(await getRecord<Order>("orders", orderId)).includes(
        orderToken,
      ),
      false,
    );
    const otherCheckout = { ...checkout, id: "legacy-shared-source-checkout" };
    await putRecord("checkouts", otherCheckout.id, otherCheckout, true);
    const erased = await eraseOrderArtwork(
      orderId,
      "Customer requested test artwork removal.",
    );
    assert.equal(erased.sharedSourcesRetained > 0, true);
    assert.ok(
      (await getAsset(design.source)).length > 0,
      "another order's shared source survives artwork erasure",
    );
    const retention = await runRetention();
    assert.equal(retention.checkoutsForManualReview, 0);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    assert.ok(
      path
        .resolve(directory)
        .startsWith(path.resolve(tmpdir()) + path.sep + "slow-reveal-test-"),
    );
    await rm(directory, { recursive: true, force: true });
  }
});
