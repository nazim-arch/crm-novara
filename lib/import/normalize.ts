// Header/cell normalization shared by every Import Hub entity.
// Extracted verbatim from components/leads/LeadImportModal.tsx so all importers
// map headers and coerce ExcelJS cell values identically.

/** Coerce an ExcelJS cell value (richText / formula result / date / primitive)
 *  into a plain string or number. */
export function normalizeCellValue(v: unknown): string | number {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().split("T")[0];
  if (typeof v === "object") {
    if ("richText" in v) return (v as { richText: Array<{ text: string }> }).richText.map((r) => r.text).join("");
    if ("result" in v) return normalizeCellValue((v as { result: unknown }).result);
    if ("text" in v && typeof (v as { text: unknown }).text === "string") return (v as { text: string }).text;
    if ("error" in v) return "";
  }
  return String(v);
}

/** Lowercase + collapse whitespace so header aliases match loosely. */
export function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Map raw sheet headers → canonical field keys using an entity's columnMap. */
export function mapHeaders(rawHeaders: string[], columnMap: Record<string, string>): Record<string, string> {
  const map: Record<string, string> = {};
  for (const h of rawHeaders) {
    const key = columnMap[normalizeHeader(h)];
    if (key) map[h] = key;
  }
  return map;
}
