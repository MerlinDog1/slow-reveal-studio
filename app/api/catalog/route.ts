import { getCatalogue } from "@/lib/server/catalog";
import { launchGates, hasStorage } from "@/lib/server/config";
import { api, privateJson } from "@/lib/server/security";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(async () => {
    const catalogue = await getCatalogue();
    return privateJson({
      ...catalogue,
      directUploads: hasStorage(),
      liveCheckoutEnabled:
        !catalogue.prototype && launchGates().every((g) => g.passed),
    });
  });
}
