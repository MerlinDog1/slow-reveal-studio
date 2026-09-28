export type LocalProject = {
  id: string;
  name: string;
  updatedAt: string;
  image: Blob;
  settings: unknown;
  crop: { zoom: number; x: number; y: number; rotation: number };
  productId: string;
  finishId: string;
  referenceId?: string | null;
  rendererVersion?: string;
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
