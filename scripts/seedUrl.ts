import { DataAPIClient } from "@datastax/astra-db-ts";
import { PuppeteerWebBaseLoader } from "@langchain/community/document_loaders/web/puppeteer";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import OpenAI from "openai";
import "dotenv/config"

const { ASTRA_DB_NAMESPACE, ASTRA_DB_COLLECTION, ASTRA_DB_API_ENDPOINT, ASTRA_DB_APPLICATION_TOKEN, OPENAI_API_KEY } = process.env

const url = process.argv[2]
if (!url) {
  console.error("Usage: ts-node scripts/seedUrl.ts <url>")
  process.exit(1)
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN)
const db = client.db(ASTRA_DB_API_ENDPOINT, { namespace: ASTRA_DB_NAMESPACE })

const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 512, chunkOverlap: 100 })

const scrapePage = async (pageUrl: string) => {
  const loader = new PuppeteerWebBaseLoader(pageUrl, {
    launchOptions: { headless: true },
    gotoOptions: { waitUntil: "domcontentloaded" },
    evaluate: async (Page, browser) => {
      const result = await Page.evaluate(() => document.body.innerHTML)
      await browser.close()
      return result
    }
  })
  return (await loader.scrape())?.replace(/<[^>]*>?/gm, '')
}

async function run() {
  const collection = await db.collection(ASTRA_DB_COLLECTION!)

  const deleted = await collection.deleteMany({ source_url: url })
  console.log(`Wiped ${(deleted as any).deletedCount ?? 0} existing chunks from ${url}`)

  console.log(`Scraping: ${url}`)
  const content = await scrapePage(url)
  const chunks = await splitter.splitText(content)
  console.log(`Scraped ${chunks.length} chunks — embedding and upserting...`)

  const seeded_at = new Date().toISOString()
  let inserted = 0
  for (const chunk of chunks) {
    const embedding = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: chunk,
      encoding_format: "float",
    })
    await collection.insertOne({ $vector: embedding.data[0].embedding, text: chunk, source_url: url, seeded_at })
    inserted++
    if (inserted % 10 === 0) process.stdout.write(`\r  ${inserted}/${chunks.length}`)
  }
  console.log(`\nDone — inserted ${inserted} chunks from ${url}`)
}

run().catch(err => { console.error(err); process.exit(1) })
