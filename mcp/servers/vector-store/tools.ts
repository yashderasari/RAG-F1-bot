import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { DataAPIClient } from "@datastax/astra-db-ts"
import OpenAI from "openai"
import { z } from "zod"
import "dotenv/config"

const { ASTRA_DB_NAMESPACE, ASTRA_DB_COLLECTION, ASTRA_DB_API_ENDPOINT, ASTRA_DB_APPLICATION_TOKEN, OPENAI_API_KEY } = process.env

const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN)
const db = client.db(ASTRA_DB_API_ENDPOINT!, { namespace: ASTRA_DB_NAMESPACE })

export function registerTools(server: McpServer) {
  server.tool(
    "search_f1_knowledge",
    "Search the F1 knowledge base for historical context, regulations, driver biographies, circuit history, and news. Use this for anything that doesn't require live race data.",
    {
      query: z.string().describe("Natural language search query"),
      top_k: z.number().optional().default(5).describe("Number of chunks to retrieve (default 5)")
    },
    async ({ query, top_k }) => {
      const embedding = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: query,
        encoding_format: "float"
      })
      const collection = await db.collection(ASTRA_DB_COLLECTION!)
      const cursor = collection.find({}, {
        sort: { $vector: embedding.data[0].embedding },
        limit: top_k ?? 5
      })
      const docs = await cursor.toArray()
      const result = docs.map(doc => ({ text: doc.text, source_url: null }))
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
    }
  )
}
