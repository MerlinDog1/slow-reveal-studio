import { SiteHeader, SiteFooter } from "@/components/site-header";
import { AdminAccess } from "@/components/admin-access";
import { adminUiConfiguration } from "@/lib/server/admin-auth";
export const dynamic = "force-dynamic";
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
        <AdminAccess configuration={adminUiConfiguration()} />
      </main>
      <SiteFooter />
    </>
  );
}
