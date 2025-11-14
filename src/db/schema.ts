import { pgTable, varchar, real, boolean, unique } from "drizzle-orm/pg-core";

export const countryTable = pgTable("countries", {
    code: varchar({length: 15}).primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    hasMonthlyInflationData: boolean().notNull(),
});

export const inflationTable = pgTable("inflation", {
    countryCode: varchar({length: 15}).notNull().references(() => countryTable.code),
    timestamp: varchar({length: 10}).notNull(),
    inflationValue: real().notNull(),
}, (table) => [
    unique().on(table.countryCode, table.timestamp)
]);

export const incomeTable = pgTable("income", {
    countryCode: varchar({length: 15}).notNull().references(() => countryTable.code),
    timestamp: varchar({length: 10}).notNull(),
    ppp_international_dollars: real().notNull(),
    current_local_currency: real().notNull(),
    annual_growth_rate: real().notNull(),
}, (table) => [
    unique().on(table.countryCode, table.timestamp)
]);