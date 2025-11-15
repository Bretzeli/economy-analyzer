"use server"

import { getAllCountries, getAvailableYears, type CountryInfo } from "@/services/db-operations"
import { db } from "@/db/db"
import { countryTable, inflationTable, incomeTable } from "@/db/schema"
import { and, eq, gte, lte, inArray, sql, desc, like } from "drizzle-orm"
import type { Filter } from "@/types/filters"

export type TabularViewRow = {
  countryCode: string
  countryName: string
  timestamp: string
  inflationValue: number | null
  current_local_currency: number | null
  ppp_international_dollars: number | null
  annual_growth_rate: number | null
}

export async function fetchAllCountries(): Promise<CountryInfo[]> {
  return getAllCountries()
}

export async function fetchTabularDataCount(filter: Filter): Promise<number> {
  const conditions: any[] = []

  // Country code filter
  if (filter.countryCodes && filter.countryCodes.length > 0) {
    conditions.push(inArray(countryTable.code, filter.countryCodes))
  }

  // Date range filters for inflation
  const inflationConditions: any[] = []
  if (filter.startDate) {
    inflationConditions.push(gte(inflationTable.timestamp, filter.startDate))
  }
  if (filter.endDate) {
    inflationConditions.push(lte(inflationTable.timestamp, filter.endDate))
  }

  // Count inflation data (including monthly)
  const inflationCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(inflationTable)
    .innerJoin(countryTable, eq(countryTable.code, inflationTable.countryCode))
    .where(
      conditions.length > 0 || inflationConditions.length > 0
        ? and(...conditions, ...inflationConditions)
        : undefined
    )

  // Count income data (yearly) that doesn't have matching inflation
  const incomeConditions: any[] = []
  if (filter.startDate) {
    const year = filter.startDate.length >= 4 ? filter.startDate.substring(0, 4) : filter.startDate
    incomeConditions.push(gte(incomeTable.timestamp, year))
  }
  if (filter.endDate) {
    const year = filter.endDate.length >= 4 ? filter.endDate.substring(0, 4) : filter.endDate
    incomeConditions.push(lte(incomeTable.timestamp, year))
  }

  // Get income timestamps to check for matches
  const incomeTimestamps = await db
    .select({ 
      countryCode: incomeTable.countryCode,
      timestamp: incomeTable.timestamp 
    })
    .from(incomeTable)
    .innerJoin(countryTable, eq(countryTable.code, incomeTable.countryCode))
    .where(
      conditions.length > 0 || incomeConditions.length > 0
        ? and(...conditions, ...incomeConditions)
        : undefined
    )

  // Count income rows that don't have matching inflation data
  const incomeYearKeys = new Set(incomeTimestamps.map(i => `${i.countryCode}-${i.timestamp}`))
  
  // Get inflation year keys
  const inflationDataForKeys = await db
    .select({
      countryCode: inflationTable.countryCode,
      timestamp: inflationTable.timestamp,
    })
    .from(inflationTable)
    .innerJoin(countryTable, eq(countryTable.code, inflationTable.countryCode))
    .where(
      conditions.length > 0 || inflationConditions.length > 0
        ? and(...conditions, ...inflationConditions)
        : undefined
    )

  const inflationYearKeys = new Set(inflationDataForKeys.map(i => {
    const year = i.timestamp.length >= 4 ? i.timestamp.substring(0, 4) : i.timestamp
    return `${i.countryCode}-${year}`
  }))

  // Count income-only rows
  let incomeOnlyCount = 0
  incomeYearKeys.forEach(key => {
    if (!inflationYearKeys.has(key)) {
      incomeOnlyCount++
    }
  })

  return (inflationCount[0]?.count ?? 0) + incomeOnlyCount
}

export async function fetchTabularData(filter: Filter): Promise<TabularViewRow[]> {
  const conditions: any[] = []

  // Country code filter
  if (filter.countryCodes && filter.countryCodes.length > 0) {
    conditions.push(inArray(countryTable.code, filter.countryCodes))
  }

  // Date range filters for inflation
  const inflationConditions: any[] = []
  if (filter.startDate) {
    inflationConditions.push(gte(inflationTable.timestamp, filter.startDate))
  }
  if (filter.endDate) {
    inflationConditions.push(lte(inflationTable.timestamp, filter.endDate))
  }

  // Get all inflation data (including monthly)
  const inflationData = await db
    .select({
      countryCode: inflationTable.countryCode,
      countryName: countryTable.name,
      timestamp: inflationTable.timestamp,
      inflationValue: inflationTable.inflationValue,
    })
    .from(inflationTable)
    .innerJoin(countryTable, eq(countryTable.code, inflationTable.countryCode))
    .where(
      conditions.length > 0 || inflationConditions.length > 0
        ? and(...conditions, ...inflationConditions)
        : undefined
    )

  // Get all income data (yearly)
  const incomeConditions: any[] = []
  if (filter.startDate) {
    // For income, we need to match by year if startDate is monthly
    const year = filter.startDate.length >= 4 ? filter.startDate.substring(0, 4) : filter.startDate
    incomeConditions.push(gte(incomeTable.timestamp, year))
  }
  if (filter.endDate) {
    const year = filter.endDate.length >= 4 ? filter.endDate.substring(0, 4) : filter.endDate
    incomeConditions.push(lte(incomeTable.timestamp, year))
  }

  const incomeData = await db
    .select({
      countryCode: incomeTable.countryCode,
      countryName: countryTable.name,
      timestamp: incomeTable.timestamp,
      ppp_international_dollars: incomeTable.ppp_international_dollars,
      current_local_currency: incomeTable.current_local_currency,
      annual_growth_rate: incomeTable.annual_growth_rate,
    })
    .from(incomeTable)
    .innerJoin(countryTable, eq(countryTable.code, incomeTable.countryCode))
    .where(
      conditions.length > 0 || incomeConditions.length > 0
        ? and(...conditions, ...incomeConditions)
        : undefined
    )

  // Create a map of income data by country and year
  const incomeMap = new Map<string, typeof incomeData[0]>()
  incomeData.forEach(item => {
    const key = `${item.countryCode}-${item.timestamp}`
    incomeMap.set(key, item)
  })

  // Combine inflation data with income data
  // For monthly inflation timestamps, match with yearly income by extracting the year
  const result: TabularViewRow[] = inflationData.map(inflation => {
    const year = inflation.timestamp.length >= 4 ? inflation.timestamp.substring(0, 4) : inflation.timestamp
    const incomeKey = `${inflation.countryCode}-${year}`
    const income = incomeMap.get(incomeKey)

    return {
      countryCode: inflation.countryCode,
      countryName: inflation.countryName,
      timestamp: inflation.timestamp,
      inflationValue: inflation.inflationValue,
      current_local_currency: income?.current_local_currency ?? null,
      ppp_international_dollars: income?.ppp_international_dollars ?? null,
      annual_growth_rate: income?.annual_growth_rate ?? null,
    }
  })

  // Also include income-only rows (where there's no inflation data for that year)
  const inflationKeys = new Set(inflationData.map(i => {
    const year = i.timestamp.length >= 4 ? i.timestamp.substring(0, 4) : i.timestamp
    return `${i.countryCode}-${year}`
  }))

  incomeData.forEach(income => {
    const key = `${income.countryCode}-${income.timestamp}`
    if (!inflationKeys.has(key)) {
      // Check if we should include this based on date filters
      const shouldInclude = 
        (!filter.startDate || income.timestamp >= filter.startDate.substring(0, 4)) &&
        (!filter.endDate || income.timestamp <= filter.endDate.substring(0, 4))
      
      if (shouldInclude) {
        result.push({
          countryCode: income.countryCode,
          countryName: income.countryName,
          timestamp: income.timestamp,
          inflationValue: null,
          current_local_currency: income.current_local_currency,
          ppp_international_dollars: income.ppp_international_dollars,
          annual_growth_rate: income.annual_growth_rate,
        })
      }
    }
  })

  // Apply sorting - support multiple sort columns
  type SortConfig = {
    column: 'country' | 'timestamp' | 'inflationValue' | 'current_local_currency' | 'ppp_international_dollars' | 'annual_growth_rate'
    direction: 'asc' | 'desc'
  }
  const sortConfigs: SortConfig[] = (filter as Filter & { sortConfigs?: SortConfig[] }).sortConfigs || (filter.sortBy && filter.sortOrder ? [{
    column: filter.sortBy as SortConfig['column'],
    direction: filter.sortOrder
  }] : [])
  
  if (sortConfigs.length > 0) {
    result.sort((a, b) => {
      for (const sortConfig of sortConfigs) {
        let comparison = 0
        const sortOrder = sortConfig.direction === 'desc' ? -1 : 1
        
        switch (sortConfig.column) {
          case 'country':
            comparison = a.countryName.localeCompare(b.countryName)
            break
          case 'timestamp':
          case 'time':
            // Properly compare timestamps: YYYY or YYYY-MM format
            // Convert to comparable format: YYYY-MM-DD (using 01 for month/day if not present)
            const aTimestamp = a.timestamp.length === 4 
              ? `${a.timestamp}-01-01` 
              : a.timestamp.length === 7 
                ? `${a.timestamp}-01` 
                : a.timestamp
            const bTimestamp = b.timestamp.length === 4 
              ? `${b.timestamp}-01-01` 
              : b.timestamp.length === 7 
                ? `${b.timestamp}-01` 
                : b.timestamp
            comparison = aTimestamp.localeCompare(bTimestamp)
            break
          case 'inflation':
          case 'inflationValue':
            const aInf = a.inflationValue ?? -Infinity
            const bInf = b.inflationValue ?? -Infinity
            comparison = aInf - bInf
            break
          case 'incomeLCU':
          case 'current_local_currency':
            const aLCU = a.current_local_currency ?? -Infinity
            const bLCU = b.current_local_currency ?? -Infinity
            comparison = aLCU - bLCU
            break
          case 'incomePPP':
          case 'ppp_international_dollars':
            const aPPP = a.ppp_international_dollars ?? -Infinity
            const bPPP = b.ppp_international_dollars ?? -Infinity
            comparison = aPPP - bPPP
            break
          case 'growthRate':
          case 'annual_growth_rate':
            const aGrowth = a.annual_growth_rate ?? -Infinity
            const bGrowth = b.annual_growth_rate ?? -Infinity
            comparison = aGrowth - bGrowth
            break
        }
        
        if (comparison !== 0) {
          return comparison * sortOrder
        }
      }
      return 0
    })
  }

  // Apply pagination
  if (filter.paging) {
    const offset = filter.paging.offset ?? 0
    const limit = filter.paging.limit ?? 20
    return result.slice(offset, offset + limit)
  }

  return result
}

export async function fetchAvailableYearsForFilter(): Promise<string[]> {
  return getAvailableYears()
}

export async function fetchAvailableMonths(year: string): Promise<string[]> {
  const months = await db
    .selectDistinct({ timestamp: inflationTable.timestamp })
    .from(inflationTable)
    .where(
      and(
        sql`LENGTH(${inflationTable.timestamp}) = 7`,
        sql`${inflationTable.timestamp} ~ '^[0-9]{4}-[0-9]{2}$'`,
        like(inflationTable.timestamp, `${year}-%`)
      )
    )
    .orderBy(desc(inflationTable.timestamp))

  const monthSet = new Set<string>()
  months.forEach(item => {
    if (item.timestamp.length === 7) {
      monthSet.add(item.timestamp.substring(5, 7))
    }
  })

  return Array.from(monthSet).sort().reverse()
}

