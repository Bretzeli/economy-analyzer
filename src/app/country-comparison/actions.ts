"use server"

import { getAllCountries, getCountryTimeSeriesData, type CountryInfo, type CountryTimeSeriesData } from "@/services/db-operations"

export async function fetchAllCountries(): Promise<CountryInfo[]> {
  return getAllCountries()
}

export async function fetchCountryTimeSeries(countryCode: string): Promise<CountryTimeSeriesData[]> {
  return getCountryTimeSeriesData(countryCode)
}

