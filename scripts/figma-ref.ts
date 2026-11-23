/**
 * figma-ref.ts — a Figma URL's file key and node id, for the Figma MCP's reads and for pull
 * request references. Pure: no I/O. Figma is the source of truth for UI design; a link is
 * kept verbatim and never turned into a copy of the design.
 */

/** `https://www.figma.com/design/<key>/<name>?node-id=42-7` → `{ file_key, node_id: "42:7" }`. */
export function figmaTarget(url: string | null | undefined): { url: string; file_key: string; node_id: string | null } | null {
  if (!url) return null;
  const m = /^https:\/\/(?:www\.)?figma\.com\/(?:design|file|proto|board)\/([A-Za-z0-9]+)(?:\/[^?#]*)?(?:\?([^#]*))?/.exec(url.trim());
  if (m === null) return null;
  const node = new URLSearchParams(m[2] ?? "").get("node-id");
  return { url: url.trim(), file_key: m[1], node_id: node ? node.replace(/-/g, ":") : null };
}
