CREATE TABLE "adyen_processed_reports" (
	"filename" text PRIMARY KEY NOT NULL,
	"report_date" date,
	"row_count" integer NOT NULL,
	"transaction_count" integer NOT NULL,
	"anomalies" jsonb,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_daily_actuals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_filename" text NOT NULL,
	"tenant_number" text NOT NULL,
	"sale_date" date NOT NULL,
	"month" text NOT NULL,
	"gross_volume" numeric(14, 2) NOT NULL,
	"transaction_count" integer NOT NULL,
	"aio_commission" numeric(14, 2) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_monthly_actuals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_number" text NOT NULL,
	"month" text NOT NULL,
	"gross_volume" numeric(14, 2) NOT NULL,
	"transaction_count" integer NOT NULL,
	"aio_commission" numeric(14, 2) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_daily_actuals_file_tenant_day_key" ON "merchant_daily_actuals" USING btree ("report_filename","tenant_number","sale_date");--> statement-breakpoint
CREATE INDEX "merchant_daily_actuals_tenant_month_idx" ON "merchant_daily_actuals" USING btree ("tenant_number","month");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_monthly_actuals_tenant_month_key" ON "merchant_monthly_actuals" USING btree ("tenant_number","month");