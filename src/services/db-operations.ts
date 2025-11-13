import {db} from "@/db/db";
import {countryTable, inflationTable} from "@/db/schema";
import {InflationData} from "@/types/api-types";
import {desc} from "drizzle-orm";
import {Filter} from "@/types/filters";
import {and, eq, gte, lte} from "drizzle-orm/sql/expressions/conditions";

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
    console.log("Adding country: " + countryCode);
    if(!CountryCache.hasCountry(countryCode)) {
        console.log("Inserting new country: " + countryCode);
        await db.insert(countryTable).values({
            code: countryCode,
            name: countryName,
            hasMonthlyInflationData: true,
        }).onConflictDoNothing().execute();
        CountryCache.addCountry(countryCode);
        console.log("Country added successfully: " + countryCode);
    }
    else {
        console.log("Country already exists: " + countryCode);
    }
}

export const addInflationData = async (data : InflationData) => {
    console.log("Adding inflation data for country: " + data.countryCode);
    await addCountry(data.countryCode, data.countryName);
    console.log("Country added successfully: " + data.countryCode);
    console.log("Inserting new inflation data: " + data.timestamp);
    await db.insert(inflationTable).values({
        countryCode: data.countryCode,
        timestamp: data.timestamp,
        inflationValue: data.inflationRate,
    }).onConflictDoNothing().execute();
    console.log("Inflation data added successfully: " + data.timestamp);
}

export const readInflationData = async (filter: Filter) : Promise<InflationData[]> => {
    const conditions = [];

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

    return db.select({
            countryCode: inflationTable.countryCode,
            countryName: countryTable.name,
            timestamp: inflationTable.timestamp,
            inflationRate: inflationTable.inflationValue
        })
        .from(inflationTable)
        .innerJoin(countryTable, eq(countryTable.code, inflationTable.countryCode))
        .where(and(...conditions))
      ;
}

export const getNewestDateForInflationData= async () : Promise<string | null> => {
    console.log("Getting newest date for inflation data");
    return db.select().from(inflationTable).orderBy(desc(inflationTable.timestamp)).limit(1).then(result => result[0]?.timestamp || null);
}

