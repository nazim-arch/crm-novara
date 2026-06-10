import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerLeadTools } from "./tools/leads.js";
import { registerOpportunityTools } from "./tools/opportunities.js";
import { registerTaskTools } from "./tools/tasks.js";
import { registerFollowUpTools } from "./tools/follow_ups.js";
import { registerAnalyticsTools } from "./tools/analytics.js";
import { getToken } from "./auth.js";

async function main() {
  // Validate credentials and get initial token at startup
  try {
    await getToken();
    console.error("[DealStackHQ MCP] Authentication successful");
  } catch (err) {
    console.error("[DealStackHQ MCP] Startup auth failed:", err);
    process.exit(1);
  }

  const server = new McpServer({
    name: "dealstackhq",
    version: "1.0.0",
  });

  registerLeadTools(server);
  registerOpportunityTools(server);
  registerTaskTools(server);
  registerFollowUpTools(server);
  registerAnalyticsTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[DealStackHQ MCP] Server running on stdio");
}

main().catch((err) => {
  console.error("[DealStackHQ MCP] Fatal error:", err);
  process.exit(1);
});
