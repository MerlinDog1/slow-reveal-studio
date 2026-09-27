import { SiteHeader, SiteFooter } from "@/components/site-header";
import { Basket } from "@/components/basket";
export const metadata = { title: "Your personalised kit" };
export default function BasketPage() {
  return (
    <>
      <SiteHeader />
      <main className="content-page">
        <span className="eyebrow">One last look</span>
        <h1>Your little making project.</h1>
        <Basket />
      </main>
      <SiteFooter />
    </>
  );
}
