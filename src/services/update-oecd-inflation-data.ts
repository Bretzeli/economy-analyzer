"use server";

import {addInflationData, getNewestDateForOecdInflationData, deleteWorldBankDataForCountryYear} from "@/services/db-operations";
import {getOecdInflationData} from "@/services/api-calls";

export const updateInflationDataFromOecd = async () => {
    console.log("Updating inflation data...");
    let startDate: string = await getNewestDateForOecdInflationData() ?? "1914-01";
    startDate = incrementDate(startDate);

    // Track totals across all API calls
    let totalRecordsRead = 0;
    let totalRecordsAdded = 0;
    let totalErrors = 0; // Includes both invalid records and database errors
    let totalWorldBankDeleted = 0; // Track World Bank entries deleted due to OECD data

    let incrementedDate: string;
    for (startDate; startDate <= new Date().toISOString().slice(0, 4); startDate = incrementedDate){
        incrementedDate = incrementDate(startDate, 75);     // 20 downloads pro Stunde ==> ca. 2h mit 75 Zeitpunkten pro Abfrage
        const newData = await getOecdInflationData(startDate, incrementedDate);
        totalRecordsRead += newData.length;
        
        // Filter out invalid data before processing
        const validData = newData.filter(data => {
            // Validate required fields
            if (!data.countryCode || !data.timestamp) {
                console.warn(`Skipping invalid record: missing countryCode or timestamp. Data:`, JSON.stringify(data));
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
        
        // Process in batches to avoid overwhelming the database connection pool
        const BATCH_SIZE = 5; // Reduced batch size to avoid overwhelming Neon HTTP client
        let apiCallRecordsAdded = 0;
        let apiCallErrors = invalidCount; // Start with invalid records count
        let apiCallWorldBankDeleted = 0;
        totalErrors += invalidCount; // Add invalid records to total errors
        
        // Track unique country/year combinations that get OECD data added
        const addedCountryYears = new Set<string>();
        
        for (let i = 0; i < validData.length; i += BATCH_SIZE) {
            const batch = validData.slice(i, i + BATCH_SIZE);
            try {
                // Process each item individually to catch and log specific failures
                const results = await Promise.allSettled(
                    batch.map(async (data) => {
                        await addInflationData(data);
                        // Track country/year for cleanup
                        const year = data.timestamp.substring(0, 4);
                        addedCountryYears.add(`${data.countryCode}:${year}`);
                    })
                );
                
                // Log any failures with details
                results.forEach((result, idx) => {
                    if (result.status === 'rejected') {
                        const data = batch[idx];
                        console.error(`Failed to add inflation data for ${data.countryCode} at ${data.timestamp}:`, result.reason);
                        apiCallErrors++;
                        totalErrors++;
                    } else {
                        apiCallRecordsAdded++;
                        totalRecordsAdded++;
                    }
                });
            } catch (error) {
                console.error(`Error processing batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error);
                apiCallErrors += batch.length;
                totalErrors += batch.length;
                // Continue with next batch instead of failing completely
            }
        }
        
        // Delete World Bank entries for countries/years where OECD data was added
        if (addedCountryYears.size > 0) {
            console.log(`Checking for World Bank entries to delete for ${addedCountryYears.size} country/year combinations...`);
            const deleteResults = await Promise.allSettled(
                Array.from(addedCountryYears).map(async (countryYear) => {
                    const [countryCode, year] = countryYear.split(':');
                    const deletedCount = await deleteWorldBankDataForCountryYear(countryCode, year);
                    if (deletedCount > 0) {
                        apiCallWorldBankDeleted += deletedCount;
                        totalWorldBankDeleted += deletedCount;
                        console.log(`Deleted ${deletedCount} World Bank entry/entries for ${countryCode} at ${year} (OECD data added)`);
                    }
                })
            );
            
            const deleteErrors = deleteResults.filter(r => r.status === 'rejected').length;
            if (deleteErrors > 0) {
                console.warn(`Encountered ${deleteErrors} errors during World Bank cleanup`);
                totalErrors += deleteErrors;
            }
        }
        
        // Log summary after each API call
        console.log(`API call completed: ${newData.length} records read, ${apiCallRecordsAdded} added to DB, ${apiCallWorldBankDeleted} World Bank entries deleted, ${apiCallErrors} errors`);
    }
    
    // Log final summary for all API calls combined
    console.log(`All API calls completed: ${totalRecordsRead} records read, ${totalRecordsAdded} added to DB, ${totalWorldBankDeleted} World Bank entries deleted, ${totalErrors} errors`);
}

function incrementDate(date: string, increment: number = 1): string {
    if (date.includes('-')) {
        // Format: yyyy-mm
        const [year, month] = date.split('-');
        const yearNum = parseInt(year, 10);
        const monthNum = parseInt(month, 10);

        // Calculate total months
        const totalMonths = yearNum * 12 + monthNum + increment;

        // Calculate new year and month
        const newYear = Math.floor((totalMonths - 1) / 12);
        const newMonth = ((totalMonths - 1) % 12) + 1;

        return `${newYear}-${newMonth.toString().padStart(2, '0')}`;
    } else {
        // Format: yyyy
        const yearNum = parseInt(date, 10);
        return (yearNum + increment).toString();
    }
}