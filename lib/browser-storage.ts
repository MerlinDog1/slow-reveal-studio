import {
  privateBasketDesign,
  pendingBasketCheckout,
  type SavedPrivateDesign,
  type PendingBasketCheckout,
} from "./browser-checkout";

export type LocalProject = {
  id: string;
  name: string;
  updatedAt: string;
  image: Blob;
  settings: unknown;
  subjectMask?: unknown;
  crop: { zoom: number; x: number; y: number; rotation: number };
  productId: string;
  finishId: string;
  referenceId?: string | null;
  rendererVersion?: string;
  privateDesign?: SavedPrivateDesign;
  pendingCheckout?: PendingBasketCheckout;
};
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("slow-reveal-studio", 1);
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(
        new Error(
          "Device storage is unavailable or blocked. Close other studio tabs and try again.",
        ),
      );
    };
    const timeout = setTimeout(fail, 7000);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("projects"))
        request.result.createObjectStore("projects", { keyPath: "id" });
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      clearTimeout(timeout);
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = fail;
    request.onblocked = fail;
  });
}
export async function saveLocalProject(project: LocalProject) {
  const database = await db();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction("projects", "readwrite");
      tx.objectStore("projects").put(project);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(
          tx.error ?? new Error("Device storage transaction was cancelled."),
        );
    });
  } finally {
    database.close();
  }
}
export async function getLocalProject(
  id = "current",
): Promise<LocalProject | undefined> {
  const database = await db();
  try {
    return await new Promise<LocalProject | undefined>((resolve, reject) => {
      const req = database
        .transaction("projects")
        .objectStore("projects")
        .get(id);
      req.onsuccess = () => {
        resolve(req.result);
      };
      req.onerror = () => {
        reject(req.error);
      };
    });
  } finally {
    database.close();
  }
}
export async function deleteLocalProject(id = "current") {
  const database = await db();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction("projects", "readwrite");
      tx.objectStore("projects").delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(
          tx.error ?? new Error("Device storage transaction was cancelled."),
        );
    });
  } finally {
    database.close();
  }
}

/** Attach the private resume link without replacing a newer basket in another tab. */
export async function rememberPrivateBasketDesign(
  expectedUpdatedAt: string,
  input: SavedPrivateDesign,
): Promise<SavedPrivateDesign> {
  const design = privateBasketDesign(input);
  if (!design) throw new Error("The private design link could not be saved.");
  const database = await db();
  try {
    return await new Promise<SavedPrivateDesign>((resolve, reject) => {
      const tx = database.transaction("projects", "readwrite");
      const store = tx.objectStore("projects");
      const request = store.get("basket");
      let saved = design;
      let failure: Error | undefined;
      request.onsuccess = () => {
        const current = request.result as LocalProject | undefined;
        if (!current || current.updatedAt !== expectedUpdatedAt) {
          failure = new Error(
            "Your basket changed in another tab. Reload it before checkout.",
          );
          tx.abort();
          return;
        }
        // Concurrent saves converge on the first committed design, so retries use its attempt.
        saved = privateBasketDesign(current.privateDesign) ?? design;
        store.put({ ...current, privateDesign: saved });
      };
      tx.oncomplete = () => resolve(saved);
      tx.onerror = () =>
        reject(
          failure ??
            tx.error ??
            new Error(
              "The private design link could not be saved on this device.",
            ),
        );
      tx.onabort = () =>
        reject(
          failure ??
            tx.error ??
            new Error(
              "Device storage was cancelled. Retry saving before checkout.",
            ),
        );
    });
  } finally {
    database.close();
  }
}

/** Persist the precise delivery/proof intent before any checkout request can leave the browser. */
export async function rememberBasketCheckout(
  expectedUpdatedAt: string,
  designId: string,
  input: PendingBasketCheckout,
): Promise<PendingBasketCheckout> {
  const intent = pendingBasketCheckout(input);
  if (!intent) throw new Error("The checkout attempt could not be saved.");
  const database = await db();
  try {
    return await new Promise<PendingBasketCheckout>((resolve, reject) => {
      const tx = database.transaction("projects", "readwrite");
      const store = tx.objectStore("projects");
      const request = store.get("basket");
      let failure: Error | undefined;
      request.onsuccess = () => {
        const current = request.result as LocalProject | undefined;
        const existing = pendingBasketCheckout(current?.pendingCheckout);
        if (
          !current ||
          current.updatedAt !== expectedUpdatedAt ||
          current.privateDesign?.id !== designId
        ) {
          failure = new Error(
            "Your basket changed in another tab. Reload it before checkout.",
          );
        } else if (
          current.pendingCheckout !== undefined &&
          (!existing || JSON.stringify(existing) !== JSON.stringify(intent))
        ) {
          failure = new Error(
            "Checkout has already started with a different proof or delivery choice. Reload to resume that checkout.",
          );
        }
        if (failure) {
          tx.abort();
          return;
        }
        store.put({ ...current, pendingCheckout: intent });
      };
      tx.oncomplete = () => resolve(intent);
      tx.onerror = () =>
        reject(
          failure ??
            tx.error ??
            new Error(
              "The checkout attempt could not be saved on this device.",
            ),
        );
      tx.onabort = () =>
        reject(
          failure ??
            tx.error ??
            new Error("Device storage was cancelled. Retry before checkout."),
        );
    });
  } finally {
    database.close();
  }
}
