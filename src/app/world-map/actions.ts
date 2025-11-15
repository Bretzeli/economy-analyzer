"use server"

import { getWorldMapData, getAvailableYears, getGlobalValueBounds, type WorldMapData, type GlobalValueBounds } from "@/services/db-operations"

export async function fetchWorldMapData(year: string): Promise<WorldMapData[]> {
  return getWorldMapData(year)
}

export async function fetchAvailableYears(): Promise<string[]> {
  return getAvailableYears()
}

export async function fetchGlobalValueBounds(): Promise<GlobalValueBounds> {
  return getGlobalValueBounds()
}

