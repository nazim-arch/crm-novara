import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api } from "../client.js";

export function registerTaskTools(server: McpServer) {
  server.tool(
    "list_tasks",
    "List DealStackHQ tasks with filtering by status, priority, agent, overdue flag, and date range.",
    {
      status: z.enum(["Todo", "InProgress", "Done", "Cancelled"]).optional(),
      priority: z.enum(["Low", "Medium", "High", "Critical"]).optional(),
      assigned_to: z.string().optional().describe("User ID of assigned agent"),
      overdue: z.boolean().optional().describe("If true, returns only overdue tasks"),
      date_from: z.string().optional().describe("ISO date — filter tasks due on or after this date"),
      date_to: z.string().optional().describe("ISO date — filter tasks due on or before this date"),
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(25),
    },
    async ({ assigned_to, date_from, date_to, overdue, ...rest }) => {
      const result = await api.get("/api/mcp/tasks", {
        ...(rest.status ? { status: rest.status } : {}),
        ...(rest.priority ? { priority: rest.priority } : {}),
        ...(assigned_to ? { assigned_to } : {}),
        ...(overdue ? { overdue: "true" } : {}),
        ...(date_from ? { from: date_from } : {}),
        ...(date_to ? { to: date_to } : {}),
        page: String(rest.page),
        limit: String(rest.limit),
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_task",
    "Get full details of a task including notes. Accepts task ID or task number (e.g. NOV-TASK-000001).",
    { task_id: z.string().describe("Task ID or task number (NOV-TASK-XXXXXX)") },
    async ({ task_id }) => {
      const result = await api.get(`/api/mcp/tasks/${task_id}`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "create_task",
    "Create a new task in DealStackHQ.",
    {
      title: z.string().describe("Task title"),
      due_date: z.string().describe("ISO date string for the due date"),
      priority: z.enum(["Low", "Medium", "High", "Critical"]).default("Medium"),
      description: z.string().optional(),
      sector: z.string().optional().describe("Task sector/category"),
      assigned_to_id: z.string().optional().describe("User ID to assign to (defaults to the MCP admin user)"),
      lead_id: z.string().optional().describe("Link task to a lead ID"),
      opportunity_id: z.string().optional().describe("Link task to an opportunity ID"),
    },
    async (input) => {
      const result = await api.post("/api/mcp/tasks", input);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "update_task",
    "Update a task or mark it as complete. Accepts task ID or task number.",
    {
      task_id: z.string().describe("Task ID or task number"),
      title: z.string().optional(),
      status: z.enum(["Todo", "InProgress", "Done", "Cancelled"]).optional().describe("Set to 'Done' to mark complete"),
      priority: z.enum(["Low", "Medium", "High", "Critical"]).optional(),
      due_date: z.string().optional().describe("New due date (ISO string)"),
      assigned_to_id: z.string().optional(),
    },
    async ({ task_id, ...fields }) => {
      const result = await api.patch(`/api/mcp/tasks/${task_id}`, fields);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
