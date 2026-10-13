CREATE TABLE "inventory_periods" (
	"year" smallint NOT NULL,
	"month" smallint NOT NULL,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_by" uuid,
	CONSTRAINT "inventory_periods_year_month_pk" PRIMARY KEY("year","month"),
	CONSTRAINT "inventory_periods_month_valid" CHECK ("inventory_periods"."month" between 1 and 12)
);
--> statement-breakpoint
CREATE TABLE "period_balances" (
	"year" smallint NOT NULL,
	"month" smallint NOT NULL,
	"product_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"category" "inventory_category" NOT NULL,
	"opening_qty" numeric(18, 4) NOT NULL,
	"in_qty" numeric(18, 4) NOT NULL,
	"out_qty" numeric(18, 4) NOT NULL,
	"adjustment_qty" numeric(18, 4) NOT NULL,
	"closing_qty" numeric(18, 4) NOT NULL,
	CONSTRAINT "period_balances_year_month_warehouse_id_product_id_category_pk" PRIMARY KEY("year","month","warehouse_id","product_id","category")
);
--> statement-breakpoint
ALTER TABLE "period_balances" ADD CONSTRAINT "period_balances_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_balances" ADD CONSTRAINT "period_balances_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "period_balances_product_idx" ON "period_balances" USING btree ("product_id");