// Excel-friendly date parsing shared by server importers.
// Extracted from app/api/leads/bulk-update/route.ts (parseDate) so Task due-dates
// and any other imported dates handle Excel serials / DD-MM-YYYY / ISO uniformly.

/** Parse an Excel serial number, DD/MM/YYYY, DD-MM-YYYY, ISO, or Date → Date | null. */
export function parseImportDate(val: unknown): Date | null {
  if (!val && val !== 0) return null;
  // Excel serial number (days since 1899-12-30)
  if (typeof val === "number") {
    const ms = (val - 25569) * 86400 * 1000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof val === "string" && val.trim()) {
    const s = val.trim();
    // DD/MM/YYYY or DD-MM-YYYY
    const dmy = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
    if (dmy) {
      const d = new Date(`${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`);
      if (!isNaN(d.getTime())) return d;
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  return null;
}

/** Treat "", null, undefined as absent. */
export function optionalCell<T>(val: T | undefined | null | ""): T | undefined {
  if (val === null || val === undefined || val === "") return undefined;
  return val;
}
