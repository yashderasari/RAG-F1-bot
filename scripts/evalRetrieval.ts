import { DataAPIClient } from "@datastax/astra-db-ts"
import OpenAI from "openai"
import fs from "fs"
import path from "path"
import "dotenv/config"

const {
  ASTRA_DB_NAMESPACE, ASTRA_DB_COLLECTION, ASTRA_DB_API_ENDPOINT,
  ASTRA_DB_APPLICATION_TOKEN, OPENAI_API_KEY, COHERE_API_KEY
} = process.env
const RERANK_ENABLED = process.env.RERANK_ENABLED === "true"

const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
const dbClient = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN)
const db = dbClient.db(ASTRA_DB_API_ENDPOINT!, { namespace: ASTRA_DB_NAMESPACE })

type GoldenEntry = { query: string; expected_keywords: string[]; notes?: string }
type Chunk = { text: string; source_url: null; relevance_score?: number }
type QueryResult = {
  query: string
  passed: boolean
  mrr: number
  matched_keywords: string[]
  top5_texts: string[]
}

async function cohereRerank(query: string, docs: Chunk[], topN: number): Promise<Chunk[]> {
  const res = await fetch("https://api.cohere.com/v2/rerank", {
    method: "POST",
    headers: { "Authorization": `Bearer ${COHERE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "rerank-v3.5", query, documents: docs.map(d => d.text), top_n: topN })
  })
  if (!res.ok) throw new Error(`Cohere rerank → ${res.status}: ${await res.text()}`)
  const data = await res.json() as { results: { index: number; relevance_score: number }[] }
  return data.results.map(r => ({ text: docs[r.index].text, source_url: null, relevance_score: r.relevance_score }))
}

async function retrieve(query: string, topK = 5): Promise<Chunk[]> {
  const fetchK = RERANK_ENABLED ? Math.max(25, topK) : topK
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
  let chunks: Chunk[] = docs.map(d => ({ text: d.text as string, source_url: null }))

  if (RERANK_ENABLED && COHERE_API_KEY) {
    chunks = await cohereRerank(query, chunks, topK)
  }
  return chunks.slice(0, topK)
}

function scoreQuery(chunks: Chunk[], keywords: string[]): { passed: boolean; mrr: number; matched_keywords: string[] } {
  const allText = chunks.map(c => c.text.toLowerCase())
  const matched = keywords.filter(kw => allText.some(t => t.includes(kw.toLowerCase())))
  const passed = matched.length >= 2

  // MRR: reciprocal rank of first chunk containing any keyword
  let mrr = 0
  for (let i = 0; i < chunks.length; i++) {
    const t = chunks[i].text.toLowerCase()
    if (keywords.some(kw => t.includes(kw.toLowerCase()))) {
      mrr = 1 / (i + 1)
      break
    }
  }
  return { passed, mrr, matched_keywords: matched }
}

async function run() {
  const mode = RERANK_ENABLED ? "rerank" : "baseline"
  console.log(`\n=== F1 Retrieval Eval — mode: ${mode} ===\n`)

  const golden: GoldenEntry[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, "eval/golden.json"), "utf-8")
  )

  const results: QueryResult[] = []
  let totalMrr = 0

  for (const entry of golden) {
    process.stdout.write(`  ${entry.query.slice(0, 55).padEnd(55)} `)
    const chunks = await retrieve(entry.query)
    const { passed, mrr, matched_keywords } = scoreQuery(chunks, entry.expected_keywords)
    totalMrr += mrr
    results.push({ query: entry.query, passed, mrr, matched_keywords, top5_texts: chunks.map(c => c.text) })
    console.log(`${passed ? "✓" : "✗"}  MRR=${mrr.toFixed(2)}  matched=[${matched_keywords.join(", ")}]`)
  }

  const hitRate = results.filter(r => r.passed).length
  const meanMrr = totalMrr / golden.length
  console.log(`\n--- Summary ---`)
  console.log(`hit-rate @ 5 : ${hitRate}/${golden.length} (${Math.round(hitRate / golden.length * 100)}%)`)
  console.log(`mean MRR     : ${meanMrr.toFixed(3)}`)

  const outPath = path.join(
    __dirname, "eval",
    `results-${new Date().toISOString().replace(/[:.]/g, "-")}-${mode}.json`
  )
  fs.writeFileSync(outPath, JSON.stringify({ mode, hitRate, total: golden.length, meanMrr, results }, null, 2))
  console.log(`\nFull results written to ${outPath}\n`)
}

run().catch(err => { console.error(err); process.exit(1) })
