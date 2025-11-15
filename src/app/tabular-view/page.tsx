"use client"

import { useState, useEffect, useCallback, startTransition } from "react"
import { ArrowUpDown, ArrowUp, ArrowDown, CheckSquare, Square, ChevronLeft, ChevronRight } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shadcn/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select"
import { Checkbox } from "@/components/shadcn/checkbox"
import { Label } from "@/components/shadcn/label"
import { Button } from "@/components/shadcn/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/table"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover"
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList, CommandInput } from "@/components/shadcn/command"
import { fetchTabularData, fetchTabularDataCount, fetchAllCountries, fetchAvailableYearsForFilter, fetchAvailableMonths, type TabularViewRow } from "./actions"
import type { CountryInfo } from "@/services/db-operations"

type SortColumn = 'country' | 'timestamp' | 'inflation' | 'incomeLCU' | 'incomePPP' | 'growthRate'
type SortDirection = 'asc' | 'desc'

type SortConfig = {
  column: SortColumn
  direction: SortDirection
}

export default function TabularViewPage() {
  const [data, setData] = useState<TabularViewRow[]>([])
  const [countries, setCountries] = useState<CountryInfo[]>([])
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set())
  const [availableYears, setAvailableYears] = useState<string[]>([])
  const [startYear, setStartYear] = useState<string>("")
  const [startMonth, setStartMonth] = useState<string>("")
  const [endYear, setEndYear] = useState<string>("")
  const [endMonth, setEndMonth] = useState<string>("")
  const [availableStartMonths, setAvailableStartMonths] = useState<string[]>([])
  const [availableEndMonths, setAvailableEndMonths] = useState<string[]>([])
  const [sortConfigs, setSortConfigs] = useState<SortConfig[]>([
    { column: 'country', direction: 'asc' },
    { column: 'timestamp', direction: 'desc' }
  ])
  const [loading, setLoading] = useState(false)
  const [countryFilterOpen, setCountryFilterOpen] = useState(false)
  const [pageSize, setPageSize] = useState<number>(20)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [totalCount, setTotalCount] = useState<number>(0)

  // Load countries and years on mount
  useEffect(() => {
    Promise.all([
      fetchAllCountries(),
      fetchAvailableYearsForFilter()
    ]).then(([countriesData, years]) => {
      setCountries(countriesData)
      setAvailableYears(years)
      if (years.length > 0) {
        setStartYear(years[years.length - 1]) // Oldest year
        setEndYear(years[0]) // Newest year
      }
    })
  }, [])

  // Load months when years change
  useEffect(() => {
    if (startYear) {
      fetchAvailableMonths(startYear).then(months => {
        startTransition(() => setAvailableStartMonths(months))
      })
    } else {
      startTransition(() => setAvailableStartMonths([]))
    }
  }, [startYear])

  useEffect(() => {
    if (endYear) {
      fetchAvailableMonths(endYear).then(months => {
        startTransition(() => setAvailableEndMonths(months))
      })
    } else {
      startTransition(() => setAvailableEndMonths([]))
    }
  }, [endYear])

  // Reset to page 1 when filters change
  useEffect(() => {
    startTransition(() => {
      setCurrentPage(1)
    })
  }, [selectedCountries, startYear, startMonth, endYear, endMonth, pageSize])

  // Build filter and fetch data
  useEffect(() => {
    let cancelled = false
    
    const loadData = async () => {
      setLoading(true)
      
      const filter: {
        countryCodes?: string[]
        startDate?: string
        endDate?: string
        sortBy?: 'country' | 'timestamp' | 'inflationValue' | 'current_local_currency' | 'ppp_international_dollars' | 'annual_growth_rate'
        sortOrder?: 'asc' | 'desc'
        paging?: {
          offset: number
          limit: number
        }
      } = {
        countryCodes: selectedCountries.size > 0 ? Array.from(selectedCountries) : undefined,
      }

      // Build startDate
      if (startYear) {
        if (startMonth) {
          filter.startDate = `${startYear}-${startMonth}`
        } else {
          filter.startDate = startYear
        }
      }

      // Build endDate
      if (endYear) {
        if (endMonth) {
          filter.endDate = `${endYear}-${endMonth}`
        } else {
          filter.endDate = endYear
        }
      }

      // Apply sorting - pass all sort configs
      if (sortConfigs.length > 0) {
        const sortByMap: Record<SortColumn, 'country' | 'timestamp' | 'inflationValue' | 'current_local_currency' | 'ppp_international_dollars' | 'annual_growth_rate'> = {
          'country': 'country',
          'timestamp': 'timestamp',
          'inflation': 'inflationValue',
          'incomeLCU': 'current_local_currency',
          'incomePPP': 'ppp_international_dollars',
          'growthRate': 'annual_growth_rate'
        }
        // Use first sort for primary sorting
        const firstSort = sortConfigs[0]
        filter.sortBy = sortByMap[firstSort.column]
        filter.sortOrder = firstSort.direction
        // Store all sort configs for multi-column sorting
        const filterWithSortConfigs = filter as typeof filter & {
          sortConfigs?: Array<{
            column: 'country' | 'timestamp' | 'inflationValue' | 'current_local_currency' | 'ppp_international_dollars' | 'annual_growth_rate'
            direction: 'asc' | 'desc'
          }>
        }
        filterWithSortConfigs.sortConfigs = sortConfigs.map(sc => ({
          column: sortByMap[sc.column],
          direction: sc.direction
        }))
      }

      // Apply pagination
      const offset = (currentPage - 1) * pageSize
      filter.paging = {
        offset,
        limit: pageSize
      }

      try {
        const [result, count] = await Promise.all([
          fetchTabularData(filter),
          fetchTabularDataCount(filter)
        ])
        if (!cancelled) {
          startTransition(() => {
            setData(result)
            setTotalCount(count)
            setLoading(false)
          })
        }
      } catch (error) {
        console.error("Error loading data:", error)
        if (!cancelled) {
          startTransition(() => {
            setLoading(false)
          })
        }
      }
    }

    loadData()

    return () => {
      cancelled = true
    }
  }, [selectedCountries, startYear, startMonth, endYear, endMonth, currentPage, pageSize, sortConfigs])

  // Use data directly (already sorted and paginated server-side)
  const sortedData = data

  const handleSort = useCallback((column: SortColumn) => {
    setSortConfigs(prev => {
      const existingIndex = prev.findIndex(s => s.column === column)
      
      if (existingIndex >= 0) {
        // Column already in sort - check if it's at the front
        const current = prev[existingIndex]
        if (existingIndex === 0) {
          // It's already at the front - toggle direction
          if (current.direction === 'desc') {
            // Change to asc
            return [{ ...current, direction: 'asc' }, ...prev.slice(1)]
          } else {
            // Remove from sort
            return prev.slice(1)
          }
        } else {
          // Move to front with desc direction (removing duplicate)
          const filtered = prev.filter(s => s.column !== column)
          return [{ column, direction: 'desc' }, ...filtered]
        }
      } else {
        // Add new sort at the beginning
        return [{ column, direction: 'desc' }, ...prev]
      }
    })
  }, [])

  const getSortIcon = (column: SortColumn) => {
    const config = sortConfigs.find(s => s.column === column)
    if (!config) return <ArrowUpDown className="h-4 w-4" />
    return config.direction === 'asc' 
      ? <ArrowUp className="h-4 w-4" />
      : <ArrowDown className="h-4 w-4" />
  }

  const handleSelectAllCountries = () => {
    if (selectedCountries.size === countries.length) {
      setSelectedCountries(new Set())
    } else {
      setSelectedCountries(new Set(countries.map(c => c.code)))
    }
  }

  const handleToggleCountry = (code: string) => {
    setSelectedCountries(prev => {
      const newSet = new Set(prev)
      if (newSet.has(code)) {
        newSet.delete(code)
      } else {
        newSet.add(code)
      }
      return newSet
    })
  }

  const formatValue = (value: number | null, decimals: number = 2): string => {
    if (value === null) return "N/A"
    return value.toLocaleString(undefined, { 
      minimumFractionDigits: decimals, 
      maximumFractionDigits: decimals 
    })
  }

  const formatTimestamp = (timestamp: string): string => {
    if (timestamp.length === 4) return timestamp
    if (timestamp.length === 7) {
      const [year, month] = timestamp.split('-')
      const date = new Date(2000, parseInt(month) - 1)
      return `${date.toLocaleString('default', { month: 'short' })} ${year}`
    }
    return timestamp
  }

  const allCountriesSelected = selectedCountries.size === countries.length && countries.length > 0
  const someCountriesSelected = selectedCountries.size > 0 && selectedCountries.size < countries.length

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold">Tabular View</h1>
          <p className="text-muted-foreground">
            View and filter economic data in a comprehensive table format
          </p>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Filter data by time range and countries</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Start Date */}
              <div className="space-y-2">
                <Label>Start Date</Label>
                <div className="flex gap-2">
                  <Select value={startYear} onValueChange={setStartYear}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent>
                      {[...availableYears].reverse().map(year => (
                        <SelectItem key={year} value={year}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {availableStartMonths.length > 0 && (
                    <Select value={startMonth || undefined} onValueChange={(value) => setStartMonth(value === "__all__" ? "" : value)}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Month" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All</SelectItem>
                        {availableStartMonths.map(month => (
                          <SelectItem key={month} value={month}>
                            {new Date(2000, parseInt(month) - 1).toLocaleString('default', { month: 'long' })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {/* End Date */}
              <div className="space-y-2">
                <Label>End Date</Label>
                <div className="flex gap-2">
                  <Select value={endYear} onValueChange={setEndYear}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableYears.map(year => (
                        <SelectItem key={year} value={year}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {availableEndMonths.length > 0 && (
                    <Select value={endMonth || undefined} onValueChange={(value) => setEndMonth(value === "__all__" ? "" : value)}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Month" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All</SelectItem>
                        {availableEndMonths.map(month => (
                          <SelectItem key={month} value={month}>
                            {new Date(2000, parseInt(month) - 1).toLocaleString('default', { month: 'long' })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </div>

            {/* Country Filter */}
            <div className="space-y-2">
              <Label>Countries</Label>
              <Popover open={countryFilterOpen} onOpenChange={setCountryFilterOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    {selectedCountries.size === 0 
                      ? "Select countries..." 
                      : `${selectedCountries.size} country${selectedCountries.size > 1 ? 'ies' : 'y'} selected`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search countries..." />
                    <CommandList className="max-h-[300px]">
                      <CommandGroup>
                        <CommandItem
                          onSelect={handleSelectAllCountries}
                          className="cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            {allCountriesSelected ? (
                              <CheckSquare className="h-4 w-4" />
                            ) : someCountriesSelected ? (
                              <Square className="h-4 w-4" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                            <span>Select All</span>
                          </div>
                        </CommandItem>
                      </CommandGroup>
                      <CommandGroup>
                        <CommandEmpty>No countries found.</CommandEmpty>
                        {countries.map(country => (
                          <CommandItem
                            key={country.code}
                            value={country.name}
                            onSelect={() => handleToggleCountry(country.code)}
                            className="cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={selectedCountries.has(country.code)}
                                onCheckedChange={() => handleToggleCountry(country.code)}
                              />
                              <span>{country.name}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Data Table</CardTitle>
                <CardDescription>
                  {loading ? "Loading..." : `Showing ${sortedData.length} of ${totalCount} row${totalCount !== 1 ? 's' : ''}`}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="page-size" className="text-sm">Rows per page:</Label>
                <Select value={pageSize.toString()} onValueChange={(value) => setPageSize(parseInt(value))}>
                  <SelectTrigger id="page-size" className="w-[80px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('country')}>
                      <div className="flex items-center gap-2">
                        Country Name
                        {getSortIcon('country')}
                      </div>
                    </TableHead>
                    <TableHead>Country Code</TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('timestamp')}>
                      <div className="flex items-center gap-2">
                        Timestamp
                        {getSortIcon('timestamp')}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('inflation')}>
                      <div className="flex items-center gap-2">
                        Inflation Rate (%)
                        {getSortIcon('inflation')}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('incomeLCU')}>
                      <div className="flex items-center gap-2">
                        Income (LCU)
                        {getSortIcon('incomeLCU')}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('incomePPP')}>
                      <div className="flex items-center gap-2">
                        Income (PPP)
                        {getSortIcon('incomePPP')}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('growthRate')}>
                      <div className="flex items-center gap-2">
                        Income Growth Rate (%)
                        {getSortIcon('growthRate')}
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        {loading ? "Loading data..." : "No data available for the selected filters"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedData.map((row, index) => (
                      <TableRow key={`${row.countryCode}-${row.timestamp}-${index}`}>
                        <TableCell className="font-medium">{row.countryName}</TableCell>
                        <TableCell>{row.countryCode}</TableCell>
                        <TableCell>{formatTimestamp(row.timestamp)}</TableCell>
                        <TableCell>{row.inflationValue !== null ? `${formatValue(row.inflationValue)}%` : "N/A"}</TableCell>
                        <TableCell>{row.current_local_currency !== null ? formatValue(row.current_local_currency, 0) : "N/A"}</TableCell>
                        <TableCell>{row.ppp_international_dollars !== null ? formatValue(row.ppp_international_dollars, 0) : "N/A"}</TableCell>
                        <TableCell>{row.annual_growth_rate !== null ? `${formatValue(row.annual_growth_rate)}%` : "N/A"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {/* Pagination Controls */}
            {totalCount > 0 && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                  Page {currentPage} of {Math.ceil(totalCount / pageSize)}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1 || loading}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalCount / pageSize), prev + 1))}
                    disabled={currentPage >= Math.ceil(totalCount / pageSize) || loading}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
