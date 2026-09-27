import { notFound } from "next/navigation";
import { Studio } from "@/components/studio";
export const dynamicParams = false;
export function generateStaticParams() {
  return ["dots", "mosaic", "contour", "line-amplification"].map((mode) => ({
    mode,
  }));
}
export default async function Lab({
  params,
}: {
  params: Promise<{ mode: string }>;
}) {
  const { mode } = await params;
  if (!["dots", "mosaic", "contour", "line-amplification"].includes(mode))
    notFound();
  return (
    <Studio
      lab
      initialMode={mode as "dots" | "mosaic" | "contour" | "line-amplification"}
    />
  );
}
