import { SiteHeader, SiteFooter } from "@/components/site-header";
import { OrderStatus } from "@/components/order-status";
export const metadata = {
  title: "Your order",
  robots: { index: false, follow: false },
};
export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <SiteHeader />
      <main className="content-page">
        <span className="eyebrow">Something to look forward to</span>
        <h1>Your canvas, taking shape.</h1>
        <OrderStatus id={id} />
      </main>
      <SiteFooter />
    </>
  );
}
