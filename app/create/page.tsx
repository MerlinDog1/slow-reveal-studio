import { Studio } from "@/components/studio";
import { getPreviewModes } from "@/lib/mode-availability";
export const metadata = { title: "Create your canvas" };
export default function CreatePage() {
  return <Studio availableModes={getPreviewModes()} />;
}
