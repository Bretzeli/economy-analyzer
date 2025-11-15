"use client"

import { useState, useEffect, useMemo, useCallback, startTransition } from "react"
// @ts-expect-error - react-simple-maps doesn't have types
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/shadcn/tooltip"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select"
import { Slider } from "@/components/shadcn/slider"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shadcn/card"
import { Globe } from "lucide-react"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import { fetchWorldMapData, fetchAvailableYears, fetchGlobalValueBounds } from "./actions"
import type { WorldMapData, GlobalValueBounds } from "@/services/db-operations"
import { COUNTRY_CODE_TO_NAME } from "@/lib/country-codes"

// Use world-atlas TopoJSON (doesn't have ISO codes, only names)
// We'll map by country name instead
const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"

// Create reverse mapping from country names to ISO codes using country-codes.ts
// Also include common variations of country names
const countryNameToIso: Record<string, string> = {}
Object.entries(COUNTRY_CODE_TO_NAME).forEach(([code, name]) => {
  countryNameToIso[name] = code
  // Add common variations
  if (name === "United States") {
    countryNameToIso["United States of America"] = code
    countryNameToIso["USA"] = code
  }
  if (name === "United Kingdom") {
    countryNameToIso["UK"] = code
    countryNameToIso["Great Britain"] = code
  }
  if (name === "South Korea") {
    countryNameToIso["Korea"] = code
    countryNameToIso["Korea, South"] = code
  }
})

type ValueType = "inflation" | "ppp" | "lcu" | "growth" | "difference"

export default function WorldMapPage() {
  const { resolvedTheme } = useTheme()
  const router = useRouter()
  const isDarkMode = resolvedTheme === "dark" || false
  const [mapData, setMapData] = useState<WorldMapData[]>([])
  const [availableYears, setAvailableYears] = useState<string[]>([])
  const [selectedYear, setSelectedYear] = useState<string>("")
  const [selectedValueType, setSelectedValueType] = useState<ValueType>("inflation")
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [globalBounds, setGlobalBounds] = useState<GlobalValueBounds | null>(null)

  // Load available years and global bounds on mount
  useEffect(() => {
    Promise.all([
      fetchAvailableYears(),
      fetchGlobalValueBounds()
    ]).then(([years, bounds]) => {
      setAvailableYears(years)
      setGlobalBounds(bounds)
      if (years.length > 0) {
        setSelectedYear(years[0]) // Default to newest year
      }
    })
  }, [])

  // Load map data when year changes
  useEffect(() => {
    if (!selectedYear) return
    
    let cancelled = false
    
    startTransition(() => {
      setLoading(true)
    })
    
    fetchWorldMapData(selectedYear).then(data => {
      if (!cancelled) {
        console.log(`Loaded ${data.length} countries for year ${selectedYear}`)
        console.log("Sample country codes:", data.slice(0, 5).map(d => d.countryCode))
        
        // Check if countries have actual data
        const countriesWithData = data.filter(d => 
          d.inflationValue !== null || 
          d.ppp_international_dollars !== null || 
          d.current_local_currency !== null ||
          d.annual_growth_rate !== null
        )
        console.log(`Countries with data: ${countriesWithData.length} out of ${data.length}`)
        if (countriesWithData.length > 0) {
          console.log("Sample countries with data:", countriesWithData.slice(0, 5).map(d => ({
            code: d.countryCode,
            name: d.countryName,
            inflation: d.inflationValue,
            ppp: d.ppp_international_dollars,
            growth: d.annual_growth_rate
          })))
        } else {
          console.warn(`No countries have data for year ${selectedYear}. Try selecting a different year.`)
        }
        
        startTransition(() => {
          setMapData(data)
          setLoading(false)
        })
      }
    }).catch(err => {
      if (!cancelled) {
        console.error("Error loading world map data:", err)
        startTransition(() => {
          setLoading(false)
        })
      }
    })

    return () => {
      cancelled = true
    }
  }, [selectedYear])

  // Create a map of country codes to data
  const dataMap = useMemo(() => {
    const map = new Map<string, WorldMapData>()
    mapData.forEach(item => {
      map.set(item.countryCode, item)
    })
    return map
  }, [mapData])

  // Convert country code to ISO 3166-1 alpha-3 (for map matching)
  // The database uses 3-letter codes which should mostly match ISO codes
  const getIsoCode = useCallback((countryCode: string): string => {
    // Most codes should already be ISO codes, but handle some special cases
    const codeMap: Record<string, string> = {
      "G7": "G7", // Not a real ISO code, will be filtered out
      "G20": "G20",
      "EA20": "EA20",
      "EU27_2020": "EU27",
      "OECD": "OECD",
      "OECDE": "OECDE",
    }
    return codeMap[countryCode] || countryCode
  }, [])

  // Create a reverse lookup map: ISO code -> country data
  // This helps match map geography ISO codes to our database country codes
  const isoToDataMap = useMemo(() => {
    const map = new Map<string, WorldMapData>()
    mapData.forEach(item => {
      // Store by the country code itself (which should be ISO alpha-3)
      map.set(item.countryCode, item)
      // Also store by uppercase version for case-insensitive matching
      map.set(item.countryCode.toUpperCase(), item)
      // Store by the mapped code (for special cases)
      const mappedCode = getIsoCode(item.countryCode)
      if (mappedCode !== item.countryCode) {
        map.set(mappedCode, item)
        map.set(mappedCode.toUpperCase(), item)
      }
    })
    return map
  }, [mapData, getIsoCode])

  // Get value for a country based on selected value type
  const getCountryValue = useCallback((countryCode: string): number | null => {
    const data = dataMap.get(countryCode)
    if (!data) return null

    switch (selectedValueType) {
      case "inflation":
        return data.inflationValue
      case "ppp":
        return data.ppp_international_dollars
      case "lcu":
        return data.current_local_currency
      case "growth":
        return data.annual_growth_rate
      case "difference":
        return data.difference
      default:
        return null
    }
  }, [dataMap, selectedValueType])

  // Calculate color scale with 2% as the perfect center point
  // Use global bounds across all years for consistent coloring
  // Uses 85% range (percentiles) to exclude outliers
  const { minValue, maxValue, actualMin, actualMax, colorScale } = useMemo(() => {
    // Get global bounds for the selected value type
    let globalMin: number | null = null
    let globalMax: number | null = null
    let actualMin: number | null = null
    let actualMax: number | null = null

    if (globalBounds) {
      switch (selectedValueType) {
        case "inflation":
          globalMin = globalBounds.inflation?.min ?? null
          globalMax = globalBounds.inflation?.max ?? null
          actualMin = globalBounds.inflation?.actualMin ?? null
          actualMax = globalBounds.inflation?.actualMax ?? null
          break
        case "ppp":
          globalMin = globalBounds.ppp?.min ?? null
          globalMax = globalBounds.ppp?.max ?? null
          actualMin = globalBounds.ppp?.actualMin ?? null
          actualMax = globalBounds.ppp?.actualMax ?? null
          break
        case "lcu":
          globalMin = globalBounds.lcu?.min ?? null
          globalMax = globalBounds.lcu?.max ?? null
          actualMin = globalBounds.lcu?.actualMin ?? null
          actualMax = globalBounds.lcu?.actualMax ?? null
          break
        case "growth":
          globalMin = globalBounds.growth?.min ?? null
          globalMax = globalBounds.growth?.max ?? null
          actualMin = globalBounds.growth?.actualMin ?? null
          actualMax = globalBounds.growth?.actualMax ?? null
          break
        case "difference":
          globalMin = globalBounds.difference?.min ?? null
          globalMax = globalBounds.difference?.max ?? null
          actualMin = globalBounds.difference?.actualMin ?? null
          actualMax = globalBounds.difference?.actualMax ?? null
          break
      }
    }

    // Fallback to current year's values if global bounds not available
    const values = Array.from(dataMap.values())
      .map(item => getCountryValue(item.countryCode))
      .filter((v): v is number => v !== null)

    if (values.length === 0 && (globalMin === null || globalMax === null)) {
      return { minValue: 0, maxValue: 0, actualMin: 0, actualMax: 0, colorScale: () => "hsl(var(--muted))" }
    }

    // Use global bounds if available, otherwise use current year's values
    // min/max are the 85% range bounds, actualMin/actualMax are the true extremes
    const min = globalMin !== null ? globalMin : (values.length > 0 ? Math.min(...values) : 0)
    const max = globalMax !== null ? globalMax : (values.length > 0 ? Math.max(...values) : 0)
    const trueMin = actualMin !== null ? actualMin : (values.length > 0 ? Math.min(...values) : 0)
    const trueMax = actualMax !== null ? actualMax : (values.length > 0 ? Math.max(...values) : 0)
    
    // For percentage-based metrics (inflation, difference), use center values
    // Growth uses sequential red-to-green scale (low = red, high = green)
    const isPercentageMetric = selectedValueType === "inflation" || 
                               selectedValueType === "difference"
    
    if (isPercentageMetric) {
      const centerValue = selectedValueType === "difference" ? 0.0 : 2.0 // 0% for difference, 2% for inflation
      const maxDeviation = Math.max(Math.abs(max - centerValue), Math.abs(min - centerValue))
      
      return {
        minValue: min, // Show 85% range bounds in legend
        maxValue: max,
        actualMin: trueMin, // Keep actual extremes for reference
        actualMax: trueMax,
        colorScale: (value: number | null) => {
          if (value === null) return "hsl(var(--muted))"
          
          // Clamp value to the 85% range for color calculation
          const clampedValue = Math.max(min, Math.min(max, value))
          
          // Calculate distance from center (2%) using clamped value
          const deviation = clampedValue - centerValue
          const normalizedDeviation = Math.max(-1, Math.min(1, deviation / maxDeviation))
          
          // If value is outside the range, use extreme colors
          if (value < min) {
            // Below range: use minimum color (most extreme blue)
            const intensity = 1.0
            const adjustedIntensity = Math.pow(intensity, 0.7)
            const hue = 240 - (adjustedIntensity * 60)
            const saturation = 60 + (adjustedIntensity * 35)
            // Adjust lightness for dark mode: lighter colors in dark mode
            const baseLightness = isDarkMode ? 50 : 60
            const lightnessRange = isDarkMode ? 25 : 30
            const lightness = baseLightness - (adjustedIntensity * lightnessRange)
            return `hsl(${hue}, ${saturation}%, ${lightness}%)`
          } else if (value > max) {
            // Above range: use maximum color (most extreme red)
            const intensity = 1.0
            const adjustedIntensity = Math.pow(intensity, 0.7)
            const hue = 30 - (adjustedIntensity * 30)
            const saturation = 60 + (adjustedIntensity * 35)
            // Adjust lightness for dark mode: lighter colors in dark mode
            const baseLightness = isDarkMode ? 50 : 60
            const lightnessRange = isDarkMode ? 25 : 30
            const lightness = baseLightness - (adjustedIntensity * lightnessRange)
            return `hsl(${hue}, ${saturation}%, ${lightness}%)`
          }
          
          if (selectedValueType === "difference") {
            // For difference: 0% is neutral, below is cold (blue), above is hot (red)
            // Use a perceptually uniform diverging scale with better contrast
            if (normalizedDeviation < 0) {
              // Below 0%: blue scale (cold)
              const intensity = Math.abs(normalizedDeviation)
              // Use a power curve to make differences more visible
              const adjustedIntensity = Math.pow(intensity, 0.7)
              // Blue (240) to cyan (180) - more saturated and darker for larger deviations
              const hue = 240 - (adjustedIntensity * 60)
              const saturation = 60 + (adjustedIntensity * 35) // 60% to 95% saturation
              // Adjust lightness for dark mode: lighter colors in dark mode
              const baseLightness = isDarkMode ? 50 : 60
              const lightnessRange = isDarkMode ? 25 : 30
              const lightness = baseLightness - (adjustedIntensity * lightnessRange)
              return `hsl(${hue}, ${saturation}%, ${lightness}%)`
            } else if (normalizedDeviation > 0) {
              // Above 0%: red scale (hot)
              const intensity = normalizedDeviation
              // Use a power curve to make differences more visible
              const adjustedIntensity = Math.pow(intensity, 0.7)
              // Orange (30) to red (0) - more saturated and darker for larger deviations
              const hue = 30 - (adjustedIntensity * 30)
              const saturation = 60 + (adjustedIntensity * 35) // 60% to 95% saturation
              // Adjust lightness for dark mode: lighter colors in dark mode
              const baseLightness = isDarkMode ? 50 : 60
              const lightnessRange = isDarkMode ? 25 : 30
              const lightness = baseLightness - (adjustedIntensity * lightnessRange)
              return `hsl(${hue}, ${saturation}%, ${lightness}%)`
            } else {
              // Exactly 0%: neutral light gray/white - adjust for dark mode
              return isDarkMode ? `hsl(0, 0%, 60%)` : `hsl(0, 0%, 90%)`
            }
          } else {
            // For inflation and growth: 2% is perfect (neutral white/light gray)
            // Below 2%: blue (cold), above 2%: red (hot)
            // Use a perceptually uniform scale with better contrast
            if (normalizedDeviation < 0) {
              // Below 2%: blue scale (cold)
              const intensity = Math.abs(normalizedDeviation)
              // Use a power curve to make differences more visible
              const adjustedIntensity = Math.pow(intensity, 0.7)
              // Blue (240) to cyan (180) - more saturated and darker for larger deviations
              const hue = 240 - (adjustedIntensity * 60)
              const saturation = 60 + (adjustedIntensity * 35) // 60% to 95% saturation
              // Adjust lightness for dark mode: lighter colors in dark mode
              const baseLightness = isDarkMode ? 50 : 60
              const lightnessRange = isDarkMode ? 25 : 30
              const lightness = baseLightness - (adjustedIntensity * lightnessRange)
              return `hsl(${hue}, ${saturation}%, ${lightness}%)`
            } else if (normalizedDeviation > 0) {
              // Above 2%: red scale (hot)
              const intensity = normalizedDeviation
              // Use a power curve to make differences more visible
              const adjustedIntensity = Math.pow(intensity, 0.7)
              // Orange (30) to red (0) - more saturated and darker for larger deviations
              const hue = 30 - (adjustedIntensity * 30)
              const saturation = 60 + (adjustedIntensity * 35) // 60% to 95% saturation
              // Adjust lightness for dark mode: lighter colors in dark mode
              const baseLightness = isDarkMode ? 50 : 60
              const lightnessRange = isDarkMode ? 25 : 30
              const lightness = baseLightness - (adjustedIntensity * lightnessRange)
              return `hsl(${hue}, ${saturation}%, ${lightness}%)`
            } else {
              // Exactly 2%: neutral light gray/white - adjust for dark mode
              return isDarkMode ? `hsl(0, 0%, 60%)` : `hsl(0, 0%, 90%)`
            }
          }
        }
      }
    }

    // For sequential metrics (income, growth): use red-to-green scale
    // Higher is better - low values = red, high values = green
    const isSequentialMetric = selectedValueType === "ppp" || 
                               selectedValueType === "lcu" || 
                               selectedValueType === "growth"
    
    if (isSequentialMetric) {
      const range = max - min
      
      return {
        minValue: min, // Show 85% range bounds in legend
        maxValue: max,
        actualMin: trueMin, // Keep actual extremes for reference
        actualMax: trueMax,
        colorScale: (value: number | null) => {
          if (value === null) return "hsl(var(--muted))"
          
          // Clamp value to the 85% range for color calculation
          const clampedValue = Math.max(min, Math.min(max, value))
          const normalized = (clampedValue - min) / range
          
          // If value is outside the range, use extreme colors
          if (value < min) {
            // Below range: use minimum color (red) - adjust for dark mode
            return isDarkMode ? `hsl(0, 90%, 50%)` : `hsl(0, 90%, 40%)`
          } else if (value > max) {
            // Above range: use maximum color (green) - adjust for dark mode
            return isDarkMode ? `hsl(120, 90%, 50%)` : `hsl(120, 90%, 40%)`
          }
          
          // Red (0) to Green (120) - higher values are green
          const hue = normalized * 120
          const saturation = 70 + ((1 - normalized) * 20)
          // Adjust lightness for dark mode: lighter colors in dark mode
          const baseLightness = isDarkMode ? 45 : 50
          const lightnessRange = isDarkMode ? 15 : 10
          const lightness = baseLightness + ((1 - normalized) * lightnessRange)
          return `hsl(${hue}, ${saturation}%, ${lightness}%)`
        }
      }
    }
    
    // Fallback (should not reach here)
    return {
      minValue: min,
      maxValue: max,
      actualMin: trueMin,
      actualMax: trueMax,
      colorScale: () => "hsl(var(--muted))"
    }
  }, [dataMap, selectedValueType, getCountryValue, globalBounds, isDarkMode])

  // Format value for display
  const formatValue = (value: number | null): string => {
    if (value === null) return "N/A"
    
    switch (selectedValueType) {
      case "inflation":
      case "growth":
      case "difference":
        return `${value.toFixed(1)}%`
      case "ppp":
      case "lcu":
        return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
      default:
        return "N/A"
    }
  }

  // Get tooltip text
  const getTooltipText = (countryCode: string, countryName: string): string => {
    const value = getCountryValue(countryCode)
    if (value === null) {
      return `${countryName} (${countryCode}) N/A`
    }
    return `${countryName} (${countryCode}) ${formatValue(value)}`
  }

  // Year slider value (reverse the index since slider goes left=oldest, right=newest)
  // availableYears is sorted newest first, but slider should be oldest (left) to newest (right)
  const yearIndex = availableYears.indexOf(selectedYear)
  // Reverse the index: if array has 10 items, index 0 (newest) becomes 9 (right), index 9 (oldest) becomes 0 (left)
  const reversedIndex = yearIndex >= 0 ? availableYears.length - 1 - yearIndex : availableYears.length - 1
  const yearSliderValue = [reversedIndex]

  const handleYearSliderChange = (values: number[]) => {
    const sliderIndex = values[0]
    // Reverse back: slider index 0 (left) = oldest (last in array), slider index max (right) = newest (first in array)
    const arrayIndex = availableYears.length - 1 - sliderIndex
    if (arrayIndex >= 0 && arrayIndex < availableYears.length) {
      setSelectedYear(availableYears[arrayIndex])
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-primary/10">
            <Globe className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            World Map
          </h1>
        </div>

        {/* Controls */}
        <Card>
          <CardHeader>
            <CardTitle>Map Controls</CardTitle>
            <CardDescription>Select the data type and year to display on the map</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="min-w-[200px]">
                <Select value={selectedValueType} onValueChange={(v) => setSelectedValueType(v as ValueType)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select value type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inflation">Inflation Rate</SelectItem>
                    <SelectItem value="ppp">PPP Income Data</SelectItem>
                    <SelectItem value="lcu">LCU Income Data</SelectItem>
                    <SelectItem value="growth">Income Growth Rate</SelectItem>
                    <SelectItem value="difference">Growth Rate - Inflation (Difference)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1 space-y-2 w-full">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Year</label>
                  <span className="text-sm text-muted-foreground">{selectedYear || "Loading..."}</span>
                </div>
                {availableYears.length > 0 && (
                  <Slider
                    value={yearSliderValue}
                    onValueChange={handleYearSliderChange}
                    min={0}
                    max={availableYears.length - 1}
                    step={1}
                    className="w-full"
                  />
                )}
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{availableYears[availableYears.length - 1] || ""}</span>
                  <span>{availableYears[0] || ""}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Map */}
        <Card>
          <CardContent className="p-6">
            {loading ? (
              <div className="h-[600px] flex items-center justify-center text-muted-foreground">
                Loading map data...
              </div>
            ) : (
              <div className="w-full h-[600px] relative">
                <ComposableMap
                  projectionConfig={{
                    scale: 147,
                    center: [0, 20],
                  }}
                  className="w-full h-full"
                >
                  <ZoomableGroup>
                    <Geographies geography={geoUrl}>
                      {({ geographies }: { geographies: Array<{ rsmKey: string; properties: Record<string, string> }> }) => {
                        // Debug: log first geography to see what properties are available
                        if (geographies.length > 0 && mapData.length > 0) {
                          const firstGeo = geographies[0]
                          console.log("First geography properties:", Object.keys(firstGeo.properties))
                          console.log("Sample ISO codes from map:", geographies.slice(0, 5).map(g => ({
                            name: g.properties.NAME || g.properties.NAME_LONG,
                            ISO_A3: g.properties.ISO_A3,
                            ISO_A3_EH: g.properties.ISO_A3_EH,
                            ISO3: g.properties.ISO3,
                            allProps: Object.keys(g.properties).filter(k => k.includes("ISO") || k.includes("CODE"))
                          })))
                          console.log("Sample DB codes:", Array.from(dataMap.keys()).slice(0, 10))
                        }
                        
                        return geographies.map((geo) => {
                          // world-atlas only has "name" property, not ISO codes
                          // Get country name from map (try multiple property names)
                          const mapCountryName = (
                            geo.properties.name || 
                            geo.properties.NAME || 
                            geo.properties.NAME_LONG ||
                            geo.properties.NAME_EN ||
                            geo.properties.ADMIN ||
                            ""
                          ).trim()
                          
                          // Convert country name to ISO code using our mapping
                          let isoCode = countryNameToIso[mapCountryName]
                          
                          // If not found in mapping, try case-insensitive match
                          if (!isoCode) {
                            const normalizedName = mapCountryName.toLowerCase()
                            for (const [name, code] of Object.entries(countryNameToIso)) {
                              if (name.toLowerCase() === normalizedName) {
                                isoCode = code
                                break
                              }
                            }
                          }
                          
                          // Also try matching by country name directly in our database
                          let countryData: WorldMapData | undefined = undefined
                          
                          if (isoCode) {
                            // Try lookup by ISO code
                            countryData = isoToDataMap.get(isoCode) || isoToDataMap.get(isoCode.toUpperCase())
                          }
                          
                          // If still not found, try matching by country name in database
                          if (!countryData && mapCountryName) {
                            for (const [code, data] of dataMap.entries()) {
                              if (data.countryName.toLowerCase() === mapCountryName.toLowerCase()) {
                                countryData = data
                                isoCode = code
                                break
                              }
                            }
                          }
                          
                          // If still not found, try case-insensitive search in dataMap by code
                          if (!countryData && isoCode) {
                            for (const [code, data] of dataMap.entries()) {
                              if (code.toUpperCase() === isoCode.toUpperCase()) {
                                countryData = data
                                break
                              }
                            }
                          }

                          // Always use database name if available, otherwise use map name
                          // This ensures we always have a country name to display
                          const countryName = countryData?.countryName || mapCountryName || "Unknown Country"
                          
                          // Use database code if available, otherwise use ISO code, or fallback to map name
                          const countryCode = countryData?.countryCode || isoCode || mapCountryName || "UNK"
                          const dbCountryCode = countryData?.countryCode || ""
                          
                          // Get value directly from countryData - no need to lookup again
                          let value: number | null = null
                          if (countryData) {
                            // Get value directly from the countryData object based on selected value type
                            switch (selectedValueType) {
                              case "inflation":
                                value = countryData.inflationValue
                                break
                              case "ppp":
                                value = countryData.ppp_international_dollars
                                break
                              case "lcu":
                                value = countryData.current_local_currency
                                break
                              case "growth":
                                value = countryData.annual_growth_rate
                                break
                              case "difference":
                                value = countryData.difference
                                break
                            }
                            
                            // Debug: log matches (only once for first geography)
                            if (value !== null && geographies.indexOf(geo) === 0) {
                              const matchCount = geographies.filter((g) => {
                                const gIso = (g.properties.ISO_A3 || g.properties.ISO_A3_EH || "").trim()
                                const gData = isoToDataMap.get(gIso) || isoToDataMap.get(gIso.toUpperCase())
                                return gData && (gData.inflationValue !== null || gData.ppp_international_dollars !== null)
                              }).length
                              console.log(`Total matches found: ${matchCount} out of ${geographies.length} geographies`)
                            }
                          } else if (countryData) {
                            // We have country data but the selected value type has no value
                            console.log(`Country ${dbCountryCode} has data but no value for ${selectedValueType}`)
                          }
                          
                          // For countries without data: gray fill in dark mode, black in light mode
                          const noDataFill = isDarkMode ? "hsl(0, 0%, 50%)" : "hsl(var(--muted))"
                          const fill = value !== null ? colorScale(value) : noDataFill
                          const isHovered = hoveredCountry === dbCountryCode || hoveredCountry === isoCode
                          // Border: black in dark mode, default border in light mode
                          const borderColor = isDarkMode 
                            ? "#000000" 
                            : "hsl(var(--border))"

                          const handleCountryClick = () => {
                            // Only navigate if we have a valid country code
                            if (dbCountryCode && selectedYear) {
                              router.push(`/single-country?country=${encodeURIComponent(dbCountryCode)}&year=${encodeURIComponent(selectedYear)}&ignoreMonth=true`)
                            }
                          }

                          return (
                            <TooltipProvider key={geo.rsmKey}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Geography
                                    geography={geo}
                                    fill={fill}
                                    stroke={borderColor}
                                    strokeWidth={isHovered ? 2 : 0.5}
                                    style={{
                                      default: {
                                        outline: "none",
                                        transition: "all 0.2s",
                                      },
                                      hover: {
                                        fill: value !== null ? colorScale(value) : noDataFill,
                                        outline: "none",
                                        strokeWidth: 2,
                                        cursor: dbCountryCode ? "pointer" : "default",
                                      },
                                      pressed: {
                                        outline: "none",
                                      },
                                    }}
                                    onMouseEnter={() => setHoveredCountry(dbCountryCode || isoCode)}
                                    onMouseLeave={() => setHoveredCountry(null)}
                                    onClick={handleCountryClick}
                                  />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{getTooltipText(countryCode, countryName)}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )
                        })
                      }}
                    </Geographies>
                  </ZoomableGroup>
                </ComposableMap>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Legend */}
        {!loading && mapData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Legend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {selectedValueType === "difference" ? (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Min: {formatValue(minValue)}</span>
                      <div className="flex-1 mx-4 h-4 rounded relative" style={{
                        background: "linear-gradient(to right, hsl(240, 90%, 35%), hsl(240, 70%, 50%), hsl(0, 0%, 85%), hsl(30, 70%, 50%), hsl(0, 90%, 35%))"
                      }}>
                        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-foreground/30" style={{ transform: 'translateX(-50%)' }} />
                        <div className="absolute left-1/2 -top-5 text-xs text-muted-foreground" style={{ transform: 'translateX(-50%)' }}>
                          0%
                        </div>
                      </div>
                      <span className="text-muted-foreground">Max: {formatValue(maxValue)}</span>
                    </div>
                    {(actualMin !== null && actualMax !== null && actualMin !== undefined && actualMax !== undefined && (actualMin < minValue || actualMax > maxValue)) && (
                      <p className="text-xs text-muted-foreground text-center italic">
                        Values outside the {formatValue(minValue)} - {formatValue(maxValue)} range are displayed with the same color as the boundary.
                      </p>
                    )}
                  </>
                ) : selectedValueType === "inflation" ? (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Min: {formatValue(minValue)}</span>
                      <div className="flex-1 mx-4 h-4 rounded relative" style={{
                        background: "linear-gradient(to right, hsl(240, 90%, 35%), hsl(240, 70%, 50%), hsl(0, 0%, 85%), hsl(30, 70%, 50%), hsl(0, 90%, 35%))"
                      }}>
                        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-foreground/30" style={{ transform: 'translateX(-50%)' }} />
                        <div className="absolute left-1/2 -top-5 text-xs text-muted-foreground" style={{ transform: 'translateX(-50%)' }}>
                          2%
                        </div>
                      </div>
                      <span className="text-muted-foreground">Max: {formatValue(maxValue)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      Blue = Below 2% (too low), White = 2% (ideal), Red = Above 2% (too high)
                    </p>
                    {(actualMin !== null && actualMax !== null && actualMin !== undefined && actualMax !== undefined && (actualMin < minValue || actualMax > maxValue)) && (
                      <p className="text-xs text-muted-foreground text-center italic">
                        Values outside the {formatValue(minValue)} - {formatValue(maxValue)} range are displayed with the same color as the boundary.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Min: {formatValue(minValue)}</span>
                      <div className="flex-1 mx-4 h-4 rounded" style={{
                        background: selectedValueType === "ppp" || selectedValueType === "lcu" || selectedValueType === "growth"
                          ? "linear-gradient(to right, hsl(0, 70%, 50%), hsl(120, 70%, 50%))"
                          : "linear-gradient(to right, hsl(240, 70%, 50%), hsl(0, 70%, 50%))"
                      }} />
                      <span className="text-muted-foreground">Max: {formatValue(maxValue)}</span>
                    </div>
                    {(actualMin !== null && actualMax !== null && actualMin !== undefined && actualMax !== undefined && (actualMin < minValue || actualMax > maxValue)) && (
                      <p className="text-xs text-muted-foreground text-center italic">
                        Values outside the {formatValue(minValue)} - {formatValue(maxValue)} range are displayed with the same color as the boundary.
                      </p>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
