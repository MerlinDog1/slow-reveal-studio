import { notFound } from "next/navigation";
import { Studio } from "@/components/studio";
import { getPreviewModes } from "@/lib/mode-availability";
import type { RenderMode } from "@/lib/renderers/types";
export const dynamicParams = false;
export function generateStaticParams() {
  return getPreviewModes().map((mode) => ({
    mode,
  }));
}
export default async function Lab({
  params,
}: {
  params: Promise<{ mode: string }>;
}) {
  const { mode } = await params;
  const availableModes = getPreviewModes();
  if (!availableModes.some((available) => available === mode)) notFound();
  return (
    <Studio
      lab
      availableModes={availableModes}
      initialMode={mode as RenderMode}
    />
  );
}
