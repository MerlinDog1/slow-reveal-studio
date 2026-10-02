import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { DEFAULT_SETTINGS, RENDERER_VERSION } from "../lib/renderers";
import { ApiError, digest } from "../lib/server/security";
import { getAsset, putAsset } from "../lib/server/assets";
import { getRecord, putRecord, replaceOrder } from "../lib/server/store";
import { submitReplacement } from "../lib/server/replacements";
import { validatePhoto } from "../lib/server/source-validation";
import type { Design, Order, Package } from "../lib/server/schema";

const conflict = (error: unknown) =>
  error instanceof ApiError && error.status === 409;
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function observe<T>(promise: Promise<T>) {
  return promise.then(
    (value) => ({ status: "fulfilled" as const, value }),
    (reason) => ({ status: "rejected" as const, reason }),
  );
}
async function isolated(work: () => Promise<void>) {
  const directory = await mkdtemp(
    path.join(tmpdir(), "srs-replacement-claims-"),
  );
  const env = {
    STUDIO_DATA_DIR: directory,
    NODE_ENV: "development",
    ALLOW_LOCAL_DEVELOPMENT_STORAGE: "true",
    SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    R2_ACCOUNT_ID: "",
    R2_ACCESS_KEY_ID: "",
    R2_SECRET_ACCESS_KEY: "",
    R2_BUCKET: "",
    RESEND_API_KEY: "",
    STRIPE_SECRET_KEY: "",
    LIVE_CHECKOUT_ENABLED: "false",
    PHYSICAL_VALIDATION_APPROVED: "false",
  };
  const previous = Object.fromEntries(
    Object.keys(env).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, env);
  try {
    await work();
  } finally {
    for (const [key, value] of Object.entries(previous))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    await rm(directory, { recursive: true, force: true });
  }
}
async function fixture() {
  const id = randomUUID(),
    token = "synthetic-replacement-claim-capability-32chars";
  const bytes = await sharp({
    create: { width: 64, height: 80, channels: 3, background: "#556677" },
  })
    .png()
    .toBuffer();
  const source = await putAsset(`designs/${id}/source.png`, bytes, "image/png");
  const crop = { zoom: 1, x: 0, y: 0, rotation: 0 as const };
  const design: Design = {
    id,
    tokenHash: digest(token),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    mode: "dots",
    productId: "30x40",
    finishId: "rolled",
    inkId: "black",
    settings: DEFAULT_SETTINGS,
    crop,
    source,
    rightsConfirmed: true,
    marketingConsent: false,
    warnings: [],
    rendererVersion: RENDERER_VERSION,
  };
  const order: Order = {
    id,
    tokenHash: digest(token),
    createdAt: design.createdAt,
    stripeSessionId: "cs_fixture",
    paymentStatus: "paid",
    amountPence: 4900,
    currency: "gbp",
    reviewStatus: "alternate-photo-requested",
    revisions: [],
    currentRevisionId: "original",
    audit: [],
    photoRequest: {
      id: randomUUID(),
      revisionId: "original",
      requestedAt: design.createdAt,
      note: "Supply another photograph.",
    },
    originalSnapshot: {
      id,
      tokenHash: digest(token),
      createdAt: design.createdAt,
      design,
      amountPence: 4900,
      shippingId: "standard",
      package: {
        source,
        archive: source,
        finishedSvg: source,
        templateSvg: source,
        snapshotHash: "0".repeat(64),
        manifest: { revisionId: "original" },
      },
    },
  };
  await putRecord("orders", id, order, true);
  const body = {
    requestId: order.photoRequest!.id,
    expectedRevisionId: "original",
    submissionId: randomUUID(),
    rightsConfirmed: true as const,
    crop,
    source: { dataUrl: `data:image/png;base64,${bytes.toString("base64")}` },
  };
  return { order, token, body };
}
async function produce(design: Design, id: string): Promise<Package> {
  const revisionId = randomUUID(),
    base = `orders/${id}/${revisionId}`;
  return {
    source: await putAsset(
      `${base}/source.png`,
      await getAsset(design.source),
      "image/png",
    ),
    archive: await putAsset(
      `${base}/archive.zip`,
      Buffer.from("fixture"),
      "application/zip",
    ),
    finishedSvg: await putAsset(
      `${base}/finished.svg`,
      Buffer.from("<svg/>"),
      "image/svg+xml",
    ),
    templateSvg: await putAsset(
      `${base}/template.svg`,
      Buffer.from("<svg/>"),
      "image/svg+xml",
    ),
    snapshotHash: digest(
      JSON.stringify({ settings: design.settings, crop: design.crop }),
    ),
    manifest: { revisionId },
  };
}

test("two simultaneous identical submissions reconcile a lost claim as processing and render only once", async () =>
  isolated(async () => {
    const { order, token, body } = await fixture();
    const bothValidated = deferred(),
      allowProduction = deferred();
    let validations = 0,
      productions = 0;
    const validate = async (bytes: Buffer) => {
      const warnings = await validatePhoto(bytes);
      if (++validations === 2) bothValidated.resolve();
      await bothValidated.promise;
      return warnings;
    };
    const producer = async (design: Design, id: string) => {
      productions++;
      await allowProduction.promise;
      return produce(design, id);
    };
    const first = observe(
      submitReplacement(order.id, token, body, producer, validate),
    );
    const second = observe(
      submitReplacement(order.id, token, body, producer, validate),
    );
    try {
      const early = await Promise.race([first, second]);
      assert.equal(early.status, "fulfilled");
      if (early.status === "fulfilled")
        assert.equal(early.value.state, "processing");
    } finally {
      allowProduction.resolve();
    }
    const results = await Promise.all([first, second]);
    assert.deepEqual(
      results
        .map((result) =>
          result.status === "fulfilled" ? result.value.state : "rejected",
        )
        .sort(),
      ["processing", "saved"],
    );
    assert.equal(
      validations,
      2,
      "both callers must read the old order before the synchronized claim attempt",
    );
    assert.equal(productions, 1);
    const saved = (await getRecord<Order>("orders", order.id))!;
    assert.equal(saved.revisions.length, 1);
    assert.equal(saved.replacementIntake, undefined);
    assert.deepEqual(saved.originalSnapshot, order.originalSnapshot);
  }));

test("a duplicate finishing validation after the winning request commits returns its saved revision", async () =>
  isolated(async () => {
    const { order, token, body } = await fixture();
    const secondEntered = deferred(),
      firstDone = deferred();
    let productions = 0;
    const producer = async (design: Design, id: string) => {
      productions++;
      return produce(design, id);
    };
    const first = submitReplacement(
      order.id,
      token,
      body,
      producer,
      async (bytes) => {
        const warnings = await validatePhoto(bytes);
        await secondEntered.promise;
        return warnings;
      },
    );
    const second = submitReplacement(
      order.id,
      token,
      body,
      producer,
      async (bytes) => {
        const warnings = await validatePhoto(bytes);
        secondEntered.resolve();
        await firstDone.promise;
        return warnings;
      },
    );
    const saved = await first;
    firstDone.resolve();
    const repeated = await second;
    assert.equal(saved.state, "saved");
    assert.equal(repeated.state, "saved");
    assert.equal(
      "revisionId" in repeated ? repeated.revisionId : null,
      "revisionId" in saved ? saved.revisionId : null,
    );
    assert.equal(productions, 1);
    assert.equal(
      (await getRecord<Order>("orders", order.id))!.revisions.length,
      1,
    );
  }));

test("simultaneous changed payloads keep409 and never share a submission's production result", async () =>
  isolated(async () => {
    const { order, token, body } = await fixture();
    const bothValidated = deferred(),
      allowProduction = deferred();
    let validations = 0,
      productions = 0;
    const validate = async (bytes: Buffer) => {
      const warnings = await validatePhoto(bytes);
      if (++validations === 2) bothValidated.resolve();
      await bothValidated.promise;
      return warnings;
    };
    const producer = async (design: Design, id: string) => {
      productions++;
      await allowProduction.promise;
      return produce(design, id);
    };
    const first = observe(
      submitReplacement(order.id, token, body, producer, validate),
    );
    const second = observe(
      submitReplacement(
        order.id,
        token,
        { ...body, crop: { ...body.crop, x: 0.2 } },
        producer,
        validate,
      ),
    );
    try {
      const early = await Promise.race([first, second]);
      assert.equal(early.status, "rejected");
      if (early.status === "rejected") assert.ok(conflict(early.reason));
    } finally {
      allowProduction.resolve();
    }
    const results = await Promise.all([first, second]);
    assert.equal(
      results.filter((result) => result.status === "rejected").length,
      1,
    );
    assert.equal(
      results.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal(productions, 1);
    assert.equal(
      (await getRecord<Order>("orders", order.id))!.revisions.length,
      1,
    );
  }));

test("claim reconciliation rejects superseded requests, expired matching leases and erased orders", async () =>
  isolated(async () => {
    for (const condition of ["superseded", "expired", "erased"] as const) {
      const { order, token, body } = await fixture();
      const entered = deferred(),
        resume = deferred();
      let productions = 0;
      const pending = observe(
        submitReplacement(
          order.id,
          token,
          body,
          async () => {
            productions++;
            throw new Error("Production must not run");
          },
          async (bytes) => {
            const warnings = await validatePhoto(bytes);
            entered.resolve();
            await resume.promise;
            return warnings;
          },
        ),
      );
      await entered.promise;
      await replaceOrder(
        order,
        condition === "superseded"
          ? {
              ...order,
              photoRequest: { ...order.photoRequest!, id: randomUUID() },
            }
          : condition === "erased"
            ? { ...order, dataDeletedAt: new Date().toISOString() }
            : {
                ...order,
                replacementIntake: {
                  submissionId: body.submissionId,
                  requestId: body.requestId,
                  baseRevisionId: body.expectedRevisionId,
                  inputHash: digest(JSON.stringify(body)),
                  leaseId: randomUUID(),
                  startedAt: new Date(Date.now() - 11 * 60000).toISOString(),
                  source: order.originalSnapshot.package.source,
                },
              },
      );
      resume.resolve();
      const result = await pending;
      assert.equal(result.status, "rejected");
      if (result.status === "rejected") {
        assert.ok(result.reason instanceof ApiError);
        assert.equal(result.reason.status, condition === "erased" ? 410 : 409);
      }
      assert.equal(productions, 0);
      assert.equal(
        (await getRecord<Order>("orders", order.id))!.revisions.length,
        0,
      );
    }
  }));
