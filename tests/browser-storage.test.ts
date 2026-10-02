import test from "node:test";
import assert from "node:assert/strict";
import {
  getLocalProject,
  saveLocalProject,
  deleteLocalProject,
  rememberPrivateBasketDesign,
  rememberBasketCheckout,
  type LocalProject,
} from "../lib/browser-storage";
import { checkoutAttemptId } from "../lib/checkout-intent";

const firstDesign = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  token: "A".repeat(43),
};
const secondDesign = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  token: "B".repeat(43),
};
const savedAt = "2026-09-28T10:00:00.000Z";
const savedProof = "a".repeat(64);
function basket(): LocalProject {
  return {
    id: "basket",
    name: "Fixture",
    updatedAt: savedAt,
    image: new Blob(["fixture"], { type: "image/png" }),
    settings: { inkColor: "#233b56" },
    crop: { zoom: 1, x: 0, y: 0, rotation: 0 },
    productId: "fixture",
    finishId: "rolled",
  };
}

/** Controlled transactional storage: writes become visible only at commit and readwrite transactions serialize. */
async function withBasketDb(
  initial: LocalProject | undefined,
  work: (control: {
    snapshot: () => LocalProject | undefined;
    failNext: (kind: "quota" | "read" | "abort") => void;
    connections: () => { opened: number; closed: number; commits: number };
  }) => Promise<void>,
) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  let current = initial ? structuredClone(initial) : undefined;
  let opened = 0,
    closed = 0,
    commits = 0,
    active = false;
  let failure: "quota" | "read" | "abort" | undefined;
  const queue: (() => void)[] = [];
  const pump = () => {
    if (!active && queue.length) {
      active = true;
      queueMicrotask(queue.shift()!);
    }
  };
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: {
      open() {
        opened++;
        const database = {
          close: () => {
            closed++;
          },
          transaction(name: string, mode: string) {
            assert.equal(name, "projects");
            assert.equal(mode, "readwrite");
            const fail = failure;
            failure = undefined;
            let request: {
              result?: LocalProject;
              onsuccess: null | (() => void);
              onerror: null | (() => void);
            };
            let staged: LocalProject | undefined,
              didPut = false,
              done = false;
            const finish = (aborted = false) => {
              if (done) return;
              done = true;
              queueMicrotask(() => {
                if (aborted) {
                  if (tx.error) tx.onerror?.();
                  tx.onabort?.();
                } else {
                  if (didPut) {
                    current = structuredClone(staged);
                    commits++;
                  }
                  tx.oncomplete?.();
                }
                active = false;
                pump();
              });
            };
            const tx = {
              error: null as DOMException | null,
              oncomplete: null as null | (() => void),
              onerror: null as null | (() => void),
              onabort: null as null | (() => void),
              abort: () => finish(true),
              objectStore(store: string) {
                assert.equal(store, "projects");
                return {
                  get(key: string) {
                    assert.equal(key, "basket");
                    request = { onsuccess: null, onerror: null };
                    return request;
                  },
                  put(value: LocalProject) {
                    staged = structuredClone(value);
                    didPut = true;
                  },
                };
              },
            };
            queue.push(() => {
              if (fail === "read") {
                tx.error = new DOMException("Read failed", "UnknownError");
                request.onerror?.();
                finish(true);
                return;
              }
              request.result = current ? structuredClone(current) : undefined;
              request.onsuccess?.();
              if (done) return;
              if (fail === "quota")
                tx.error = new DOMException(
                  "Device quota exceeded",
                  "QuotaExceededError",
                );
              finish(fail === "quota" || fail === "abort");
            });
            pump();
            return tx;
          },
        };
        const request = {
          result: database,
          onsuccess: null as null | (() => void),
        };
        queueMicrotask(() => request.onsuccess?.());
        return request;
      },
    },
  });
  try {
    await work({
      snapshot: () => (current ? structuredClone(current) : undefined),
      failNext: (kind) => {
        failure = kind;
      },
      connections: () => ({ opened, closed, commits }),
    });
  } finally {
    if (previous) Object.defineProperty(globalThis, "indexedDB", previous);
    else Reflect.deleteProperty(globalThis, "indexedDB");
  }
}

test("blocked device storage rejects promptly and closes a late successful connection", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  let closed = 0;
  const request = {
    result: { close: () => closed++ },
    onblocked: null as null | (() => void),
    onsuccess: null as null | (() => void),
  };
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: {
      open() {
        queueMicrotask(() => request.onblocked?.());
        return request;
      },
    },
  });
  try {
    await assert.rejects(getLocalProject(), /unavailable or blocked/);
    request.onsuccess?.();
    assert.equal(closed, 1);
  } finally {
    if (previous) Object.defineProperty(globalThis, "indexedDB", previous);
    else Reflect.deleteProperty(globalThis, "indexedDB");
  }
});

test("aborted save and delete transactions reject and always close their connection", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  let closed = 0;
  const database = {
    close: () => closed++,
    transaction() {
      const transaction = {
        error: null,
        onabort: null as null | (() => void),
        objectStore: () => ({ put() {}, delete() {} }),
      };
      queueMicrotask(() => transaction.onabort?.());
      return transaction;
    },
  };
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: {
      open() {
        const request = {
          result: database,
          onsuccess: null as null | (() => void),
        };
        queueMicrotask(() => request.onsuccess?.());
        return request;
      },
    },
  });
  try {
    await assert.rejects(
      saveLocalProject({ id: "current" } as LocalProject),
      /cancelled/,
    );
    await assert.rejects(deleteLocalProject(), /cancelled/);
    assert.equal(closed, 2);
  } finally {
    if (previous) Object.defineProperty(globalThis, "indexedDB", previous);
    else Reflect.deleteProperty(globalThis, "indexedDB");
  }
});

test("concurrent private saves converge on the first committed binding without replacing the basket", async () => {
  const original = basket();
  await withBasketDb(original, async (control) => {
    const [first, second] = await Promise.all([
      rememberPrivateBasketDesign(savedAt, firstDesign),
      rememberPrivateBasketDesign(savedAt, secondDesign),
    ]);
    assert.deepEqual(first, firstDesign);
    assert.deepEqual(second, firstDesign);
    const stored = control.snapshot()!;
    assert.deepEqual(stored.privateDesign, firstDesign);
    assert.deepEqual(
      { ...stored, privateDesign: undefined },
      { ...original, privateDesign: undefined },
    );
    first.token = "changed-return-value";
    assert.equal(control.snapshot()?.privateDesign?.token, firstDesign.token);
    assert.deepEqual(control.connections(), {
      opened: 2,
      closed: 2,
      commits: 2,
    });
  });
});

test("missing or concurrently updated baskets cannot be resurrected by a late private save", async () => {
  for (const original of [
    undefined,
    { ...basket(), updatedAt: "2026-09-28T10:00:01.000Z", name: "Newer edit" },
  ]) {
    await withBasketDb(original, async (control) => {
      await assert.rejects(
        rememberPrivateBasketDesign(savedAt, firstDesign),
        /basket changed/,
      );
      assert.deepEqual(control.snapshot(), original);
      assert.deepEqual(control.connections(), {
        opened: 1,
        closed: 1,
        commits: 0,
      });
    });
  }
});

test("pending checkout is durable and repeatable but cannot switch shipping, proof, attempt or design", async () => {
  const intent = {
    attemptId: await checkoutAttemptId(firstDesign.id, savedProof, "express"),
    proofHash: savedProof,
    shippingId: "express",
  };
  const original = { ...basket(), privateDesign: firstDesign };
  await withBasketDb(original, async (control) => {
    assert.deepEqual(
      await rememberBasketCheckout(savedAt, firstDesign.id, intent),
      intent,
    );
    assert.deepEqual(
      await rememberBasketCheckout(savedAt, firstDesign.id, { ...intent }),
      intent,
    );
    const before = control.snapshot();
    for (const patch of [
      { shippingId: "standard" },
      { proofHash: "b".repeat(64) },
      { attemptId: secondDesign.id },
    ])
      await assert.rejects(
        rememberBasketCheckout(savedAt, firstDesign.id, {
          ...intent,
          ...patch,
        }),
        /already started/,
      );
    await assert.rejects(
      rememberBasketCheckout(savedAt, secondDesign.id, intent),
      /basket changed/,
    );
    await assert.rejects(
      rememberBasketCheckout(
        "2026-09-28T10:00:00.001Z",
        firstDesign.id,
        intent,
      ),
      /basket changed/,
    );
    assert.deepEqual(control.snapshot(), before);
    assert.equal(control.snapshot()?.pendingCheckout?.shippingId, "express");
    assert.equal(control.connections().commits, 2);
    assert.equal(control.connections().opened, control.connections().closed);
  });
});

test("concurrent different delivery attempts commit one winner and preserve it on rejection", async () => {
  const standard = {
    attemptId: await checkoutAttemptId(firstDesign.id, savedProof, "standard"),
    proofHash: savedProof,
    shippingId: "standard",
  };
  const express = {
    attemptId: await checkoutAttemptId(firstDesign.id, savedProof, "express"),
    proofHash: savedProof,
    shippingId: "express",
  };
  await withBasketDb(
    { ...basket(), privateDesign: firstDesign },
    async (control) => {
      const result = await Promise.allSettled([
        rememberBasketCheckout(savedAt, firstDesign.id, standard),
        rememberBasketCheckout(savedAt, firstDesign.id, express),
      ]);
      assert.equal(result[0].status, "fulfilled");
      assert.equal(result[1].status, "rejected");
      assert.deepEqual(control.snapshot()?.pendingCheckout, standard);
      assert.equal(control.connections().commits, 1);
    },
  );
});

test("corrupt persisted pending state fails closed instead of silently starting a new attempt", async () => {
  const intent = {
    attemptId: await checkoutAttemptId(firstDesign.id, savedProof, "standard"),
    proofHash: savedProof,
    shippingId: "standard",
  };
  const original = {
    ...basket(),
    privateDesign: firstDesign,
    pendingCheckout: { ...intent, proofHash: "corrupt" },
  };
  await withBasketDb(original, async (control) => {
    await assert.rejects(
      rememberBasketCheckout(savedAt, firstDesign.id, intent),
      /already started/,
    );
    assert.deepEqual(control.snapshot(), original);
    assert.equal(control.connections().commits, 0);
  });
});

test("read failures, quota errors and aborted writes never persist a private link or checkout and always close storage", async () => {
  const intent = {
    attemptId: await checkoutAttemptId(firstDesign.id, savedProof, "standard"),
    proofHash: savedProof,
    shippingId: "standard",
  };
  for (const failure of ["read", "quota", "abort"] as const)
    for (const operation of ["private", "checkout"] as const) {
      const original = {
        ...basket(),
        ...(operation === "checkout" ? { privateDesign: firstDesign } : {}),
      };
      await withBasketDb(original, async (control) => {
        control.failNext(failure);
        await assert.rejects(
          operation === "private"
            ? rememberPrivateBasketDesign(savedAt, firstDesign)
            : rememberBasketCheckout(savedAt, firstDesign.id, intent),
        );
        assert.deepEqual(control.snapshot(), original);
        assert.deepEqual(control.connections(), {
          opened: 1,
          closed: 1,
          commits: 0,
        });
      });
    }
});

test("invalid new resume inputs are rejected before opening device storage", async () => {
  await withBasketDb(basket(), async (control) => {
    await assert.rejects(
      rememberPrivateBasketDesign(savedAt, {
        ...firstDesign,
        token: "invalid",
      }),
      /could not be saved/,
    );
    await assert.rejects(
      rememberBasketCheckout(savedAt, firstDesign.id, {
        attemptId: firstDesign.id,
        proofHash: "invalid",
        shippingId: "standard",
      }),
      /could not be saved/,
    );
    assert.deepEqual(control.connections(), {
      opened: 0,
      closed: 0,
      commits: 0,
    });
  });
});
