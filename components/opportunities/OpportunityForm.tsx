"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createOpportunitySchema,
  type CreateOpportunityInput,
} from "@/lib/validations/opportunity";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Plus, Trash2 } from "lucide-react";

type PropertyType = CreateOpportunityInput["property_type"];

const CONFIG_LABEL_PLACEHOLDER: Record<PropertyType, string> = {
  Apartment: "e.g. 2BHK, 3BHK",
  Residential: "e.g. 2BHK, Villa Unit",
  Villa: "e.g. 3BHK Villa",
  Plot: "e.g. 30×40, 500 sqft",
  Commercial: "e.g. Shop, Showroom",
  Office: "e.g. Unit A, Suite 101",
};

function formatCurrency(n: number) {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

interface ExistingConfig {
  id: string;
  label: string;
  number_of_units: number;
  price_per_unit: number | string;
}

interface OpportunityFormProps {
  defaultValues?: Partial<CreateOpportunityInput>;
  existingConfigurations?: ExistingConfig[];
  opportunityId?: string;
}

export function OpportunityForm({
  defaultValues,
  existingConfigurations,
  opportunityId,
}: OpportunityFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const isEditing = !!opportunityId;

  const initialConfigs =
    existingConfigurations && existingConfigurations.length > 0
      ? existingConfigurations.map((c) => ({
          id: c.id,
          label: c.label,
          number_of_units: c.number_of_units,
          price_per_unit: Number(c.price_per_unit),
        }))
      : [{ label: "", number_of_units: 1, price_per_unit: 0 }];

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<CreateOpportunityInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createOpportunitySchema) as any,
    defaultValues: {
      status: "Active",
      ...defaultValues,
      configurations: initialConfigs,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "configurations",
  });

  const propertyType = watch("property_type");
  const commissionPercent = watch("commission_percent");
  const configurations = watch("configurations");

  const totalSalesValue = (configurations ?? []).reduce((sum, row) => {
    const units = Number(row.number_of_units) || 0;
    const price = Number(row.price_per_unit) || 0;
    return sum + units * price;
  }, 0);

  const possibleRevenue =
    totalSalesValue > 0 && Number(commissionPercent) > 0
      ? (totalSalesValue * Number(commissionPercent)) / 100
      : 0;

  const labelPlaceholder =
    propertyType ? CONFIG_LABEL_PLACEHOLDER[propertyType] : "e.g. 2BHK, Plot";

  const onSubmit = async (data: CreateOpportunityInput) => {
    setLoading(true);
    try {
      const url = isEditing
        ? `/api/opportunities/${opportunityId}`
        : "/api/opportunities";
      const method = isEditing ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await res.json();
      if (!res.ok) {
        const msg =
          result.details?.fieldErrors
            ? Object.values(result.details.fieldErrors).flat().join("; ")
            : result.error ?? "Failed to save";
        toast.error(msg);
        return;
      }

      toast.success(isEditing ? "Opportunity updated" : "Opportunity created");
      router.push(`/opportunities/${result.data.id}`);
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* ── Section 1: Basic Info ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Basic Info
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="name">
              Opportunity Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              {...register("name")}
              placeholder="e.g. Skyline Heights – Phase 1"
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project">
              Project <span className="text-destructive">*</span>
            </Label>
            <Input
              id="project"
              {...register("project")}
              placeholder="Project name"
            />
            {errors.project && (
              <p className="text-xs text-destructive">{errors.project.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="developer">Developer</Label>
            <Input id="developer" {...register("developer")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="location">
              Location <span className="text-destructive">*</span>
            </Label>
            <Input
              id="location"
              {...register("location")}
              placeholder="e.g. Wakad, Pune"
            />
            {errors.location && (
              <p className="text-xs text-destructive">{errors.location.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>
              Property Type <span className="text-destructive">*</span>
            </Label>
            <Select
              defaultValue={defaultValues?.property_type}
              onValueChange={(v) =>
                v && setValue("property_type", v as PropertyType)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Apartment">Apartment</SelectItem>
                <SelectItem value="Residential">Residential</SelectItem>
                <SelectItem value="Villa">Villa</SelectItem>
                <SelectItem value="Plot">Plot</SelectItem>
                <SelectItem value="Commercial">Commercial</SelectItem>
                <SelectItem value="Office">Office</SelectItem>
              </SelectContent>
            </Select>
            {errors.property_type && (
              <p className="text-xs text-destructive">
                {errors.property_type.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              defaultValue={defaultValues?.status ?? "Active"}
              onValueChange={(v) =>
                v && setValue("status", v as "Active" | "Inactive" | "Sold")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
                <SelectItem value="Sold">Sold</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2: Revenue Model ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Revenue Model
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="commission_percent">
              Commission % <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="commission_percent"
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder="e.g. 2.5"
                {...register("commission_percent")}
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
            {errors.commission_percent && (
              <p className="text-xs text-destructive">
                {errors.commission_percent.message}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Percentage of total sales value earned as commission
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 3: Configurations ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Inventory / Configurations{" "}
              <span className="text-destructive">*</span>
            </CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                append({ label: "", number_of_units: 1, price_per_unit: 0 })
              }
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Row
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {errors.configurations?.root && (
            <p className="text-xs text-destructive">
              {errors.configurations.root.message}
            </p>
          )}
          {errors.configurations?.message && (
            <p className="text-xs text-destructive">
              {errors.configurations.message}
            </p>
          )}

          {/* Table header */}
          <div className="grid grid-cols-[1fr_80px_140px_120px_36px] gap-2 text-xs font-medium text-muted-foreground px-1">
            <span>
              {propertyType === "Plot" ? "Plot Size / Label" : "Unit Type / Label"}
            </span>
            <span>Units</span>
            <span>Price / Unit (₹)</span>
            <span>Row Total</span>
            <span />
          </div>

          {fields.map((field, index) => {
            const units = Number(watch(`configurations.${index}.number_of_units`)) || 0;
            const price = Number(watch(`configurations.${index}.price_per_unit`)) || 0;
            const rowTotal = units * price;

            return (
              <div
                key={field.id}
                className="grid grid-cols-[1fr_80px_140px_120px_36px] gap-2 items-start"
              >
                <div>
                  <Input
                    placeholder={labelPlaceholder}
                    {...register(`configurations.${index}.label`)}
                  />
                  {errors.configurations?.[index]?.label && (
                    <p className="text-xs text-destructive mt-0.5">
                      {errors.configurations[index]?.label?.message}
                    </p>
                  )}
                </div>
                <div>
                  <Input
                    type="number"
                    min="1"
                    placeholder="1"
                    {...register(`configurations.${index}.number_of_units`)}
                  />
                  {errors.configurations?.[index]?.number_of_units && (
                    <p className="text-xs text-destructive mt-0.5">
                      {errors.configurations[index]?.number_of_units?.message}
                    </p>
                  )}
                </div>
                <div>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    {...register(`configurations.${index}.price_per_unit`)}
                  />
                  {errors.configurations?.[index]?.price_per_unit && (
                    <p className="text-xs text-destructive mt-0.5">
                      {errors.configurations[index]?.price_per_unit?.message}
                    </p>
                  )}
                </div>
                <div className="h-9 px-2 flex items-center text-sm font-medium text-muted-foreground">
                  {rowTotal > 0 ? formatCurrency(rowTotal) : "—"}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    if (fields.length > 1) remove(index);
                    else toast.error("At least one configuration row is required");
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Section 4: Summary ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-muted/40 border">
              <p className="text-xs text-muted-foreground mb-1">
                Total Sales Value
              </p>
              <p className="text-lg font-semibold">
                {totalSalesValue > 0 ? formatCurrency(totalSalesValue) : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sum of all row totals
              </p>
            </div>
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-xs text-muted-foreground mb-1">
                Possible Revenue
              </p>
              <p className="text-lg font-semibold text-primary">
                {possibleRevenue > 0 ? formatCurrency(possibleRevenue) : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {Number(commissionPercent) > 0
                  ? `${commissionPercent}% of total sales value`
                  : "Set commission % above"}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" {...register("notes")} rows={3} />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3 justify-end">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? "Update Opportunity" : "Create Opportunity"}
        </Button>
      </div>
    </form>
  );
}
