import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api } from "../client.js";

export function registerFollowUpTools(server: McpServer) {
  server.tool(
    "list_follow_ups",
    "List DealStackHQ follow-ups. Use status='overdue' to find all overdue follow-ups, 'pending' for upcoming, 'completed' for done ones.",
    {
      status: z.enum(["pending", "overdue", "completed"]).optional().describe("Filter by follow-up status"),
      assigned_to: z.string().optional().describe("User ID to filter by assigned agent"),
      date_from: z.string().optional().describe("ISO date — filter follow-ups scheduled on or after"),
      date_to: z.string().optional().describe("ISO date — filter follow-ups scheduled on or before"),
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(25),
    },
    async ({ assigned_to, date_from, date_to, ...rest }) => {
      const result = await api.get("/api/mcp/follow-ups", {
        ...(rest.status ? { status: rest.status } : {}),
        ...(assigned_to ? { assigned_to } : {}),
        ...(date_from ? { from: date_from } : {}),
        ...(date_to ? { to: date_to } : {}),
        page: String(rest.page),
        limit: String(rest.limit),
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
