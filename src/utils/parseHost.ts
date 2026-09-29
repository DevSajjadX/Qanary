import type { EndpointDraft } from "../types";

/**
 * Normalise any messy host string into a clean `host` or `host/path`.
 *
 * Handles: markdown links, https://, http://, www., /*, trailing slashes.
 * Wildcard host prefixes (`*.`) are preserved — the backend synthesises a concrete
 * subdomain at probe time. Subdomains and paths are also preserved.
 *
 * Examples:
 *   "[https://google.com/](https://goog.com/)" → "goog.com"
 *   "https://www.google.com/"                  → "google.com"
 *   "*.google.com"                             → "*.google.com"  (preserved)
 *   "google.com/*"                             → "google.com"
 *   "docs.google.com"                          → "docs.google.com"
 *   "google.com/inbox"                         → "google.com/inbox"
 */
/** Parse one user-entered endpoint (`host`, `host:port`, or a pasted URL) into a draft.
 *  Runs parseHost first to strip markdown/scheme/www, then drops any path/query/fragment
 *  (an endpoint is host + port only) and splits a trailing `:port`.
 *  Returns null for what it can't read: an out-of-range port, IPv6 (not supported by the probe
 *  yet), or leftovers with a stray colon. Whether the host itself is valid is the backend's
 *  call (`store::validate_endpoint`) — this only parses shape. */
export function splitHostPort(raw: string): EndpointDraft | null {
  const cleaned = parseHost(raw).replace(/[/?#].*$/, "");
  const m = cleaned.match(/^([^:[\]]+):(\d+)$/);
  if (m) {
    const port = Number(m[2]);
    return port >= 1 && port <= 65535 ? { host: m[1], port } : null;
  }
  if (!cleaned || /[:[\]]/.test(cleaned)) return null;
  return { host: cleaned };
}

export function parseHost(raw: string): string {
  let s = raw.trim();
  // [text](url) → extract url from parens
  const md = s.match(/\[.*?\]\(([^)]+)\)/);
  if (md) s = md[1].trim();
  s = s.replace(/^https?:\/\//i, "").replace(/^\/\//, ""); // strip scheme (case-insensitive)
  s = s.replace(/^www\./, "");                             // strip www.
  s = s.replace(/\/\*$/, "");                              // strip wildcard path
  s = s.replace(/\/$/, "");                                // strip trailing slash
  return s;
}
