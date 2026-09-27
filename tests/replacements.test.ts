import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { DEFAULT_SETTINGS, RENDERER_VERSION } from "../lib/renderers";
import { ApiError, digest, newToken } from "../lib/server/security";
import { getAsset, putAsset } from "../lib/server/assets";
import { getRecord, putRecord, replaceOrder } from "../lib/server/store";
import type { Checkout, Design, Order, Package } from "../lib/server/schema";
import {
  submitReplacement,
  approveCustomerProof,
  createReplacementUpload,
} from "../lib/server/replacements";
import {
  applyReviewAction,
  updateOrder,
  currentPackage,
} from "../lib/server/admin";
import {
  customerProofApproved,
  orderArtworkStatus,
  discardUncommittedPackage,
} from "../lib/server/orders";
import {
  newNotification,
  notificationMessage,
} from "../lib/server/notifications";
import { uploadedSource, type UploadTicket } from "../lib/server/uploads";
import { orderAccessToken } from "../lib/server/order-access";
import { runRetention } from "../lib/server/retention";
import {
  GET as getProof,
  POST as approveProofRoute,
} from "../app/api/orders/[id]/proof/route";
import { POST as replacementRoute } from "../app/api/orders/[id]/replacement/route";
import { GET as getAdminFile } from "../app/api/admin/orders/[id]/files/route";

const crop = { zoom: 1, x: 0, y: 0, rotation: 0 as const };
const conflict = (error: unknown) =>
  error instanceof ApiError && error.status === 409;
const notFound = (error: unknown) =>
  error instanceof ApiError && error.status === 404;
test("requested customer photos preserve paid snapshots, bind ownership, require fresh proof, and resist races", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "slow-reveal-replacements-"),
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
    "PHYSICAL_VALIDATION_APPROVED",
    "ADMIN_API_TOKEN",
  ];
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  for (const key of keys) delete process.env[key];
  process.env.STUDIO_DATA_DIR = directory;
  process.env.ALLOW_LOCAL_DEVELOPMENT_STORAGE = "true";
  process.env.ORDER_ACCESS_KEYS = JSON.stringify({
    qa: "isolated-order-replacement-access-secret-12345",
  });
  process.env.ORDER_ACCESS_KEY_ID = "qa";
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost";
  process.env.PHYSICAL_VALIDATION_APPROVED = "true";
  process.env.ADMIN_API_TOKEN = newToken();
  try {
    const original = await sharp({
      create: { width: 80, height: 100, channels: 3, background: "#cccccc" },
    })
      .png()
      .toBuffer();
    const alternate = await sharp({
      create: { width: 80, height: 100, channels: 3, background: "#333333" },
    })
      .png()
      .toBuffer();
    async function packageStub(design: Design, id: string): Promise<Package> {
      const revisionId = randomUUID();
      const prefix = `orders/${id}/${revisionId}`;
      const source = await putAsset(
        `${prefix}/original.png`,
        await getAsset(design.source),
        design.source.mime,
      );
      const templateSvg = await putAsset(
        `${prefix}/template.svg`,
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="30mm" height="40mm"/>',
        ),
        "image/svg+xml",
      );
      const finishedSvg = await putAsset(
        `${prefix}/finished.svg`,
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="30mm" height="40mm"><circle r="1"/></svg>',
        ),
        "image/svg+xml",
      );
      const archive = await putAsset(
        `${prefix}/artwork.zip`,
        Buffer.from("isolated test archive"),
        "application/zip",
      );
      return {
        source,
        templateSvg,
        finishedSvg,
        archive,
        snapshotHash: digest(`${source.sha256}:${revisionId}`),
        manifest: { revisionId, sourceWarnings: design.warnings },
      };
    }
    async function fixture(requested = true) {
      const id = randomUUID();
      const token = orderAccessToken(id, "qa");
      const source = await putAsset(
        `designs/${id}/original.png`,
        original,
        "image/png",
      );
      const design: Design = {
        id: randomUUID(),
        tokenHash: digest(newToken()),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400_000).toISOString(),
        mode: "dots",
        productId: "30x40",
        finishId: "rolled",
        inkId: "charcoal",
        settings: {
          ...DEFAULT_SETTINGS,
          widthMm: 30,
          heightMm: 40,
          spacingMm: 1,
          safeMarginMm: 1,
          minDiameterMm: 0.5,
          maxDiameterMm: 0.7,
          guideWidthMm: 0.5,
        },
        crop,
        source,
        rightsConfirmed: true,
        marketingConsent: false,
        warnings: ["Original advice"],
        rendererVersion: RENDERER_VERSION,
      };
      const production = await packageStub(design, id);
      const checkout: Checkout = {
        id,
        createdAt: new Date().toISOString(),
        tokenHash: digest(token),
        design: { ...design, source: production.source },
        package: production,
        amountPence: 4900,
        shippingId: "standard",
        sessionId: `cs_isolated_${id}`,
        accessKeyId: "qa",
      };
      let order: Order = {
        id,
        createdAt: checkout.createdAt,
        tokenHash: checkout.tokenHash,
        stripeSessionId: checkout.sessionId!,
        paymentStatus: "paid",
        amountPence: 4900,
        currency: "gbp",
        originalSnapshot: checkout,
        reviewStatus: "approved",
        revisions: [],
        currentRevisionId: String(production.manifest.revisionId),
        approvedRevisionId: String(production.manifest.revisionId),
        audit: [],
      };
      if (requested)
        order = applyReviewAction(
          order,
          "request-photo",
          "Please choose a sharper photograph.",
        );
      await putRecord("orders", id, order, true);
      const body = {
        requestId: order.photoRequest?.id ?? randomUUID(),
        expectedRevisionId: order.currentRevisionId,
        submissionId: randomUUID(),
        rightsConfirmed: true as const,
        crop,
        source: {
          dataUrl: `data:image/png;base64,${alternate.toString("base64")}`,
          name: "alternate.png",
        },
      };
      return { order, token, body };
    }
    const first = await fixture();
    const other = await fixture();
    let renderCalls = 0;
    const forbiddenRender = async () => {
      renderCalls++;
      throw new Error("Must reject before rendering");
    };
    await assert.rejects(
      submitReplacement(
        first.order.id,
        other.token,
        first.body,
        forbiddenRender,
      ),
      notFound,
    );
    await assert.rejects(
      submitReplacement(
        other.order.id,
        other.token,
        first.body,
        forbiddenRender,
      ),
      conflict,
    );
    await assert.rejects(
      submitReplacement(
        first.order.id,
        first.token,
        { ...first.body, rightsConfirmed: false },
        forbiddenRender,
      ),
    );
    await assert.rejects(
      submitReplacement(
        first.order.id,
        first.token,
        {
          ...first.body,
          source: { key: first.order.originalSnapshot.package.source.key },
        },
        forbiddenRender,
      ),
    );
    await assert.rejects(
      submitReplacement(
        first.order.id,
        first.token,
        { ...first.body, settings: DEFAULT_SETTINGS },
        forbiddenRender,
      ),
    );
    const unrequested = await fixture(false);
    await assert.rejects(
      submitReplacement(
        unrequested.order.id,
        unrequested.token,
        unrequested.body,
        forbiddenRender,
      ),
      conflict,
    );
    await assert.rejects(
      createReplacementUpload(first.order.id, other.token, {
        requestId: first.body.requestId,
        expectedRevisionId: first.body.expectedRevisionId,
        mime: "image/png",
        bytes: alternate.length,
      }),
      notFound,
    );
    assert.equal(renderCalls, 0);
    const deniedRoute = await replacementRoute(
      new Request(`http://localhost/api/orders/${first.order.id}/replacement`, {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          Authorization: `Bearer ${other.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(first.body),
      }),
      { params: Promise.resolve({ id: first.order.id }) },
    );
    assert.equal(deniedRoute.status, 404);
    // Ticket scope is checked before private storage is read, even with a valid ticket capability.
    const uploadToken = newToken();
    const ticket: UploadTicket = {
      id: randomUUID(),
      tokenHash: digest(uploadToken),
      key: "staging/isolated/original",
      mime: "image/png",
      bytes: alternate.length,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      scope: { orderId: first.order.id, requestId: first.body.requestId },
    };
    await putRecord("uploads", ticket.id, ticket, true);
    let reads = 0;
    const read = async () => {
      reads++;
      return alternate;
    };
    await assert.rejects(
      uploadedSource(
        ticket.id,
        uploadToken,
        { orderId: other.order.id, requestId: first.body.requestId },
        read,
      ),
      notFound,
    );
    await assert.rejects(
      uploadedSource(ticket.id, uploadToken, undefined, read),
      notFound,
    );
    await assert.rejects(
      uploadedSource(ticket.id, newToken(), ticket.scope, read),
      notFound,
    );
    assert.equal(reads, 0);
    assert.deepEqual(
      (await uploadedSource(ticket.id, uploadToken, ticket.scope, read)).bytes,
      alternate,
    );
    assert.equal(reads, 1);
    // One full production export verifies that replacement geometry uses the new source.
    const saved = await submitReplacement(
      first.order.id,
      first.token,
      first.body,
    );
    assert.equal(saved.state, "saved");
    let updated = (await getRecord<Order>("orders", first.order.id))!;
    assert.deepEqual(updated.originalSnapshot, first.order.originalSnapshot);
    assert.equal(updated.revisions.length, 1);
    assert.equal(updated.reviewStatus, "awaiting-review");
    assert.equal(updated.approvedRevisionId, undefined);
    assert.equal(updated.replacementIntake, undefined);
    assert.equal(updated.revisions[0].customerProofRequired, true);
    assert.equal(updated.revisions[0].package.source.sha256, digest(alternate));
    assert.notEqual(
      updated.revisions[0].package.source.key,
      updated.originalSnapshot.package.source.key,
    );
    assert.deepEqual(
      await getAsset(updated.originalSnapshot.package.source),
      original,
    );
    assert.deepEqual(await getAsset(currentPackage(updated).source), alternate);
    await discardUncommittedPackage(updated.id, currentPackage(updated));
    assert.deepEqual(
      await getAsset(currentPackage(updated).source),
      alternate,
      "An ambiguous commit must preserve a referenced package",
    );
    assert.equal(updated.revisions[0].package.manifest.guideWidthMm, 0.25);
    assert.equal(
      updated.revisions[0].package.manifest.requestedGuideWidthMm,
      0.5,
    );
    assert.deepEqual(updated.revisions[0].package.manifest.sourceWarnings, [
      "The source is small. Review fine details before printing.",
    ]);
    assert.equal(JSON.stringify(updated).includes(first.token), false);
    assert.equal(
      JSON.stringify(updated).includes(first.body.source.dataUrl),
      false,
    );
    assert.equal(customerProofApproved(updated), false);
    assert.throws(
      () => applyReviewAction(updated, "approve", ""),
      /customer must approve/,
    );
    assert.throws(
      () =>
        applyReviewAction(
          {
            ...updated,
            reviewStatus: "approved",
            approvedRevisionId: updated.currentRevisionId,
          },
          "dispatch",
          "",
          "Carrier 123",
        ),
      /customer must approve/,
    );
    const retry = await submitReplacement(
      first.order.id,
      first.token,
      first.body,
      forbiddenRender,
    );
    assert.equal(retry.state, "saved");
    assert.equal(
      (await getRecord<Order>("orders", first.order.id))!.revisions.length,
      1,
    );
    await assert.rejects(
      submitReplacement(
        first.order.id,
        first.token,
        { ...first.body, crop: { ...crop, zoom: 2 } },
        forbiddenRender,
      ),
      conflict,
    );
    assert.equal(renderCalls, 0);
    const proofBody = {
      revisionId: updated.currentRevisionId,
      proofHash: currentPackage(updated).snapshotHash,
      proofApproved: true,
    };
    await assert.rejects(
      approveCustomerProof(first.order.id, other.token, proofBody),
      notFound,
    );
    await assert.rejects(
      approveCustomerProof(first.order.id, first.token, {
        ...proofBody,
        proofHash: "0".repeat(64),
      }),
      conflict,
    );
    await assert.rejects(
      approveCustomerProof(first.order.id, first.token, {
        ...proofBody,
        proofApproved: false,
      }),
    );
    for (const view of ["finished", "template"]) {
      const response = await getProof(
        new Request(
          `http://localhost/api/orders/${first.order.id}/proof?revision=${updated.currentRevisionId}&view=${view}`,
          { headers: { Authorization: `Bearer ${first.token}` } },
        ),
        { params: Promise.resolve({ id: first.order.id }) },
      );
      assert.equal(response.status, 200);
      assert.equal(
        response.headers.get("X-Studio-Proof-Hash"),
        proofBody.proofHash,
      );
      assert.match(response.headers.get("Cache-Control")!, /no-store/);
      assert.match(await response.text(), /<svg/);
    }
    const proofResponse = await approveProofRoute(
      new Request(`http://localhost/api/orders/${first.order.id}/proof`, {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          Authorization: `Bearer ${first.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(proofBody),
      }),
      { params: Promise.resolve({ id: first.order.id }) },
    );
    assert.equal(proofResponse.status, 200);
    await approveCustomerProof(first.order.id, first.token, proofBody);
    updated = (await getRecord<Order>("orders", first.order.id))!;
    assert.equal(updated.customerProofApprovals!.length, 1);
    assert.equal(updated.reviewStatus, "awaiting-review");
    assert.equal(customerProofApproved(updated), true);
    assert.equal(
      applyReviewAction(updated, "approve", "Reviewed").reviewStatus,
      "approved",
    );
    await assert.rejects(
      putRecord("orders", updated.id, {
        ...updated,
        customerProofApprovals: [],
      }),
      /append only/,
    );
    await assert.rejects(
      putRecord("orders", updated.id, {
        ...updated,
        revisions: [{ ...updated.revisions[0], crop: { ...crop, zoom: 2 } }],
      }),
      /append only/,
    );
    // Admin adjustment follows the latest source, preserves source advice, and requires a fresh proof approval.
    const regenerated = await updateOrder(updated.id, {
      action: "regenerate",
      note: "Check crop with alternate photo",
      revision: updated.currentRevisionId,
      crop: { ...crop, zoom: 1.1 },
    });
    updated = regenerated.order;
    assert.equal(currentPackage(updated).source.sha256, digest(alternate));
    assert.equal(updated.revisions[1].customerProofRequired, true);
    assert.equal(customerProofApproved(updated), false);
    assert.equal(updated.customerProofApprovals!.length, 1);
    assert.deepEqual(
      currentPackage(updated).manifest.sourceWarnings,
      updated.revisions[0].package.manifest.sourceWarnings,
    );
    await assert.rejects(
      approveCustomerProof(updated.id, first.token, proofBody),
      conflict,
    );
    const adminSource = await getAdminFile(
      new Request(
        `http://localhost/api/admin/orders/${updated.id}/files?file=source`,
        { headers: { Authorization: `Bearer ${process.env.ADMIN_API_TOKEN}` } },
      ),
      { params: Promise.resolve({ id: updated.id }) },
    );
    assert.deepEqual(Buffer.from(await adminSource.arrayBuffer()), alternate);
    const note = newNotification("request-photo", "Sharper photo please");
    const mail = notificationMessage(updated, note);
    assert.match(mail.text, /upload it securely/);
    assert.match(mail.text, new RegExp(`/order/${updated.id}#token=`));
    assert.equal(JSON.stringify(note).includes(first.token), false);

    const adminRace = await fixture();
    let adminStarted!: () => void, adminRelease!: () => void;
    const adminBegan = new Promise<void>((resolve) => {
      adminStarted = resolve;
    });
    const adminProceed = new Promise<void>((resolve) => {
      adminRelease = resolve;
    });
    let abandonedAdminPackage: Package | undefined;
    const adminPending = updateOrder(
      adminRace.order.id,
      { action: "regenerate", revision: adminRace.order.currentRevisionId },
      undefined,
      async (design, id) => {
        adminStarted();
        await adminProceed;
        abandonedAdminPackage = await packageStub(design, id);
        return abandonedAdminPackage;
      },
    );
    const adminRejected = assert.rejects(adminPending, conflict);
    await adminBegan;
    const adminCurrent = (await getRecord<Order>(
      "orders",
      adminRace.order.id,
    ))!;
    await replaceOrder(
      adminCurrent,
      applyReviewAction(
        adminCurrent,
        "hold",
        "Concurrent reviewer put this order on hold.",
      ),
    );
    adminRelease();
    await adminRejected;
    assert.equal(
      (await getRecord<Order>("orders", adminRace.order.id))!.reviewStatus,
      "hold",
    );
    await assert.rejects(getAsset(abandonedAdminPackage!.archive));
    await assert.rejects(getAsset(abandonedAdminPackage!.source));
    assert.deepEqual(
      await getAsset(adminRace.order.originalSnapshot.package.source),
      original,
    );

    // Concurrent retry returns processing, a competing upload is refused, and a review race cannot commit stale artwork.
    const racing = await fixture();
    let started!: () => void, release!: () => void;
    const began = new Promise<void>((resolve) => {
      started = resolve;
    });
    const proceed = new Promise<void>((resolve) => {
      release = resolve;
    });
    let rejectedPackage: Package | undefined;
    const paused = async (design: Design, id: string) => {
      started();
      await proceed;
      rejectedPackage = await packageStub(design, id);
      return rejectedPackage;
    };
    const pending = submitReplacement(
      racing.order.id,
      racing.token,
      racing.body,
      paused,
    );
    const rejected = assert.rejects(pending, conflict);
    await began;
    const processing = await submitReplacement(
      racing.order.id,
      racing.token,
      racing.body,
      forbiddenRender,
    );
    assert.equal(processing.state, "processing");
    await assert.rejects(
      submitReplacement(
        racing.order.id,
        racing.token,
        { ...racing.body, submissionId: randomUUID() },
        forbiddenRender,
      ),
      conflict,
    );
    const claimed = (await getRecord<Order>("orders", racing.order.id))!;
    await replaceOrder(
      claimed,
      applyReviewAction(
        claimed,
        "request-photo",
        "A newer request supersedes the pending upload.",
      ),
    );
    release();
    await rejected;
    const afterRace = (await getRecord<Order>("orders", racing.order.id))!;
    assert.equal(afterRace.revisions.length, 0);
    assert.deepEqual(afterRace.originalSnapshot, racing.order.originalSnapshot);
    assert.equal(afterRace.replacementIntake, undefined);
    await assert.rejects(getAsset(rejectedPackage!.source));
    await assert.rejects(getAsset(claimed.replacementIntake!.source));
    assert.deepEqual(
      await getAsset(racing.order.originalSnapshot.package.source),
      original,
    );
    // Failed validation releases its lease; terminal orders reject new uploads before rendering.
    const badPhoto = await fixture();
    await assert.rejects(
      submitReplacement(
        badPhoto.order.id,
        badPhoto.token,
        {
          ...badPhoto.body,
          source: { dataUrl: "data:image/png;base64,bm90LWFuLWltYWdl" },
        },
        forbiddenRender,
      ),
    );
    assert.equal(
      (await getRecord<Order>("orders", badPhoto.order.id))!.replacementIntake,
      undefined,
    );
    for (const terminal of ["dispatched", "erased", "unpaid"] as const) {
      const fixtureOrder = await fixture();
      const record =
        terminal === "dispatched"
          ? { ...fixtureOrder.order, reviewStatus: "dispatched" as const }
          : terminal === "erased"
            ? { ...fixtureOrder.order, dataDeletedAt: new Date().toISOString() }
            : {
                ...fixtureOrder.order,
                paymentStatus: "pending" as unknown as "paid",
              };
      if (terminal === "unpaid") {
        // A browser cannot create this state; seed another ID to exercise the defensive paid check.
        const id = randomUUID();
        await putRecord("orders", id, { ...record, id }, true);
        await assert.rejects(
          submitReplacement(
            id,
            fixtureOrder.token,
            fixtureOrder.body,
            forbiddenRender,
          ),
          conflict,
        );
      } else {
        await replaceOrder(fixtureOrder.order, record);
        await assert.rejects(
          submitReplacement(
            record.id,
            fixtureOrder.token,
            fixtureOrder.body,
            forbiddenRender,
          ),
          (error) =>
            error instanceof ApiError && [409, 410].includes(error.status),
        );
      }
    }
    assert.equal(renderCalls, 0);
    // Scheduled cleanup invalidates abandoned leases before deleting their private staging data.
    const stale = await fixture();
    const staging = await putAsset(
      `staging/order-replacements/${stale.order.id}/interrupted/original`,
      alternate,
      "image/png",
    );
    await replaceOrder(stale.order, {
      ...stale.order,
      replacementIntake: {
        submissionId: randomUUID(),
        requestId: stale.body.requestId,
        baseRevisionId: stale.body.expectedRevisionId,
        inputHash: digest("isolated"),
        leaseId: randomUUID(),
        startedAt: new Date(Date.now() - 2 * 86400_000).toISOString(),
        source: staging,
      },
    });
    const cleanup = await runRetention();
    assert.equal(cleanup.interruptedReplacementsDeleted, 1);
    await assert.rejects(getAsset(staging));
    assert.equal(
      orderArtworkStatus((await getRecord<Order>("orders", stale.order.id))!)
        .replacement.processing,
      false,
    );
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
