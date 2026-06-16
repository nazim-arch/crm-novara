import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api } from "../client.js";

export function registerLeadTools(server: McpServer) {
  server.tool(
    "list_leads",
    "Search and list DealStackHQ leads. Supports filtering by status, temperature, assigned agent, date range, and full-text search.",
    {
      q: z.string().optional().describe("Search by name, phone, email, or lead number"),
      status: z.enum(["New", "Contacted", "Prospect", "SiteVisitCompleted", "Negotiation", "Booked", "Won", "Lost", "InvalidLead", "OnHold", "Recycle"]).optional(),
      temperature: z.enum(["Hot", "Warm", "Cold", "FollowUpLater"]).optional(),
      assigned_to: z.string().optional().describe("User ID of the assigned agent"),
      date_from: z.string().optional().describe("ISO date string — filter leads created on or after this date"),
      date_to: z.string().optional().describe("ISO date string — filter leads created on or before this date"),
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(25),
    },
    async ({ q, status, temperature, assigned_to, date_from, date_to, page, limit }) => {
      const result = await api.get("/api/mcp/leads", {
        ...(q ? { q } : {}),
        ...(status ? { status } : {}),
        ...(temperature ? { temperature } : {}),
        ...(assigned_to ? { assigned_to } : {}),
        ...(date_from ? { from: date_from } : {}),
        ...(date_to ? { to: date_to } : {}),
        page: String(page),
        limit: String(limit),
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_lead",
    "Get full details of a single lead including activities, notes, linked opportunities, follow-ups, and stage history. Accepts lead ID or lead number (e.g. NOV-LEAD-000001).",
    { lead_id: z.string().describe("Lead ID or lead number (NOV-LEAD-XXXXXX)") },
    async ({ lead_id }) => {
      const result = await api.get(`/api/mcp/leads/${lead_id}`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "create_lead",
    "Create a new lead in DealStackHQ.",
    {
      full_name: z.string().describe("Full name of the lead"),
      phone: z.string().describe("Phone number (must be unique)"),
      lead_source: z.string().describe("Source of the lead (e.g. 'Meta Ads', 'Referral', 'Walk In', 'Website')"),
      temperature: z.enum(["Hot", "Warm", "Cold", "FollowUpLater"]).default("Warm"),
      email: z.string().email().optional(),
      assigned_to_id: z.string().optional().describe("User ID to assign this lead to"),
    },
    async (input) => {
      const result = await api.post("/api/mcp/leads", input);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "update_lead",
    "Update fields on an existing lead. Accepts lead ID or lead number.",
    {
      lead_id: z.string().describe("Lead ID or lead number"),
      temperature: z.enum(["Hot", "Warm", "Cold", "FollowUpLater"]).optional(),
      activity_stage: z.enum(["New", "NoResponse", "Busy", "Unreachable", "Prospect", "CallBack", "FollowUp", "SiteVisitScheduled", "LongRNR", "NotInterested", "Junk"]).optional(),
      email: z.string().email().optional(),
      city: z.string().optional(),
      location_preference: z.string().optional(),
      timeline_to_buy: z.string().optional(),
      financing_required: z.boolean().optional(),
      assigned_to_id: z.string().optional().describe("User ID to reassign lead to"),
    },
    async ({ lead_id, ...fields }) => {
      const result = await api.patch(`/api/mcp/leads/${lead_id}`, fields);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "change_lead_stage",
    "Move a lead to a new pipeline stage. For Won leads, provide settlement_value and deal_commission_percent. For Lost leads, provide lost_reason.",
    {
      lead_id: z.string().describe("Lead ID or lead number"),
      stage: z.enum(["New", "Contacted", "Prospect", "SiteVisitCompleted", "Negotiation", "Booked", "Won", "Lost", "InvalidLead", "OnHold", "Recycle"]),
      notes: z.string().optional().describe("Notes about this stage change"),
      lost_reason: z.string().optional().describe("Reason for losing the lead (required when stage=Lost)"),
      lost_notes: z.string().optional(),
      settlement_value: z.number().optional().describe("Settlement amount in INR (required when stage=Won)"),
      deal_commission_percent: z.number().optional().describe("Commission % for this deal (required when stage=Won)"),
    },
    async ({ lead_id, ...body }) => {
      const result = await api.post(`/api/mcp/leads/${lead_id}/stage`, body);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
