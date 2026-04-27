import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { DataAPIClient } from "@datastax/astra-db-ts"
import OpenAI from "openai"
import { z } from "zod"
import "dotenv/config"

const { ASTRA_DB_NAMESPACE, ASTRA_DB_COLLECTION, ASTRA_DB_API_ENDPOINT, ASTRA_DB_APPLICATION_TOKEN, OPENAI_API_KEY, COHERE_API_KEY } = process.env
const RERANK_ENABLED = process.env.RERANK_ENABLED === "true"

const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN)
const db = client.db(ASTRA_DB_API_ENDPOINT!, { namespace: ASTRA_DB_NAMESPACE })

type Chunk = { text: string; source_url: null; relevance_score?: number }

async function cohereRerank(query: string, docs: Chunk[], topN: number): Promise<Chunk[]> {
  const res = await fetch("https://api.cohere.com/v2/rerank", {
    method: "POST",
    headers: { "Authorization": `Bearer ${COHERE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "rerank-v3.5", query, documents: docs.map(d => d.text), top_n: topN })
  })
  if (!res.ok) throw new Error(`Cohere rerank → ${res.status}`)
  const data = await res.json() as { results: { index: number; relevance_score: number }[] }
  return data.results.map(r => ({ text: docs[r.index].text, source_url: null, relevance_score: r.relevance_score }))
}

export function registerTools(server: McpServer) {
  server.tool(
    "search_f1_knowledge",
    "Search the F1 knowledge base for historical context, regulations, driver biographies, circuit history, and news. Use this for anything that doesn't require live race data.",
    {
      query: z.string().describe("Natural language search query"),
      top_k: z.number().optional().default(5).describe("Number of chunks to retrieve (default 5)")
    },
    async ({ query, top_k }) => {
      const finalK = top_k ?? 5
      const fetchK = RERANK_ENABLED ? Math.max(25, finalK) : finalK

      const embedding = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: query,
        encoding_format: "float"
      })
      const collection = await db.collection(ASTRA_DB_COLLECTION!)
      const cursor = collection.find({}, {
        sort: { $vector: embedding.data[0].embedding },
        limit: fetchK
      })
      const docs = await cursor.toArray()
      let result: Chunk[] = docs.map(doc => ({ text: doc.text, source_url: null }))

      if (RERANK_ENABLED && COHERE_API_KEY) {
        try {
          result = await cohereRerank(query, result, finalK)
        } catch (err) {
          // fall back to bi-encoder top-k on Cohere failure
          console.error("[vector-store] Cohere rerank failed, falling back:", err)
          result = result.slice(0, finalK)
        }
      }

      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
    }
  )
}
