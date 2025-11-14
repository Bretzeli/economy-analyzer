ALTER TABLE "countries" ALTER COLUMN "code" SET DATA TYPE varchar(15);--> statement-breakpoint
ALTER TABLE "income" ALTER COLUMN "countryCode" SET DATA TYPE varchar(15);--> statement-breakpoint
ALTER TABLE "inflation" ALTER COLUMN "countryCode" SET DATA TYPE varchar(15);