"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createLeadSchema, type CreateLeadInput } from "@/lib/validations/lead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DuplicateWarningModal } from "./DuplicateWarningModal";
import { Loader2 } from "lucide-react";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";

type User = { id: string; name: string; role: string };

interface LeadFormProps {
  users: User[];
  currentUserId: string;
  defaultValues?: Partial<CreateLeadInput>;
  leadId?: string;
}

const LEAD_SOURCES = [
  "Website", "Facebook", "Instagram", "Google Ads",
  "Referral", "Walk-in", "Cold Call", "Exhibition", "WhatsApp", "Other",
];

export function LeadForm({ users, currentUserId, defaultValues, leadId }: LeadFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState<CreateLeadInput | null>(null);
  const [duplicateData, setDuplicateData] = useState<{
    exact_matches: { id: string; lead_number: string; full_name: string; phone: string; email: string | null; status: string; temperature: string }[];
    name_similar: { id: string; lead_number: string; full_name: string; phone: string; email: string | null; status: string; temperature: string }[];
  }>({ exact_matches: [], name_similar: [] });

  const isEditing = !!leadId;
  const [scheduleFollowup, setScheduleFollowup] = useState(false);
  const [followupDate, setFollowupDate] = useState("");
  const [followupType, setFollowupType] = useState("Call");

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateLeadInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createLeadSchema) as any,
    defaultValues: {
      lead_owner_id: currentUserId,
      assigned_to_id: currentUserId,
      temperature: "Cold",
      ...defaultValues,
    },
  });

  const phone = watch("phone");
  const email = watch("email");
  const fullName = watch("full_name");

  const checkDuplicates = useDebouncedCallback(
    async (p: string, e: string, n: string) => {
      if (!p && !e && !n) return;
      try {
        const params = new URLSearchParams();
        if (p) params.set("phone", p);
        if (e) params.set("email", e);
        if (n) params.set("name", n);
        const res = await fetch(`/api/leads/check-duplicate?${params}`);
        const data = await res.json();
        if (data.has_duplicates) {
          setDuplicateData({
            exact_matches: data.exact_matches,
            name_similar: data.name_similar,
          });
        }
      } catch {
        // silent
      }
    },
    600
  );

  useEffect(() => {
    if (!isEditing) {
      checkDuplicates(phone ?? "", email ?? "", fullName ?? "");
    }
  }, [phone, email, fullName, isEditing, checkDuplicates]);

  const submitLead = async (data: CreateLeadInput, skipDuplicateCheck = false) => {
    if (!skipDuplicateCheck && !isEditing) {
      const params = new URLSearchParams();
      if (data.phone) params.set("phone", data.phone);
      if (data.email) params.set("email", data.email ?? "");
      if (data.full_name) params.set("name", data.full_name);
      const res = await fetch(`/api/leads/check-duplicate?${params}`);
      const dupeData = await res.json();
      if (dupeData.has_duplicates) {
        setDuplicateData({
          exact_matches: dupeData.exact_matches,
          name_similar: dupeData.name_similar,
        });
        setPendingSubmit(data);
        setShowDuplicates(true);
        return;
      }
    }

    setLoading(true);
    try {
      const url = isEditing ? `/api/leads/${leadId}` : "/api/leads";
      const method = isEditing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error ?? "Failed to save lead");
        return;
      }
      toast.success(isEditing ? "Lead updated" : "Lead created");

      // Schedule follow-up if requested (new leads only)
      if (!isEditing && scheduleFollowup && followupDate && result.data?.id) {
        try {
          await fetch("/api/follow-ups", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lead_id: result.data.id,
              scheduled_at: followupDate,
              type: followupType,
            }),
          });
          toast.success("Follow-up scheduled");
        } catch {
          toast.error("Lead created but follow-up scheduling failed");
        }
      }

      router.push(`/leads/${result.data.id}`);
      router.refresh();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit((data) => submitLead(data))}>
        <Tabs defaultValue="basic">
          <TabsList className="mb-4">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="requirement">Requirement</TabsTrigger>
            <TabsTrigger value="followup">Follow-up</TabsTrigger>
          </TabsList>

          {/* Basic Info Tab */}
          <TabsContent value="basic">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contact Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="full_name">Full Name *</Label>
                    <Input id="full_name" {...register("full_name")} />
                    {errors.full_name && (
                      <p className="text-xs text-destructive">{errors.full_name.message}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Phone *</Label>
                    <Input id="phone" type="tel" {...register("phone")} />
                    {errors.phone && (
                      <p className="text-xs text-destructive">{errors.phone.message}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" {...register("email")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="whatsapp">WhatsApp</Label>
                    <Input id="whatsapp" type="tel" {...register("whatsapp")} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <Label>Lead Source *</Label>
                    <Select
                      defaultValue={defaultValues?.lead_source}
                      onValueChange={(v) => v && setValue("lead_source", v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select source" />
                      </SelectTrigger>
                      <SelectContent>
                        {LEAD_SOURCES.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.lead_source && (
                      <p className="text-xs text-destructive">{errors.lead_source.message}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Temperature *</Label>
                    <Select
                      defaultValue={defaultValues?.temperature ?? "Cold"}
                      onValueChange={(v) => v && setValue("temperature", v as CreateLeadInput["temperature"])}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Hot">🔥 Hot</SelectItem>
                        <SelectItem value="Warm">☀️ Warm</SelectItem>
                        <SelectItem value="Cold">❄️ Cold</SelectItem>
                        <SelectItem value="FollowUpLater">Later</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Lead Owner *</Label>
                    <Select
                      defaultValue={defaultValues?.lead_owner_id ?? currentUserId}
                      onValueChange={(v) => v && setValue("lead_owner_id", v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.lead_owner_id && (
                      <p className="text-xs text-destructive">{errors.lead_owner_id.message}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Assigned To *</Label>
                    <Select
                      defaultValue={defaultValues?.assigned_to_id ?? currentUserId}
                      onValueChange={(v) => v && setValue("assigned_to_id", v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.assigned_to_id && (
                      <p className="text-xs text-destructive">{errors.assigned_to_id.message}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="campaign_source">Campaign Source</Label>
                    <Input id="campaign_source" {...register("campaign_source")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="referral_source">Referral Source</Label>
                    <Input id="referral_source" {...register("referral_source")} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Requirement Tab */}
          <TabsContent value="requirement">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Property Requirement</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Property Type</Label>
                    <Select
                      defaultValue={defaultValues?.property_type}
                      onValueChange={(v) => v && setValue("property_type", v as CreateLeadInput["property_type"])}
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
                  </div>
                  <div className="space-y-1.5">
                    <Label>Purpose</Label>
                    <Select
                      defaultValue={defaultValues?.purpose}
                      onValueChange={(v) => v && setValue("purpose", v as CreateLeadInput["purpose"])}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select purpose" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EndUse">End Use</SelectItem>
                        <SelectItem value="Investment">Investment</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="location_preference">Location Preference</Label>
                    <Input id="location_preference" {...register("location_preference")} placeholder="e.g. Wakad, Pune" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="unit_type">Unit Type</Label>
                    <Input id="unit_type" {...register("unit_type")} placeholder="e.g. 2BHK, 3BHK" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="budget_min">Budget Min (₹)</Label>
                    <Input id="budget_min" type="number" {...register("budget_min")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="budget_max">Budget Max (₹)</Label>
                    <Input id="budget_max" type="number" {...register("budget_max")} />
                    {errors.budget_min && (
                      <p className="text-xs text-destructive">{errors.budget_min.message}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="timeline_to_buy">Timeline to Buy</Label>
                    <Input id="timeline_to_buy" {...register("timeline_to_buy")} placeholder="e.g. 3 months, immediately" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reason_for_interest">Reason for Interest</Label>
                    <Input id="reason_for_interest" {...register("reason_for_interest")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="potential_lead_value">Potential Lead Value (₹)</Label>
                    <Input id="potential_lead_value" type="number" {...register("potential_lead_value")} placeholder="Estimated deal value" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Follow-up Tab */}
          <TabsContent value="followup">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Follow-up Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="next_followup_date">Next Follow-up Date</Label>
                    <Input id="next_followup_date" type="date" {...register("next_followup_date")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Follow-up Type</Label>
                    <Select
                      defaultValue={defaultValues?.followup_type}
                      onValueChange={(v) => v && setValue("followup_type", v as CreateLeadInput["followup_type"])}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Call">Call</SelectItem>
                        <SelectItem value="Email">Email</SelectItem>
                        <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                        <SelectItem value="Visit">Visit</SelectItem>
                        <SelectItem value="Meeting">Meeting</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notes">Initial Notes</Label>
                  <Textarea id="notes" {...register("notes")} rows={4} placeholder="Any additional context..." />
                </div>

                {!isEditing && (
                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="schedule_followup"
                        checked={scheduleFollowup}
                        onCheckedChange={(v) => setScheduleFollowup(!!v)}
                      />
                      <Label htmlFor="schedule_followup" className="cursor-pointer font-medium">
                        Schedule follow-up on creation
                      </Label>
                    </div>
                    {scheduleFollowup && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div className="space-y-1.5">
                          <Label>Follow-up Date &amp; Time</Label>
                          <Input
                            type="datetime-local"
                            value={followupDate}
                            onChange={(e) => setFollowupDate(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Type</Label>
                          <Select defaultValue="Call" onValueChange={(v) => v && setFollowupType(v)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Call">Call</SelectItem>
                              <SelectItem value="Email">Email</SelectItem>
                              <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                              <SelectItem value="Visit">Visit</SelectItem>
                              <SelectItem value="Meeting">Meeting</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex gap-3 mt-4 justify-end">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? "Update Lead" : "Create Lead"}
          </Button>
        </div>
      </form>

      <DuplicateWarningModal
        open={showDuplicates}
        exactMatches={duplicateData.exact_matches}
        nameSimilar={duplicateData.name_similar}
        onOpenExisting={(id) => router.push(`/leads/${id}`)}
        onContinue={() => {
          setShowDuplicates(false);
          if (pendingSubmit) submitLead(pendingSubmit, true);
        }}
        onClose={() => setShowDuplicates(false)}
      />
    </>
  );
}
