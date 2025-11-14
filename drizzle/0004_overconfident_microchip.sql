ALTER TABLE "income" ADD COLUMN "ppp_international_dollars" real NOT NULL;--> statement-breakpoint
ALTER TABLE "income" ADD COLUMN "current_local_currency" real NOT NULL;--> statement-breakpoint
ALTER TABLE "income" ADD COLUMN "annual_growth_rate" real NOT NULL;--> statement-breakpoint
ALTER TABLE "income" DROP COLUMN "incomeValue";--> statement-breakpoint
ALTER TABLE "income" ADD CONSTRAINT "income_countryCode_timestamp_unique" UNIQUE("countryCode","timestamp");