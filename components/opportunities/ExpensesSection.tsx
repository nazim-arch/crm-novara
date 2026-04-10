"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  createExpenseSchema,
  type CreateExpenseInput,
  EXPENSE_CATEGORIES,
} from "@/lib/validations/expense";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Loader2, Receipt } from "lucide-react";

type Expense = {
  id: string;
  expense_date: Date | string;
  category: string;
  amount: number | string;
  description: string | null;
  added_by: { id: string; name: string };
};

interface ExpensesSectionProps {
  opportunityId: string;
  expenses: Expense[];
  possibleRevenue: number;
  closedRevenue: number;
  currentUserId: string;
  isAdmin: boolean;
}

function formatCurrency(n: number) {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function ExpensesSection({
  opportunityId,
  expenses,
  possibleRevenue,
  closedRevenue,
  currentUserId,
  isAdmin,
}: ExpensesSectionProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateExpenseInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createExpenseSchema) as any,
    defaultValues: {
      expense_date: new Date().toISOString().split("T")[0],
    },
  });

  const totalExpense = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const netExpectedRevenue = possibleRevenue - totalExpense;
  const netProfit = closedRevenue - totalExpense;

  async function onSubmit(data: CreateExpenseInput) {
    const res = await fetch(`/api/opportunities/${opportunityId}/expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) {
      const msg =
        result.details?.fieldErrors
          ? Object.values(result.details.fieldErrors).flat().join("; ")
          : result.error ?? "Failed to add expense";
      toast.error(msg);
      return;
    }
    toast.success("Expense added");
    reset({ expense_date: new Date().toISOString().split("T")[0] });
    setOpen(false);
    router.refresh();
  }

  async function handleDelete(expenseId: string) {
    if (!confirm("Delete this expense?")) return;
    setDeletingId(expenseId);
    try {
      const res = await fetch(
        `/api/opportunities/${opportunityId}/expenses/${expenseId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const r = await res.json();
        toast.error(r.error ?? "Failed to delete");
        return;
      }
      toast.success("Expense deleted");
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Expenses ({expenses.length})
          </CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Expense
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Expense</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
                <div className="space-y-1.5">
                  <Label>
                    Category <span className="text-destructive">*</span>
                  </Label>
                  <Select onValueChange={(v) => v && setValue("category", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.category && (
                    <p className="text-xs text-destructive">{errors.category.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="expense_date">
                    Date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="expense_date"
                    type="date"
                    {...register("expense_date")}
                  />
                  {errors.expense_date && (
                    <p className="text-xs text-destructive">{errors.expense_date.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="amount">
                    Amount (₹) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="amount"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    {...register("amount")}
                  />
                  {errors.amount && (
                    <p className="text-xs text-destructive">{errors.amount.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    rows={2}
                    placeholder="Optional notes"
                    {...register("description")}
                  />
                </div>

                <div className="flex gap-2 justify-end pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Add Expense
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Expense list */}
        {expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No expenses recorded yet
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-3">Date</th>
                  <th className="text-left py-2 px-3">Category</th>
                  <th className="text-left py-2 px-3">Description</th>
                  <th className="text-right py-2 px-3">Amount</th>
                  <th className="text-left py-2 pl-3">Added By</th>
                  <th className="py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {expenses.map((exp) => {
                  const canDelete = isAdmin || exp.added_by.id === currentUserId;
                  return (
                    <tr key={exp.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">
                        {formatDate(exp.expense_date)}
                      </td>
                      <td className="py-2 px-3 font-medium">{exp.category}</td>
                      <td className="py-2 px-3 text-muted-foreground max-w-[180px] truncate">
                        {exp.description ?? "—"}
                      </td>
                      <td className="py-2 px-3 text-right font-medium">
                        {formatCurrency(Number(exp.amount))}
                      </td>
                      <td className="py-2 pl-3 text-muted-foreground text-xs">
                        {exp.added_by.name}
                      </td>
                      <td className="py-2">
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            disabled={deletingId === exp.id}
                            onClick={() => handleDelete(exp.id)}
                          >
                            {deletingId === exp.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2">
                  <td colSpan={3} className="py-2 pr-3 text-xs text-muted-foreground font-medium text-right">
                    Total Expense
                  </td>
                  <td className="py-2 px-3 text-right font-semibold text-destructive">
                    {formatCurrency(totalExpense)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Financial summary */}
        <div className="grid grid-cols-3 gap-3 pt-2 border-t">
          <div className="p-3 rounded-lg bg-muted/40">
            <p className="text-xs text-muted-foreground mb-0.5">Total Expense</p>
            <p className="font-semibold text-destructive">
              {totalExpense > 0 ? formatCurrency(totalExpense) : "—"}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-muted/40">
            <p className="text-xs text-muted-foreground mb-0.5">Net Expected Revenue</p>
            <p className={`font-semibold ${netExpectedRevenue >= 0 ? "text-primary" : "text-destructive"}`}>
              {possibleRevenue > 0 ? formatCurrency(netExpectedRevenue) : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">Possible − Expense</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/40">
            <p className="text-xs text-muted-foreground mb-0.5">Net Profit</p>
            <p className={`font-semibold ${netProfit >= 0 ? "text-green-600" : "text-destructive"}`}>
              {closedRevenue > 0 ? formatCurrency(netProfit) : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">Closed − Expense</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
