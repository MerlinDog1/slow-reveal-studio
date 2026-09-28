import test from "node:test";
import assert from "node:assert/strict";
import {
  getLocalProject,
  saveLocalProject,
  deleteLocalProject,
  type LocalProject,
} from "../lib/browser-storage";

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
