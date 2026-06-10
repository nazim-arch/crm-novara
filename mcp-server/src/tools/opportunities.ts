import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api } from "../client.js";

export function registerOpportunityTools(server: McpServer) {
  server.tool(
    "list_opportunities",
    "List DealStackHQ opportunities (real estate projects). Includes revenue, commission, and lead counts.",
    {
      q: z.string().optional().describe("Search by name, project, developer, or opportunity number"),
      status: z.enum(["Active", "Inactive", "Sold"]).optional(),
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(25),
    },
    async ({ q, status, page, limit }) => {
      const result = await api.get("/api/mcp/opportunities", {
        ...(q ? { q } : {}),
        ...(status ? { status } : {}),
        page: String(page),
        limit: String(limit),
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_opportunity",
    "Get full details of an opportunity including all linked leads, expenses, and calculated revenue/profit figures. Accepts opportunity ID or number (e.g. NOV-OPP-000001).",
    { opportunity_id: z.string().describe("Opportunity ID or number (NOV-OPP-XXXXXX)") },
    async ({ opportunity_id }) => {
      const result = await api.get(`/api/mcp/opportunities/${opportunity_id}`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "create_opportunity",
    "Create a new opportunity (real estate project) in DealStackHQ.",
    {
      name: z.string().describe("Opportunity name"),
      project: z.string().describe("Project name"),
      property_type: z.enum(["Residential", "Commercial", "Plot", "Villa", "Apartment", "Office", "Land"]),
      location: z.string().describe("Location / area (e.g. 'Pune', 'Baner')"),
      commission_percent: z.number().min(0).max(100).describe("Commission percentage"),
      developer: z.string().optional(),
      total_sales_value: z.number().optional().describe("Total sales value in INR"),
    },
    async (input) => {
      const result = await api.post("/api/mcp/opportunities", input);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "update_opportunity",
    "Update fields on an existing opportunity. Accepts opportunity ID or number.",
    {
      opportunity_id: z.string(),
      name: z.string().optional(),
      project: z.string().optional(),
      commission_percent: z.number().min(0).max(100).optional(),
      developer: z.string().optional(),
      location: z.string().optional(),
      total_sales_value: z.number().optional(),
      status: z.enum(["Active", "Inactive", "Sold"]).optional(),
    },
    async ({ opportunity_id, ...fields }) => {
      const result = await api.patch(`/api/mcp/opportunities/${opportunity_id}`, fields);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
