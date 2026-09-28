import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  authenticateAdmin,
  adminUiConfiguration,
  localAdminTokenEnabled,
  supabaseAdminConfigured,
  requireAdminRole,
  type AdminAuthProvider,
  type AdminIdentity,
} from "../lib/server/admin-auth";
import { ApiError, newToken, bearer } from "../lib/server/security";
import {
  createPreset,
  updatePreset,
  revisePreset,
  publishedPresets,
  createPresetSchema,
} from "../lib/server/presets";
import { DEFAULT_SETTINGS, RENDERER_VERSION } from "../lib/renderers";
import {
  presetSettings,
  PRESET_SETTING_KEYS,
  type RendererPreset,
} from "../lib/preset-types";
import { putRecord, getRecord, deleteRecord } from "../lib/server/store";
import { GET as getPublicPresets } from "../app/api/presets/route";
import { POST as postPreset } from "../app/api/admin/presets/route";
import { PATCH as patchPreset } from "../app/api/admin/presets/[id]/route";

const jwt = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from('{"role":"operator","user_metadata":{"role":"operator"}}').toString("base64url")}.unverified_signature`;
const settings = presetSettings(DEFAULT_SETTINGS);
const operator: AdminIdentity = {
  kind: "supabase",
  userId: randomUUID(),
  role: "operator",
};
const reviewer: AdminIdentity = {
  kind: "supabase",
  userId: randomUUID(),
  role: "reviewer",
};
const configured = {
  NODE_ENV: "production",
  SUPABASE_ADMIN_AUTH_ENABLED: "true",
  SUPABASE_URL: "https://studio.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "server-only-secret",
  NEXT_PUBLIC_SUPABASE_URL: "https://studio.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_isolated_qa_public_key",
  NEXT_PUBLIC_SITE_URL: "https://studio.example",
};
const status = (expected: number) => (error: unknown) =>
  error instanceof ApiError && error.status === expected;
test("admin authorization verifies provider identity and current private membership without trusting JWT roles", async () => {
  let user: { id: string } | null = { id: reviewer.userId };
  let membership: { role: string; active: boolean } | null = {
    role: "reviewer",
    active: true,
  };
  let verificationCalls = 0,
    membershipCalls = 0;
  const provider: AdminAuthProvider = {
    async getUser(token) {
      verificationCalls++;
      assert.equal(token, jwt);
      return user;
    },
    async getMembership(id) {
      membershipCalls++;
      assert.equal(id, reviewer.userId);
      return membership;
    },
  };
  const request = new Request("https://studio.example/api/admin", {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  assert.equal(
    bearer(request),
    null,
    "Admin JWTs must not widen guest capability acceptance",
  );
  assert.deepEqual(
    await authenticateAdmin(request, "reviewer", provider, configured),
    reviewer,
  );
  await assert.rejects(
    authenticateAdmin(request, "operator", provider, configured),
    status(403),
  );
  membership = { role: "operator", active: true };
  assert.equal(
    (await authenticateAdmin(request, "operator", provider, configured)).role,
    "operator",
  );
  membership = { role: "operator", active: false };
  await assert.rejects(
    authenticateAdmin(request, "reviewer", provider, configured),
    status(403),
  );
  membership = null;
  await assert.rejects(
    authenticateAdmin(request, "reviewer", provider, configured),
    status(403),
  );
  user = null;
  await assert.rejects(
    authenticateAdmin(request, "reviewer", provider, configured),
    status(401),
  );
  assert.equal(verificationCalls, 6);
  assert.equal(membershipCalls, 5);
  await assert.rejects(
    authenticateAdmin(
      request,
      "reviewer",
      {
        ...provider,
        async getUser() {
          throw new Error("provider details must stay private");
        },
      },
      configured,
    ),
    (error) =>
      error instanceof ApiError &&
      error.status === 503 &&
      !error.message.includes("provider details"),
  );
  await assert.rejects(
    authenticateAdmin(request, "reviewer", provider, {
      ...configured,
      SUPABASE_ADMIN_AUTH_ENABLED: "false",
    }),
    status(503),
  );
  await assert.rejects(
    authenticateAdmin(
      new Request("https://studio.example/api/admin"),
      "reviewer",
      provider,
      configured,
    ),
    status(401),
  );
  await assert.rejects(
    authenticateAdmin(
      new Request("https://studio.example/api/admin", {
        headers: { Authorization: `Bearer ${"a".repeat(9000)}.b.c` },
      }),
      "reviewer",
      provider,
      configured,
    ),
    status(401),
  );
  assert.throws(() => requireAdminRole(reviewer, "operator"), status(403));
});
test("shared administrator tokens require explicit loopback configuration and cannot open remote production", async () => {
  const token = newToken();
  const env = {
    NODE_ENV: "development",
    ADMIN_API_TOKEN: token,
    ALLOW_LOCAL_ADMIN_TOKEN: "true",
    NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000",
  };
  const local = new Request("http://127.0.0.1:3000/api/admin", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.deepEqual(await authenticateAdmin(local, "operator", undefined, env), {
    kind: "local-token",
    userId: "local-development",
    role: "operator",
  });
  for (const changed of [
    { ...env, ALLOW_LOCAL_ADMIN_TOKEN: "false" },
    { ...env, NEXT_PUBLIC_SITE_URL: "https://studio.example" },
    { ...env, NODE_ENV: "production" },
  ])
    await assert.rejects(
      authenticateAdmin(local, "reviewer", undefined, changed),
      status(401),
    );
  assert.equal(
    localAdminTokenEnabled(local.url, {
      ...env,
      NODE_ENV: "production",
      ALLOW_LOCAL_DEVELOPMENT_STORAGE: "true",
    }),
    true,
  );
  for (const origin of [
    "https://studio.example",
    "http://localhost.attacker.example",
    "http://127.0.0.2",
    "https://127.0.0.1.attacker.example",
  ])
    await assert.rejects(
      authenticateAdmin(
        new Request(`${origin}/api/admin`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        "reviewer",
        undefined,
        {
          ...env,
          NODE_ENV: "production",
          ALLOW_LOCAL_DEVELOPMENT_STORAGE: "true",
        },
      ),
      status(401),
    );
});
test("administrator UI configuration never serializes service credentials or mismatched origins", () => {
  assert.deepEqual(adminUiConfiguration(configured), {
    supabaseUrl: "https://studio.supabase.co",
    publishableKey: configured.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    localTokenAllowed: false,
  });
  assert.equal(supabaseAdminConfigured(configured), true);
  const serviceJwt = `${Buffer.from("{}").toString("base64url")}.${Buffer.from('{"role":"service_role"}').toString("base64url")}.signature`;
  for (const value of [
    "sb_secret_never_send_to_browser",
    configured.SUPABASE_SERVICE_ROLE_KEY,
    serviceJwt,
    "invalid",
  ]) {
    const result = adminUiConfiguration({
      ...configured,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: value,
    });
    assert.equal(result.publishableKey, null);
    assert.equal(JSON.stringify(result).includes(value), false);
  }
  for (const value of [
    "https://other.supabase.co",
    "https://user:password@studio.supabase.co",
    "https://studio.supabase.co/path",
    "https://studio.supabase.co/?query=1",
    "https://studio.supabase.co/#token",
    "http://studio.supabase.co",
    "javascript:alert(1)",
  ])
    assert.equal(
      adminUiConfiguration({ ...configured, NEXT_PUBLIC_SUPABASE_URL: value })
        .supabaseUrl,
      null,
    );
  const anonJwt = `${Buffer.from("{}").toString("base64url")}.${Buffer.from('{"role":"anon"}').toString("base64url")}.signature`;
  assert.equal(
    adminUiConfiguration({
      ...configured,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: anonJwt,
    }).publishableKey,
    anonJwt,
  );
});
test("shared presets retain immutable versions, explicit publication, concurrency and privacy boundaries", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "slow-reveal-presets-"));
  const keys = [
    "STUDIO_DATA_DIR",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ALLOW_LOCAL_DEVELOPMENT_STORAGE",
    "ALLOW_LOCAL_ADMIN_TOKEN",
    "ADMIN_API_TOKEN",
    "NEXT_PUBLIC_SITE_URL",
    "PHYSICAL_VALIDATION_APPROVED",
    "PHYSICALLY_VALIDATED_MODES",
    "NODE_ENV",
  ];
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  for (const key of keys) delete process.env[key];
  process.env.STUDIO_DATA_DIR = directory;
  process.env.ALLOW_LOCAL_DEVELOPMENT_STORAGE = "true";
  process.env.ALLOW_LOCAL_ADMIN_TOKEN = "true";
  process.env.ADMIN_API_TOKEN = newToken();
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost";
  try {
    assert.deepEqual(
      Object.keys(settings).sort(),
      PRESET_SETTING_KEYS.filter(
        (key) => DEFAULT_SETTINGS[key] !== undefined,
      ).sort(),
    );
    for (const forbidden of [
      "text",
      "source",
      "crop",
      "email",
      "token",
      "widthMm",
      "heightMm",
      "inkColor",
      "mode",
    ])
      assert.equal(
        createPresetSchema.safeParse({
          name: "Safe preset",
          mode: "dots",
          settings: { ...settings, [forbidden]: "private value" },
        }).success,
        false,
      );
    await assert.rejects(
      createPreset(
        {
          name: "Invalid range",
          mode: "dots",
          settings: { ...settings, minDiameterMm: 4, maxDiameterMm: 2 },
        },
        reviewer,
      ),
      status(400),
    );
    let record = await createPreset(
      {
        name: "Calm dots",
        description: "A reviewed starting point",
        mode: "dots",
        settings,
      },
      reviewer,
    );
    assert.equal(record.publishedVersion, null);
    assert.equal(record.versions[0].createdBy, reviewer.userId);
    assert.deepEqual((await publishedPresets()).presets, []);
    await assert.rejects(
      updatePreset(
        record.id,
        { action: "publish", expectedRevision: record.revision, version: 1 },
        reviewer,
      ),
      status(403),
    );
    record = await updatePreset(
      record.id,
      { action: "publish", expectedRevision: record.revision, version: 1 },
      operator,
    );
    const publicFirst = (await publishedPresets("dots")).presets[0];
    assert.equal(publicFirst.version, 1);
    assert.equal(publicFirst.name, "Calm dots");
    assert.equal(JSON.stringify(publicFirst).includes(reviewer.userId), false);
    assert.equal("audit" in publicFirst, false);
    assert.equal("createdBy" in publicFirst, false);
    const oldVersion = structuredClone(record.versions[0]);
    record = await updatePreset(
      record.id,
      {
        action: "revise",
        expectedRevision: record.revision,
        name: "Calm dots refined",
        settings: { ...settings, contrast: 1.5 },
      },
      reviewer,
    );
    assert.deepEqual(record.versions[0], oldVersion);
    assert.equal(record.currentVersion, 2);
    assert.equal(record.publishedVersion, 1);
    assert.equal(
      (await publishedPresets()).presets[0].settings.contrast,
      settings.contrast,
    );
    await assert.rejects(
      updatePreset(
        record.id,
        {
          action: "publish",
          expectedRevision: record.revision - 1,
          version: 2,
        },
        operator,
      ),
      status(409),
    );
    const conflicts = await Promise.allSettled([
      updatePreset(
        record.id,
        { action: "publish", expectedRevision: record.revision, version: 2 },
        operator,
      ),
      updatePreset(
        record.id,
        { action: "unpublish", expectedRevision: record.revision },
        operator,
      ),
    ]);
    assert.equal(
      conflicts.filter((item) => item.status === "fulfilled").length,
      1,
    );
    assert.equal(
      conflicts.filter((item) => item.status === "rejected").length,
      1,
    );
    record = (await getRecord<RendererPreset>("presets", record.id))!;
    await assert.rejects(
      putRecord("presets", record.id, {
        ...record,
        revision: record.revision + 1,
        versions: [
          { ...record.versions[0], name: "Overwritten history" },
          record.versions[1],
        ],
      }),
      /append only/,
    );
    await assert.rejects(deleteRecord("presets", record.id), /Archive presets/);
    record = await updatePreset(
      record.id,
      { action: "archive", expectedRevision: record.revision },
      operator,
    );
    assert.deepEqual((await publishedPresets()).presets, []);
    await assert.rejects(
      updatePreset(
        record.id,
        {
          action: "revise",
          expectedRevision: record.revision,
          name: "Archived",
          settings,
        },
        reviewer,
      ),
      status(409),
    );
    record = await updatePreset(
      record.id,
      { action: "restore", expectedRevision: record.revision },
      operator,
    );
    assert.equal(
      record.publishedVersion,
      null,
      "Restore must not silently republish",
    );
    const oldRenderer = {
      ...record,
      versions: record.versions.map((item) => ({
        ...item,
        rendererVersion: "obsolete/0",
      })),
    };
    assert.throws(
      () =>
        revisePreset(
          oldRenderer,
          { action: "publish", expectedRevision: record.revision, version: 1 },
          operator,
        ),
      status(409),
    );
    const wrongMode = {
      ...record,
      versions: record.versions.map((item) => ({
        ...item,
        mode: "mosaic" as const,
      })),
    };
    assert.throws(
      () =>
        revisePreset(
          wrongMode,
          { action: "publish", expectedRevision: record.revision, version: 1 },
          operator,
        ),
      status(409),
    );
    await putRecord(
      "presets",
      randomUUID(),
      { ...oldRenderer, id: randomUUID(), publishedVersion: 1 },
      true,
    );
    await putRecord(
      "presets",
      randomUUID(),
      { ...wrongMode, id: randomUUID(), publishedVersion: 1 },
      true,
    );
    assert.deepEqual((await publishedPresets()).presets, []);
    let experimental = await createPreset(
      { name: "Experimental cells", mode: "mosaic", settings },
      reviewer,
    );
    experimental = await updatePreset(
      experimental.id,
      {
        action: "publish",
        expectedRevision: experimental.revision,
        version: 1,
      },
      operator,
    );
    assert.deepEqual(
      (await publishedPresets("mosaic")).presets,
      [],
      "Public mode gates also apply to published presets",
    );
    Object.assign(process.env, { NODE_ENV: "development" });
    assert.equal(
      (await publishedPresets("mosaic")).presets[0].id,
      experimental.id,
    );
    const denied = await postPreset(
      new Request("http://localhost/api/admin/presets", {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Anonymous", mode: "dots", settings }),
      }),
    );
    assert.equal(denied.status, 401);
    const createResponse = await postPreset(
      new Request("http://localhost/api/admin/presets", {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.ADMIN_API_TOKEN}`,
        },
        body: JSON.stringify({
          name: "Local operator",
          mode: "dots",
          settings,
        }),
      }),
    );
    assert.equal(createResponse.status, 201);
    const created = (await createResponse.json()).preset as RendererPreset;
    const publishResponse = await patchPreset(
      new Request(`http://localhost/api/admin/presets/${created.id}`, {
        method: "PATCH",
        headers: {
          Origin: "http://localhost",
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.ADMIN_API_TOKEN}`,
        },
        body: JSON.stringify({
          action: "publish",
          expectedRevision: created.revision,
          version: 1,
        }),
      }),
      { params: Promise.resolve({ id: created.id }) },
    );
    assert.equal(publishResponse.status, 200);
    const publicResponse = await getPublicPresets(
      new Request("http://localhost/api/presets?mode=dots"),
    );
    assert.equal(publicResponse.status, 200);
    assert.match(publicResponse.headers.get("Cache-Control")!, /no-store/);
    assert.equal(
      (await publicResponse.json()).presets[0].rendererVersion,
      RENDERER_VERSION,
    );
    assert.equal(
      JSON.stringify(await getRecord("presets", created.id)).includes(
        process.env.ADMIN_API_TOKEN!,
      ),
      false,
    );
    const migration = await readFile(
      path.resolve("supabase/migrations/202609280004_admin_presets.sql"),
      "utf8",
    );
    assert.match(
      migration,
      /revoke all on public\.studio_admin_users from anon, authenticated/,
    );
    assert.match(
      migration,
      /revoke execute on function public\.studio_replace_preset/,
    );
    assert.match(migration, /expected_payload/);
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
