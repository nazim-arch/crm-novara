// Shared types for the Import Hub. One EntityImportConfig drives the generic
// client ImportPanel + the per-entity template/preview, so every entity shares
// one parse/preview/result UX instead of a bespoke modal each.

/** A single header definition for the downloadable template. */
export interface TemplateColumn {
  /** Header cell text (may include a trailing * to mark required). */
  header: string;
  /** Second-row hint describing accepted values. */
  note: string;
  /** Third-row example value. */
  sample: string;
}

/** Column shown in the 5-row preview table (post-mapping, by field key). */
export interface PreviewColumn {
  field: string;
  label: string;
  required?: boolean;
}

/** Enum hint rendered in the "required columns" reference block. */
export interface EnumHint {
  label: string;
  values: string;
}

export interface EntityImportConfig {
  /** Stable entity key. */
  entity: "lead" | "opportunity" | "task" | "client";
  /** Human label (tab + copy). */
  label: string;
  /** POST endpoint that accepts `{ rows }` and returns ImportResult. */
  endpoint: string;
  /** Raw-header (normalized) → canonical field key. */
  columnMap: Record<string, string>;
  /** Field keys that must be present (mapped) for import to proceed. */
  mandatory: string[];
  /** field key → display label for mandatory fields. */
  mandatoryLabels: Record<string, string>;
  /** Template rows. */
  templateColumns: TemplateColumn[];
  /** Downloaded template filename. */
  templateFileName: string;
  /** Columns shown in the preview table. */
  previewColumns: PreviewColumn[];
  /** Enum value hints for the reference block. */
  enumHints?: EnumHint[];
  /** Optional extra note under the dropzone. */
  helpText?: string;
}

/** Canonical import result — identical to the existing lead-import shape so the
 *  result UI is universal across entities. */
export interface FailedRow {
  row: number;
  name: string;
  errors: string[];
}

export interface ImportResult {
  created: number;
  failed: FailedRow[];
}

export type ParsedRow = Record<string, string | number | undefined>;
