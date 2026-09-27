/** Never use an incoming Host header to produce shared URLs or metadata. */
export function trustedPublicOrigin(
  value = process.env.NEXT_PUBLIC_SITE_URL,
): URL | undefined {
  try {
    const url = new URL(value || "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      /^(localhost|127\.|\[?::1\]?$)/i.test(url.hostname) ||
      url.hostname.endsWith(".local")
    )
      return undefined;
    return url;
  } catch {
    return undefined;
  }
}
