import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { registerTools } from "./tools"

const server = new McpServer({ name: "openf1-server", version: "1.0.0" })
registerTools(server)

const transport = new StdioServerTransport()
server.connect(transport)
