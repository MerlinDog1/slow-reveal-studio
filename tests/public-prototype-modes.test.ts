import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { getPreviewModes } from "../lib/mode-availability";
import { DEFAULT_SETTINGS } from "../lib/renderers";
import { checkoutAttemptId } from "../lib/checkout-intent";
import { saveDesign } from "../lib/server/designs";
import { beginCheckout } from "../lib/server/commerce";
import { designSchema } from "../lib/server/schema";
import { ApiError, newToken } from "../lib/server/security";

async function isolated(work: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), "srs-public-prototype-"));
  const environment = {
    NODE_ENV: "production",
    PUBLIC_PROTOTYPE_MODES_ENABLED: "true",
    LIVE_CHECKOUT_ENABLED: "false",
    PHYSICAL_VALIDATION_APPROVED: "false",
    PHYSICALLY_VALIDATED_MODES:
      "dots,mosaic,line-amplification,colour-blend,tv-weave,fibonacci,contour,stipple",
    STUDIO_DATA_DIR: directory,
    ALLOW_LOCAL_DEVELOPMENT_STORAGE: "true",
    SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    R2_ACCOUNT_ID: "",
    R2_ACCESS_KEY_ID: "",
    R2_SECRET_ACCESS_KEY: "",
    R2_BUCKET: "",
    RESEND_API_KEY: "",
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "",
  };
  const previous = Object.fromEntries(
    Object.keys(environment).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, environment);
  try {
    await work(directory);
  } finally {
    for (const [key, value] of Object.entries(previous))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    assert.ok(
      path
        .resolve(directory)
        .startsWith(
          path.resolve(tmpdir()) + path.sep + "srs-public-prototype-",
        ),
    );
    await rm(directory, { recursive: true, force: true });
  }
}

test("public prototype previews cannot save unapproved customer artwork or persist its photograph", async () =>
  isolated(async (directory) => {
    const photo = await sharp({
      create: { width: 64, height: 80, channels: 3, background: "#777777" },
    })
      .png()
      .toBuffer();
    const modes = getPreviewModes();
    assert.equal(modes.length, 7);
    for (const mode of modes.filter((value) => value !== "dots")) {
      const input = {
        mode,
        productId: "30x40",
        finishId: "rolled",
        inkId: "black",
        crop: { zoom: 1, x: 0, y: 0, rotation: 0 },
        settings: { ...DEFAULT_SETTINGS, mode, widthMm: 300, heightMm: 400 },
        source: {
          dataUrl: `data:image/png;base64,${photo.toString("base64")}`,
        },
        rightsConfirmed: true,
      };
      assert.equal(
        designSchema.safeParse(input).success,
        true,
        "a valid design reaches the availability boundary",
      );
      await assert.rejects(
        saveDesign(input),
        (error) =>
          error instanceof ApiError &&
          error.status === 409 &&
          /physical validation/.test(error.message),
      );
      assert.deepEqual(
        await readdir(directory),
        [],
        `${mode} must fail before source, mask or design persistence`,
      );
    }
  }));

test("public prototype opt-in leaves physical and commerce checkout gates closed before downstream work", async () =>
  isolated(async (directory) => {
    const designId = randomUUID();
    const proofHash = "a".repeat(64);
    const input = {
      attemptId: await checkoutAttemptId(designId, proofHash, "standard"),
      designId,
      token: newToken(),
      shippingId: "standard",
      proofApproved: true,
      proofHash,
    };
    const reached: string[] = [];
    const forbidden = (operation: string) => async (): Promise<never> => {
      reached.push(operation);
      throw new Error("A closed launch gate reached downstream work.");
    };
    for (const physicalApproval of ["false", "true"]) {
      process.env.PHYSICAL_VALIDATION_APPROVED = physicalApproval;
      await assert.rejects(
        beginCheckout(input, {
          catalogue: forbidden("catalogue"),
          produce: forbidden("production"),
          createSession: forbidden("Stripe create"),
          retrieveSession: forbidden("Stripe retrieve"),
        }),
        (error) => {
          assert.ok(error instanceof ApiError);
          assert.equal(error.status, 503);
          const gates = (
            error.details as { gates: { id: string; passed: boolean }[] }
          ).gates;
          assert.equal(
            gates.find((gate) => gate.id === "commerce")?.passed,
            false,
          );
          assert.equal(
            gates.find((gate) => gate.id === "physical")?.passed,
            physicalApproval === "true",
          );
          return true;
        },
      );
      assert.deepEqual(
        reached,
        [],
        "no catalogue, production or payment provider is contacted",
      );
      assert.deepEqual(
        await readdir(directory),
        [],
        "no attempt, checkout or production asset is persisted",
      );
    }
  }));
