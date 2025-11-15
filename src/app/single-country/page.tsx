"use client"

import { useState, useEffect, useMemo, useCallback, startTransition } from "react"
import { useSearchParams } from "next/navigation"
import { Search, TrendingUp, DollarSign, Globe, BarChart3 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shadcn/card"
import { Input } from "@/components/shadcn/input"
import { Slider } from "@/components/shadcn/slider"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/shadcn/chart"
import { Popover, PopoverContent, PopoverAnchor } from "@/components/shadcn/popover"
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/shadcn/command"
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn/tabs"
import { Badge } from "@/components/shadcn/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select"
import { Checkbox } from "@/components/shadcn/checkbox"
import { Label } from "@/components/shadcn/label"
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts"
import { type CountryInfo, type CountryTimeSeriesData } from "@/services/db-operations"
import { fetchAllCountries, fetchCountryTimeSeries, fetchAvailableTimestamps, fetchCountryRanking, fetchInflationRankingWithYearlyAverage } from "./actions"

export default function SingleCountryPage() {
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCountry, setSelectedCountry] = useState<CountryInfo | null>(null)
  const [countries, setCountries] = useState<CountryInfo[]>([])
  const [timeSeriesData, setTimeSeriesData] = useState<CountryTimeSeriesData[]>([])
  const [availableTimestamps, setAvailableTimestamps] = useState<string[]>([])
  const [selectedYear, setSelectedYear] = useState<string>("")
  const [selectedMonth, setSelectedMonth] = useState<string>("")
  const [ignoreMonth, setIgnoreMonth] = useState(false)
  const [useLCU, setUseLCU] = useState(false)
  const [yearRange, setYearRange] = useState<[number, number]>([0, 0])
  const [ranking, setRanking] = useState<Awaited<ReturnType<typeof fetchCountryRanking>>>(null)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [initializedFromUrl, setInitializedFromUrl] = useState(false)

  // Load countries on mount
  useEffect(() => {
    fetchAllCountries().then(setCountries)
  }, [])

  // Initialize from URL parameters
  useEffect(() => {
    if (countries.length > 0 && !initializedFromUrl) {
      const countryCode = searchParams.get("country")
      const year = searchParams.get("year")
      const ignoreMonthParam = searchParams.get("ignoreMonth")

      startTransition(() => {
        if (countryCode) {
          // Find the country by code
          const country = countries.find(c => c.code === countryCode)
          if (country) {
            setSelectedCountry(country)
            setSearchQuery(country.name)
          }
        }

        if (year) {
          setSelectedYear(year)
        }

        if (ignoreMonthParam === "true") {
          setIgnoreMonth(true)
        }

        setInitializedFromUrl(true)
      })
    }
  }, [countries, searchParams, initializedFromUrl])

  // Filter countries based on search query
  const filteredCountries = useMemo(() => {
    if (!searchQuery.trim()) return countries.slice(0, 10)
    const query = searchQuery.toLowerCase()
    return countries
      .filter(country => 
        country.name.toLowerCase().includes(query) || 
        country.code.toLowerCase().includes(query)
      )
      .slice(0, 10)
  }, [searchQuery, countries])

  // Load data when country is selected
  useEffect(() => {
    if (!selectedCountry) {
      // Clear data when no country is selected
      startTransition(() => {
        setTimeSeriesData([])
        setAvailableTimestamps([])
        setRanking(null)
      })
      return
    }

    let cancelled = false
    
    startTransition(() => {
      setLoading(true)
    })
    
    Promise.all([
      fetchCountryTimeSeries(selectedCountry.code),
      fetchAvailableTimestamps(selectedCountry.code),
    ]).then(([timeSeries, timestamps]) => {
      if (!cancelled) {
        startTransition(() => {
          setTimeSeriesData(timeSeries)
          setAvailableTimestamps(timestamps)
          // Set default to newest year and month only if we haven't initialized from URL params
          // We check if initializedFromUrl is true - if it is, we assume year was set from URL
          if (timestamps.length > 0 && !initializedFromUrl) {
            const newest = timestamps[0]
            const year = newest.length >= 4 ? newest.substring(0, 4) : newest
            const month = newest.length === 7 ? newest.substring(5, 7) : ""
            setSelectedYear(year)
            setSelectedMonth(month)
          }
          setLoading(false)
        })
      }
    }).catch(err => {
      if (!cancelled) {
        console.error("Error loading country data:", err)
        startTransition(() => {
          setLoading(false)
        })
      }
    })

    return () => {
      cancelled = true
    }
  }, [selectedCountry, useLCU, initializedFromUrl])

  // Update ranking when year, month, ignoreMonth, or LCU preference changes
  useEffect(() => {
    if (!selectedCountry || !selectedYear) return
    
    // Income ranking always uses just the year (ignores month)
    const incomeTimestamp = selectedYear
    
    // Inflation ranking: if ignoreMonth is true, use yearly average; otherwise use year-month if selected, else just year
    const shouldUseYearlyAverage = ignoreMonth
    const inflationTimestamp = shouldUseYearlyAverage ? selectedYear : (selectedMonth ? `${selectedYear}-${selectedMonth}` : selectedYear)
    
    // Fetch rankings
    Promise.all([
      fetchCountryRanking(selectedCountry.code, incomeTimestamp, useLCU),
      shouldUseYearlyAverage 
        ? fetchInflationRankingWithYearlyAverage(selectedCountry.code, selectedYear)
        : fetchCountryRanking(selectedCountry.code, inflationTimestamp, useLCU)
    ]).then(([incomeRanking, inflationRankingResult]) => {
      if (incomeRanking) {
        if (shouldUseYearlyAverage && inflationRankingResult) {
          // Merge: use income data from incomeRanking, inflation data from yearly average result
          setRanking({
            ...incomeRanking,
            inflationValue: inflationRankingResult.inflationValue,
            inflationRank: inflationRankingResult.inflationRank,
            inflationTotalCountries: inflationRankingResult.inflationTotalCountries,
            timestamp: selectedYear,
          })
        } else if (!shouldUseYearlyAverage && inflationRankingResult) {
          // Regular ranking result
          setRanking({
            ...incomeRanking,
            inflationValue: inflationRankingResult.inflationValue,
            inflationRank: inflationRankingResult.inflationRank,
            inflationTotalCountries: inflationRankingResult.inflationTotalCountries,
            timestamp: inflationTimestamp,
          })
        } else {
          setRanking(incomeRanking)
        }
      }
    })
  }, [selectedCountry, selectedYear, selectedMonth, ignoreMonth, useLCU])

  const handleCountrySelect = (country: CountryInfo) => {
    setSelectedCountry(country)
    setSearchQuery(country.name)
    setIsSearchOpen(false)
  }

  // Get sorted years as numbers for the range slider
  const availableYearsSorted = useMemo(() => {
    const years = new Set<number>()
    timeSeriesData.forEach(d => {
      if (d.timestamp.length >= 4) {
        const year = parseInt(d.timestamp.substring(0, 4))
        if (!isNaN(year)) {
          years.add(year)
        }
      }
    })
    return Array.from(years).sort((a, b) => a - b) // Oldest to newest
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

  // Prepare chart data (filtered by year range)
  const inflationChartData = useMemo(() => {
    return filterByYearRange(timeSeriesData)
      .filter(d => d.inflationValue !== null)
      .map(d => ({
        timestamp: d.timestamp,
        value: d.inflationValue!,
      }))
  }, [timeSeriesData, filterByYearRange])

  const incomePPPChartData = useMemo(() => {
    return filterByYearRange(timeSeriesData)
      .filter(d => d.ppp_international_dollars !== null)
      .map(d => ({
        timestamp: d.timestamp,
        value: d.ppp_international_dollars!,
      }))
  }, [timeSeriesData, filterByYearRange])

  const incomeLCUChartData = useMemo(() => {
    return filterByYearRange(timeSeriesData)
      .filter(d => d.current_local_currency !== null)
      .map(d => ({
        timestamp: d.timestamp,
        value: d.current_local_currency!,
      }))
  }, [timeSeriesData, filterByYearRange])

  const growthRateChartData = useMemo(() => {
    return filterByYearRange(timeSeriesData)
      .filter(d => d.annual_growth_rate !== null)
      .map(d => ({
        timestamp: d.timestamp,
        value: d.annual_growth_rate!,
      }))
  }, [timeSeriesData, filterByYearRange])

  // For difference chart, match by year since income growth is yearly but inflation might be monthly
  const differenceChartData = useMemo(() => {
    // Filter by year range first
    const filteredData = filterByYearRange(timeSeriesData)
    
    // Group data by year
    const dataByYear = new Map<string, { growthRate: number | null; inflationValues: number[] }>()
    
    filteredData.forEach(d => {
      // Extract year from timestamp (handles both "2023" and "2023-07" formats)
      const year = d.timestamp.length >= 4 ? d.timestamp.substring(0, 4) : d.timestamp
      
      if (!dataByYear.has(year)) {
        dataByYear.set(year, { growthRate: null, inflationValues: [] })
      }
      
      const yearData = dataByYear.get(year)!
      if (d.annual_growth_rate !== null) {
        yearData.growthRate = d.annual_growth_rate
      }
      if (d.inflationValue !== null) {
        yearData.inflationValues.push(d.inflationValue)
      }
    })
    
    // Calculate difference for each year where both values exist
    const result: Array<{ timestamp: string; difference: number }> = []
    
    dataByYear.forEach((data, year) => {
      if (data.growthRate !== null && data.inflationValues.length > 0) {
        // Use average inflation for the year if multiple months exist
        const avgInflation = data.inflationValues.reduce((sum, val) => sum + val, 0) / data.inflationValues.length
        result.push({
          timestamp: year,
          difference: data.growthRate - avgInflation,
        })
      }
    })
    
    return result.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  }, [timeSeriesData, filterByYearRange])

  const chartConfigs = {
    inflation: {
      value: {
        label: "Inflation Rate (%)",
        color: "var(--chart-1)",
      },
    },
    incomePPP: {
      value: {
        label: "Income (PPP)",
        color: "var(--chart-2)",
      },
    },
    incomeLCU: {
      value: {
        label: "Income (LCU)",
        color: "var(--chart-3)",
      },
    },
    growthRate: {
      value: {
        label: "Growth Rate (%)",
        color: "var(--chart-4)",
      },
    },
    difference: {
      difference: {
        label: "Difference (%)",
        color: "var(--chart-5)",
      },
    },
  }

  const formatTimestamp = (timestamp: string) => {
    if (timestamp.length === 4) return timestamp
    if (timestamp.length === 7) return timestamp // YYYY-MM format
    return timestamp
  }

  const formatTimestampYearOnly = (timestamp: string) => {
    // Extract year from timestamp (handles both YYYY and YYYY-MM formats)
    if (timestamp.length >= 4) return timestamp.substring(0, 4)
    return timestamp
  }

  // Extract available years and months from timestamps
  const availableYears = useMemo(() => {
    const years = new Set<string>()
    availableTimestamps.forEach(ts => {
      if (ts.length >= 4) {
        years.add(ts.substring(0, 4))
      }
    })
    return Array.from(years).sort().reverse() // Newest first
  }, [availableTimestamps])

  const availableMonths = useMemo(() => {
    if (!selectedYear) return []
    const months = new Set<string>()
    availableTimestamps.forEach(ts => {
      if (ts.startsWith(selectedYear) && ts.length === 7) {
        months.add(ts.substring(5, 7))
      }
    })
    return Array.from(months).sort().reverse() // Newest first
  }, [availableTimestamps, selectedYear])

  // Update month when year changes if current month doesn't exist for new year
  useEffect(() => {
    if (selectedYear && availableMonths.length > 0) {
      if (!selectedMonth || !availableMonths.includes(selectedMonth)) {
        startTransition(() => {
          setSelectedMonth(availableMonths[0]) // Set to newest month
        })
      }
    } else {
      startTransition(() => {
        setSelectedMonth("")
      })
    }
  }, [selectedYear, availableMonths, selectedMonth])

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Header with Search */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-primary/10">
              <TrendingUp className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Single Country Analysis
            </h1>
          </div>

          {/* Country Search */}
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
            <Popover 
              open={isSearchOpen && (searchQuery.length > 0 || filteredCountries.length > 0)} 
              onOpenChange={setIsSearchOpen}
            >
              <PopoverAnchor asChild>
                <div className="w-full">
                  <Input
                    placeholder="Search for a country..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      setIsSearchOpen(e.target.value.length > 0)
                    }}
                    onFocus={() => {
                      if (searchQuery.length > 0 || filteredCountries.length > 0) {
                        setIsSearchOpen(true)
                      }
                    }}
                    onBlur={(e) => {
                      // Don't close if clicking on the popover
                      const relatedTarget = e.relatedTarget as HTMLElement
                      if (relatedTarget?.closest('[data-slot="popover-content"]')) {
                        return
                      }
                      // Small delay to allow click events on items to fire
                      setTimeout(() => {
                        setIsSearchOpen(false)
                      }, 200)
                    }}
                    className="pl-10"
                    autoComplete="off"
                  />
                </div>
              </PopoverAnchor>
              <PopoverContent 
                className="w-[var(--radix-popover-trigger-width)] p-0" 
                align="start"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <Command shouldFilter={false}>
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
          </div>
        </div>

        {loading && (
          <div className="text-center py-8 text-muted-foreground">Loading data...</div>
        )}

        {!selectedCountry && !loading && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground text-lg">
                Select a country above to view detailed economic metrics and trends.
              </p>
            </CardContent>
          </Card>
        )}

        {selectedCountry && !loading && (
          <>
            {/* Country Header */}
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">{selectedCountry.name}</CardTitle>
                <CardDescription>Economic metrics and trends over time</CardDescription>
              </CardHeader>
            </Card>

            {/* Ranking Section */}
            {ranking && availableYears.length > 0 && (
              <div className="space-y-4">
                {/* Year and Month Selectors */}
                <div className="flex gap-4 items-end">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Year</label>
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Select year" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableYears.map(year => (
                          <SelectItem key={year} value={year}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {availableMonths.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Month (Inflation)</label>
                      <Select value={selectedMonth} onValueChange={setSelectedMonth} disabled={ignoreMonth}>
                        <SelectTrigger className="w-[140px]">
                          <SelectValue placeholder="Select month" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableMonths.map(month => (
                            <SelectItem key={month} value={month}>
                              {new Date(2000, parseInt(month) - 1).toLocaleString('default', { month: 'long' })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {availableMonths.length > 0 && (
                    <div className="flex items-center space-x-2 pb-2">
                      <Checkbox 
                        id="ignore-month" 
                        checked={ignoreMonth} 
                        onCheckedChange={(checked) => setIgnoreMonth(checked === true)}
                      />
                      <Label 
                        htmlFor="ignore-month" 
                        className="text-sm font-medium cursor-pointer"
                      >
                        Use yearly average
                      </Label>
                    </div>
                  )}
                  <div className="flex-1" />
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Income Type</label>
                    <Tabs value={useLCU ? "lcu" : "ppp"} onValueChange={(v) => setUseLCU(v === "lcu")}>
                      <TabsList>
                        <TabsTrigger value="ppp">PPP</TabsTrigger>
                        <TabsTrigger value="lcu">LCU</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </div>

                {/* Ranking Cards */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {/* Income Ranking Card */}
                  <Card className="min-w-0">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>Income Ranking ({useLCU ? "LCU" : "PPP"})</span>
                        {useLCU ? (
                          ranking.lcuRank !== null ? (
                            <Badge variant="secondary" className="text-lg px-3 py-1">
                              #{ranking.lcuRank} of {ranking.lcuTotalCountries}
                            </Badge>
                          ) : (
                            <Badge variant="outline">No data</Badge>
                          )
                        ) : (
                          ranking.incomeRank !== null ? (
                            <Badge variant="secondary" className="text-lg px-3 py-1">
                              #{ranking.incomeRank} of {ranking.incomeTotalCountries}
                            </Badge>
                          ) : (
                            <Badge variant="outline">No data</Badge>
                          )
                        )}
                      </CardTitle>
                      <CardDescription>
                        {selectedMonth 
                          ? `Rankings for ${new Date(2000, parseInt(selectedMonth) - 1).toLocaleString('default', { month: 'long' })} ${selectedYear}`
                          : `Rankings for ${selectedYear}`
                        }
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {useLCU ? (
                        ranking.lcuRank !== null ? (
                          <>
                            <div className="flex items-baseline gap-2">
                              <span className="text-2xl font-bold text-foreground">
                                {ranking.current_local_currency !== null 
                                  ? ranking.current_local_currency.toLocaleString(undefined, { maximumFractionDigits: 0 })
                                  : 'N/A'}
                              </span>
                              <span className="text-sm text-muted-foreground">LCU</span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Ranked <span className="font-semibold text-foreground">{ranking.lcuRank}</span> out of <span className="font-semibold text-foreground">{ranking.lcuTotalCountries}</span> countries with LCU data
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground">No LCU income data available for this period</p>
                        )
                      ) : (
                        ranking.incomeRank !== null ? (
                          <>
                            <div className="flex items-baseline gap-2">
                              <span className="text-2xl font-bold text-foreground">
                                {ranking.ppp_international_dollars !== null 
                                  ? ranking.ppp_international_dollars.toLocaleString(undefined, { maximumFractionDigits: 0 })
                                  : 'N/A'}
                              </span>
                              <span className="text-sm text-muted-foreground">PPP International $</span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Ranked <span className="font-semibold text-foreground">{ranking.incomeRank}</span> out of <span className="font-semibold text-foreground">{ranking.incomeTotalCountries}</span> countries with PPP data
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground">No PPP income data available for this period</p>
                        )
                      )}
                    </CardContent>
                  </Card>

                  {/* Inflation Ranking Card */}
                  <Card className="min-w-0">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>Inflation Ranking</span>
                        {ranking.inflationRank !== null ? (
                          <Badge variant="secondary" className="text-lg px-3 py-1">
                            #{ranking.inflationRank} of {ranking.inflationTotalCountries}
                          </Badge>
                        ) : (
                          <Badge variant="outline">No data</Badge>
                        )}
                      </CardTitle>
                      <CardDescription>
                        {selectedMonth 
                          ? `Rankings for ${new Date(2000, parseInt(selectedMonth) - 1).toLocaleString('default', { month: 'long' })} ${selectedYear}`
                          : `Rankings for ${selectedYear}`
                        }
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {ranking.inflationRank !== null ? (
                        <>
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-bold text-foreground">
                              {ranking.inflationValue !== null 
                                ? `${ranking.inflationValue.toFixed(2)}%`
                                : 'N/A'}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Ranked <span className="font-semibold text-foreground">{ranking.inflationRank}</span> out of <span className="font-semibold text-foreground">{ranking.inflationTotalCountries}</span> countries with inflation data
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">No inflation data available for this period</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

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
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Line 
                          type="monotone" 
                          dataKey="value" 
                          stroke="var(--chart-1)" 
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4, fill: "var(--chart-1)" }}
                        />
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
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Line 
                          type="monotone" 
                          dataKey="value" 
                          stroke="var(--chart-2)" 
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4, fill: "var(--chart-2)" }}
                        />
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
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Line 
                          type="monotone" 
                          dataKey="value" 
                          stroke="var(--chart-3)" 
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4, fill: "var(--chart-3)" }}
                        />
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
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Line 
                          type="monotone" 
                          dataKey="value" 
                          stroke="var(--chart-4)" 
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4, fill: "var(--chart-4)" }}
                        />
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
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line 
                        type="monotone" 
                        dataKey="difference" 
                        stroke="var(--chart-5)" 
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: "var(--chart-5)" }}
                      />
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
