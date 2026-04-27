import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { cacheGet, cacheSet, cacheKey, TTL } from "./cache"

const BASE = "https://api.openf1.org/v1"

async function openf1<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${BASE}${path}`)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v))
  }
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`OpenF1 ${path} → ${res.status}`)
  return res.json() as Promise<T>
}

const F1_POINTS: Record<number, number> = {
  1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1
}

type Session = {
  session_key: number; session_type: string; session_name: string;
  year: number; country_name: string; location: string;
  date_start: string; date_end: string; meeting_key: number; circuit_short_name: string
}
type Driver = {
  driver_number: number; full_name: string; name_acronym: string;
  team_name: string; country_code: string; session_key: number
}
type Position = {
  driver_number: number; position: number; date: string; session_key: number
}
type Lap = {
  driver_number: number; lap_number: number; lap_duration: number | null;
  session_key: number; date_start: string
}
type Weather = {
  date: string; air_temperature: number; track_temperature: number;
  humidity: number; pressure: number; rainfall: number; wind_speed: number; session_key: number
}
type Meeting = {
  meeting_key: number; meeting_name: string; meeting_official_name: string;
  country_name: string; location: string; year: number; date_start: string
}

async function getFinalPositions(session_key: number): Promise<Position[]> {
  const positions = await openf1<Position[]>("/position", { session_key })
  const byDriver = new Map<number, Position>()
  for (const p of positions) {
    const existing = byDriver.get(p.driver_number)
    if (!existing || p.date > existing.date) {
      byDriver.set(p.driver_number, p)
    }
  }
  return Array.from(byDriver.values()).sort((a, b) => a.position - b.position)
}

export function registerTools(server: McpServer) {
  // ─── get_session_info ────────────────────────────────────────────────────
  server.tool(
    "get_session_info",
    "Get F1 session and meeting information for a given year and optional country. Returns practice, qualifying, sprint, and race sessions.",
    { year: z.number().describe("Season year"), country: z.string().optional().describe("Country name (e.g. 'Monaco', 'Belgium')") },
    async ({ year, country }) => {
      const key = cacheKey("get_session_info", { year, country })
      const cached = cacheGet(key)
      if (cached) return { content: [{ type: "text" as const, text: JSON.stringify(cached) }] }

      const [meetings, sessions] = await Promise.all([
        openf1<Meeting[]>("/meetings", { year, country_name: country }),
        openf1<Session[]>("/sessions", { year, country_name: country })
      ])
      const result = { meetings, sessions }
      cacheSet(key, result, TTL.SESSION_META)
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
    }
  )

  // ─── get_driver_info ─────────────────────────────────────────────────────
  server.tool(
    "get_driver_info",
    "Get F1 driver information. Optionally filter by driver number or session key.",
    {
      driver_number: z.number().optional().describe("Driver's race number"),
      session_key: z.number().optional().describe("Session identifier to scope the query")
    },
    async ({ driver_number, session_key }) => {
      const key = cacheKey("get_driver_info", { driver_number, session_key })
      const cached = cacheGet(key)
      if (cached) return { content: [{ type: "text" as const, text: JSON.stringify(cached) }] }

      const drivers = await openf1<Driver[]>("/drivers", { driver_number, session_key })
      const unique = new Map<number, Driver>()
      for (const d of drivers) unique.set(d.driver_number, d)
      const result = Array.from(unique.values())
      cacheSet(key, result, TTL.SESSION_META)
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
    }
  )

  // ─── get_lap_times ───────────────────────────────────────────────────────
  server.tool(
    "get_lap_times",
    "Get lap time data for a session. Filter by driver number or specific lap number.",
    {
      session_key: z.number().describe("Session identifier (from get_session_info)"),
      driver_number: z.number().optional().describe("Driver's race number"),
      lap_number: z.number().optional().describe("Specific lap number")
    },
    async ({ session_key, driver_number, lap_number }) => {
      const key = cacheKey("get_lap_times", { session_key, driver_number, lap_number })
      const cached = cacheGet(key)
      if (cached) return { content: [{ type: "text" as const, text: JSON.stringify(cached) }] }

      const laps = await openf1<Lap[]>("/laps", { session_key, driver_number, lap_number })
      cacheSet(key, laps, TTL.COMPLETED_LAPS)
      return { content: [{ type: "text" as const, text: JSON.stringify(laps) }] }
    }
  )

  // ─── get_weather ─────────────────────────────────────────────────────────
  server.tool(
    "get_weather",
    "Get weather conditions during an F1 session (temperature, rainfall, wind speed, humidity).",
    { session_key: z.number().describe("Session identifier (from get_session_info)") },
    async ({ session_key }) => {
      const key = cacheKey("get_weather", { session_key })
      const cached = cacheGet(key)
      if (cached) return { content: [{ type: "text" as const, text: JSON.stringify(cached) }] }

      const weather = await openf1<Weather[]>("/weather", { session_key })
      // Summarize: first, last, and average readings
      const summary = weather.length
        ? {
            total_readings: weather.length,
            first: weather[0],
            last: weather[weather.length - 1],
            avg_air_temp: Math.round(weather.reduce((s, w) => s + w.air_temperature, 0) / weather.length * 10) / 10,
            avg_track_temp: Math.round(weather.reduce((s, w) => s + w.track_temperature, 0) / weather.length * 10) / 10,
            rainfall_detected: weather.some(w => w.rainfall > 0),
          }
        : { total_readings: 0 }
      cacheSet(key, summary, TTL.WEATHER_DONE)
      return { content: [{ type: "text" as const, text: JSON.stringify(summary) }] }
    }
  )

  // ─── get_race_results ────────────────────────────────────────────────────
  server.tool(
    "get_race_results",
    "Get race classification results (finishing positions) for a given year. Only covers 2023 and later. Optionally filter by GP name (e.g. 'Monaco', 'Silverstone').",
    {
      year: z.number().describe("Season year"),
      meeting_name: z.string().optional().describe("GP name to filter (e.g. 'Monaco', 'British')")
    },
    async ({ year, meeting_name }) => {
      const key = cacheKey("get_race_results", { year, meeting_name })
      const cached = cacheGet(key)
      if (cached) return { content: [{ type: "text" as const, text: JSON.stringify(cached) }] }

      const sessions = await openf1<Session[]>("/sessions", { year, session_type: "Race" })
      const filtered = meeting_name
        ? sessions.filter(s => s.location.toLowerCase().includes(meeting_name.toLowerCase())
            || s.country_name.toLowerCase().includes(meeting_name.toLowerCase())
            || s.circuit_short_name.toLowerCase().includes(meeting_name.toLowerCase()))
        : sessions

      if (!filtered.length) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "No matching race session found" }) }] }
      }

      const session = filtered[filtered.length - 1] // most recent match
      const [positions, drivers] = await Promise.all([
        getFinalPositions(session.session_key),
        openf1<Driver[]>("/drivers", { session_key: session.session_key })
      ])

      const driverMap = new Map(drivers.map(d => [d.driver_number, d]))
      const result = {
        session_name: session.session_name,
        location: session.location,
        country: session.country_name,
        date: session.date_start,
        classification: positions.map(p => ({
          position: p.position,
          driver_number: p.driver_number,
          driver_name: driverMap.get(p.driver_number)?.full_name ?? "Unknown",
          team: driverMap.get(p.driver_number)?.team_name ?? "Unknown",
        }))
      }
      cacheSet(key, result, TTL.RACE_RESULTS)
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
    }
  )

  // ─── get_standings ───────────────────────────────────────────────────────
  server.tool(
    "get_standings",
    "Get driver or constructor championship standings for a season. Only covers 2023 and later — returns an error for earlier years. Note: does not include +1 fastest lap point. May take several seconds for full season due to data aggregation.",
    {
      year: z.number().describe("Season year"),
      type: z.enum(["driver", "constructor"]).describe("'driver' for driver standings, 'constructor' for team standings")
    },
    async ({ year, type }) => {
      const key = cacheKey("get_standings", { year, type })
      const cached = cacheGet(key)
      if (cached) return { content: [{ type: "text" as const, text: JSON.stringify(cached) }] }

      const races = await openf1<Session[]>("/sessions", { year, session_type: "Race" })
      if (!races.length) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: `No race data available for ${year}. OpenF1 only covers 2023 and later.` }) }] }
      }
      const pointsTally = new Map<number, { points: number; driver_name: string; team: string }>()

      for (const race of races) {
        const [positions, drivers] = await Promise.all([
          getFinalPositions(race.session_key),
          openf1<Driver[]>("/drivers", { session_key: race.session_key })
        ])
        const driverMap = new Map(drivers.map(d => [d.driver_number, d]))

        for (const pos of positions) {
          const pts = F1_POINTS[pos.position] ?? 0
          if (!pointsTally.has(pos.driver_number)) {
            const d = driverMap.get(pos.driver_number)
            pointsTally.set(pos.driver_number, {
              points: 0,
              driver_name: d?.full_name ?? `Driver #${pos.driver_number}`,
              team: d?.team_name ?? "Unknown",
            })
          }
          pointsTally.get(pos.driver_number)!.points += pts
        }
      }

      let result: unknown
      if (type === "driver") {
        result = Array.from(pointsTally.values())
          .sort((a, b) => b.points - a.points)
          .map((e, i) => ({ position: i + 1, driver: e.driver_name, team: e.team, points: e.points }))
      } else {
        const constructorTally = new Map<string, number>()
        for (const e of pointsTally.values()) {
          constructorTally.set(e.team, (constructorTally.get(e.team) ?? 0) + e.points)
        }
        result = Array.from(constructorTally.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([team, points], i) => ({ position: i + 1, team, points }))
      }

      cacheSet(key, result, TTL.STANDINGS)
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
    }
  )
}
