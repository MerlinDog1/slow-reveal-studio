import { SiteHeader, SiteFooter } from "@/components/site-header";
import { PrivateDesign } from "@/components/private-design";
export const metadata = {
  title: "Your private design",
  robots: { index: false, follow: false },
};
export default async function DesignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <SiteHeader />
      <main className="content-page">
        <span className="eyebrow">Kept just for you</span>
        <h1>Your saved canvas.</h1>
        <PrivateDesign id={id} />
      </main>
      <SiteFooter />
    </>
  );
}
