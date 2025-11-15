"use server";

import {
    deleteAllData as deleteAllDataInternal
} from "@/services/db-operations";
import {updateAllInflationData} from "@/services/update-inflation-data";
import {updateAllIncomeData} from "@/services/update-income-data";

export const updateAllData = async () => {
    console.log("=== Starting update of all data (inflation + income) ===");
    
    // Step 1: Update inflation data
    console.log("\n--- Step 1: Updating inflation data ---");
    await updateAllInflationData();
    
    // Step 2: Update income data
    console.log("\n--- Step 2: Updating income data ---");
    await updateAllIncomeData();
    
    console.log("\n=== All data update completed ===");
}

export const deleteAndReimportAllData = async () => {
    console.log("=== Starting delete and re-import of all data (inflation + income) ===");
    
    // Step 1: Delete all existing data
    console.log("\n--- Step 1: Deleting all existing data ---");
    const deleteResult = await deleteAllDataInternal();
    console.log(`Deleted ${deleteResult.inflationDeleted} inflation records, ${deleteResult.incomeDeleted} income records and ${deleteResult.countriesDeleted} country records`);
    
    // Step 2: Re-import all data from scratch
    console.log("\n--- Step 2: Re-importing all data from scratch ---");
    await updateAllData();
    
    console.log("\n=== Delete and re-import completed ===");
}

// Re-export deleteAllData as a server action
export const deleteAllData = deleteAllDataInternal;

