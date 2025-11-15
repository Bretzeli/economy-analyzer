"use server"

import { getAllCountries, getCountryTimeSeriesData, getAvailableTimestampsForCountry, getCountryRankingWithLCU, getInflationRankingWithYearlyAverage, type CountryInfo, type CountryTimeSeriesData } from "@/services/db-operations"

export async function fetchAllCountries(): Promise<CountryInfo[]> {
  return getAllCountries()
}

export async function fetchCountryTimeSeries(countryCode: string): Promise<CountryTimeSeriesData[]> {
  return getCountryTimeSeriesData(countryCode)
}

export async function fetchAvailableTimestamps(countryCode: string): Promise<string[]> {
  return getAvailableTimestampsForCountry(countryCode)
}

export async function fetchCountryRanking(countryCode: string, timestamp?: string, useLCU: boolean = false) {
  return getCountryRankingWithLCU(countryCode, timestamp, useLCU)
}

export async function fetchInflationRankingWithYearlyAverage(countryCode: string, year: string) {
  return getInflationRankingWithYearlyAverage(countryCode, year)
}

