import {
  mkdir,
  readFile,
  rename,
  writeFile,
  readdir,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { hasDatabase, localPersistenceAllowed } from "./config";
import { ApiError } from "./security";

export type Collection =
  "designs" | "checkouts" | "orders" | "events" | "presets" | "uploads";
export function database() {
  return hasDatabase()
    ? createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      )
    : null;
}
export function dataRoot() {
  return path.resolve(
    /*turbopackIgnore: true*/ process.env.STUDIO_DATA_DIR || ".data",
  );
}
function filename(kind: Collection, id: string) {
  if (!/^[a-zA-Z0-9_-]{1,150}$/.test(id))
    throw new ApiError(400, "Invalid record identifier.");
  if (!localPersistenceAllowed())
    throw new ApiError(
      503,
      "Configure Supabase before saving on a production server.",
    );
  return path.join(dataRoot(), kind, `${id}.json`);
}
export async function getRecord<T>(
  kind: Collection,
  id: string,
): Promise<T | null> {
  const db = database();
  if (db) {
    const { data, error } = await db
      .from("studio_records")
      .select("payload")
      .eq("kind", kind)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new ApiError(503, "Database unavailable.");
    return (data?.payload as T) ?? null;
  }
  try {
    return JSON.parse(await readFile(filename(kind, id), "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
export async function putRecord<T>(
  kind: Collection,
  id: string,
  payload: T,
  insertOnly = false,
): Promise<boolean> {
  const db = database();
  if (db) {
    const result = insertOnly
      ? await db.from("studio_records").insert({ kind, id, payload })
      : await db.from("studio_records").upsert({ kind, id, payload });
    if (result.error?.code === "23505" && insertOnly) return false;
    if (result.error) throw new ApiError(503, "Could not save the record.");
    return true;
  }
  if (!insertOnly) {
    const old = await getRecord<Record<string, unknown>>(kind, id);
    if (old) {
      const next = payload as Record<string, unknown>;
      const equal = (a: unknown, b: unknown) =>
        JSON.stringify(a) === JSON.stringify(b);
      if (kind === "designs")
        throw new ApiError(
          409,
          "Saved designs are immutable; save a new revision.",
        );
      if (
        kind === "checkouts" &&
        !equal(
          { ...old, sessionId: undefined },
          { ...next, sessionId: undefined },
        )
      )
        throw new ApiError(409, "Checkout snapshots are immutable.");
      if (kind === "orders") {
        for (const key of [
          "originalSnapshot",
          "stripeSessionId",
          "paymentStatus",
          "amountPence",
          "tokenHash",
          "id",
        ])
          if (!equal(old[key], next[key]))
            throw new ApiError(
              409,
              "Paid artwork snapshots are immutable; create a revision.",
            );
        for (const key of ["revisions", "audit", "customerProofApprovals"]) {
          const existing = (old[key] ?? []) as unknown[];
          const replacement = (next[key] ?? []) as unknown[];
          if (
            !Array.isArray(replacement) ||
            replacement.length < existing.length ||
            existing.some((item, index) => !equal(item, replacement[index]))
          )
            throw new ApiError(
              409,
              "Order revision and audit history are append only.",
            );
        }
      }
    }
  }
  const file = filename(kind, id);
  await mkdir(path.dirname(file), { recursive: true });
  if (insertOnly) {
    try {
      await writeFile(file, JSON.stringify(payload), {
        flag: "wx",
        mode: 0o600,
      });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw error;
    }
  }
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(payload), { mode: 0o600 });
  await rename(temporary, file);
  return true;
}
export async function listRecords<T>(kind: Collection): Promise<T[]> {
  const db = database();
  if (db) {
    const records: T[] = [];
    let offset = 0;
    while (true) {
      const { data, error } = await db
        .from("studio_records")
        .select("payload")
        .eq("kind", kind)
        .order("id")
        .range(offset, offset + 499);
      if (error) throw new ApiError(503, "Database unavailable.");
      records.push(...(data || []).map((row) => row.payload as T));
      if (!data || data.length < 500) return records;
      offset += 500;
    }
  }
  const directory = path.dirname(filename(kind, "index"));
  try {
    const files = (await readdir(directory)).filter((name) =>
      name.endsWith(".json"),
    );
    return await Promise.all(
      files.map(
        async (file) =>
          JSON.parse(await readFile(path.join(directory, file), "utf8")) as T,
      ),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
export async function deleteRecord(kind: Collection, id: string) {
  if (kind === "orders")
    throw new ApiError(
      409,
      "Accounting records are retained; use artwork erasure tooling.",
    );
  const db = database();
  if (db) {
    const { error } = await db
      .from("studio_records")
      .delete()
      .eq("kind", kind)
      .eq("id", id);
    if (error) throw new ApiError(503, "Could not delete the record.");
    return;
  }
  await unlink(filename(kind, id)).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
}

const updateLocks = new Map<string, Promise<void>>();
/** Optimistic concurrency prevents two reviewers from losing one another's revisions or approvals. */
export async function replaceOrder<T extends { id: string }>(
  expected: T,
  replacement: T,
) {
  const db = database();
  if (db) {
    const { data, error } = await db.rpc("studio_replace_order", {
      order_id: expected.id,
      expected_payload: expected,
      replacement_payload: replacement,
    });
    if (error) throw new ApiError(503, "Could not update the order.");
    if (!data)
      throw new ApiError(
        409,
        "The order changed during review. Reload and try again.",
      );
    return;
  }
  const previous = updateLocks.get(expected.id) ?? Promise.resolve();
  let release!: () => void;
  const lock = new Promise<void>((resolve) => {
    release = resolve;
  });
  updateLocks.set(expected.id, lock);
  await previous;
  try {
    const current = await getRecord<T>("orders", expected.id);
    if (JSON.stringify(current) !== JSON.stringify(expected))
      throw new ApiError(
        409,
        "The order changed during review. Reload and try again.",
      );
    await putRecord("orders", expected.id, replacement);
  } finally {
    release();
    if (updateLocks.get(expected.id) === lock) updateLocks.delete(expected.id);
  }
}
