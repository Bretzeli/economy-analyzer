import {db} from "@/db/db";
import {countryTable, inflationTable} from "@/db/schema";
import {InflationData} from "@/types/api-types";
import {and, eq} from "drizzle-orm/sql/expressions/conditions";
import * as async_hooks from "node:async_hooks";
import {desc} from "drizzle-orm";

class CountryCache {
    private static cache: Set<string>;

    static hasCountry(code: string): boolean {
        if (!this.cache) {
            this.cache = new Set<string>();
        }
        return this.cache.has(code);
    }

    static addCountry(code: string): void {
        if (!this.cache) {
            this.cache = new Set<string>();
        }
        this.cache.add(code);
    }
}

export const addCountry = async (countryCode: string, countryName: string) => {
    if(!CountryCache.hasCountry(countryCode)) {
        await db.insert(countryTable).values({
            code: countryCode,
            name: countryName,
            hasMonthlyInflationData: true,
        }).onConflictDoNothing().execute();
        CountryCache.addCountry(countryCode);
    }
}

export const addInflationData = async (data : InflationData) => {
    await addCountry(data.countryCode, data.countryName);
    await db.insert(inflationTable).values({
        countryCode: data.countryCode,
        timestamp: data.timestamp,
        inflationValue: data.inflationRate,
    }).onConflictDoNothing().execute();
}

export const readInflationDataByCountryAndTime = async (countryCode: string, timestamp: string) => {
    return db.select().from(inflationTable).where(and(eq(inflationTable.countryCode, countryCode), eq(inflationTable.timestamp, timestamp)));
}

export const getNewestDateForInflationData= async () : Promise<string> => {
    return db.select().from(inflationTable).orderBy(desc(inflationTable.timestamp)).limit(1).then(result => result[0]?.timestamp || "1800-00");
}

