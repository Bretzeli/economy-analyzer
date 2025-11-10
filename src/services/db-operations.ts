import {db} from "../db/db";
import {countryTable} from "@/db/schema";

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