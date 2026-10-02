import { ApiError, digest, tokenMatches } from "./security";
import { database } from "./store";

export type AdminRole = "reviewer" | "operator";
export type AdminIdentity = {
  kind: "supabase" | "local-token";
  userId: string;
  role: AdminRole;
};
type Environment = Record<string, string | undefined>;
export type AdminAuthProvider = {
  getUser: (token: string) => Promise<{ id: string } | null>;
  getMembership: (
    id: string,
  ) => Promise<{ role: string; active: boolean } | null>;
};
function loopback(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
export function localAdminTokenEnabled(
  requestUrl: string,
  env: Environment = process.env,
) {
  return (
    env.ALLOW_LOCAL_ADMIN_TOKEN === "true" &&
    loopback(requestUrl) &&
    loopback(env.NEXT_PUBLIC_SITE_URL) &&
    (env.NODE_ENV !== "production" ||
      env.ALLOW_LOCAL_DEVELOPMENT_STORAGE === "true") &&
    (env.ADMIN_API_TOKEN?.length ?? 0) >= 32
  );
}
export function supabaseAdminConfigured(env: Environment = process.env) {
  return !!publicSupabaseConfiguration(env);
}
function publicSupabaseConfiguration(env: Environment) {
  if (
    env.SUPABASE_ADMIN_AUTH_ENABLED !== "true" ||
    !env.SUPABASE_SERVICE_ROLE_KEY ||
    !env.SUPABASE_URL ||
    !env.NEXT_PUBLIC_SUPABASE_URL
  )
    return null;
  let server: URL, browser: URL;
  try {
    server = new URL(env.SUPABASE_URL);
    browser = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
  } catch {
    return null;
  }
  for (const url of [server, browser]) {
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      return null;
    if (
      url.protocol !== "https:" &&
      !(
        loopback(url.href) &&
        (env.NODE_ENV !== "production" ||
          env.ALLOW_LOCAL_DEVELOPMENT_STORAGE === "true")
      )
    )
      return null;
  }
  if (server.origin !== browser.origin) return null;
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  let publicKey = /^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(key);
  if (
    !publicKey &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)
  ) {
    try {
      publicKey =
        JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8"))
          .role === "anon";
    } catch {
      publicKey = false;
    }
  }
  if (!publicKey || key.length > 8192 || key === env.SUPABASE_SERVICE_ROLE_KEY)
    return null;
  return { supabaseUrl: browser.origin, publishableKey: key };
}
/** Only validated public/anon credentials cross into the administrator client component. */
export function adminUiConfiguration(env: Environment = process.env) {
  const configured = publicSupabaseConfiguration(env);
  return {
    supabaseUrl: configured?.supabaseUrl ?? null,
    publishableKey: configured?.publishableKey ?? null,
    localTokenAllowed: localAdminTokenEnabled(
      env.NEXT_PUBLIC_SITE_URL ?? "",
      env,
    ),
  };
}
export function requireAdminRole(identity: AdminIdentity, role: AdminRole) {
  if (role === "operator" && identity.role !== "operator")
    throw new ApiError(403, "An operator account is required for this action.");
}
function defaultProvider(): AdminAuthProvider {
  const client = database();
  if (!client)
    throw new ApiError(503, "Administrator authentication is not configured.");
  return {
    async getUser(token) {
      const { data, error } = await client.auth.getUser(token);
      if (
        error &&
        ((error.status ?? 0) >= 500 || error.name === "AuthRetryableFetchError")
      )
        throw new ApiError(
          503,
          "Administrator authentication is temporarily unavailable.",
        );
      if (error || !data.user || data.user.is_anonymous) return null;
      return { id: data.user.id };
    },
    async getMembership(id) {
      const { data, error } = await client
        .from("studio_admin_users")
        .select("role,active")
        .eq("user_id", id)
        .maybeSingle();
      if (error)
        throw new ApiError(
          503,
          "Administrator membership could not be verified.",
        );
      return data;
    },
  };
}
/** Supabase verifies identity; the private membership table, never user_metadata, grants the role. */
export async function authenticateAdmin(
  request: Request,
  role: AdminRole = "reviewer",
  provider?: AdminAuthProvider,
  env: Environment = process.env,
): Promise<AdminIdentity> {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.length > 8200)
    throw new ApiError(401, "The administrator credential is invalid.");
  const opaque = authorization.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/)?.[1];
  if (
    opaque &&
    localAdminTokenEnabled(request.url, env) &&
    tokenMatches(opaque, digest(env.ADMIN_API_TOKEN!))
  )
    return {
      kind: "local-token",
      userId: "local-development",
      role: "operator",
    };
  // Keep guest capability parsing narrow; only admin authentication accepts JWT syntax.
  const jwt = authorization.match(
    /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/,
  )?.[1];
  if (!jwt || jwt.length > 8192)
    throw new ApiError(
      401,
      "Sign in with an authorised administrator account.",
    );
  if (!supabaseAdminConfigured(env))
    throw new ApiError(
      503,
      "Supabase administrator authentication is not configured.",
    );
  const auth = provider ?? defaultProvider();
  let user;
  try {
    user = await auth.getUser(jwt);
  } catch {
    throw new ApiError(
      503,
      "Administrator authentication is temporarily unavailable.",
    );
  }
  if (!user)
    throw new ApiError(
      401,
      "The administrator session is invalid or expired. Sign in again.",
    );
  let membership;
  try {
    membership = await auth.getMembership(user.id);
  } catch {
    throw new ApiError(503, "Administrator membership could not be verified.");
  }
  if (
    !membership?.active ||
    !["reviewer", "operator"].includes(membership.role)
  )
    throw new ApiError(
      403,
      "This account does not have active studio administrator access.",
    );
  const identity: AdminIdentity = {
    kind: "supabase",
    userId: user.id,
    role: membership.role as AdminRole,
  };
  requireAdminRole(identity, role);
  return identity;
}
