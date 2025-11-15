import {db} from "@/db/db";
import {countryTable, inflationTable, incomeTable} from "@/db/schema";
import {InflationData, IncomeData} from "@/types/api-types";
import {SQL, desc, asc, sql} from "drizzle-orm";
import {Filter} from "@/types/filters";
import {and, eq, gte, lte, like, inArray} from "drizzle-orm/sql/expressions/conditions";
import { wait } from "next/dist/lib/wait";

export const addCountry = async (countryCode: string, countryName: string) => {
    const dbCall: () => Promise<unknown> = () => db.insert(countryTable).values({
        code: countryCode,
        name: countryName,
        hasMonthlyInflationData: true,
    }).onConflictDoNothing({ target: countryTable.code }).execute();
    await attemptDBCall(dbCall, "addCountry for country: " + countryCode + " and name: " + countryName);
}

export const addCountryWithMonthlyFlag = async (countryCode: string, countryName: string, hasMonthlyInflationData: boolean) => {
    // If we're trying to set hasMonthlyInflationData to false, check if country already has OECD data
    // If it does, keep hasMonthlyInflationData as true (prefer OECD data)
    let finalHasMonthly = hasMonthlyInflationData;
    if (!hasMonthlyInflationData) {
        const hasOecd = await hasAnyOecdDataForCountry(countryCode);
        if (hasOecd) {
            finalHasMonthly = true;
        }
    }
    
    const dbCall: () => Promise<unknown> = () => db.insert(countryTable).values({
        code: countryCode,
        name: countryName,
        hasMonthlyInflationData: finalHasMonthly,
    }).onConflictDoUpdate({
        target: countryTable.code,
        set: {
            name: countryName,
            // Preserve true values (OECD data takes precedence), otherwise use the new value
            hasMonthlyInflationData: sql`GREATEST(${countryTable.hasMonthlyInflationData}::int, ${finalHasMonthly ? 1 : 0})::boolean`,
        }
    }).execute();
    await attemptDBCall(dbCall, "addCountryWithMonthlyFlag for country: " + countryCode + " and name: " + countryName + " with monthly: " + finalHasMonthly);
}

export const addInflationData = async (data : InflationData) => {
    await addCountry(data.countryCode, data.countryName);
    await attemptDBCall(async () => db.insert(inflationTable).values({
        countryCode: data.countryCode,
        timestamp: data.timestamp,
        inflationValue: data.inflationRate,
    }).onConflictDoNothing().execute(), "addInflationData for data: " + JSON.stringify(data));
}

export const addInflationDataWithMonthlyFlag = async (data : InflationData, hasMonthlyInflationData: boolean) => {
    await addCountryWithMonthlyFlag(data.countryCode, data.countryName, hasMonthlyInflationData);
    await attemptDBCall(async () => db.insert(inflationTable).values({
        countryCode: data.countryCode,
        timestamp: data.timestamp,
        inflationValue: data.inflationRate,
    }).onConflictDoNothing().execute(), "addInflationDataWithMonthlyFlag for data: " + JSON.stringify(data));
}

export const hasOecdDataForCountryYear = async (countryCode: string, year: string): Promise<boolean> => {
    return attemptDBCall<boolean>(async () => {
        const result = await db.select()
            .from(inflationTable)
            .where(
                and(
                    eq(inflationTable.countryCode, countryCode),
                    sql`LENGTH(${inflationTable.timestamp}) = 7`,
                    sql`${inflationTable.timestamp} ~ '^[0-9]{4}-[0-9]{2}$'`,
                    like(inflationTable.timestamp, `${year}-%`)
                )
            )
            .limit(1);
        return result.length > 0;
    }, "hasOecdDataForCountryYear for country: " + countryCode + " and year: " + year);
}

export const hasAnyOecdDataForCountry = async (countryCode: string): Promise<boolean> => {
    return attemptDBCall<boolean>(async () => {
        const result = await db.select()
            .from(inflationTable)
            .where(
                and(
                    eq(inflationTable.countryCode, countryCode),
                    sql`LENGTH(${inflationTable.timestamp}) = 7`,
                    sql`${inflationTable.timestamp} ~ '^[0-9]{4}-[0-9]{2}$'`
                )
            )
            .limit(1);
        return result.length > 0;
    }, "hasAnyOecdDataForCountry for country: " + countryCode);
}

export const deleteWorldBankDataForCountryYear = async (countryCode: string, year: string): Promise<number> => {
    return attemptDBCall<number>(async () => {
        const result = await db.delete(inflationTable)
            .where(
                and(
                    eq(inflationTable.countryCode, countryCode),
                    eq(inflationTable.timestamp, year)
                )
            )
            .returning();
        return result.length;
    }, "deleteWorldBankDataForCountryYear for country: " + countryCode + " and year: " + year);
}

export const deleteAllInflationData = async (): Promise<number> => {
    return attemptDBCall<number>(async () => {
        const result = await db.delete(inflationTable).returning();
        return result.length;
    }, "deleteAllInflationData");
}

export const deleteAllCountryData = async (): Promise<number> => {
    return attemptDBCall<number>(async () => {
        const result = await db.delete(countryTable).returning();
        return result.length;
    }, "deleteAllCountryData");
}

export const deleteAllData = async (): Promise<{ inflationDeleted: number; incomeDeleted: number; countriesDeleted: number }> => {
    console.log("Deleting all inflation, income and country data...");
    const inflationDeleted = await deleteAllInflationData();
    const incomeDeleted = await deleteAllIncomeData();
    const countriesDeleted = await deleteAllCountryData();
    console.log(`Deleted ${inflationDeleted} inflation records, ${incomeDeleted} income records and ${countriesDeleted} country records`);
    return { inflationDeleted, incomeDeleted, countriesDeleted };
}

export const readInflationData = async (filter: Filter) : Promise<InflationData[]> => {
    const conditions: SQL[] = [];

    if (filter.countryCodes && filter.countryCodes.length > 0) {
        conditions.push(inArray(inflationTable.countryCode, filter.countryCodes));
    }

    if(filter.countryNames && filter.countryNames.length > 0){
        conditions.push(inArray(countryTable.name, filter.countryNames));
    }

    if(filter.startDate){
        conditions.push(gte(inflationTable.timestamp, filter.startDate))
    }

    if(filter.endDate){
        conditions.push(lte(inflationTable.timestamp, filter.endDate))
    }

    return attemptDBCall<InflationData[]>(() => db.select({
            countryCode: inflationTable.countryCode,
            countryName: countryTable.name,
            timestamp: inflationTable.timestamp,
            inflationRate: inflationTable.inflationValue
        })
        .from(inflationTable)
        .innerJoin(countryTable, eq(countryTable.code, inflationTable.countryCode))
        .where(conditions.length > 0 ? and(...conditions) : undefined), "readInflationData for filter: " + JSON.stringify(filter));
}

export const getNewestDateForOecdInflationData= async () : Promise<string | null> => {
    return attemptDBCall<string | null>(async () => 
        db.select()
            .from(inflationTable)
            .where(sql`LENGTH(${inflationTable.timestamp}) = 7 AND ${inflationTable.timestamp} ~ '^[0-9]{4}-[0-9]{2}$'`)
            .orderBy(desc(inflationTable.timestamp))
            .limit(1)
            .then(result => result[0]?.timestamp || null), 
        "getNewestDateForInflationData");
}

export const getNewestDateForWorldBankInflationData = async (): Promise<string | null> => {
    return attemptDBCall<string | null>(async () => 
        db.select()
            .from(inflationTable)
            .where(sql`LENGTH(${inflationTable.timestamp}) = 4 AND ${inflationTable.timestamp} ~ '^[0-9]{4}$'`)
            .orderBy(desc(inflationTable.timestamp))
            .limit(1)
            .then(result => result[0]?.timestamp || null), 
        "getNewestDateForWorldBankInflationData");
}

export const addIncomeData = async (data: IncomeData) => {
    // Ensure country exists
    await addCountryWithMonthlyFlag(data.countryCode, data.countryName, false);
    
    // Only insert if at least one income value is provided
    if (data.ppp_international_dollars === undefined && 
        data.current_local_currency === undefined && 
        data.annual_growth_rate === undefined) {
        console.warn(`Skipping income data for ${data.countryCode} at ${data.timestamp}: no income values provided`);
        return;
    }
    
    await attemptDBCall(async () => {
        // Check if record exists
        const existing = await db.select()
            .from(incomeTable)
            .where(
                and(
                    eq(incomeTable.countryCode, data.countryCode),
                    eq(incomeTable.timestamp, data.timestamp)
                )
            )
            .limit(1);
        
        if (existing.length > 0) {
            // Update existing record, only updating fields that are provided
            const updateValues: {
                ppp_international_dollars?: number;
                current_local_currency?: number;
                annual_growth_rate?: number;
            } = {};
            if (data.ppp_international_dollars !== undefined) {
                updateValues.ppp_international_dollars = data.ppp_international_dollars;
            }
            if (data.current_local_currency !== undefined) {
                updateValues.current_local_currency = data.current_local_currency;
            }
            if (data.annual_growth_rate !== undefined) {
                updateValues.annual_growth_rate = data.annual_growth_rate;
            }
            
            if (Object.keys(updateValues).length > 0) {
                await db.update(incomeTable)
                    .set(updateValues)
                    .where(
                        and(
                            eq(incomeTable.countryCode, data.countryCode),
                            eq(incomeTable.timestamp, data.timestamp)
                        )
                    )
                    .execute();
            }
        } else {
            // Insert new record
            await db.insert(incomeTable).values({
                countryCode: data.countryCode,
                timestamp: data.timestamp,
                ppp_international_dollars: data.ppp_international_dollars ?? 0,
                current_local_currency: data.current_local_currency ?? 0,
                annual_growth_rate: data.annual_growth_rate ?? 0,
            }).execute();
        }
    }, "addIncomeData for data: " + JSON.stringify(data));
}

export const deleteAllIncomeData = async (): Promise<number> => {
    return attemptDBCall<number>(async () => {
        const result = await db.delete(incomeTable).returning();
        return result.length;
    }, "deleteAllIncomeData");
}

export const getNewestDateForIncomeData = async (): Promise<string | null> => {
    return attemptDBCall<string | null>(async () => 
        db.select()
            .from(incomeTable)
            .where(sql`LENGTH(${incomeTable.timestamp}) = 4 AND ${incomeTable.timestamp} ~ '^[0-9]{4}$'`)
            .orderBy(desc(incomeTable.timestamp))
            .limit(1)
            .then(result => result[0]?.timestamp || null), 
        "getNewestDateForIncomeData");
}

export const hasIncomeDataForCountryYear = async (countryCode: string, year: string): Promise<boolean> => {
    return attemptDBCall<boolean>(async () => {
        const result = await db.select()
            .from(incomeTable)
            .where(
                and(
                    eq(incomeTable.countryCode, countryCode),
                    eq(incomeTable.timestamp, year)
                )
            )
            .limit(1);
        return result.length > 0;
    }, "hasIncomeDataForCountryYear for country: " + countryCode + " and year: " + year);
}

async function attemptDBCall<T>(dbCall: () => Promise<T>, description: string) : Promise<T> {
    const MAX_RETRIES: number = 3;
    const RETRY_DELAY: number = 1000;
    let retries = 0;
    while(retries <= MAX_RETRIES) {
        try {
            return await dbCall();
        } catch (error) {
            retries++;
            // Log full error details
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            const errorName = error instanceof Error ? error.name : typeof error;
            
            // Try to extract more details from the error object
            let additionalInfo = '';
            if (error && typeof error === 'object') {
                try {
                    const errorKeys = Object.keys(error);
                    additionalInfo = ` Error keys: ${errorKeys.join(', ')}`;
                    // Check for common error properties
                    if ('cause' in error && error.cause) {
                        additionalInfo += ` Cause: ${String(error.cause)}`;
                    }
                    if ('code' in error) {
                        additionalInfo += ` Code: ${String(error.code)}`;
                    }
                } catch {
                    // Ignore errors in error extraction
                }
            }
            
            console.error(`Error calling database (retry ${retries}/${MAX_RETRIES}):`, {
                name: errorName,
                message: errorMessage,
                stack: errorStack,
                additionalInfo
            });
            
            if (retries > MAX_RETRIES) {
                console.error("Max retries reached. Full error:", error);
                throw new Error(`Max retries reached for calling database: ${description}. Last error: ${errorMessage}${additionalInfo}${errorStack ? '\nStack: ' + errorStack : ''}`);
            }
            await wait(RETRY_DELAY);
        }
    }
    throw new Error("Max retries reached for calling database: " + description);
}

// Combined income and inflation data with filters, sorting, and paging
export type CombinedIncomeInflationData = {
    countryCode: string;
    countryName: string;
    timestamp: string;
    ppp_international_dollars: number | null;
    current_local_currency: number | null;
    annual_growth_rate: number | null;
    inflationValue: number | null;
};

export const getCombinedIncomeAndInflationData = async (filter: Filter): Promise<CombinedIncomeInflationData[]> => {
    return attemptDBCall<CombinedIncomeInflationData[]>(async () => {
        const conditions: SQL[] = [];

        // Country code filter
        if (filter.countryCodes && filter.countryCodes.length > 0) {
            conditions.push(inArray(countryTable.code, filter.countryCodes));
        }

        // Country name filter
        if (filter.countryNames && filter.countryNames.length > 0) {
            conditions.push(inArray(countryTable.name, filter.countryNames));
        }

        // Date range filters - filter on income timestamp since we're using innerJoin on income
        if (filter.startDate) {
            conditions.push(gte(incomeTable.timestamp, filter.startDate));
        }

        if (filter.endDate) {
            conditions.push(lte(incomeTable.timestamp, filter.endDate));
        }

        // Build the query - we'll use a union approach to get all unique combinations
        // First, get all income data with potential inflation matches
        const baseQuery = db
            .select({
                countryCode: countryTable.code,
                countryName: countryTable.name,
                timestamp: incomeTable.timestamp,
                ppp_international_dollars: incomeTable.ppp_international_dollars,
                current_local_currency: incomeTable.current_local_currency,
                annual_growth_rate: incomeTable.annual_growth_rate,
                inflationValue: inflationTable.inflationValue,
            })
            .from(countryTable)
            .innerJoin(incomeTable, eq(countryTable.code, incomeTable.countryCode))
            .leftJoin(inflationTable, 
                and(
                    eq(countryTable.code, inflationTable.countryCode),
                    eq(incomeTable.timestamp, inflationTable.timestamp)
                )
            );

        // Apply filters, sorting, and paging conditionally
        // Note: Drizzle's query builder types change with each method call, so we use type assertions
        // to handle dynamic query building while maintaining runtime correctness
        type QueryType = ReturnType<typeof baseQuery.where> | ReturnType<typeof baseQuery.orderBy> | ReturnType<typeof baseQuery.offset> | ReturnType<typeof baseQuery.limit>;
        let query: QueryType = conditions.length > 0 
            ? baseQuery.where(and(...conditions)) as QueryType
            : baseQuery as QueryType;

        // Apply sorting
        if (filter.sortBy) {
            const sortOrder = filter.sortOrder === 'desc' ? desc : asc;
            switch (filter.sortBy) {
                case 'country':
                    query = (query as typeof baseQuery).orderBy(sortOrder(countryTable.name)) as QueryType;
                    break;
                case 'time':
                case 'timestamp':
                    query = (query as typeof baseQuery).orderBy(sortOrder(incomeTable.timestamp)) as QueryType;
                    break;
                case 'income':
                case 'ppp_international_dollars':
                    query = (query as typeof baseQuery).orderBy(sortOrder(incomeTable.ppp_international_dollars)) as QueryType;
                    break;
                case 'annual_growth_rate':
                    query = (query as typeof baseQuery).orderBy(sortOrder(incomeTable.annual_growth_rate)) as QueryType;
                    break;
                case 'inflation':
                case 'inflationValue':
                    query = (query as typeof baseQuery).orderBy(sortOrder(inflationTable.inflationValue)) as QueryType;
                    break;
            }
        } else {
            // Default sorting by country and timestamp
            query = (query as typeof baseQuery).orderBy(asc(countryTable.name), asc(incomeTable.timestamp)) as QueryType;
        }

        // Apply paging
        if (filter.paging?.offset !== undefined && filter.paging?.limit !== undefined) {
            query = ((query as typeof baseQuery).offset(filter.paging.offset).limit(filter.paging.limit)) as QueryType;
        } else if (filter.paging?.offset !== undefined) {
            query = ((query as typeof baseQuery).offset(filter.paging.offset)) as QueryType;
        } else if (filter.paging?.limit !== undefined) {
            query = ((query as typeof baseQuery).limit(filter.paging.limit)) as QueryType;
        }

        const result = await (query as Promise<CombinedIncomeInflationData[]>);
        
        // Filter out rows where both income and inflation are null
        return result.filter(row => 
            row.ppp_international_dollars !== null || 
            row.current_local_currency !== null || 
            row.annual_growth_rate !== null || 
            row.inflationValue !== null
        );
    }, "getCombinedIncomeAndInflationData for filter: " + JSON.stringify(filter));
};

// Country ranking for inflation and income
export type CountryRanking = {
    countryCode: string;
    countryName: string;
    timestamp: string;
    inflationValue: number | null;
    inflationRank: number | null;
    inflationTotalCountries: number;
    ppp_international_dollars: number | null;
    incomeRank: number | null;
    incomeTotalCountries: number;
    annual_growth_rate: number | null;
    growthRateRank: number | null;
    growthRateTotalCountries: number;
};

export const getCountryRanking = async (
    countryCode: string, 
    timestamp?: string
): Promise<CountryRanking | null> => {
    return attemptDBCall<CountryRanking | null>(async () => {
        // If no timestamp provided, get the newest available timestamp
        let targetTimestamp = timestamp;
        if (!targetTimestamp) {
            // Get the newest timestamp that has data for this country
            const newestIncome = await db
                .select({ timestamp: incomeTable.timestamp })
                .from(incomeTable)
                .where(eq(incomeTable.countryCode, countryCode))
                .orderBy(desc(incomeTable.timestamp))
                .limit(1);
            
            const newestInflation = await db
                .select({ timestamp: inflationTable.timestamp })
                .from(inflationTable)
                .where(eq(inflationTable.countryCode, countryCode))
                .orderBy(desc(inflationTable.timestamp))
                .limit(1);
            
            // Use the newest of the two, or whichever is available
            if (newestIncome.length > 0 && newestInflation.length > 0) {
                targetTimestamp = newestIncome[0].timestamp > newestInflation[0].timestamp 
                    ? newestIncome[0].timestamp 
                    : newestInflation[0].timestamp;
            } else if (newestIncome.length > 0) {
                targetTimestamp = newestIncome[0].timestamp;
            } else if (newestInflation.length > 0) {
                targetTimestamp = newestInflation[0].timestamp;
            } else {
                return null; // No data for this country
            }
        }

        // Get country info
        const country = await db
            .select()
            .from(countryTable)
            .where(eq(countryTable.code, countryCode))
            .limit(1);
        
        if (country.length === 0) {
            return null;
        }

        // Get inflation ranking
        const inflationData = await db
            .select({
                countryCode: inflationTable.countryCode,
                inflationValue: inflationTable.inflationValue,
            })
            .from(inflationTable)
            .where(eq(inflationTable.timestamp, targetTimestamp))
            .orderBy(desc(inflationTable.inflationValue));
        
        const inflationRank = inflationData.findIndex(d => d.countryCode === countryCode);
        const inflationTotalCountries = inflationData.length;
        const countryInflation = inflationData.find(d => d.countryCode === countryCode);

        // Get income ranking (by ppp_international_dollars)
        const incomeData = await db
            .select({
                countryCode: incomeTable.countryCode,
                ppp_international_dollars: incomeTable.ppp_international_dollars,
            })
            .from(incomeTable)
            .where(eq(incomeTable.timestamp, targetTimestamp))
            .orderBy(desc(incomeTable.ppp_international_dollars));
        
        const incomeRank = incomeData.findIndex(d => d.countryCode === countryCode);
        const incomeTotalCountries = incomeData.length;
        const countryIncome = incomeData.find(d => d.countryCode === countryCode);

        // Get growth rate ranking
        const growthRateData = await db
            .select({
                countryCode: incomeTable.countryCode,
                annual_growth_rate: incomeTable.annual_growth_rate,
            })
            .from(incomeTable)
            .where(eq(incomeTable.timestamp, targetTimestamp))
            .orderBy(desc(incomeTable.annual_growth_rate));
        
        const growthRateRank = growthRateData.findIndex(d => d.countryCode === countryCode);
        const growthRateTotalCountries = growthRateData.length;
        const countryGrowthRate = growthRateData.find(d => d.countryCode === countryCode);

        return {
            countryCode: countryCode,
            countryName: country[0].name,
            timestamp: targetTimestamp,
            inflationValue: countryInflation?.inflationValue ?? null,
            inflationRank: inflationRank >= 0 ? inflationRank + 1 : null, // 1-based ranking
            inflationTotalCountries,
            ppp_international_dollars: countryIncome?.ppp_international_dollars ?? null,
            incomeRank: incomeRank >= 0 ? incomeRank + 1 : null,
            incomeTotalCountries,
            annual_growth_rate: countryGrowthRate?.annual_growth_rate ?? null,
            growthRateRank: growthRateRank >= 0 ? growthRateRank + 1 : null,
            growthRateTotalCountries,
        };
    }, `getCountryRanking for country: ${countryCode}, timestamp: ${timestamp || 'newest'}`);
};

// Income growth rate vs inflation rate difference
export type IncomeInflationDifference = {
    countryCode: string;
    countryName: string;
    timestamp: string;
    annual_growth_rate: number | null;
    inflationValue: number | null;
    difference: number | null; // annual_growth_rate - inflationValue (positive is good, negative is bad)
};

export const getIncomeInflationDifference = async (filter: Filter): Promise<IncomeInflationDifference[]> => {
    return attemptDBCall<IncomeInflationDifference[]>(async () => {
        const conditions: SQL[] = [];

        // Country code filter
        if (filter.countryCodes && filter.countryCodes.length > 0) {
            conditions.push(inArray(countryTable.code, filter.countryCodes));
        }

        // Country name filter
        if (filter.countryNames && filter.countryNames.length > 0) {
            conditions.push(inArray(countryTable.name, filter.countryNames));
        }

        // Timestamp filter
        if (filter.timestamp) {
            conditions.push(
                and(
                    eq(incomeTable.timestamp, filter.timestamp),
                    eq(inflationTable.timestamp, filter.timestamp)
                )!
            );
        }

        // Date range filters
        if (filter.startDate) {
            conditions.push(
                and(
                    gte(incomeTable.timestamp, filter.startDate),
                    gte(inflationTable.timestamp, filter.startDate)
                )!
            );
        }

        if (filter.endDate) {
            conditions.push(
                and(
                    lte(incomeTable.timestamp, filter.endDate),
                    lte(inflationTable.timestamp, filter.endDate)
                )!
            );
        }

        // Join income and inflation on country and timestamp
        const baseQuery = db
            .select({
                countryCode: countryTable.code,
                countryName: countryTable.name,
                timestamp: incomeTable.timestamp,
                annual_growth_rate: incomeTable.annual_growth_rate,
                inflationValue: inflationTable.inflationValue,
                difference: sql<number>`${incomeTable.annual_growth_rate} - ${inflationTable.inflationValue}`.as('difference'),
            })
            .from(countryTable)
            .innerJoin(incomeTable, eq(countryTable.code, incomeTable.countryCode))
            .innerJoin(inflationTable, 
                and(
                    eq(countryTable.code, inflationTable.countryCode),
                    eq(incomeTable.timestamp, inflationTable.timestamp)
                )
            );

        // Apply filters, sorting, and paging conditionally
        // Note: Drizzle's query builder types change with each method call, so we use type assertions
        // to handle dynamic query building while maintaining runtime correctness
        type QueryType = ReturnType<typeof baseQuery.where> | ReturnType<typeof baseQuery.orderBy> | ReturnType<typeof baseQuery.offset> | ReturnType<typeof baseQuery.limit>;
        let query: QueryType = conditions.length > 0 
            ? baseQuery.where(and(...conditions)) as QueryType
            : baseQuery as QueryType;

        // Apply sorting
        if (filter.sortBy) {
            const sortOrder = filter.sortOrder === 'desc' ? desc : asc;
            switch (filter.sortBy) {
                case 'country':
                    query = (query as typeof baseQuery).orderBy(sortOrder(countryTable.name)) as QueryType;
                    break;
                case 'time':
                case 'timestamp':
                    query = (query as typeof baseQuery).orderBy(sortOrder(incomeTable.timestamp)) as QueryType;
                    break;
                case 'best':
                    // Best = highest difference (income growth > inflation)
                    query = (query as typeof baseQuery).orderBy(sortOrder(sql`${incomeTable.annual_growth_rate} - ${inflationTable.inflationValue}`)) as QueryType;
                    break;
                case 'worst':
                    // Worst = lowest difference (inflation > income growth)
                    // For worst, we want ascending order when sortOrder is desc, and vice versa
                    const worstSortOrder = filter.sortOrder === 'desc' ? asc : desc;
                    query = (query as typeof baseQuery).orderBy(worstSortOrder(sql`${incomeTable.annual_growth_rate} - ${inflationTable.inflationValue}`)) as QueryType;
                    break;
                case 'difference':
                    query = (query as typeof baseQuery).orderBy(sortOrder(sql`${incomeTable.annual_growth_rate} - ${inflationTable.inflationValue}`)) as QueryType;
                    break;
            }
        } else {
            // Default sorting by country and timestamp
            query = (query as typeof baseQuery).orderBy(asc(countryTable.name), asc(incomeTable.timestamp)) as QueryType;
        }

        // Apply paging
        if (filter.paging?.offset !== undefined && filter.paging?.limit !== undefined) {
            query = ((query as typeof baseQuery).offset(filter.paging.offset).limit(filter.paging.limit)) as QueryType;
        } else if (filter.paging?.offset !== undefined) {
            query = ((query as typeof baseQuery).offset(filter.paging.offset)) as QueryType;
        } else if (filter.paging?.limit !== undefined) {
            query = ((query as typeof baseQuery).limit(filter.paging.limit)) as QueryType;
        }

        const result = await (query as Promise<IncomeInflationDifference[]>);
        
        // Map to include null differences where data is missing
        return result.map(row => ({
            countryCode: row.countryCode,
            countryName: row.countryName,
            timestamp: row.timestamp,
            annual_growth_rate: row.annual_growth_rate,
            inflationValue: row.inflationValue,
            difference: row.annual_growth_rate !== null && row.inflationValue !== null 
                ? row.annual_growth_rate - row.inflationValue 
                : null,
        }));
    }, "getIncomeInflationDifference for filter: " + JSON.stringify(filter));
};

// Get all countries for search suggestions
export type CountryInfo = {
    code: string;
    name: string;
};

export const getAllCountries = async (): Promise<CountryInfo[]> => {
    return attemptDBCall<CountryInfo[]>(async () => {
        const result = await db
            .select({
                code: countryTable.code,
                name: countryTable.name,
            })
            .from(countryTable)
            .orderBy(asc(countryTable.name));
        return result;
    }, "getAllCountries");
};

// Get time series data for a single country
export type CountryTimeSeriesData = {
    timestamp: string;
    inflationValue: number | null;
    ppp_international_dollars: number | null;
    current_local_currency: number | null;
    annual_growth_rate: number | null;
};

export const getCountryTimeSeriesData = async (countryCode: string): Promise<CountryTimeSeriesData[]> => {
    return attemptDBCall<CountryTimeSeriesData[]>(async () => {
        // Get all income data for this country
        const incomeData = await db
            .select({
                timestamp: incomeTable.timestamp,
                ppp_international_dollars: incomeTable.ppp_international_dollars,
                current_local_currency: incomeTable.current_local_currency,
                annual_growth_rate: incomeTable.annual_growth_rate,
            })
            .from(incomeTable)
            .where(eq(incomeTable.countryCode, countryCode))
            .orderBy(asc(incomeTable.timestamp));
        
        // Get all inflation data for this country
        const inflationData = await db
            .select({
                timestamp: inflationTable.timestamp,
                inflationValue: inflationTable.inflationValue,
            })
            .from(inflationTable)
            .where(eq(inflationTable.countryCode, countryCode))
            .orderBy(asc(inflationTable.timestamp));
        
        // Create maps for quick lookup
        const incomeMap = new Map<string, typeof incomeData[0]>();
        incomeData.forEach(item => {
            incomeMap.set(item.timestamp, item);
        });
        
        const inflationMap = new Map<string, typeof inflationData[0]>();
        inflationData.forEach(item => {
            inflationMap.set(item.timestamp, item);
        });
        
        // Get all unique timestamps
        const allTimestamps = new Set<string>();
        incomeData.forEach(item => allTimestamps.add(item.timestamp));
        inflationData.forEach(item => allTimestamps.add(item.timestamp));
        
        // Combine data
        const result: CountryTimeSeriesData[] = Array.from(allTimestamps)
            .sort()
            .map(timestamp => {
                const income = incomeMap.get(timestamp);
                const inflation = inflationMap.get(timestamp);
                
                return {
                    timestamp,
                    inflationValue: inflation?.inflationValue ?? null,
                    ppp_international_dollars: income?.ppp_international_dollars ?? null,
                    current_local_currency: income?.current_local_currency ?? null,
                    annual_growth_rate: income?.annual_growth_rate ?? null,
                };
            });
        
        return result;
    }, `getCountryTimeSeriesData for country: ${countryCode}`);
};

// Get available timestamps for a country (for ranking slider)
export const getAvailableTimestampsForCountry = async (countryCode: string): Promise<string[]> => {
    return attemptDBCall<string[]>(async () => {
        const incomeTimestamps = await db
            .selectDistinct({ timestamp: incomeTable.timestamp })
            .from(incomeTable)
            .where(eq(incomeTable.countryCode, countryCode))
            .orderBy(desc(incomeTable.timestamp));
        
        const inflationTimestamps = await db
            .selectDistinct({ timestamp: inflationTable.timestamp })
            .from(inflationTable)
            .where(eq(inflationTable.countryCode, countryCode))
            .orderBy(desc(inflationTable.timestamp));
        
        // Combine and get unique timestamps, sorted descending
        const allTimestamps = new Set<string>();
        incomeTimestamps.forEach(t => allTimestamps.add(t.timestamp));
        inflationTimestamps.forEach(t => allTimestamps.add(t.timestamp));
        
        return Array.from(allTimestamps).sort().reverse();
    }, `getAvailableTimestampsForCountry for country: ${countryCode}`);
};

// Get country ranking with LCU option
export const getCountryRankingWithLCU = async (
    countryCode: string, 
    timestamp?: string,
    useLCU: boolean = false
): Promise<CountryRanking & { lcuRank: number | null; lcuTotalCountries: number; current_local_currency: number | null } | null> => {
    return attemptDBCall<CountryRanking & { lcuRank: number | null; lcuTotalCountries: number; current_local_currency: number | null } | null>(async () => {
        // If no timestamp provided, get the newest available timestamp
        let targetTimestamp = timestamp;
        if (!targetTimestamp) {
            const newestIncome = await db
                .select({ timestamp: incomeTable.timestamp })
                .from(incomeTable)
                .where(eq(incomeTable.countryCode, countryCode))
                .orderBy(desc(incomeTable.timestamp))
                .limit(1);
            
            const newestInflation = await db
                .select({ timestamp: inflationTable.timestamp })
                .from(inflationTable)
                .where(eq(inflationTable.countryCode, countryCode))
                .orderBy(desc(inflationTable.timestamp))
                .limit(1);
            
            if (newestIncome.length > 0 && newestInflation.length > 0) {
                targetTimestamp = newestIncome[0].timestamp > newestInflation[0].timestamp 
                    ? newestIncome[0].timestamp 
                    : newestInflation[0].timestamp;
            } else if (newestIncome.length > 0) {
                targetTimestamp = newestIncome[0].timestamp;
            } else if (newestInflation.length > 0) {
                targetTimestamp = newestInflation[0].timestamp;
            } else {
                return null;
            }
        }

        const country = await db
            .select()
            .from(countryTable)
            .where(eq(countryTable.code, countryCode))
            .limit(1);
        
        if (country.length === 0) {
            return null;
        }

        // Get inflation ranking
        const inflationData = await db
            .select({
                countryCode: inflationTable.countryCode,
                inflationValue: inflationTable.inflationValue,
            })
            .from(inflationTable)
            .where(eq(inflationTable.timestamp, targetTimestamp))
            .orderBy(desc(inflationTable.inflationValue));
        
        const inflationRank = inflationData.findIndex(d => d.countryCode === countryCode);
        const inflationTotalCountries = inflationData.length;
        const countryInflation = inflationData.find(d => d.countryCode === countryCode);

        // Get income ranking (by ppp_international_dollars)
        const incomeData = await db
            .select({
                countryCode: incomeTable.countryCode,
                ppp_international_dollars: incomeTable.ppp_international_dollars,
            })
            .from(incomeTable)
            .where(eq(incomeTable.timestamp, targetTimestamp))
            .orderBy(desc(incomeTable.ppp_international_dollars));
        
        const incomeRank = incomeData.findIndex(d => d.countryCode === countryCode);
        const incomeTotalCountries = incomeData.length;
        const countryIncome = incomeData.find(d => d.countryCode === countryCode);

        // Get LCU ranking
        const lcuData = await db
            .select({
                countryCode: incomeTable.countryCode,
                current_local_currency: incomeTable.current_local_currency,
            })
            .from(incomeTable)
            .where(eq(incomeTable.timestamp, targetTimestamp))
            .orderBy(desc(incomeTable.current_local_currency));
        
        const lcuRank = lcuData.findIndex(d => d.countryCode === countryCode);
        const lcuTotalCountries = lcuData.length;

        // Get growth rate ranking
        const growthRateData = await db
            .select({
                countryCode: incomeTable.countryCode,
                annual_growth_rate: incomeTable.annual_growth_rate,
            })
            .from(incomeTable)
            .where(eq(incomeTable.timestamp, targetTimestamp))
            .orderBy(desc(incomeTable.annual_growth_rate));
        
        const growthRateRank = growthRateData.findIndex(d => d.countryCode === countryCode);
        const growthRateTotalCountries = growthRateData.length;
        const countryGrowthRate = growthRateData.find(d => d.countryCode === countryCode);

        const countryLCU = lcuData.find(d => d.countryCode === countryCode);

        return {
            countryCode: countryCode,
            countryName: country[0].name,
            timestamp: targetTimestamp,
            inflationValue: countryInflation?.inflationValue ?? null,
            inflationRank: inflationRank >= 0 ? inflationRank + 1 : null,
            inflationTotalCountries,
            ppp_international_dollars: countryIncome?.ppp_international_dollars ?? null,
            incomeRank: incomeRank >= 0 ? incomeRank + 1 : null,
            incomeTotalCountries,
            annual_growth_rate: countryGrowthRate?.annual_growth_rate ?? null,
            growthRateRank: growthRateRank >= 0 ? growthRateRank + 1 : null,
            growthRateTotalCountries,
            lcuRank: lcuRank >= 0 ? lcuRank + 1 : null,
            lcuTotalCountries,
            current_local_currency: countryLCU?.current_local_currency ?? null,
        };
    }, `getCountryRankingWithLCU for country: ${countryCode}, timestamp: ${timestamp || 'newest'}, useLCU: ${useLCU}`);
};

// Get inflation ranking with yearly averages (for countries with monthly data, use average; for others, use yearly data)
export const getInflationRankingWithYearlyAverage = async (
    countryCode: string,
    year: string
): Promise<{ inflationValue: number | null; inflationRank: number | null; inflationTotalCountries: number } | null> => {
    return attemptDBCall<{ inflationValue: number | null; inflationRank: number | null; inflationTotalCountries: number } | null>(async () => {
        // Get all inflation data for the year
        const allInflationData = await db
            .select({
                countryCode: inflationTable.countryCode,
                timestamp: inflationTable.timestamp,
                inflationValue: inflationTable.inflationValue,
            })
            .from(inflationTable)
            .where(
                like(inflationTable.timestamp, `${year}%`)
            );

        // Group by country and calculate averages for monthly data, or use yearly data
        const countryInflationMap = new Map<string, { values: number[]; isMonthly: boolean }>();
        
        allInflationData.forEach(item => {
            const isMonthly = item.timestamp.length === 7; // YYYY-MM format
            const isYearly = item.timestamp.length === 4; // YYYY format
            
            if (!countryInflationMap.has(item.countryCode)) {
                countryInflationMap.set(item.countryCode, { values: [], isMonthly: false });
            }
            
            const countryData = countryInflationMap.get(item.countryCode)!;
            if (isMonthly) {
                countryData.values.push(item.inflationValue);
                countryData.isMonthly = true;
            } else if (isYearly && item.timestamp === year) {
                // Use yearly data directly (only if it matches the exact year)
                countryData.values = [item.inflationValue];
                countryData.isMonthly = false;
            }
        });

        // Calculate final inflation values: average for monthly, direct for yearly
        const inflationRanking: Array<{ countryCode: string; inflationValue: number }> = [];
        
        countryInflationMap.forEach((data, code) => {
            if (data.values.length > 0) {
                const avgValue = data.isMonthly 
                    ? data.values.reduce((sum, val) => sum + val, 0) / data.values.length
                    : data.values[0]; // Use direct value for yearly data
                inflationRanking.push({ countryCode: code, inflationValue: avgValue });
            }
        });

        // Sort by inflation value (descending)
        inflationRanking.sort((a, b) => b.inflationValue - a.inflationValue);

        // Find the country's rank
        const countryRank = inflationRanking.findIndex(d => d.countryCode === countryCode);
        const countryData = inflationRanking.find(d => d.countryCode === countryCode);

        return {
            inflationValue: countryData?.inflationValue ?? null,
            inflationRank: countryRank >= 0 ? countryRank + 1 : null,
            inflationTotalCountries: inflationRanking.length,
        };
    }, `getInflationRankingWithYearlyAverage for country: ${countryCode}, year: ${year}`);
};

