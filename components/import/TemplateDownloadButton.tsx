"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EntityImportConfig } from "@/lib/import/types";

// Generic ExcelJS template writer driven by config.templateColumns
// (header row, hint/notes row, sample row). Extracted from LeadImportModal.
export function TemplateDownloadButton({ config }: { config: EntityImportConfig }) {
  async function downloadTemplate() {
    const ExcelJS = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`${config.label} Template`);

    ws.addRow(config.templateColumns.map((c) => c.header));
    ws.addRow(config.templateColumns.map((c) => c.note));
    ws.addRow(config.templateColumns.map((c) => c.sample));
    config.templateColumns.forEach((_, i) => { ws.getColumn(i + 1).width = 22; });

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = config.templateFileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" size="sm" onClick={downloadTemplate}>
      <Download className="h-4 w-4 mr-1" />
      Download Template
    </Button>
  );
}
