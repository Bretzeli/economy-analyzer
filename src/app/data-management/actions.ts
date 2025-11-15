"use server";

import {
    deleteAllData as deleteAllDataInternal,
    deleteAllInflationData as deleteAllInflationDataInternal,
    deleteAllIncomeData as deleteAllIncomeDataInternal,
} from "@/services/db-operations";
import { updateAllData, deleteAndReimportAllData } from "@/services/update-all-data";
import { 
    updateAllInflationData, 
    deleteAndReimportAllInflationData 
} from "@/services/update-inflation-data";
import { 
    updateAllIncomeData, 
    deleteAndReimportAllIncomeData 
} from "@/services/update-income-data";

export type DataType = "all" | "inflation" | "income";
export type ActionType = "update" | "delete" | "delete-reimport";

interface ActionResult {
    success: boolean;
    message: string;
    details?: {
        recordsDeleted?: number;
        inflationDeleted?: number;
        incomeDeleted?: number;
        countriesDeleted?: number;
        recordsAdded?: number;
        errors?: number;
    };
}

/**
 * Verify the admin password
 */
export async function verifyAdminPassword(password: string): Promise<boolean> {
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
        console.error("ADMIN_PASSWORD environment variable is not set");
        return false;
    }
    return password === adminPassword;
}

/**
 * Perform update action on specified data type
 */
export async function performUpdateAction(
    dataType: DataType,
    password: string
): Promise<ActionResult> {
    // Verify password
    const isValid = await verifyAdminPassword(password);
    if (!isValid) {
        return {
            success: false,
            message: "Wrong password :(\nPlease try again.",
        };
    }

    try {
        if (dataType === "all") {
            const result = await updateAllData();
            return {
                success: true,
                message: `Successfully updated all data!\n\nInflation records added: ${result.inflationRecordsAdded}\nIncome records added: ${result.incomeRecordsAdded}\nTotal records added: ${result.totalRecordsAdded}\nErrors: ${result.errors}`,
                details: {
                    recordsAdded: result.totalRecordsAdded,
                    errors: result.errors,
                },
            };
        } else if (dataType === "inflation") {
            const result = await updateAllInflationData();
            return {
                success: true,
                message: `Successfully updated inflation data!\n\nRecords added: ${result.totalRecordsAdded}\n  - OECD records: ${result.oecdRecordsAdded}\n  - World Bank records: ${result.worldBankRecordsAdded}\nErrors: ${result.errors}`,
                details: {
                    recordsAdded: result.totalRecordsAdded,
                    errors: result.errors,
                },
            };
        } else if (dataType === "income") {
            const result = await updateAllIncomeData();
            return {
                success: true,
                message: `Successfully updated income data!\n\nRecords added: ${result.recordsAdded}\nCountries processed: ${result.countriesProcessed}\nErrors: ${result.errors}`,
                details: {
                    recordsAdded: result.recordsAdded,
                    errors: result.errors,
                },
            };
        }
        return {
            success: false,
            message: "Invalid data type",
        };
    } catch (error) {
        return {
            success: false,
            message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

/**
 * Perform delete action on specified data type
 */
export async function performDeleteAction(
    dataType: DataType,
    password: string
): Promise<ActionResult> {
    // Verify password
    const isValid = await verifyAdminPassword(password);
    if (!isValid) {
        return {
            success: false,
            message: "Wrong password :(\nPlease try again.",
        };
    }

    try {
        if (dataType === "all") {
            const result = await deleteAllDataInternal();
            return {
                success: true,
                message: `Successfully deleted ${result.inflationDeleted} inflation records, ${result.incomeDeleted} income records, and ${result.countriesDeleted} country records.`,
                details: {
                    inflationDeleted: result.inflationDeleted,
                    incomeDeleted: result.incomeDeleted,
                    countriesDeleted: result.countriesDeleted,
                },
            };
        } else if (dataType === "inflation") {
            const deleted = await deleteAllInflationDataInternal();
            return {
                success: true,
                message: `Successfully deleted ${deleted} inflation records.`,
                details: {
                    recordsDeleted: deleted,
                },
            };
        } else if (dataType === "income") {
            const deleted = await deleteAllIncomeDataInternal();
            return {
                success: true,
                message: `Successfully deleted ${deleted} income records.`,
                details: {
                    recordsDeleted: deleted,
                },
            };
        }
        return {
            success: false,
            message: "Invalid data type",
        };
    } catch (error) {
        return {
            success: false,
            message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

/**
 * Perform delete and reimport action on specified data type
 */
export async function performDeleteAndReimportAction(
    dataType: DataType,
    password: string
): Promise<ActionResult> {
    // Verify password
    const isValid = await verifyAdminPassword(password);
    if (!isValid) {
        return {
            success: false,
            message: "Wrong password :(\nPlease try again.",
        };
    }

    try {
        if (dataType === "all") {
            await deleteAndReimportAllData();
            return {
                success: true,
                message: "Successfully deleted and re-imported all data!",
            };
        } else if (dataType === "inflation") {
            await deleteAndReimportAllInflationData();
            return {
                success: true,
                message: "Successfully deleted and re-imported inflation data!",
            };
        } else if (dataType === "income") {
            await deleteAndReimportAllIncomeData();
            return {
                success: true,
                message: "Successfully deleted and re-imported income data!",
            };
        }
        return {
            success: false,
            message: "Invalid data type",
        };
    } catch (error) {
        return {
            success: false,
            message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

