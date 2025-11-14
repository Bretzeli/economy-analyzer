import {db} from "@/db/db";
import {countryTable, inflationTable} from "@/db/schema";
import {InflationData} from "@/types/api-types";
import {SQL, desc, sql} from "drizzle-orm";
import {Filter} from "@/types/filters";
import {and, eq, gte, lte, like} from "drizzle-orm/sql/expressions/conditions";
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

export const deleteAllData = async (): Promise<{ inflationDeleted: number; countriesDeleted: number }> => {
    console.log("Deleting all inflation and country data...");
    const inflationDeleted = await deleteAllInflationData();
    const countriesDeleted = await deleteAllCountryData();
    console.log(`Deleted ${inflationDeleted} inflation records and ${countriesDeleted} country records`);
    return { inflationDeleted, countriesDeleted };
}

export const readInflationData = async (filter: Filter) : Promise<InflationData[]> => {
    const conditions: SQL[] = [];

    if (filter.countryCodes.length > 0) {
        for (const code in filter.countryCodes) {
            conditions.push(eq(inflationTable.countryCode, code))
        }
    }

    if(filter.countryNames.length > 0){
        for (const name in filter.countryNames) {
            conditions.push(eq(countryTable.name, name))
        }
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
        .where(and(...conditions)), "readInflationData for filter: " + JSON.stringify(filter));
      ;
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

