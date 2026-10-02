import { rename } from "node:fs/promises";

/** Windows scanners can briefly hold a destination open. Never unlink the old record. */
export async function replaceFile(
  source: string,
  destination: string,
  operation = rename,
  pause = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
) {
  for (let attempt = 0; ; attempt++) {
    try {
      await operation(source, destination);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 5 || !["EPERM", "EACCES", "EBUSY"].includes(code ?? ""))
        throw error;
      await pause(Math.min(250, 20 * 2 ** attempt));
    }
  }
}
