import { hasOrderAccessKey } from "./order-access";

export const hasDatabase = () =>
  Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
export const hasStorage = () =>
  [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
  ].every((key) => Boolean(process.env[key]));
export function launchGates() {
  return [
    {
      id: "physical",
      label: "Real canvas, UV ink and pen trials signed off",
      passed: process.env.PHYSICAL_VALIDATION_APPROVED === "true",
    },
    {
      id: "commerce",
      label: "Live checkout explicitly enabled",
      passed: process.env.LIVE_CHECKOUT_ENABLED === "true",
    },
    {
      id: "database",
      label: "Supabase configured and migrations applied",
      passed: hasDatabase(),
    },
    {
      id: "storage",
      label: "Private R2 bucket configured",
      passed: hasStorage(),
    },
    {
      id: "stripe",
      label: "Stripe live key and webhook secret configured",
      passed: Boolean(
        process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") &&
        process.env.STRIPE_WEBHOOK_SECRET,
      ),
    },
    {
      id: "email",
      label: "Resend sender configured",
      passed: Boolean(
        process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL,
      ),
    },
    {
      id: "admin",
      label: "Production administrator configured",
      passed: (process.env.ADMIN_API_TOKEN?.length ?? 0) >= 32,
    },
    {
      id: "abuse-controls",
      label: "Persistent anonymous quota key configured",
      passed: (process.env.RATE_LIMIT_SECRET?.length ?? 0) >= 32,
    },
    {
      id: "retention",
      label: "Scheduled retention credential configured",
      passed: (process.env.CRON_SECRET?.length ?? 0) >= 32,
    },
    {
      id: "order-access",
      label: "Private order status keyring configured",
      passed: hasOrderAccessKey(),
    },
    {
      id: "origin",
      label: "HTTPS production URL configured",
      passed: Boolean(process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https://")),
    },
  ];
}
export function localPersistenceAllowed() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_LOCAL_DEVELOPMENT_STORAGE === "true"
  );
}
