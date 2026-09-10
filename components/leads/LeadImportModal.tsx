"use client";

import { useState } from "react";
import { Upload, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ImportPanel } from "@/components/import/ImportPanel";
import { leadImportConfig } from "@/lib/import/configs/lead.config";

// Thin wrapper: the parsing/preview/result logic now lives in the shared
// ImportPanel (config-driven), so this modal just hosts the Leads config.
export function LeadImportModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4 mr-1" />
        Import Excel
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Import Leads from Excel
            </DialogTitle>
            <DialogDescription>
              Upload an .xlsx, .xls, or .csv file. All imported leads are assigned to you and can be reassigned after import.
            </DialogDescription>
          </DialogHeader>

          <ImportPanel config={leadImportConfig} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
