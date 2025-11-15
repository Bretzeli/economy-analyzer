"use server";

import {
    getNewestDateForWorldBankInflationData,
    addInflationDataWithMonthlyFlag,
    hasOecdDataForCountryYear,
    deleteAllInflationData as deleteAllInflationDataInternal
} from "@/services/db-operations";
import {updateInflationDataFromOecd} from "@/services/update-oecd-inflation-data";
import {getInflationDataFromWorldBank} from "@/services/api-calls";

export const updateAllInflationData = async () => {
    console.log("=== Starting inflation data update ===");
    
    // Step 1: Update OECD data first
    console.log("\n--- Step 1: Updating OECD inflation data ---");
    await updateInflationDataFromOecd();
    
    // Step 2: Update World Bank data
    console.log("\n--- Step 2: Updating World Bank inflation data ---");
    await updateWorldBankInflationData();
    
    console.log("\n=== Inflation data update completed ===");
}

export const deleteAndReimportAllInflationData = async () => {
    console.log("=== Starting delete and re-import of all inflation data ===");
    
    // Step 1: Delete all existing inflation data
    console.log("\n--- Step 1: Deleting all existing inflation data ---");
    const inflationDeleted = await deleteAllInflationDataInternal();
    console.log(`Deleted ${inflationDeleted} inflation records`);
    
    // Step 2: Re-import all inflation data from scratch
    console.log("\n--- Step 2: Re-importing all inflation data from scratch ---");
    await updateAllInflationData();
    
    console.log("\n=== Delete and re-import completed ===");
}

// Keep the old function name for backward compatibility, but it now only handles inflation
export const deleteAndReimportAllData = deleteAndReimportAllInflationData;

// Re-export deleteAllInflationData as a server action
export const deleteAllInflationData = deleteAllInflationDataInternal;

async function updateWorldBankInflationData() {
    console.log("Updating World Bank inflation data...");
    let startDate: string = await getNewestDateForWorldBankInflationData() ?? "1900";
    // Increment year by 1 to get the next year to fetch
    const startYear = parseInt(startDate.substring(0, 4));
    if (!isNaN(startYear)) {
        startDate = (startYear + 1).toString();
    }

    // Track totals
    let totalRecordsRead = 0;
    let totalRecordsAdded = 0;
    let totalErrors = 0;
    let totalDuplicatesWithOecd = 0;

    // Get all World Bank data (it's a single download)
    try {
        const newData = await getInflationDataFromWorldBank(startDate);
        totalRecordsRead = newData.length;
        
        // Filter out invalid data before processing
        const validData = newData.filter(data => {
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
            // Validate inflationRate is a valid finite number
            if (typeof data.inflationRate !== 'number' || !isFinite(data.inflationRate) || isNaN(data.inflationRate)) {
                console.warn(`Skipping invalid record: invalid inflationRate (${data.inflationRate}) for ${data.countryCode} at ${data.timestamp}`);
                return false;
            }
            return true;
        });
        
        const invalidCount = newData.length - validData.length;
        if (invalidCount > 0) {
            console.warn(`Filtered out ${invalidCount} invalid records from ${newData.length} total records`);
        }
        totalErrors += invalidCount;
        
        // Process in batches to avoid overwhelming the database connection pool
        const BATCH_SIZE = 5;
        
        for (let i = 0; i < validData.length; i += BATCH_SIZE) {
            const batch = validData.slice(i, i + BATCH_SIZE);
            try {
                // Process each item individually to check for OECD duplicates and handle deletions
                const results = await Promise.allSettled(
                    batch.map(async (data) => {
                        const year = data.timestamp.substring(0, 4);
                        
                        // Check if OECD data exists for this country and year
                        const hasOecd = await hasOecdDataForCountryYear(data.countryCode, year);
                        
                        if (hasOecd) {
                            // Skip adding World Bank data if OECD data exists
                            console.warn(`Skipping World Bank data for ${data.countryCode} at ${data.timestamp}: OECD data already exists for this year`);
                            return { skipped: true, reason: 'oecd_exists' };
                        }
                        
                        // Add World Bank data (hasMonthlyInflationData = false)
                        await addInflationDataWithMonthlyFlag(data, false);
                        return { skipped: false };
                    })
                );
                
                // Log any failures and count results
                results.forEach((result, idx) => {
                    if (result.status === 'rejected') {
                        const data = batch[idx];
                        console.error(`Failed to add World Bank inflation data for ${data.countryCode} at ${data.timestamp}:`, result.reason);
                        totalErrors++;
                    } else if (result.status === 'fulfilled') {
                        if (result.value.skipped) {
                            totalDuplicatesWithOecd++;
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
        console.error("Error fetching World Bank inflation data:", error);
        throw error;
    }
    
    // Log final summary
    console.log(`\nWorld Bank update completed:`);
    console.log(`  - Records read: ${totalRecordsRead}`);
    console.log(`  - Records added: ${totalRecordsAdded}`);
    console.log(`  - Duplicates with OECD (skipped): ${totalDuplicatesWithOecd}`);
    console.log(`  - Errors: ${totalErrors}`);
}

