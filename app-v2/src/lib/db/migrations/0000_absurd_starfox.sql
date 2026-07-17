CREATE TABLE "app_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"processors" jsonb NOT NULL,
	"adyen_config" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_login_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"application_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_login_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "customer_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"contact_info" jsonb NOT NULL,
	"analysis" jsonb,
	"quote" jsonb
);
--> statement-breakpoint
CREATE TABLE "margin_policy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"padding_bps" integer DEFAULT 20 NOT NULL,
	"padding_min_mrr_add" numeric(10, 2) DEFAULT '0' NOT NULL,
	"padding_adyen_cost_hide" boolean DEFAULT true NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_applications" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"customer_user_id" uuid,
	"stage" text NOT NULL,
	"hubspot_deal_id" text,
	"adyen_ids" jsonb,
	"adyen_onboarding_url" text,
	"analysis" jsonb,
	"proposal" jsonb,
	"business" jsonb,
	"owner_contact" jsonb,
	"processing" jsonb,
	"agreement" jsonb,
	"target_margin" numeric(8, 6),
	"pricing_model" text,
	"customer_link_token" text,
	"customer_link_purpose" text,
	"customer_link_sent_at" timestamp with time zone,
	"customer_link_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_applications_customer_link_token_unique" UNIQUE("customer_link_token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "customer_login_tokens" ADD CONSTRAINT "customer_login_tokens_application_id_merchant_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."merchant_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "margin_policy" ADD CONSTRAINT "margin_policy_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_applications" ADD CONSTRAINT "merchant_applications_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_applications" ADD CONSTRAINT "merchant_applications_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;