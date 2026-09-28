import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { DEFAULT_SETTINGS, RENDERER_VERSION } from "../lib/renderers";
import type {
  Checkout,
  Design,
  Order,
  Package,
  Revision,
} from "../lib/server/schema";
import { getRecord, putRecord, replaceOrder } from "../lib/server/store";
import { digest } from "../lib/server/security";
import { updateOrder } from "../lib/server/admin";
import {
  deliverNotification,
  notificationMessage,
  queueRevisedProof,
  revisedProofNotification,
  type NotificationTransport,
} from "../lib/server/notifications";
import { orderAccessToken, orderStatusLink } from "../lib/server/order-access";
import { GET as orderStatus } from "../app/api/orders/[id]/route";

test("regenerated customer proofs enqueue one durable private notification and retry without changing artwork", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "slow-reveal-proof-notices-"),
  );
  const keys = [
    "STUDIO_DATA_DIR",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "R2_ACCOUNT_ID",
    "ALLOW_LOCAL_DEVELOPMENT_STORAGE",
    "ORDER_ACCESS_KEYS",
    "ORDER_ACCESS_KEY_ID",
    "NEXT_PUBLIC_SITE_URL",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
  ];
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  for (const key of keys) delete process.env[key];
  process.env.STUDIO_DATA_DIR = directory;
  process.env.ALLOW_LOCAL_DEVELOPMENT_STORAGE = "true";
  process.env.ORDER_ACCESS_KEYS = JSON.stringify({
    qa: "isolated-revised-proof-test-access-secret-12345",
  });
  process.env.ORDER_ACCESS_KEY_ID = "qa";
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost";
  try {
    // This fixture tests metadata/outbox transactions; actual artwork exports are covered separately.
    function production(id: string, revisionId = randomUUID()): Package {
      const asset = (file: string, mime: string) => ({
        key: `orders/${id}/${revisionId}/${file}`,
        mime,
        bytes: 32,
        sha256: digest(file),
      });
      return {
        source: asset("original.png", "image/png"),
        archive: asset("artwork.zip", "application/zip"),
        templateSvg: asset("template.svg", "image/svg+xml"),
        finishedSvg: asset("finished.svg", "image/svg+xml"),
        manifest: { revisionId, sourceWarnings: [] },
        snapshotHash: digest(`${id}:${revisionId}`),
      };
    }
    async function fixture(required = true, email = true) {
      const id = randomUUID();
      const originalPackage = production(id);
      const token = orderAccessToken(id);
      const now = new Date().toISOString();
      const design: Design = {
        id: randomUUID(),
        tokenHash: digest("private-design-capability"),
        createdAt: now,
        expiresAt: new Date(Date.now() + 86400_000).toISOString(),
        mode: "dots",
        productId: "30x40",
        finishId: "rolled",
        inkId: "charcoal",
        crop: { x: 0, y: 0, zoom: 1, rotation: 0 },
        settings: {
          ...DEFAULT_SETTINGS,
          text: { value: "PERSONAL_TEXT_MUST_NOT_BE_EMAILED" },
        },
        source: originalPackage.source,
        rightsConfirmed: true,
        marketingConsent: false,
        warnings: [],
        rendererVersion: RENDERER_VERSION,
      };
      const checkout: Checkout = {
        id,
        createdAt: now,
        tokenHash: digest(token),
        design,
        package: originalPackage,
        amountPence: 4900,
        shippingId: "standard",
        accessKeyId: "qa",
        sessionId: `cs_fixture_${id}`,
      };
      const base: Revision = {
        id: String(originalPackage.manifest.revisionId),
        createdAt: now,
        package: originalPackage,
        settings: design.settings,
        crop: design.crop,
        note: "Fixture customer replacement",
        customerProofRequired: required,
      };
      const order: Order = {
        id,
        createdAt: now,
        tokenHash: checkout.tokenHash,
        stripeSessionId: checkout.sessionId!,
        paymentStatus: "paid",
        amountPence: 4900,
        currency: "gbp",
        originalSnapshot: checkout,
        reviewStatus: "awaiting-review",
        revisions: [base],
        currentRevisionId: base.id,
        audit: [],
        ...(email ? { customerEmail: "proof-fixture@example.test" } : {}),
      };
      await putRecord("orders", id, order, true);
      return { order, token };
    }
    const first = await fixture();
    const originalSnapshot = structuredClone(first.order.originalSnapshot);
    let renders = 0;
    const produce = async (_design: Design, id: string) => {
      renders++;
      return production(id);
    };
    const sent: {
      to: string | undefined;
      subject: string;
      text: string;
      key: string;
    }[] = [];
    let providerAccepts = false;
    const transport: NotificationTransport = async (to, subject, text, key) => {
      sent.push({ to, subject, text, key });
      return providerAccepts;
    };
    const generated = await updateOrder(
      first.order.id,
      {
        action: "regenerate",
        revision: first.order.currentRevisionId,
        note: "INTERNAL_STAFF_NOTE_NOT_FOR_EMAIL",
      },
      transport,
      produce,
    );
    assert.equal(renders, 1);
    assert.equal(generated.order.revisions.length, 2);
    assert.deepEqual(generated.order.originalSnapshot, originalSnapshot);
    assert.equal(generated.order.reviewStatus, "awaiting-review");
    assert.equal(generated.order.approvedRevisionId, undefined);
    assert.equal(generated.notification?.type, "revised-proof");
    assert.equal(generated.notification?.status, "pending");
    assert.match(generated.notification!.message, /order update is saved/);
    const notification = generated.order.notifications![0];
    assert.equal(notification.revisionId, generated.order.currentRevisionId);
    assert.equal(notification.attempts, 1);
    assert.equal(z.string().uuid().safeParse(notification.id).success, true);
    assert.equal(
      notification.id,
      revisedProofNotification(
        first.order.id,
        generated.order.currentRevisionId,
      ).id,
    );
    assert.notEqual(
      notification.id,
      revisedProofNotification(randomUUID(), generated.order.currentRevisionId)
        .id,
    );
    assert.notEqual(
      notification.id,
      revisedProofNotification(first.order.id, randomUUID()).id,
    );
    assert.equal(
      queueRevisedProof(generated.order).order.notifications!.length,
      1,
    );
    assert.equal(
      queueRevisedProof(generated.order).notification!.id,
      notification.id,
    );
    const privateLink = orderStatusLink(first.order.originalSnapshot);
    assert.equal(sent.length, 1);
    assert.match(sent[0].subject, /revised.*proof/i);
    assert.ok(sent[0].text.includes(privateLink));
    assert.match(
      sent[0].text,
      /both the finished artwork and printed guide template/,
    );
    assert.match(sent[0].text, /always shows the current proof/);
    for (const forbidden of [
      "INTERNAL_STAFF_NOTE_NOT_FOR_EMAIL",
      "PERSONAL_TEXT_MUST_NOT_BE_EMAILED",
      first.order.originalSnapshot.package.source.key,
      first.order.originalSnapshot.package.source.sha256,
    ])
      assert.equal(sent[0].text.includes(forbidden), false);
    assert.equal(JSON.stringify(notification).includes(first.token), false);
    assert.equal(JSON.stringify(notification).includes(privateLink), false);
    const access = await orderStatus(
      new Request(`http://localhost/api/orders/${first.order.id}`, {
        headers: {
          Authorization: `Bearer ${new URL(privateLink).hash.slice("#token=".length)}`,
        },
      }),
      { params: Promise.resolve({ id: first.order.id }) },
    );
    assert.equal(access.status, 200);
    assert.equal((await access.json()).proof.requiresApproval, true);
    providerAccepts = true;
    const retry = await updateOrder(
      first.order.id,
      { action: "retry-notification", notificationId: notification.id },
      transport,
      produce,
    );
    assert.equal(retry.notification?.status, "sent");
    assert.equal(retry.order.revisions.length, 2);
    assert.equal(renders, 1, "Delivery retry must not regenerate artwork");
    assert.equal(
      retry.order.currentRevisionId,
      generated.order.currentRevisionId,
    );
    assert.deepEqual(
      sent[1],
      sent[0],
      "Retry reuses exact private message and provider key",
    );
    await updateOrder(
      first.order.id,
      { action: "retry-notification", notificationId: notification.id },
      transport,
      produce,
    );
    assert.equal(
      sent.length,
      2,
      "Sent marker is a permanent no-op even after provider dedupe expires",
    );
    assert.deepEqual(retry.order.originalSnapshot, originalSnapshot);
    await assert.rejects(
      updateOrder(
        first.order.id,
        { action: "regenerate", revision: first.order.currentRevisionId },
        transport,
        produce,
      ),
      /artwork has changed/,
    );
    assert.equal(renders, 1);

    // A normal original-order regeneration with no required customer proof must not send this mail.
    const ordinary = await fixture(false);
    const ordinaryResult = await updateOrder(
      ordinary.order.id,
      { action: "regenerate", revision: ordinary.order.currentRevisionId },
      transport,
      produce,
    );
    assert.equal(ordinaryResult.notification, undefined);
    assert.equal(ordinaryResult.order.notifications, undefined);
    assert.equal(sent.length, 2);

    // A newer proof atomically supersedes the older unsent request, while retaining both immutable revisions.
    const superseded = await fixture();
    const noSend: NotificationTransport = async () => false;
    const older = await updateOrder(
      superseded.order.id,
      { action: "regenerate", revision: superseded.order.currentRevisionId },
      noSend,
      produce,
    );
    const newer = await updateOrder(
      superseded.order.id,
      { action: "regenerate", revision: older.order.currentRevisionId },
      noSend,
      produce,
    );
    assert.equal(newer.order.notifications![0].status, "superseded");
    assert.equal(newer.order.notifications![1].status, "pending");
    assert.equal(newer.order.revisions.length, 3);
    let unexpectedCalls = 0;
    const mustNotSend: NotificationTransport = async () => {
      unexpectedCalls++;
      return true;
    };
    const staleRetry = await updateOrder(
      superseded.order.id,
      { action: "retry-notification", notificationId: older.notification!.id },
      mustNotSend,
      produce,
    );
    assert.equal(staleRetry.notification?.status, "superseded");
    assert.equal(unexpectedCalls, 0);
    // Approval, a new-photo request, closed states or unknown terminal states make pending reminders obsolete.
    for (const terminal of [
      "approved-proof",
      "dispatched",
      "alternate-photo-requested",
      "archived",
      "cancelled",
    ] as const) {
      const target = await fixture();
      const pending = await updateOrder(
        target.order.id,
        { action: "regenerate", revision: target.order.currentRevisionId },
        noSend,
        produce,
      );
      const revision = pending.order.revisions.at(-1)!;
      const closed: Order =
        terminal === "approved-proof"
          ? {
              ...pending.order,
              customerProofApprovals: [
                {
                  revisionId: revision.id,
                  snapshotHash: revision.package.snapshotHash,
                  approvedAt: new Date().toISOString(),
                },
              ],
            }
          : {
              ...pending.order,
              reviewStatus: terminal as Order["reviewStatus"],
            };
      await replaceOrder(pending.order, closed);
      const result = await deliverNotification(
        target.order.id,
        pending.notification!.id,
        mustNotSend,
      );
      assert.equal(result.status, "superseded");
      assert.equal(unexpectedCalls, 0);
    }
    const erased = await fixture();
    const erasedPending = await updateOrder(
      erased.order.id,
      { action: "regenerate", revision: erased.order.currentRevisionId },
      noSend,
      produce,
    );
    await replaceOrder(erasedPending.order, {
      ...erasedPending.order,
      dataDeletedAt: new Date().toISOString(),
    });
    await assert.rejects(
      deliverNotification(
        erased.order.id,
        erasedPending.notification!.id,
        mustNotSend,
      ),
      /erasure has closed/,
    );
    assert.equal(unexpectedCalls, 0);

    // Missing delivery prerequisites preserve the saved revision and recoverable outbox without claiming email success.
    const missingEmail = await fixture(true, false);
    const missing = await updateOrder(
      missingEmail.order.id,
      { action: "regenerate", revision: missingEmail.order.currentRevisionId },
      mustNotSend,
      produce,
    );
    assert.equal(missing.notification?.status, "pending");
    assert.match(missing.notification!.message, /no customer email/);
    assert.equal(missing.order.revisions.length, 2);
    assert.equal(unexpectedCalls, 0);
    const missingKey = await fixture();
    delete process.env.ORDER_ACCESS_KEYS;
    const cannotLink = await updateOrder(
      missingKey.order.id,
      { action: "regenerate", revision: missingKey.order.currentRevisionId },
      mustNotSend,
      produce,
    );
    assert.equal(cannotLink.notification?.status, "pending");
    assert.match(
      cannotLink.notification!.message,
      /Restore its private access key/,
    );
    assert.equal(cannotLink.order.revisions.length, 2);
    assert.equal(unexpectedCalls, 0);
    process.env.ORDER_ACCESS_KEYS = JSON.stringify({
      qa: "isolated-revised-proof-test-access-secret-12345",
    });
    const recovered = await updateOrder(
      missingKey.order.id,
      {
        action: "retry-notification",
        notificationId: cannotLink.notification!.id,
      },
      transport,
      produce,
    );
    assert.equal(recovered.notification?.status, "sent");
    assert.equal(recovered.order.revisions.length, 2);

    // A fresh sending lease prevents concurrent retries from creating a second provider call.
    const parallel = await fixture();
    let signal!: () => void, release!: () => void;
    const began = new Promise<void>((resolve) => {
      signal = resolve;
    });
    const resume = new Promise<void>((resolve) => {
      release = resolve;
    });
    let parallelCalls = 0;
    const inFlight = updateOrder(
      parallel.order.id,
      { action: "regenerate", revision: parallel.order.currentRevisionId },
      async () => {
        parallelCalls++;
        signal();
        await resume;
        return true;
      },
      produce,
    );
    await began;
    const claimed = (await getRecord<Order>("orders", parallel.order.id))!;
    assert.equal(
      claimed.revisions.length,
      2,
      "Outbox and revision commit before transport begins",
    );
    assert.equal(claimed.notifications![0].status, "sending");
    const inFlightRetry = await updateOrder(
      parallel.order.id,
      {
        action: "retry-notification",
        notificationId: claimed.notifications![0].id,
      },
      mustNotSend,
      produce,
    );
    assert.equal(inFlightRetry.notification?.status, "sending");
    assert.equal(unexpectedCalls, 0);
    release();
    assert.equal((await inFlight).notification?.status, "sent");
    assert.equal(parallelCalls, 1);
    assert.equal(
      JSON.stringify(claimed.notifications).includes(parallel.token),
      false,
    );
    assert.equal(
      notificationMessage(claimed, claimed.notifications![0]).idempotencyKey,
      `notification-${claimed.notifications![0].id}`,
    );

    // A render that loses its order CAS never commits an outbox entry or sends its proof.
    const racing = await fixture();
    const refused = updateOrder(
      racing.order.id,
      { action: "regenerate", revision: racing.order.currentRevisionId },
      mustNotSend,
      async (_design, id) => {
        const current = (await getRecord<Order>("orders", id))!;
        await replaceOrder(current, { ...current, reviewStatus: "hold" });
        return production(id);
      },
    );
    await assert.rejects(refused, /order changed during review/);
    const afterConflict = (await getRecord<Order>("orders", racing.order.id))!;
    assert.equal(afterConflict.revisions.length, 1);
    assert.equal(afterConflict.notifications, undefined);
    assert.equal(unexpectedCalls, 0);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(resolved, { recursive: true, force: true });
  }
});
