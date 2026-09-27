import { SiteHeader, SiteFooter } from "@/components/site-header";
import { AdminDesk } from "@/components/admin-desk";
export const metadata = {
  title: "Production desk",
  robots: { index: false, follow: false },
};
export default function Admin() {
  return (
    <>
      <SiteHeader />
      <main className="content-page">
        <span className="eyebrow">From photograph to workbench</span>
        <h1>The production desk.</h1>
        <AdminDesk />
      </main>
      <SiteFooter />
    </>
  );
}
