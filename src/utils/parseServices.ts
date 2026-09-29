import { splitHostPort } from "./parseHost";
import type { Endpoint, EndpointDraft, ServiceDraft } from "../types";

/**
 * Parse a comma-separated endpoints field ("host1, host2:8080"). Entries that can't be read are
 * returned in `invalid` (verbatim) instead of being dropped, so the modal can name them.
 */
export function parseEndpoints(text: string): { endpoints: EndpointDraft[]; invalid: string[] } {
  const endpoints: EndpointDraft[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(",").map((h) => h.trim()).filter(Boolean)) {
    const ep = splitHostPort(raw);
    if (ep) endpoints.push(ep);
    else invalid.push(raw);
  }
  return { endpoints, invalid };
}

/** Inverse of `parseEndpoints` for pre-filling the edit modal. Port omitted when 443. */
export function endpointsToText(endpoints: Endpoint[]): string {
  return endpoints.map((e) => (e.port === 443 ? e.host : `${e.host}:${e.port}`)).join(", ");
}

/**
 * Parse the add-services textarea, where each non-blank line is one service:
 *   "Label: host1, host2:8080"  → { label: "Label", endpoints: [{host:"host1"}, {host:"host2",port:8080}] }
 *   "host.com"                  → { label: "host.com", endpoints: [{host:"host.com"}] }
 *
 * A line with any unreadable endpoint, or none at all, goes to `invalid` whole — nothing from it
 * is added, so a fix-and-resubmit can't duplicate the half that did parse.
 */
export function parseServiceLines(text: string): { drafts: ServiceDraft[]; invalid: string[] } {
  const drafts: ServiceDraft[] = [];
  const invalid: string[] = [];
  for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const colonIdx = line.indexOf(":");
    let rawLabel = "";
    let hostsPart = line;

    // "Label: h1, h2" — but not "h.com:8080" (port), "https://h.com" (scheme), or "h.com: …"
    // (a dot means the part before the colon is a host, not a label).
    if (colonIdx > 0) {
      const before = line.slice(0, colonIdx).trim();
      const after = line.slice(colonIdx + 1);
      const isPort = /^\d+(\/.*)?$/.test(after.trim());
      if (!isPort && !after.startsWith("//") && !before.includes(",") && !before.includes(".")) {
        rawLabel = before;
        hostsPart = after;
      }
    }

    const { endpoints, invalid: bad } = parseEndpoints(hostsPart);
    if (endpoints.length === 0 || bad.length > 0) {
      invalid.push(line);
      continue;
    }
    drafts.push({ label: rawLabel || endpoints[0].host, endpoints });
  }
  return { drafts, invalid };
}
