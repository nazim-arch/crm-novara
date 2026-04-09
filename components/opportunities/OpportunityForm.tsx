"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createOpportunitySchema, type CreateOpportunityInput } from "@/lib/validations/opportunity";
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
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";

const UNIT_TYPES = ["Studio", "1BHK", "2BHK", "3BHK", "4BHK", "5BHK", "Penthouse", "Villa", "Commercial", "Office", "Plot"];

interface OpportunityFormProps {
  defaultValues?: Partial<CreateOpportunityInput>;
  opportunityId?: string;
}

export function OpportunityForm({ defaultValues, opportunityId }: OpportunityFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [selectedUnitTypes, setSelectedUnitTypes] = useState<string[]>(
    defaultValues?.unit_types ?? []
  );
  const isEditing = !!opportunityId;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateOpportunityInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createOpportunitySchema) as any,
    defaultValues: {
      commission_type: "Percentage",
      status: "Active",
      ...defaultValues,
    },
  });

  const commissionType = watch("commission_type");
  const unitValue = watch("unit_value");
  const numberOfUnits = watch("number_of_units");
  const commissionPercent = watch("commission_percent");

  // Computed financial values
  const totalSalesValue = unitValue && numberOfUnits ? Number(unitValue) * Number(numberOfUnits) : null;
  const possibleRevenue = totalSalesValue && commissionPercent ? totalSalesValue * Number(commissionPercent) / 100 : null;

  useEffect(() => {
    if (totalSalesValue !== null) setValue("total_sales_value", totalSalesValue);
    if (possibleRevenue !== null) setValue("possible_revenue", possibleRevenue);
  }, [totalSalesValue, possibleRevenue, setValue]);

  const toggleUnitType = (type: string) => {
    const updated = selectedUnitTypes.includes(type)
      ? selectedUnitTypes.filter((t) => t !== type)
      : [...selectedUnitTypes, type];
    setSelectedUnitTypes(updated);
    setValue("unit_types", updated);
  };

  const onSubmit = async (data: CreateOpportunityInput) => {
    setLoading(true);
    try {
      const url = isEditing ? `/api/opportunities/${opportunityId}` : "/api/opportunities";
      const method = isEditing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, unit_types: selectedUnitTypes }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error ?? "Failed to save");
        return;
      }
      toast.success(isEditing ? "Opportunity updated" : "Opportunity created");
      router.push(`/opportunities/${result.data.id}`);
      router.refresh();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Opportunity Name *</Label>
              <Input id="name" {...register("name")} placeholder="e.g. Skyline Heights - Phase 1" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project">Project *</Label>
              <Input id="project" {...register("project")} placeholder="Project name" />
              {errors.project && <p className="text-xs text-destructive">{errors.project.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="developer">Developer</Label>
              <Input id="developer" {...register("developer")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sector">Sector</Label>
              <Input id="sector" {...register("sector")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="location">Location *</Label>
              <Input id="location" {...register("location")} placeholder="e.g. Wakad, Pune" />
              {errors.location && <p className="text-xs text-destructive">{errors.location.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Property Type *</Label>
              <Select
                defaultValue={defaultValues?.property_type}
                onValueChange={(v) => v && setValue("property_type", v as CreateOpportunityInput["property_type"])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Residential">Residential</SelectItem>
                  <SelectItem value="Commercial">Commercial</SelectItem>
                  <SelectItem value="Plot">Plot</SelectItem>
                  <SelectItem value="Villa">Villa</SelectItem>
                  <SelectItem value="Apartment">Apartment</SelectItem>
                  <SelectItem value="Office">Office</SelectItem>
                </SelectContent>
              </Select>
              {errors.property_type && <p className="text-xs text-destructive">{errors.property_type.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="price_min">Price Min (₹)</Label>
              <Input id="price_min" type="number" {...register("price_min")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="price_max">Price Max (₹)</Label>
              <Input id="price_max" type="number" {...register("price_max")} />
            </div>
            <div className="space-y-1.5">
              <Label>Commission Type</Label>
              <Select
                defaultValue="Percentage"
                onValueChange={(v) => setValue("commission_type", v as "Fixed" | "Percentage")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Percentage">Percentage (%)</SelectItem>
                  <SelectItem value="Fixed">Fixed (₹)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="commission_value">
                Commission Value * {commissionType === "Percentage" ? "(%)" : "(₹)"}
              </Label>
              <Input id="commission_value" type="number" step="0.01" {...register("commission_value")} />
              {errors.commission_value && <p className="text-xs text-destructive">{errors.commission_value.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                defaultValue="Active"
                onValueChange={(v) => setValue("status", v as "Active" | "Inactive" | "Sold")}
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
          </div>

          <div className="space-y-2">
            <Label>Unit Types *</Label>
            <div className="flex flex-wrap gap-2">
              {UNIT_TYPES.map((type) => (
                <label key={type} className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    checked={selectedUnitTypes.includes(type)}
                    onCheckedChange={() => toggleUnitType(type)}
                  />
                  <span className="text-sm">{type}</span>
                </label>
              ))}
            </div>
            {errors.unit_types && <p className="text-xs text-destructive">{errors.unit_types.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" {...register("notes")} rows={3} />
          </div>

          {/* Financial Model */}
          <div className="pt-2">
            <p className="text-sm font-medium mb-3 text-muted-foreground uppercase tracking-wide">Financial Model</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="opportunity_source">Opportunity Source</Label>
                <Input id="opportunity_source" {...register("opportunity_source")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unit_value">Unit Value (₹)</Label>
                <Input id="unit_value" type="number" {...register("unit_value")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="number_of_units">Number of Units</Label>
                <Input id="number_of_units" type="number" {...register("number_of_units")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="commission_percent">Commission % (Revenue)</Label>
                <Input id="commission_percent" type="number" step="0.01" {...register("commission_percent")} />
              </div>
            </div>

            {(totalSalesValue !== null || possibleRevenue !== null) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                {totalSalesValue !== null && (
                  <div className="space-y-1.5">
                    <Label>Total Sales Value (computed)</Label>
                    <div className="h-9 px-3 flex items-center border rounded-md bg-muted text-sm font-medium">
                      ₹{totalSalesValue.toLocaleString("en-IN")}
                    </div>
                  </div>
                )}
                {possibleRevenue !== null && (
                  <div className="space-y-1.5">
                    <Label>Possible Revenue (computed)</Label>
                    <div className="h-9 px-3 flex items-center border rounded-md bg-muted text-sm font-medium">
                      ₹{possibleRevenue.toLocaleString("en-IN")}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
              <div className="space-y-1.5">
                <Label htmlFor="closed_revenue">Closed Revenue (₹)</Label>
                <Input id="closed_revenue" type="number" {...register("closed_revenue")} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3 mt-4 justify-end">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? "Update" : "Create Opportunity"}
        </Button>
      </div>
    </form>
  );
}
