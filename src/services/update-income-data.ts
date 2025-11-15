"use server";

import {
    getNewestDateForIncomeData,
    addIncomeData,
    hasIncomeDataForCountryYear,
    deleteAllIncomeData as deleteAllIncomeDataInternal
} from "@/services/db-operations";
import {getIncomeDataFromWorldBank} from "@/services/api-calls";
import {IncomeData} from "@/types/api-types";

export const updateAllIncomeData = async (): Promise<{
    recordsAdded: number;
    errors: number;
    countriesProcessed: number;
}> => {
    console.log("=== Starting income data update ===");
    
    const result = await updateWorldBankIncomeData();
    
    console.log("\n=== Income data update completed ===");
    
    return {
        recordsAdded: result.recordsAdded,
        errors: result.errors,
        countriesProcessed: result.countriesProcessed,
    };
}

export const deleteAndReimportAllIncomeData = async () => {
    console.log("=== Starting delete and re-import of all income data ===");
    
    // Step 1: Delete all existing income data
    console.log("\n--- Step 1: Deleting all existing income data ---");
    const deleteResult = await deleteAllIncomeDataInternal();
    console.log(`Deleted ${deleteResult} income records`);
    
    // Step 2: Re-import all data from scratch
    console.log("\n--- Step 2: Re-importing all income data from scratch ---");
    await updateAllIncomeData();
    
    console.log("\n=== Delete and re-import completed ===");
}

// Re-export deleteAllIncomeData as a server action
export const deleteAllIncomeData = deleteAllIncomeDataInternal;

async function updateWorldBankIncomeData(): Promise<{
    recordsRead: number;
    recordsAdded: number;
    duplicates: number;
    errors: number;
    countriesProcessed: number;
}> {
    console.log("Updating World Bank income data...");
    let startDate: string = await getNewestDateForIncomeData() ?? "1900";
    // Increment year by 1 to get the next year to fetch
    const startYear = parseInt(startDate.substring(0, 4));
    if (!isNaN(startYear)) {
        startDate = (startYear + 1).toString();
    }

    // Track totals
    let totalRecordsRead = 0;
    let totalRecordsAdded = 0;
    let totalErrors = 0;
    let totalDuplicates = 0;
    const countriesProcessed = new Set<string>();

    try {
        // Fetch all three income indicators
        console.log("Fetching PPP international dollars data...");
        const pppData = await getIncomeDataFromWorldBank('NY.GNP.PCAP.PP.CD', startDate);
        console.log(`Fetched ${pppData.length} PPP records`);
        
        console.log("Fetching current local currency data...");
        const localCurrencyData = await getIncomeDataFromWorldBank('NY.GNP.PCAP.CN', startDate);
        console.log(`Fetched ${localCurrencyData.length} local currency records`);
        
        console.log("Fetching annual growth rate data...");
        const growthRateData = await getIncomeDataFromWorldBank('NY.GNP.PCAP.KD.ZG', startDate);
        console.log(`Fetched ${growthRateData.length} growth rate records`);
        
        totalRecordsRead = pppData.length + localCurrencyData.length + growthRateData.length;
        
        // Merge the three datasets into a single IncomeData structure
        const mergedData = new Map<string, IncomeData>();
        
        // Process PPP data
        for (const item of pppData) {
            const key = `${item.countryCode}_${item.timestamp}`;
            if (!mergedData.has(key)) {
                mergedData.set(key, {
                    countryCode: item.countryCode,
                    countryName: item.countryName,
                    timestamp: item.timestamp,
                });
            }
            const data = mergedData.get(key)!;
            data.ppp_international_dollars = item.incomeValue;
        }
        
        // Process local currency data
        for (const item of localCurrencyData) {
            const key = `${item.countryCode}_${item.timestamp}`;
            if (!mergedData.has(key)) {
                mergedData.set(key, {
                    countryCode: item.countryCode,
                    countryName: item.countryName,
                    timestamp: item.timestamp,
                });
            }
            const data = mergedData.get(key)!;
            data.current_local_currency = item.incomeValue;
        }
        
        // Process growth rate data
        for (const item of growthRateData) {
            const key = `${item.countryCode}_${item.timestamp}`;
            if (!mergedData.has(key)) {
                mergedData.set(key, {
                    countryCode: item.countryCode,
                    countryName: item.countryName,
                    timestamp: item.timestamp,
                });
            }
            const data = mergedData.get(key)!;
            data.annual_growth_rate = item.incomeValue;
        }
        
        const mergedArray = Array.from(mergedData.values());
        
        // Filter out invalid data before processing
        const validData = mergedArray.filter(data => {
            // Validate required fields
            if (!data.countryCode || !data.timestamp) {
                console.warn(`Skipping invalid record: missing countryCode or timestamp. Data:`, JSON.stringify(data));
                return false;
            }
            // Validate timestamp is in YYYY format
            if (!/^\d{4}$/.test(data.timestamp)) {
                console.warn(`Skipping invalid record: timestamp not in YYYY format (${data.timestamp}) for ${data.countryCode}`);
                return false;
            }
            // Validate at least one income value is a valid finite number
            const hasValidValue = 
                (data.ppp_international_dollars !== undefined && isFinite(data.ppp_international_dollars)) ||
                (data.current_local_currency !== undefined && isFinite(data.current_local_currency)) ||
                (data.annual_growth_rate !== undefined && isFinite(data.annual_growth_rate));
            
            if (!hasValidValue) {
                console.warn(`Skipping invalid record: no valid income values for ${data.countryCode} at ${data.timestamp}`);
                return false;
            }
            return true;
        });
        
        const invalidCount = mergedArray.length - validData.length;
        if (invalidCount > 0) {
            console.warn(`Filtered out ${invalidCount} invalid records from ${mergedArray.length} total records`);
        }
        totalErrors += invalidCount;
        
        // Process in batches to avoid overwhelming the database connection pool
        const BATCH_SIZE = 5;
        
        for (let i = 0; i < validData.length; i += BATCH_SIZE) {
            const batch = validData.slice(i, i + BATCH_SIZE);
            try {
                // Process each item individually to check for duplicates
                const results = await Promise.allSettled(
                    batch.map(async (data) => {                        
                        // Check if data already exists for this country and year
                        // We still update to merge new values with existing ones
                        // This allows us to add missing indicators to existing records
                        
                        // Add or update income data
                        await addIncomeData(data);
                        countriesProcessed.add(data.countryCode);
                        return { skipped: false };
                    })
                );
                
                // Log any failures and count results
                results.forEach((result, idx) => {
                    if (result.status === 'rejected') {
                        const data = batch[idx];
                        console.error(`Failed to add income data for ${data.countryCode} at ${data.timestamp}:`, result.reason);
                        totalErrors++;
                    } else if (result.status === 'fulfilled') {
                        if (result.value.skipped) {
                            totalDuplicates++;
                        } else {
                            totalRecordsAdded++;
                        }
                    }
                });
            } catch (error) {
                console.error(`Error processing batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error);
                totalErrors += batch.length;
                // Continue with next batch instead of failing completely
            }
        }
        
    } catch (error) {
        console.error("Error fetching World Bank income data:", error);
        throw error;
    }
    
    // Log final summary
    console.log(`\nWorld Bank income update completed:`);
    console.log(`  - Records read: ${totalRecordsRead}`);
    console.log(`  - Records added/updated: ${totalRecordsAdded}`);
    console.log(`  - Duplicates (skipped): ${totalDuplicates}`);
    console.log(`  - Errors: ${totalErrors}`);
    console.log(`  - Countries processed: ${countriesProcessed.size}`);
    
    return {
        recordsRead: totalRecordsRead,
        recordsAdded: totalRecordsAdded,
        duplicates: totalDuplicates,
        errors: totalErrors,
        countriesProcessed: countriesProcessed.size,
    };
}

