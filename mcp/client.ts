import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { tool } from "ai"
import path from "path"
import { schemas } from "./types"

type McpClients = { openf1: Client; vectorStore: Client }

declare global {
  // eslint-disable-next-line no-var
  var __mcpClients: McpClients | undefined
}

const TSNODE_BIN = path.join(process.cwd(), "node_modules", "ts-node", "dist", "bin.js")
const TS_COMPILER_OPTS = JSON.stringify({ module: "CommonJS", esModuleInterop: true, skipLibCheck: true })

async function spawnClient(name: string, serverPath: string): Promise<Client> {
  const client = new Client({ name, version: "1.0.0" })
  const transport = new StdioClientTransport({
    command: process.execPath, // node binary
    args: [TSNODE_BIN, "--skip-project", "--compiler-options", TS_COMPILER_OPTS, path.join(process.cwd(), serverPath)],
    env: Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined)) as Record<string, string>,
  })
  await client.connect(transport)
  return client
}

async function initClients(): Promise<McpClients> {
  const [openf1, vectorStore] = await Promise.all([
    spawnClient("openf1-client", "mcp/servers/openf1/index.ts"),
    spawnClient("vector-store-client", "mcp/servers/vector-store/index.ts"),
  ])
  return { openf1, vectorStore }
}

export async function getMcpClients(): Promise<McpClients> {
  if (!global.__mcpClients) {
    global.__mcpClients = await initClients()
  }
  return global.__mcpClients
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText(result: any): string {
  const content: { type: string; text?: string }[] = result?.content ?? []
  return content[0]?.text ?? JSON.stringify(content)
}

export async function getMcpTools() {
  const clients = await getMcpClients()

  return {
    search_f1_knowledge: tool({
      description: "Search the F1 knowledge base for history, regulations, driver bios, circuit info, and news from the scraped corpus.",
      parameters: schemas.search_f1_knowledge,
      execute: async (args) => extractText(await clients.vectorStore.callTool({ name: "search_f1_knowledge", arguments: args })),
    }),
    get_session_info: tool({
      description: "Get F1 session schedule (practice, qualifying, sprint, race) for a year and optional country.",
      parameters: schemas.get_session_info,
      execute: async (args) => extractText(await clients.openf1.callTool({ name: "get_session_info", arguments: args })),
    }),
    get_driver_info: tool({
      description: "Get F1 driver details — name, team, country. Filter by driver number or session.",
      parameters: schemas.get_driver_info,
      execute: async (args) => extractText(await clients.openf1.callTool({ name: "get_driver_info", arguments: args })),
    }),
    get_lap_times: tool({
      description: "Get lap times for an F1 session. Filter by driver or lap number.",
      parameters: schemas.get_lap_times,
      execute: async (args) => extractText(await clients.openf1.callTool({ name: "get_lap_times", arguments: args })),
    }),
    get_weather: tool({
      description: "Get weather conditions (temperature, rainfall, wind) during an F1 session.",
      parameters: schemas.get_weather,
      execute: async (args) => extractText(await clients.openf1.callTool({ name: "get_weather", arguments: args })),
    }),
    get_race_results: tool({
      description: "Get race finishing positions for a given year and optional GP name. Only covers 2023 and later — do NOT call for pre-2023 seasons.",
      parameters: schemas.get_race_results,
      execute: async (args) => extractText(await clients.openf1.callTool({ name: "get_race_results", arguments: args })),
    }),
    get_standings: tool({
      description: "Get driver or constructor championship standings for a season by aggregating race results. Only covers 2023 and later — do NOT call for pre-2023 seasons.",
      parameters: schemas.get_standings,
      execute: async (args) => extractText(await clients.openf1.callTool({ name: "get_standings", arguments: args })),
    }),
  }
}
