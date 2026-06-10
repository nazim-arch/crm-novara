import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api } from "../client.js";

export function registerAnalyticsTools(server: McpServer) {
  server.tool(
    "query_analytics",
    `Run analytics queries against DealStackHQ data. Use this for questions like:
- "What happened with leads today?" → metric: leads_today
- "Why are leads being lost?" → metric: lost_reasons
- "How is the pipeline looking?" → metric: pipeline_by_stage
- "Which agents are performing best?" → metric: agent_performance
- "Show me revenue across opportunities" → metric: revenue_summary
- "How many overdue follow-ups are there?" → metric: follow_ups_overdue

Available metrics:
- leads_summary: total leads broken down by status, temperature, and source
- leads_today: all lead activity for today (new, stage changes, won, lost)
- lost_reasons: breakdown of why leads were lost, sorted by frequency
- pipeline_by_stage: lead counts and values per pipeline stage
- pipeline_by_temperature: lead counts per temperature (Hot/Warm/Cold)
- follow_ups_overdue: all overdue follow-ups with lead details
- revenue_summary: closed/possible revenue and expenses per opportunity
- agent_performance: won/lost/active leads and win rate per sales agent
- stage_changes: all pipeline stage changes in the date range
- recent_activity: last 50 activity log entries`,
    {
      metric: z.enum([
        "leads_summary",
        "leads_today",
        "lost_reasons",
        "pipeline_by_stage",
        "pipeline_by_temperature",
        "follow_ups_overdue",
        "revenue_summary",
        "agent_performance",
        "stage_changes",
        "recent_activity",
      ]),
      date_from: z.string().optional().describe("ISO date string — start of date range"),
      date_to: z.string().optional().describe("ISO date string — end of date range"),
      assigned_to: z.string().optional().describe("User ID — filter results to a specific agent"),
    },
    async ({ metric, date_from, date_to, assigned_to }) => {
      const result = await api.get("/api/mcp/analytics", {
        metric,
        ...(date_from ? { from: date_from } : {}),
        ...(date_to ? { to: date_to } : {}),
        ...(assigned_to ? { assigned_to } : {}),
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "list_users",
    "List all active users/agents in DealStackHQ with their IDs, names, and roles. Use this to find agent IDs for filtering other queries.",
    {},
    async () => {
      const result = await api.get("/api/mcp/users");
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
