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
};
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("slow-reveal-studio", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("projects", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function saveLocalProject(project: LocalProject) {
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction("projects", "readwrite");
    tx.objectStore("projects").put(project);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  database.close();
}
export async function getLocalProject(
  id = "current",
): Promise<LocalProject | undefined> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const req = database
      .transaction("projects")
      .objectStore("projects")
      .get(id);
    req.onsuccess = () => {
      database.close();
      resolve(req.result);
    };
    req.onerror = () => {
      database.close();
      reject(req.error);
    };
  });
}
export async function deleteLocalProject(id = "current") {
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction("projects", "readwrite");
    tx.objectStore("projects").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  database.close();
}
