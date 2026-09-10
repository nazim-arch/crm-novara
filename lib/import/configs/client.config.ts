import type { EntityImportConfig } from "@/lib/import/types";

// Greenfield client import. Only name is required; dedup is by case-insensitive
// name (and contact_email when present).
export const clientImportConfig: EntityImportConfig = {
  entity: "client",
  label: "Clients",
  endpoint: "/api/clients/import",
  columnMap: {
    "name": "name",
    "client": "name",
    "client name": "name",
    "company": "name",
    "industry": "industry",
    "sector": "industry",
    "contact person": "contact_person",
    "contact_person": "contact_person",
    "contact name": "contact_person",
    "contact email": "contact_email",
    "contact_email": "contact_email",
    "email": "contact_email",
    "contact phone": "contact_phone",
    "contact_phone": "contact_phone",
    "phone": "contact_phone",
    "notes": "notes",
    "remarks": "notes",
  },
  mandatory: ["name"],
  mandatoryLabels: {
    name: "Name",
  },
  templateColumns: [
    { header: "Name*", note: "Client / company name", sample: "Acme Realty" },
    { header: "Industry", note: "Optional", sample: "Real Estate" },
    { header: "Contact Person", note: "Optional", sample: "Priya Sharma" },
    { header: "Contact Email", note: "Optional (validated)", sample: "priya@acme.com" },
    { header: "Contact Phone", note: "Optional; if given must include +91 (e.g. +919876543210)", sample: "+919876543210" },
    { header: "Notes", note: "Optional", sample: "" },
  ],
  templateFileName: "clients_import_template.xlsx",
  previewColumns: [
    { field: "name", label: "Name", required: true },
    { field: "industry", label: "Industry" },
    { field: "contact_person", label: "Contact" },
    { field: "contact_email", label: "Email" },
    { field: "contact_phone", label: "Phone" },
  ],
  helpText: "Duplicate clients (same name, or same contact email) are skipped.",
};
