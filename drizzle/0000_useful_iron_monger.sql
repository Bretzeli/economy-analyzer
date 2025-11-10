CREATE TABLE "income" (
	"countryCode" varchar(5) NOT NULL,
	"timestamp" varchar(10) NOT NULL,
	"incomeValue" numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inflation" (
	"countryCode" varchar(5) NOT NULL,
	"timestamp" varchar(10) NOT NULL,
	"inflationValue" numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"code" varchar(5) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"hasMonthlyInflationData" boolean NOT NULL
);
--> statement-breakpoint
ALTER TABLE "income" ADD CONSTRAINT "income_countryCode_countries_code_fk" FOREIGN KEY ("countryCode") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inflation" ADD CONSTRAINT "inflation_countryCode_countries_code_fk" FOREIGN KEY ("countryCode") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;