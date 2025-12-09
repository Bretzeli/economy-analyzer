"use client"

import { useState, useEffect, useMemo, useCallback, startTransition, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Search, TrendingUp, DollarSign, Globe, BarChart3, Plus, X } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shadcn/card"
import { Input } from "@/components/shadcn/input"
import { Slider } from "@/components/shadcn/slider"
import { ChartContainer, ChartTooltip } from "@/components/shadcn/chart"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover"
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/shadcn/command"
import { Badge } from "@/components/shadcn/badge"
import { Button } from "@/components/shadcn/button"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts"
import { type CountryInfo, type CountryTimeSeriesData } from "@/services/db-operations"
import { fetchAllCountries, fetchCountryTimeSeries } from "./actions"

// Maximum number of countries that can be compared
const MAX_COUNTRIES = 5

// Colors for different countries - using chart color variables
const COUNTRY_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "hsl(var(--chart-1) / 0.7)",
  "hsl(var(--chart-2) / 0.7)",
  "hsl(var(--chart-3) / 0.7)",
  "hsl(var(--chart-4) / 0.7)",
  "hsl(var(--chart-5) / 0.7)",
]

function CountryComparisonPageContent() {
  useEffect(() => {
    document.title = "Economy Analyzer - Country Comparison"
  }, [])

  const searchParams = useSearchParams()
  const [selectedCountries, setSelectedCountries] = useState<CountryInfo[]>([])
  const [countries, setCountries] = useState<CountryInfo[]>([])
  const [timeSeriesData, setTimeSeriesData] = useState<Map<string, CountryTimeSeriesData[]>>(new Map())
  const [searchQuery, setSearchQuery] = useState("")
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [yearRange, setYearRange] = useState<[number, number]>([0, 0])
  const [initializedFromUrl, setInitializedFromUrl] = useState(false)

  // Load countries on mount
  useEffect(() => {
    fetchAllCountries().then(setCountries)
  }, [])

  // Initialize from URL parameters
  useEffect(() => {
    if (countries.length > 0 && !initializedFromUrl) {
      const countryCode = searchParams.get("country")
      if (countryCode) {
        const country = countries.find(c => c.code === countryCode)
        if (country) {
          startTransition(() => {
            setSelectedCountries([country])
            setInitializedFromUrl(true)
          })
          return
        }
      }
      setInitializedFromUrl(true)
    }
  }, [countries, searchParams, initializedFromUrl])

  // Filter countries based on search query
  const filteredCountries = useMemo(() => {
    if (!searchQuery.trim()) return countries.slice(0, 10)
    const query = searchQuery.toLowerCase()
    return countries
      .filter(country => 
        (country.name.toLowerCase().includes(query) || 
        country.code.toLowerCase().includes(query)) &&
        !selectedCountries.find(c => c.code === country.code)
      )
      .slice(0, 10)
  }, [searchQuery, countries, selectedCountries])

  // Load time series data for selected countries
  useEffect(() => {
    let cancelled = false
    
    const loadData = async () => {
      const newData = new Map<string, CountryTimeSeriesData[]>()
      const countriesToLoad: CountryInfo[] = []
      
      // Check which countries need data loaded
      selectedCountries.forEach(country => {
        if (!timeSeriesData.has(country.code)) {
          countriesToLoad.push(country)
        } else {
          newData.set(country.code, timeSeriesData.get(country.code)!)
        }
      })
      
      // Load data for new countries
      if (countriesToLoad.length > 0) {
        const loadedData = await Promise.all(
          countriesToLoad.map(async (country) => {
            try {
              const data = await fetchCountryTimeSeries(country.code)
              return { code: country.code, data }
            } catch (err) {
              console.error(`Error loading data for ${country.code}:`, err)
              return { code: country.code, data: [] as CountryTimeSeriesData[] }
            }
          })
        )
        
        if (!cancelled) {
          loadedData.forEach(({ code, data }) => {
            newData.set(code, data)
          })
        }
      }
      
      if (!cancelled) {
        startTransition(() => {
          setTimeSeriesData(prev => {
            const updated = new Map(prev)
            
            // Add/update data for selected countries
            newData.forEach((value, key) => {
              updated.set(key, value)
            })
            
            // Remove data for countries that are no longer selected
            Array.from(updated.keys()).forEach(key => {
              if (!selectedCountries.find(c => c.code === key)) {
                updated.delete(key)
              }
            })
            
            return updated
          })
        })
      }
    }

    loadData()
    
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCountries])

  // Get all available years from all selected countries
  const availableYearsSorted = useMemo(() => {
    const years = new Set<number>()
    timeSeriesData.forEach(data => {
      data.forEach(d => {
        if (d.timestamp.length >= 4) {
          const year = parseInt(d.timestamp.substring(0, 4))
          if (!isNaN(year)) {
            years.add(year)
          }
        }
      })
    })
    const sorted = Array.from(years).sort((a, b) => a - b)
    return sorted
  }, [timeSeriesData])

  // Initialize year range when data is loaded
  useEffect(() => {
    if (availableYearsSorted.length > 0 && yearRange[0] === 0 && yearRange[1] === 0) {
      startTransition(() => {
        setYearRange([availableYearsSorted[0], availableYearsSorted[availableYearsSorted.length - 1]])
      })
    }
  }, [availableYearsSorted, yearRange])

  // Helper to extract year from timestamp
  const getYearFromTimestamp = useCallback((timestamp: string): number => {
    if (timestamp.length >= 4) {
      const year = parseInt(timestamp.substring(0, 4))
      return isNaN(year) ? 0 : year
    }
    return 0
  }, [])

  // Filter data by year range
  const filterByYearRange = useCallback(<T extends { timestamp: string }>(data: T[]): T[] => {
    return data.filter(d => {
      const year = getYearFromTimestamp(d.timestamp)
      return year >= yearRange[0] && year <= yearRange[1]
    })
  }, [yearRange, getYearFromTimestamp])

  // Combine all countries' data into unified chart data
  const combineChartData = useCallback((
    dataKey: keyof CountryTimeSeriesData,
    filterFn?: (value: number | null) => boolean
  ) => {
    // Get all unique timestamps across all countries
    const allTimestamps = new Set<string>()
    timeSeriesData.forEach(data => {
      filterByYearRange(data).forEach(d => {
        if (filterFn ? filterFn(d[dataKey] as number | null) : d[dataKey] !== null) {
          allTimestamps.add(d.timestamp)
        }
      })
    })

    // Create data points for each timestamp
    const combinedData: Array<Record<string, string | number>> = []
    
    Array.from(allTimestamps).sort().forEach(timestamp => {
      const dataPoint: Record<string, string | number> = { timestamp }
      
      selectedCountries.forEach((country) => {
        const countryData = timeSeriesData.get(country.code)
        if (countryData) {
          const filteredData = filterByYearRange(countryData)
          const point = filteredData.find(d => d.timestamp === timestamp)
          if (point && (filterFn ? filterFn(point[dataKey] as number | null) : point[dataKey] !== null)) {
            dataPoint[country.code] = point[dataKey] as number
          } else {
            // Use null for missing data (Recharts handles this)
            dataPoint[country.code] = null as unknown as number
          }
        }
      })
      
      combinedData.push(dataPoint)
    })

    return combinedData
  }, [timeSeriesData, selectedCountries, filterByYearRange])

  // Chart data for different metrics
  const inflationChartData = useMemo(() => {
    return combineChartData('inflationValue', (val) => val !== null)
  }, [combineChartData])

  const incomePPPChartData = useMemo(() => {
    return combineChartData('ppp_international_dollars', (val) => val !== null)
  }, [combineChartData])

  const incomeLCUChartData = useMemo(() => {
    return combineChartData('current_local_currency', (val) => val !== null)
  }, [combineChartData])

  const growthRateChartData = useMemo(() => {
    return combineChartData('annual_growth_rate', (val) => val !== null)
  }, [combineChartData])

  // For difference chart, match by year since income growth is yearly but inflation might be monthly
  const differenceChartData = useMemo(() => {
    const allYears = new Set<string>()
    
    timeSeriesData.forEach(data => {
      filterByYearRange(data).forEach(d => {
        const year = d.timestamp.length >= 4 ? d.timestamp.substring(0, 4) : d.timestamp
        if ((d.annual_growth_rate !== null || d.inflationValue !== null)) {
          allYears.add(year)
        }
      })
    })

    const combinedData: Array<Record<string, string | number>> = []

    Array.from(allYears).sort().forEach(year => {
      const dataPoint: Record<string, string | number> = { timestamp: year }
      
      selectedCountries.forEach((country) => {
        const countryData = timeSeriesData.get(country.code)
        if (countryData) {
          const filteredData = filterByYearRange(countryData)
          
          // Get growth rate for this year
          let growthRate: number | null = null
          const growthPoint = filteredData.find(d => {
            const dYear = d.timestamp.length >= 4 ? d.timestamp.substring(0, 4) : d.timestamp
            return dYear === year && d.annual_growth_rate !== null
          })
          if (growthPoint) {
            growthRate = growthPoint.annual_growth_rate
          }
          
          // Get average inflation for this year
          const inflationPoints = filteredData.filter(d => {
            const dYear = d.timestamp.length >= 4 ? d.timestamp.substring(0, 4) : d.timestamp
            return dYear === year && d.inflationValue !== null
          })
          
          let avgInflation: number | null = null
          if (inflationPoints.length > 0) {
            const inflationValues = inflationPoints.map(p => p.inflationValue!).filter(v => v !== null)
            if (inflationValues.length > 0) {
              avgInflation = inflationValues.reduce((sum, val) => sum + val, 0) / inflationValues.length
            }
          }
          
            if (growthRate !== null && avgInflation !== null) {
            dataPoint[country.code] = growthRate - avgInflation
          } else {
            dataPoint[country.code] = null as unknown as number
          }
        }
      })
      
      combinedData.push(dataPoint)
    })

    return combinedData
  }, [timeSeriesData, selectedCountries, filterByYearRange])

  const handleCountrySelect = (country: CountryInfo) => {
    if (!selectedCountries.find(c => c.code === country.code) && selectedCountries.length < MAX_COUNTRIES) {
      setSelectedCountries(prev => [...prev, country])
      setSearchQuery("")
      setIsSearchOpen(false)
    }
  }

  const handleCountryRemove = (countryCode: string) => {
    setSelectedCountries(prev => prev.filter(c => c.code !== countryCode))
  }

  const formatTimestamp = (timestamp: string) => {
    if (timestamp.length === 4) return timestamp
    if (timestamp.length === 7) return timestamp // YYYY-MM format
    return timestamp
  }

  const formatTimestampYearOnly = (timestamp: string) => {
    if (timestamp.length >= 4) return timestamp.substring(0, 4)
    return timestamp
  }

  // Custom tooltip content that shows country name
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey?: string | number; value?: number | string; color?: string }>; label?: string }) => {
    if (active && payload && payload.length && label) {
      return (
        <div className="rounded-lg border bg-background p-2 shadow-sm">
          <div className="text-sm font-medium mb-1">{formatTimestampYearOnly(label)}</div>
          {payload.map((entry, index) => {
            const dataKey = typeof entry.dataKey === 'string' ? entry.dataKey : String(entry.dataKey ?? '')
            const country = selectedCountries.find(c => c.code === dataKey)
            if (entry.value === null || entry.value === undefined) return null
            return (
              <div key={index} className="flex items-center gap-2 text-sm">
                {entry.color && (
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                )}
                <span className="font-medium">{country?.name || dataKey}:</span>
                <span>
                  {typeof entry.value === 'number'
                    ? entry.value.toLocaleString(undefined, { maximumFractionDigits: 2 })
                    : entry.value}
                </span>
              </div>
            )
          })}
        </div>
      )
    }
    return null
  }

  // Chart configs
  const chartConfigs = {
    inflation: {
      value: {
        label: "Inflation Rate (%)",
      },
    },
    incomePPP: {
      value: {
        label: "Income (PPP)",
      },
    },
    incomeLCU: {
      value: {
        label: "Income (LCU)",
      },
    },
    growthRate: {
      value: {
        label: "Growth Rate (%)",
      },
    },
    difference: {
      difference: {
        label: "Difference (%)",
      },
    },
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-orange-500/20 to-red-500/20">
              <BarChart3 className="h-8 w-8 text-orange-500" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">
              Country Comparison
            </h1>
          </div>

          {/* Country Selection */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Add Country Button */}
              <Popover open={isSearchOpen} onOpenChange={setIsSearchOpen}>
                <PopoverTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-2"
                    disabled={selectedCountries.length >= MAX_COUNTRIES}
                  >
                    <Plus className="h-4 w-4" />
                    Add Country
                    {selectedCountries.length >= MAX_COUNTRIES && ` (${MAX_COUNTRIES} max)`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <div className="flex items-center border-b px-3">
                      <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                      <Input
                        placeholder="Search countries..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value)
                          setIsSearchOpen(true)
                        }}
                        className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                        autoComplete="off"
                      />
                    </div>
                    <CommandList>
                      <CommandEmpty>No countries found.</CommandEmpty>
                      <CommandGroup>
                        {filteredCountries.map((country) => (
                          <CommandItem
                            key={country.code}
                            value={country.name}
                            onSelect={() => handleCountrySelect(country)}
                            className="cursor-pointer"
                          >
                            {country.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Selected Country Badges */}
              {selectedCountries.map((country, index) => (
                <Badge
                  key={country.code}
                  variant="secondary"
                  className="gap-2 pr-1"
                >
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: COUNTRY_COLORS[index % COUNTRY_COLORS.length] }}
                  />
                  {country.name}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-4 w-4 rounded-full hover:bg-destructive/20"
                    onClick={() => handleCountryRemove(country.code)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>

              {selectedCountries.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Add countries to compare their economic indicators (max {MAX_COUNTRIES})
                </p>
              )}
              {selectedCountries.length > 0 && selectedCountries.length < MAX_COUNTRIES && (
                <p className="text-sm text-muted-foreground">
                  {MAX_COUNTRIES - selectedCountries.length} more {MAX_COUNTRIES - selectedCountries.length === 1 ? 'country' : 'countries'} can be added
                </p>
              )}
              {selectedCountries.length >= MAX_COUNTRIES && (
                <p className="text-sm text-muted-foreground">
                  Maximum of {MAX_COUNTRIES} countries reached. Remove a country to add another.
                </p>
              )}
          </div>
        </div>

        {selectedCountries.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground text-lg">
                Select countries above to compare their economic metrics and trends.
              </p>
            </CardContent>
          </Card>
        )}

        {selectedCountries.length > 0 && (
          <>
            {/* Year Range Slider */}
            {availableYearsSorted.length > 0 && yearRange[0] > 0 && yearRange[1] > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Time Range</CardTitle>
                  <CardDescription>Select the year range to display in all charts</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Year Range</span>
                      <span className="font-medium">{yearRange[0]} - {yearRange[1]}</span>
                    </div>
                    <Slider
                      value={yearRange}
                      onValueChange={(values) => setYearRange([values[0], values[1]])}
                      min={availableYearsSorted[0]}
                      max={availableYearsSorted[availableYearsSorted.length - 1]}
                      step={1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{availableYearsSorted[0]}</span>
                      <span>{availableYearsSorted[availableYearsSorted.length - 1]}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Time Series Charts */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Inflation Chart */}
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Inflation Over Time
                  </CardTitle>
                  <CardDescription>Annual inflation rate (%)</CardDescription>
                </CardHeader>
                <CardContent className="overflow-hidden">
                  {inflationChartData.length > 0 ? (
                    <ChartContainer config={chartConfigs.inflation} className="h-[300px] w-full min-w-0">
                      <LineChart data={inflationChartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                          dataKey="timestamp"
                          tickFormatter={formatTimestampYearOnly}
                          className="text-xs"
                        />
                        <YAxis className="text-xs" />
                        <ChartTooltip content={<CustomTooltip />} />
                        <Legend
                          content={({ payload }) => (
                            <div className="flex flex-wrap gap-2 justify-center mt-4">
                              {payload?.map((entry, index) => {
                                const dataKey = typeof entry.dataKey === 'string' ? entry.dataKey : String(entry.dataKey ?? '')
                                const country = selectedCountries.find(c => c.code === dataKey)
                                return (
                                  <div key={index} className="flex items-center gap-2 text-xs">
                                    {entry.color && (
                                      <div
                                        className="h-3 w-3 rounded-full"
                                        style={{ backgroundColor: entry.color }}
                                      />
                                    )}
                                    <span>{country?.name || dataKey}</span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        />
                        {selectedCountries.map((country, index) => (
                          <Line
                            key={country.code}
                            type="monotone"
                            dataKey={country.code}
                            stroke={COUNTRY_COLORS[index % COUNTRY_COLORS.length]}
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                            connectNulls={true}
                          />
                        ))}
                      </LineChart>
                    </ChartContainer>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      No inflation data available
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Income PPP Chart */}
              <Card className="min-w-0">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Globe className="h-5 w-5" />
                      Income (PPP) Over Time
                    </CardTitle>
                    <CardDescription>PPP International Dollars</CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-hidden">
                    {incomePPPChartData.length > 0 ? (
                      <ChartContainer config={chartConfigs.incomePPP} className="h-[300px] w-full min-w-0">
                        <LineChart data={incomePPPChartData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis
                            dataKey="timestamp"
                            tickFormatter={formatTimestamp}
                            className="text-xs"
                          />
                          <YAxis className="text-xs" />
                          <ChartTooltip content={<CustomTooltip />} />
                          <Legend
                            content={({ payload }) => (
                              <div className="flex flex-wrap gap-2 justify-center mt-4">
                                {payload?.map((entry, index) => {
                                  const dataKey = typeof entry.dataKey === 'string' ? entry.dataKey : String(entry.dataKey ?? '')
                                  const country = selectedCountries.find(c => c.code === dataKey)
                                  return (
                                    <div key={index} className="flex items-center gap-2 text-xs">
                                      {entry.color && (
                                        <div
                                          className="h-3 w-3 rounded-full"
                                          style={{ backgroundColor: entry.color }}
                                        />
                                      )}
                                      <span>{country?.name || dataKey}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          />
                          {selectedCountries.map((country, index) => (
                            <Line
                              key={country.code}
                              type="monotone"
                              dataKey={country.code}
                              stroke={COUNTRY_COLORS[index % COUNTRY_COLORS.length]}
                              strokeWidth={2}
                              dot={false}
                              activeDot={{ r: 4 }}
                              connectNulls={true}
                            />
                          ))}
                        </LineChart>
                      </ChartContainer>
                    ) : (
                      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                        No PPP income data available
                      </div>
                    )}
                  </CardContent>
                </Card>

              {/* Income LCU Chart */}
              <Card className="min-w-0">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5" />
                      Income (LCU) Over Time
                    </CardTitle>
                    <CardDescription>Current Local Currency Units</CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-hidden">
                    {incomeLCUChartData.length > 0 ? (
                      <ChartContainer config={chartConfigs.incomeLCU} className="h-[300px] w-full min-w-0">
                        <LineChart data={incomeLCUChartData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis
                            dataKey="timestamp"
                            tickFormatter={formatTimestamp}
                            className="text-xs"
                          />
                          <YAxis className="text-xs" />
                          <ChartTooltip content={<CustomTooltip />} />
                          <Legend
                            content={({ payload }) => (
                              <div className="flex flex-wrap gap-2 justify-center mt-4">
                                {payload?.map((entry, index) => {
                                  const dataKey = typeof entry.dataKey === 'string' ? entry.dataKey : String(entry.dataKey ?? '')
                                  const country = selectedCountries.find(c => c.code === dataKey)
                                  return (
                                    <div key={index} className="flex items-center gap-2 text-xs">
                                      {entry.color && (
                                        <div
                                          className="h-3 w-3 rounded-full"
                                          style={{ backgroundColor: entry.color }}
                                        />
                                      )}
                                      <span>{country?.name || dataKey}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          />
                          {selectedCountries.map((country, index) => (
                            <Line
                              key={country.code}
                              type="monotone"
                              dataKey={country.code}
                              stroke={COUNTRY_COLORS[index % COUNTRY_COLORS.length]}
                              strokeWidth={2}
                              dot={false}
                              activeDot={{ r: 4 }}
                              connectNulls={true}
                            />
                          ))}
                        </LineChart>
                      </ChartContainer>
                    ) : (
                      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                        No LCU income data available
                      </div>
                    )}
                  </CardContent>
                </Card>

              {/* Income Growth Rate Chart */}
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Income Growth Rate Over Time
                  </CardTitle>
                  <CardDescription>Annual growth rate (%)</CardDescription>
                </CardHeader>
                <CardContent className="overflow-hidden">
                  {growthRateChartData.length > 0 ? (
                    <ChartContainer config={chartConfigs.growthRate} className="h-[300px] w-full min-w-0">
                      <LineChart data={growthRateChartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                          dataKey="timestamp"
                          tickFormatter={formatTimestamp}
                          className="text-xs"
                        />
                        <YAxis className="text-xs" />
                        <ChartTooltip content={<CustomTooltip />} />
                        <Legend
                          content={({ payload }) => (
                            <div className="flex flex-wrap gap-2 justify-center mt-4">
                              {payload?.map((entry, index) => {
                                const dataKey = typeof entry.dataKey === 'string' ? entry.dataKey : String(entry.dataKey ?? '')
                                const country = selectedCountries.find(c => c.code === dataKey)
                                return (
                                  <div key={index} className="flex items-center gap-2 text-xs">
                                    {entry.color && (
                                      <div
                                        className="h-3 w-3 rounded-full"
                                        style={{ backgroundColor: entry.color }}
                                      />
                                    )}
                                    <span>{country?.name || dataKey}</span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        />
                        {selectedCountries.map((country, index) => (
                          <Line
                            key={country.code}
                            type="monotone"
                            dataKey={country.code}
                            stroke={COUNTRY_COLORS[index % COUNTRY_COLORS.length]}
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                            connectNulls={true}
                          />
                        ))}
                      </LineChart>
                    </ChartContainer>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      No growth rate data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Difference Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Income Growth vs Inflation Difference
                </CardTitle>
                <CardDescription>
                  Difference between income growth rate and inflation rate (positive is good)
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-hidden">
                {differenceChartData.length > 0 ? (
                  <ChartContainer config={chartConfigs.difference} className="h-[300px] w-full min-w-0">
                    <LineChart data={differenceChartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="timestamp"
                        tickFormatter={formatTimestamp}
                        className="text-xs"
                      />
                      <YAxis className="text-xs" />
                      <ChartTooltip content={<CustomTooltip />} />
                      <Legend
                        content={({ payload }) => (
                          <div className="flex flex-wrap gap-2 justify-center mt-4">
                            {payload?.map((entry, index) => {
                              const dataKey = typeof entry.dataKey === 'string' ? entry.dataKey : String(entry.dataKey ?? '')
                              const country = selectedCountries.find(c => c.code === dataKey)
                              return (
                                <div key={index} className="flex items-center gap-2 text-xs">
                                  {entry.color && (
                                    <div
                                      className="h-3 w-3 rounded-full"
                                      style={{ backgroundColor: entry.color }}
                                    />
                                  )}
                                  <span>{country?.name || dataKey}</span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      />
                      {selectedCountries.map((country, index) => (
                        <Line
                          key={country.code}
                          type="monotone"
                          dataKey={country.code}
                          stroke={COUNTRY_COLORS[index % COUNTRY_COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                          connectNulls={true}
                        />
                      ))}
                    </LineChart>
                  </ChartContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No data available for comparison
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}

export default function CountryComparisonPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        </div>
      </div>
    }>
      <CountryComparisonPageContent />
    </Suspense>
  )
}
