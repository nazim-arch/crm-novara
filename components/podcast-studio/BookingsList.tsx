"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, Download, MoreHorizontal, Plus, ChevronLeft, ChevronRight, Loader2, Eye, Edit, Copy, Trash2 } from "lucide-react";
import { formatTimeDisplay, formatDateDisplay } from "@/lib/podcast-studio";

type Booking = {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  client_name: string;
  phone?: string | null;
  notes?: string | null;
  recording_hours?: number | null;
  recording_value?: number | null;
  editing_hours?: number | null;
  editing_value?: number | null;
  gst_percent: number;
  base_amount: number;
  gst_amount: number;
  total_revenue: number;
  status: string;
};

const MONTH_OPTIONS = (() => {
  const opts: { label: string; value: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push({
      label: d.toLocaleString("en-IN", { month: "long", year: "numeric" }),
      value: d.toISOString().slice(0, 7),
    });
  }
  return opts;
})();

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap",
      status === "Confirmed" && "bg-emerald-100 text-emerald-700",
      status === "Cancelled" && "bg-red-100 text-red-700",
      status === "Completed" && "bg-blue-100 text-blue-700",
    )}>
      {status}
    </span>
  );
}

export function BookingsList() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewBooking, setViewBooking] = useState<Booking | null>(null);
  const limit = 20;

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        ...(search && { search }),
        ...(statusFilter !== "all" && { status: statusFilter }),
        ...(monthFilter !== "all" && { month: monthFilter }),
      });
      const res = await fetch(`/api/podcast-studio/bookings?${params}`);
      if (res.ok) {
        const json = await res.json();
        setBookings(json.data);
        setTotal(json.meta.total);
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, monthFilter]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);
  useEffect(() => { setPage(1); }, [search, statusFilter, monthFilter]);

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await fetch(`/api/podcast-studio/bookings/${deleteId}`, { method: "DELETE" });
      setDeleteId(null);
      fetchBookings();
    } finally {
      setDeleting(false);
    }
  }

  function handleDuplicate(b: Booking) {
    router.push(`/podcast-studio/bookings/new?date=${b.booking_date}&time=${b.start_time}`);
  }

  function exportCSV() {
    if (!bookings.length) return;
    const headers = [
      "Date","Start","End","Duration (min)","Client","Phone",
      "Recording Hrs","Recording Value","Editing Hrs","Editing Value",
      "Base Amount","GST %","GST Amount","Total Revenue","Status","Notes",
    ];
    const rows = bookings.map(b => [
      b.booking_date, b.start_time, b.end_time, b.duration_minutes,
      b.client_name, b.phone ?? "",
      b.recording_hours ?? "", b.recording_value ?? "",
      b.editing_hours ?? "", b.editing_value ?? "",
      b.base_amount, b.gst_percent, b.gst_amount, b.total_revenue,
      b.status, (b.notes ?? "").replace(/,/g, ";"),
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `podcast-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const activeBookings = bookings.filter(b => b.status !== "Cancelled");
  const summaryRevenue = activeBookings.reduce((s, b) => s + Number(b.total_revenue), 0);
  const summaryBase = activeBookings.reduce((s, b) => s + Number(b.base_amount), 0);
  const summaryHours = activeBookings.reduce((s, b) => s + b.duration_minutes, 0) / 60;

  const pages = Math.ceil(total / limit);

  return (
    <div className="space-y-5">
      {/* Revenue Summary Strip */}
      {activeBookings.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Sessions (this view)", value: String(activeBookings.length) },
            { label: "Total Hours", value: summaryHours.toFixed(1) },
            { label: "Base Revenue", value: `₹${summaryBase.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` },
            { label: "Total Revenue (incl. GST)", value: `₹${summaryRevenue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` },
          ].map(item => (
            <div key={item.label} className="bg-violet-50 border border-violet-100 rounded-lg px-4 py-3">
              <p className="text-[11px] text-violet-600 font-medium">{item.label}</p>
              <p className="text-lg font-bold text-violet-900 mt-0.5">{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search client name or phone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v ?? "all")}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Confirmed">Confirmed</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
            <SelectItem value="Cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={monthFilter} onValueChange={v => setMonthFilter(v ?? "all")}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Months</SelectItem>
            {MONTH_OPTIONS.map(m => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={exportCSV} title="Export CSV">
          <Download className="h-4 w-4" />
        </Button>
        <Button className="bg-violet-600 hover:bg-violet-700 text-white" render={<Link href="/podcast-studio/bookings/new" />}>
          <Plus className="h-4 w-4 mr-1.5" /> New
        </Button>
      </div>

      {/* Table */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="whitespace-nowrap">Date</TableHead>
                <TableHead className="whitespace-nowrap">Time</TableHead>
                <TableHead className="whitespace-nowrap">Duration</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="whitespace-nowrap hidden sm:table-cell">Phone</TableHead>
                <TableHead className="whitespace-nowrap text-right">Rec. Value</TableHead>
                <TableHead className="whitespace-nowrap text-right">Edit. Value</TableHead>
                <TableHead className="whitespace-nowrap text-right">Base</TableHead>
                <TableHead className="whitespace-nowrap text-right hidden lg:table-cell">GST %</TableHead>
                <TableHead className="whitespace-nowrap text-right hidden lg:table-cell">GST Amt</TableHead>
                <TableHead className="whitespace-nowrap text-right font-semibold">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={13} className="text-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : bookings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} className="text-center py-16">
                    <div className="space-y-2">
                      <p className="text-muted-foreground font-medium">No bookings found</p>
                      <p className="text-sm text-muted-foreground">Try adjusting your filters or create a new booking</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                bookings.map(b => (
                  <TableRow key={b.id} className="hover:bg-muted/30">
                    <TableCell className="whitespace-nowrap text-sm font-medium">{formatDateDisplay(b.booking_date)}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatTimeDisplay(b.start_time)} – {formatTimeDisplay(b.end_time)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{b.duration_minutes} min</TableCell>
                    <TableCell className="font-medium max-w-[140px] truncate">{b.client_name}</TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{b.phone ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm">{b.recording_value ? `₹${Number(b.recording_value).toLocaleString("en-IN")}` : "—"}</TableCell>
                    <TableCell className="text-right text-sm">{b.editing_value ? `₹${Number(b.editing_value).toLocaleString("en-IN")}` : "—"}</TableCell>
                    <TableCell className="text-right text-sm font-medium">₹{Number(b.base_amount).toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-right text-sm hidden lg:table-cell">{Number(b.gst_percent)}%</TableCell>
                    <TableCell className="text-right text-sm hidden lg:table-cell">₹{Number(b.gst_amount).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</TableCell>
                    <TableCell className="text-right font-semibold text-violet-700 whitespace-nowrap">
                      ₹{Number(b.total_revenue).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </TableCell>
                    <TableCell><StatusBadge status={b.status} /></TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger>
                          <Button variant="ghost" size="icon-sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewBooking(b)}>
                            <Eye className="h-4 w-4 mr-2" /> View
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => router.push(`/podcast-studio/bookings/${b.id}/edit`)}>
                            <Edit className="h-4 w-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicate(b)}>
                            <Copy className="h-4 w-4 mr-2" /> Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(b.id)}>
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} bookings · Page {page} of {pages}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon-sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Booking</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The booking will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View detail modal */}
      {viewBooking && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setViewBooking(null)}>
          <div className="bg-background rounded-2xl border shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">{viewBooking.client_name}</h3>
              <StatusBadge status={viewBooking.status} />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-muted-foreground text-xs mb-0.5">Date</p><p className="font-medium">{formatDateDisplay(viewBooking.booking_date)}</p></div>
              <div><p className="text-muted-foreground text-xs mb-0.5">Duration</p><p className="font-medium">{viewBooking.duration_minutes} min</p></div>
              <div><p className="text-muted-foreground text-xs mb-0.5">Start</p><p className="font-medium">{formatTimeDisplay(viewBooking.start_time)}</p></div>
              <div><p className="text-muted-foreground text-xs mb-0.5">End</p><p className="font-medium">{formatTimeDisplay(viewBooking.end_time)}</p></div>
              {viewBooking.phone && <div className="col-span-2"><p className="text-muted-foreground text-xs mb-0.5">Phone</p><p className="font-medium">{viewBooking.phone}</p></div>}
              {viewBooking.notes && <div className="col-span-2"><p className="text-muted-foreground text-xs mb-0.5">Notes</p><p className="text-sm">{viewBooking.notes}</p></div>}
            </div>
            <div className="border-t pt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Recording</span><span>{viewBooking.recording_hours ? `${viewBooking.recording_hours} hrs` : "—"} · ₹{Number(viewBooking.recording_value ?? 0).toLocaleString("en-IN")}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Editing</span><span>{viewBooking.editing_hours ? `${viewBooking.editing_hours} hrs` : "—"} · ₹{Number(viewBooking.editing_value ?? 0).toLocaleString("en-IN")}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Base Amount</span><span className="font-medium">₹{Number(viewBooking.base_amount).toLocaleString("en-IN")}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">GST ({viewBooking.gst_percent}%)</span><span>₹{Number(viewBooking.gst_amount).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span></div>
              <div className="flex justify-between font-bold border-t pt-2"><span>Total Revenue</span><span className="text-violet-700">₹{Number(viewBooking.total_revenue).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span></div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => { router.push(`/podcast-studio/bookings/${viewBooking.id}/edit`); setViewBooking(null); }}>
                <Edit className="h-4 w-4 mr-1.5" /> Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setViewBooking(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
