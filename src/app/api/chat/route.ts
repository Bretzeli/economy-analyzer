"use server"

import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { db } from "@/db/db"
import { countryTable, inflationTable, incomeTable } from "@/db/schema"
import { eq, like, desc, asc, and, gte, lte, sql } from "drizzle-orm"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Define the tools/functions the AI can use to query the database
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_countries_list",
      description: "Get a list of all available countries in the database with their codes and names. Use this when the user asks about what countries are available or wants to know country codes.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Optional search term to filter countries by name"
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_inflation_data",
      description: "Get inflation data for specific countries and/or time periods. Returns inflation rates as percentages.",
      parameters: {
        type: "object",
        properties: {
          country_codes: {
            type: "array",
            items: { type: "string" },
            description: "Array of country codes (e.g., ['USA', 'DEU', 'JPN']). If empty, returns data for all countries."
          },
          start_year: {
            type: "string",
            description: "Start year for data range (e.g., '2020')"
          },
          end_year: {
            type: "string",
            description: "End year for data range (e.g., '2023')"
          },
          limit: {
            type: "number",
            description: "Maximum number of records to return (default 50, max 200)"
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_income_data",
      description: "Get income data for specific countries and/or time periods. Returns PPP (purchasing power parity) in international dollars, local currency values, and annual growth rates.",
      parameters: {
        type: "object",
        properties: {
          country_codes: {
            type: "array",
            items: { type: "string" },
            description: "Array of country codes (e.g., ['USA', 'DEU', 'JPN']). If empty, returns data for all countries."
          },
          start_year: {
            type: "string",
            description: "Start year for data range (e.g., '2020')"
          },
          end_year: {
            type: "string",
            description: "End year for data range (e.g., '2023')"
          },
          limit: {
            type: "number",
            description: "Maximum number of records to return (default 50, max 200)"
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_country_comparison",
      description: "Compare inflation and income data between multiple countries for a specific year. Returns combined data including inflation rate, PPP income, and growth rate.",
      parameters: {
        type: "object",
        properties: {
          country_codes: {
            type: "array",
            items: { type: "string" },
            description: "Array of country codes to compare (e.g., ['USA', 'DEU', 'JPN'])"
          },
          year: {
            type: "string",
            description: "Year for comparison (e.g., '2022')"
          }
        },
        required: ["country_codes", "year"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_country_ranking",
      description: "Get rankings of countries by inflation, income (PPP), or growth rate for a specific year. Useful for questions like 'which country has the highest inflation?' or 'top 10 countries by income'.",
      parameters: {
        type: "object",
        properties: {
          metric: {
            type: "string",
            enum: ["inflation", "income_ppp", "growth_rate"],
            description: "The metric to rank by"
          },
          year: {
            type: "string",
            description: "Year for ranking (e.g., '2022')"
          },
          order: {
            type: "string",
            enum: ["highest", "lowest"],
            description: "Whether to get highest or lowest values first"
          },
          limit: {
            type: "number",
            description: "Number of countries to return (default 10, max 50)"
          }
        },
        required: ["metric", "year"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_country_time_series",
      description: "Get historical time series data for a single country across all available years. Shows how inflation, income, and growth have changed over time.",
      parameters: {
        type: "object",
        properties: {
          country_code: {
            type: "string",
            description: "The country code (e.g., 'USA', 'DEU')"
          }
        },
        required: ["country_code"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_available_years",
      description: "Get the range of years for which data is available in the database.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "calculate_real_income_change",
      description: "Calculate the real income change (income growth minus inflation) for countries. Positive values mean purchasing power increased, negative means it decreased. If no country_codes provided, calculates for ALL countries in the database.",
      parameters: {
        type: "object",
        properties: {
          country_codes: {
            type: "array",
            items: { type: "string" },
            description: "Array of country codes. If empty or not provided, calculates for ALL countries in the database."
          },
          year: {
            type: "string",
            description: "Year for calculation"
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default 20, max 100)"
          }
        },
        required: ["year"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_countries_by_region",
      description: "Get a list of country codes for a specific region. Use this when users ask about European countries, Asian countries, etc.",
      parameters: {
        type: "object",
        properties: {
          region: {
            type: "string",
            enum: ["europe", "asia", "north_america", "south_america", "africa", "oceania", "middle_east", "eu", "g7", "g20", "oecd"],
            description: "The region to get country codes for"
          }
        },
        required: ["region"]
      }
    }
  }
]

// Function implementations
async function getCountriesList(search?: string) {
  let query = db.select({
    code: countryTable.code,
    name: countryTable.name,
  }).from(countryTable)

  if (search) {
    query = query.where(like(countryTable.name, `%${search}%`)) as typeof query
  }

  const result = await query.orderBy(asc(countryTable.name))
  return result
}

async function getInflationData(countryCodes?: string[], startYear?: string, endYear?: string, limit: number = 50) {
  const conditions = []
  
  if (countryCodes && countryCodes.length > 0) {
    conditions.push(sql`${inflationTable.countryCode} IN ${countryCodes}`)
  }
  
  if (startYear) {
    conditions.push(gte(inflationTable.timestamp, startYear))
  }
  
  if (endYear) {
    conditions.push(lte(inflationTable.timestamp, endYear + "-12"))
  }

  const query = db.select({
    countryCode: inflationTable.countryCode,
    countryName: countryTable.name,
    timestamp: inflationTable.timestamp,
    inflationRate: inflationTable.inflationValue,
  })
    .from(inflationTable)
    .innerJoin(countryTable, eq(countryTable.code, inflationTable.countryCode))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(inflationTable.timestamp), asc(countryTable.name))
    .limit(Math.min(limit, 200))

  return await query
}

async function getIncomeData(countryCodes?: string[], startYear?: string, endYear?: string, limit: number = 50) {
  const conditions = []
  
  if (countryCodes && countryCodes.length > 0) {
    conditions.push(sql`${incomeTable.countryCode} IN ${countryCodes}`)
  }
  
  if (startYear) {
    conditions.push(gte(incomeTable.timestamp, startYear))
  }
  
  if (endYear) {
    conditions.push(lte(incomeTable.timestamp, endYear))
  }

  const query = db.select({
    countryCode: incomeTable.countryCode,
    countryName: countryTable.name,
    timestamp: incomeTable.timestamp,
    ppp_international_dollars: incomeTable.ppp_international_dollars,
    current_local_currency: incomeTable.current_local_currency,
    annual_growth_rate: incomeTable.annual_growth_rate,
  })
    .from(incomeTable)
    .innerJoin(countryTable, eq(countryTable.code, incomeTable.countryCode))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(incomeTable.timestamp), asc(countryTable.name))
    .limit(Math.min(limit, 200))

  return await query
}

async function getCountryComparison(countryCodes: string[], year: string) {
  // Get inflation data for the year (handle both yearly and monthly)
  const inflationData = await db.select({
    countryCode: inflationTable.countryCode,
    countryName: countryTable.name,
    timestamp: inflationTable.timestamp,
    inflationRate: inflationTable.inflationValue,
  })
    .from(inflationTable)
    .innerJoin(countryTable, eq(countryTable.code, inflationTable.countryCode))
    .where(and(
      sql`${inflationTable.countryCode} IN ${countryCodes}`,
      like(inflationTable.timestamp, `${year}%`)
    ))

  // Calculate yearly average for countries with monthly data
  const inflationByCountry = new Map<string, { name: string; values: number[] }>()
  inflationData.forEach(item => {
    if (!inflationByCountry.has(item.countryCode)) {
      inflationByCountry.set(item.countryCode, { name: item.countryName, values: [] })
    }
    inflationByCountry.get(item.countryCode)!.values.push(item.inflationRate)
  })

  // Get income data
  const incomeData = await db.select({
    countryCode: incomeTable.countryCode,
    countryName: countryTable.name,
    ppp_international_dollars: incomeTable.ppp_international_dollars,
    annual_growth_rate: incomeTable.annual_growth_rate,
  })
    .from(incomeTable)
    .innerJoin(countryTable, eq(countryTable.code, incomeTable.countryCode))
    .where(and(
      sql`${incomeTable.countryCode} IN ${countryCodes}`,
      eq(incomeTable.timestamp, year)
    ))

  // Combine data
  const result = countryCodes.map(code => {
    const inflation = inflationByCountry.get(code)
    const income = incomeData.find(i => i.countryCode === code)
    const avgInflation = inflation ? inflation.values.reduce((a, b) => a + b, 0) / inflation.values.length : null
    
    return {
      countryCode: code,
      countryName: inflation?.name || income?.countryName || code,
      year,
      inflationRate: avgInflation,
      ppp_international_dollars: income?.ppp_international_dollars || null,
      annual_growth_rate: income?.annual_growth_rate || null,
      realIncomeChange: income?.annual_growth_rate && avgInflation 
        ? income.annual_growth_rate - avgInflation 
        : null
    }
  })

  return result
}

async function getCountryRanking(metric: string, year: string, order: string = "highest", limit: number = 10) {
  const orderDir = order === "highest" ? desc : asc
  
  if (metric === "inflation") {
    // Get all inflation data for the year and calculate averages
    const inflationData = await db.select({
      countryCode: inflationTable.countryCode,
      countryName: countryTable.name,
      timestamp: inflationTable.timestamp,
      inflationRate: inflationTable.inflationValue,
    })
      .from(inflationTable)
      .innerJoin(countryTable, eq(countryTable.code, inflationTable.countryCode))
      .where(like(inflationTable.timestamp, `${year}%`))

    // Group by country and calculate averages
    const inflationByCountry = new Map<string, { name: string; values: number[] }>()
    inflationData.forEach(item => {
      if (!inflationByCountry.has(item.countryCode)) {
        inflationByCountry.set(item.countryCode, { name: item.countryName, values: [] })
      }
      inflationByCountry.get(item.countryCode)!.values.push(item.inflationRate)
    })

    const ranked = Array.from(inflationByCountry.entries())
      .map(([code, data]) => ({
        countryCode: code,
        countryName: data.name,
        value: data.values.reduce((a, b) => a + b, 0) / data.values.length
      }))
      .sort((a, b) => order === "highest" ? b.value - a.value : a.value - b.value)
      .slice(0, Math.min(limit, 50))
      .map((item, index) => ({ ...item, rank: index + 1 }))

    return { metric: "inflation_rate", year, order, data: ranked }
  }

  if (metric === "income_ppp") {
    const data = await db.select({
      countryCode: incomeTable.countryCode,
      countryName: countryTable.name,
      value: incomeTable.ppp_international_dollars,
    })
      .from(incomeTable)
      .innerJoin(countryTable, eq(countryTable.code, incomeTable.countryCode))
      .where(eq(incomeTable.timestamp, year))
      .orderBy(orderDir(incomeTable.ppp_international_dollars))
      .limit(Math.min(limit, 50))

    return { 
      metric: "income_ppp_international_dollars", 
      year, 
      order, 
      data: data.map((item, index) => ({ ...item, rank: index + 1 })) 
    }
  }

  if (metric === "growth_rate") {
    const data = await db.select({
      countryCode: incomeTable.countryCode,
      countryName: countryTable.name,
      value: incomeTable.annual_growth_rate,
    })
      .from(incomeTable)
      .innerJoin(countryTable, eq(countryTable.code, incomeTable.countryCode))
      .where(eq(incomeTable.timestamp, year))
      .orderBy(orderDir(incomeTable.annual_growth_rate))
      .limit(Math.min(limit, 50))

    return { 
      metric: "annual_growth_rate", 
      year, 
      order, 
      data: data.map((item, index) => ({ ...item, rank: index + 1 })) 
    }
  }

  return { error: "Invalid metric" }
}

async function getCountryTimeSeries(countryCode: string) {
  // Get inflation data
  const inflationData = await db.select({
    timestamp: inflationTable.timestamp,
    inflationRate: inflationTable.inflationValue,
  })
    .from(inflationTable)
    .where(eq(inflationTable.countryCode, countryCode))
    .orderBy(asc(inflationTable.timestamp))

  // Get income data
  const incomeData = await db.select({
    timestamp: incomeTable.timestamp,
    ppp_international_dollars: incomeTable.ppp_international_dollars,
    annual_growth_rate: incomeTable.annual_growth_rate,
  })
    .from(incomeTable)
    .where(eq(incomeTable.countryCode, countryCode))
    .orderBy(asc(incomeTable.timestamp))

  // Get country name
  const country = await db.select({ name: countryTable.name })
    .from(countryTable)
    .where(eq(countryTable.code, countryCode))
    .limit(1)

  return {
    countryCode,
    countryName: country[0]?.name || countryCode,
    inflationData,
    incomeData
  }
}

async function getAvailableYears() {
  const incomeYears = await db.selectDistinct({ timestamp: incomeTable.timestamp })
    .from(incomeTable)
    .where(sql`LENGTH(${incomeTable.timestamp}) = 4`)
    .orderBy(desc(incomeTable.timestamp))

  const inflationYears = await db.selectDistinct({ timestamp: inflationTable.timestamp })
    .from(inflationTable)
    .orderBy(desc(inflationTable.timestamp))

  // Extract unique years
  const years = new Set<string>()
  incomeYears.forEach(item => years.add(item.timestamp))
  inflationYears.forEach(item => {
    const year = item.timestamp.length === 4 ? item.timestamp : item.timestamp.substring(0, 4)
    years.add(year)
  })

  const sortedYears = Array.from(years).sort().reverse()
  return {
    availableYears: sortedYears,
    earliest: sortedYears[sortedYears.length - 1],
    latest: sortedYears[0],
    totalYears: sortedYears.length
  }
}

// Regional country code mappings
const REGION_COUNTRIES: Record<string, string[]> = {
  europe: ["ALB", "AND", "AUT", "BLR", "BEL", "BIH", "BGR", "HRV", "CYP", "CZE", "DNK", "EST", "FIN", "FRA", "DEU", "GRC", "HUN", "ISL", "IRL", "ITA", "XKX", "LVA", "LIE", "LTU", "LUX", "MLT", "MDA", "MCO", "MNE", "NLD", "MKD", "NOR", "POL", "PRT", "ROU", "RUS", "SMR", "SRB", "SVK", "SVN", "ESP", "SWE", "CHE", "UKR", "GBR"],
  eu: ["AUT", "BEL", "BGR", "HRV", "CYP", "CZE", "DNK", "EST", "FIN", "FRA", "DEU", "GRC", "HUN", "IRL", "ITA", "LVA", "LTU", "LUX", "MLT", "NLD", "POL", "PRT", "ROU", "SVK", "SVN", "ESP", "SWE"],
  asia: ["AFG", "ARM", "AZE", "BHR", "BGD", "BTN", "BRN", "KHM", "CHN", "GEO", "HKG", "IND", "IDN", "IRN", "IRQ", "ISR", "JPN", "JOR", "KAZ", "KWT", "KGZ", "LAO", "LBN", "MAC", "MYS", "MDV", "MNG", "MMR", "NPL", "PRK", "OMN", "PAK", "PHL", "QAT", "SAU", "SGP", "KOR", "LKA", "SYR", "TWN", "TJK", "THA", "TLS", "TUR", "TKM", "ARE", "UZB", "VNM", "YEM"],
  north_america: ["CAN", "USA", "MEX", "GTM", "BLZ", "SLV", "HND", "NIC", "CRI", "PAN", "CUB", "DOM", "HTI", "JAM", "TTO", "BHS", "BRB"],
  south_america: ["ARG", "BOL", "BRA", "CHL", "COL", "ECU", "GUY", "PRY", "PER", "SUR", "URY", "VEN"],
  africa: ["DZA", "AGO", "BEN", "BWA", "BFA", "BDI", "CMR", "CPV", "CAF", "TCD", "COM", "COD", "COG", "CIV", "DJI", "EGY", "GNQ", "ERI", "ETH", "GAB", "GMB", "GHA", "GIN", "GNB", "KEN", "LSO", "LBR", "LBY", "MDG", "MWI", "MLI", "MRT", "MUS", "MAR", "MOZ", "NAM", "NER", "NGA", "RWA", "STP", "SEN", "SYC", "SLE", "SOM", "ZAF", "SSD", "SDN", "SWZ", "TZA", "TGO", "TUN", "UGA", "ZMB", "ZWE"],
  oceania: ["AUS", "FJI", "NZL", "PNG", "WSM", "SLB", "TON", "VUT"],
  middle_east: ["BHR", "IRN", "IRQ", "ISR", "JOR", "KWT", "LBN", "OMN", "QAT", "SAU", "SYR", "ARE", "YEM", "TUR", "EGY"],
  g7: ["USA", "GBR", "FRA", "DEU", "ITA", "JPN", "CAN"],
  g20: ["ARG", "AUS", "BRA", "CAN", "CHN", "FRA", "DEU", "IND", "IDN", "ITA", "JPN", "MEX", "RUS", "SAU", "ZAF", "KOR", "TUR", "GBR", "USA"],
  oecd: ["AUS", "AUT", "BEL", "CAN", "CHL", "COL", "CRI", "CZE", "DNK", "EST", "FIN", "FRA", "DEU", "GRC", "HUN", "ISL", "IRL", "ISR", "ITA", "JPN", "KOR", "LVA", "LTU", "LUX", "MEX", "NLD", "NZL", "NOR", "POL", "PRT", "SVK", "SVN", "ESP", "SWE", "CHE", "TUR", "GBR", "USA"]
}

function getCountriesByRegion(region: string) {
  const regionKey = region.toLowerCase().replace(/[- ]/g, "_")
  const countryCodes = REGION_COUNTRIES[regionKey]
  
  if (!countryCodes) {
    return { 
      error: `Unknown region: ${region}. Available regions: europe, eu, asia, north_america, south_america, africa, oceania, middle_east, g7, g20, oecd` 
    }
  }
  
  return {
    region,
    countryCodes,
    count: countryCodes.length,
    note: "These are standard ISO 3166-1 alpha-3 country codes. Not all countries may have data in the database."
  }
}

async function calculateRealIncomeChange(countryCodes: string[] | undefined, year: string, limit: number = 20) {
  // Get income data with growth rates
  const incomeConditions = [eq(incomeTable.timestamp, year)]
  if (countryCodes && countryCodes.length > 0) {
    incomeConditions.push(sql`${incomeTable.countryCode} IN ${countryCodes}`)
  }

  const incomeData = await db.select({
    countryCode: incomeTable.countryCode,
    countryName: countryTable.name,
    annual_growth_rate: incomeTable.annual_growth_rate,
  })
    .from(incomeTable)
    .innerJoin(countryTable, eq(countryTable.code, incomeTable.countryCode))
    .where(and(...incomeConditions))

  // Get inflation data for the year (filter by country codes if provided)
  let inflationConditions = [like(inflationTable.timestamp, `${year}%`)]
  if (countryCodes && countryCodes.length > 0) {
    inflationConditions.push(sql`${inflationTable.countryCode} IN ${countryCodes}`)
  }

  const inflationData = await db.select({
    countryCode: inflationTable.countryCode,
    timestamp: inflationTable.timestamp,
    inflationRate: inflationTable.inflationValue,
  })
    .from(inflationTable)
    .where(and(...inflationConditions))

  // Calculate yearly inflation averages
  const inflationByCountry = new Map<string, number[]>()
  inflationData.forEach(item => {
    if (!inflationByCountry.has(item.countryCode)) {
      inflationByCountry.set(item.countryCode, [])
    }
    inflationByCountry.get(item.countryCode)!.push(item.inflationRate)
  })

  // Combine and calculate real income change
  const results = incomeData
    .map(income => {
      const inflationValues = inflationByCountry.get(income.countryCode)
      const avgInflation = inflationValues 
        ? inflationValues.reduce((a, b) => a + b, 0) / inflationValues.length 
        : null

      return {
        countryCode: income.countryCode,
        countryName: income.countryName,
        annual_growth_rate: income.annual_growth_rate,
        inflationRate: avgInflation,
        realIncomeChange: income.annual_growth_rate && avgInflation 
          ? income.annual_growth_rate - avgInflation 
          : null
      }
    })
    .filter(item => item.realIncomeChange !== null)
    .sort((a, b) => (b.realIncomeChange || 0) - (a.realIncomeChange || 0))
    .slice(0, Math.min(limit, 100))

  const requestedCount = countryCodes?.length || 0
  const foundCount = results.length

  return {
    year,
    description: "Real income change = income growth rate - inflation rate. Positive values mean purchasing power increased.",
    note: requestedCount > 0 && foundCount < requestedCount 
      ? `Found data for ${foundCount} out of ${requestedCount} requested countries. Some countries may not have complete income or inflation data.`
      : undefined,
    totalResults: foundCount,
    data: results
  }
}

// Execute tool calls
async function executeToolCall(toolName: string, args: Record<string, unknown>) {
  switch (toolName) {
    case "get_countries_list":
      return await getCountriesList(args.search as string | undefined)
    case "get_inflation_data":
      return await getInflationData(
        args.country_codes as string[] | undefined,
        args.start_year as string | undefined,
        args.end_year as string | undefined,
        args.limit as number | undefined
      )
    case "get_income_data":
      return await getIncomeData(
        args.country_codes as string[] | undefined,
        args.start_year as string | undefined,
        args.end_year as string | undefined,
        args.limit as number | undefined
      )
    case "get_country_comparison":
      return await getCountryComparison(
        args.country_codes as string[],
        args.year as string
      )
    case "get_country_ranking":
      return await getCountryRanking(
        args.metric as string,
        args.year as string,
        args.order as string | undefined,
        args.limit as number | undefined
      )
    case "get_country_time_series":
      return await getCountryTimeSeries(args.country_code as string)
    case "get_available_years":
      return await getAvailableYears()
    case "calculate_real_income_change":
      return await calculateRealIncomeChange(
        args.country_codes as string[] | undefined,
        args.year as string,
        args.limit as number | undefined
      )
    case "get_countries_by_region":
      return getCountriesByRegion(args.region as string)
    default:
      return { error: `Unknown tool: ${toolName}` }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json()

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      )
    }

    const systemMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
      role: "system",
      content: `You are an AI assistant for an Economy Analyzer application. You help users understand and analyze inflation and income data from around the world.

CRITICAL RULES FOR DATA:
1. ALL numerical values, percentages, rankings, and statistics MUST come EXACTLY from the database. NEVER invent, estimate, or round data.
2. ALWAYS use the available tools to query the database FIRST before answering any question about data.
3. When citing data, be precise - use the exact values returned from the database.

IMPORTANT - ALWAYS PROVIDE DATA WHEN AVAILABLE:
1. Even if you can only find PARTIAL data (e.g., 15 out of 27 EU countries), ALWAYS show what you found!
2. Include a clear note about data availability (e.g., "Data available for 15 out of 27 requested countries")
3. NEVER say "data is not available" if the tools returned ANY results - show what you have
4. Explain which measures were used (e.g., "Real income change = annual income growth rate - inflation rate")
5. Note any limitations (e.g., "Some countries may have incomplete data for this year")

REGIONAL QUERIES:
1. When users ask about "European countries", "Asian countries", etc., use the get_countries_by_region tool first
2. Then use those country codes to query for data
3. Show results for all countries that have data, even if not all countries in the region have data

RULES FOR CONTEXT AND EXPLANATIONS:
1. After presenting the database data, you SHOULD provide helpful context and explanations using your general knowledge.
2. Explain WHY certain trends occurred (e.g., "The high inflation in 2022 was largely driven by energy price increases following the Ukraine conflict, supply chain disruptions from COVID-19, and expansionary monetary policies").
3. Help users understand what the numbers mean in real-world terms.
4. Provide historical context, economic explanations, and relevant background information.
5. Make connections between different data points and explain patterns.

You have access to a database containing:
- Inflation data: inflation rates for countries (some have monthly data, some yearly)
- Income data: PPP (purchasing power parity) income in international dollars, local currency values, and annual growth rates

When users ask questions:
1. ALWAYS query the database first using the available tools
2. Present the EXACT data from the database (show ALL results, don't skip any)
3. Then provide context, explanations, and insights using your knowledge
4. Format large numbers for readability (e.g., "$45,000" not "45000")
5. When showing rankings or comparisons, present data in a clear, organized way using tables

If a user asks about something not in the database (like GDP, unemployment, etc.), politely explain that you only have inflation and income data.

Country codes are typically 3-letter ISO codes (e.g., USA, DEU, GBR, JPN, CHN). Germany is DEU.

You can respond in the same language the user uses.`
    }

    // Add system message to the beginning
    const fullMessages = [systemMessage, ...messages]

    // Make the initial API call
    let response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: fullMessages,
      tools,
      tool_choice: "auto",
    })

    // Process tool calls in a loop until we get a final response
    // Accumulate all tool-related messages across iterations
    const allToolMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []
    
    while (response.choices[0].message.tool_calls) {
      const toolCalls = response.choices[0].message.tool_calls
      
      // Add the assistant's message with tool calls
      allToolMessages.push(response.choices[0].message)
      
      for (const toolCall of toolCalls) {
        if (toolCall.type !== "function") continue
        const args = JSON.parse(toolCall.function.arguments)
        const result = await executeToolCall(toolCall.function.name, args)
        
        allToolMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        })
      }

      // Make another API call with tool results
      response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [...fullMessages, ...allToolMessages],
        tools,
        tool_choice: "auto",
      })
    }

    // Return the final response
    return NextResponse.json({
      message: response.choices[0].message.content
    })

  } catch (error) {
    console.error("Chat API error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred" },
      { status: 500 }
    )
  }
}

