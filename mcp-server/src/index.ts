import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerLeadTools } from "./tools/leads.js";
import { registerOpportunityTools } from "./tools/opportunities.js";
import { registerTaskTools } from "./tools/tasks.js";
import { registerFollowUpTools } from "./tools/follow_ups.js";
import { registerAnalyticsTools } from "./tools/analytics.js";
import { getToken } from "./auth.js";

async function main() {
  const server = new McpServer({
    name: "dealstackhq",
    version: "1.0.0",
  });

  registerLeadTools(server);
  registerOpportunityTools(server);
  registerTaskTools(server);
  registerFollowUpTools(server);
  registerAnalyticsTools(server);

  // Connect to stdio FIRST so the MCP handshake with the client is not
  // blocked by the network round-trip to authenticate. Tools call
  // getToken() on demand, so auth is not required before connecting.
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[DealStackHQ MCP] Server running on stdio");

  // Warm up the token in the background. A failure here is non-fatal:
  // the first tool call will surface any auth error to the client.
  getToken()
    .then(() => console.error("[DealStackHQ MCP] Authentication successful"))
    .catch((err) =>
      console.error("[DealStackHQ MCP] Background auth warm-up failed:", err)
    );
}

main().catch((err) => {
  console.error("[DealStackHQ MCP] Fatal error:", err);
  process.exit(1);
});
