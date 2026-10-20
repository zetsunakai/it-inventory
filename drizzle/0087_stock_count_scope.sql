CREATE TABLE "stock_count_products" (
	"stock_count_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	CONSTRAINT "stock_count_products_stock_count_id_product_id_pk" PRIMARY KEY("stock_count_id","product_id")
);
--> statement-breakpoint
ALTER TABLE "stock_counts" ADD COLUMN "include_zero_stock" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD COLUMN "initial_counted" text DEFAULT 'empty' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_count_products" ADD CONSTRAINT "stock_count_products_stock_count_id_stock_counts_id_fk" FOREIGN KEY ("stock_count_id") REFERENCES "public"."stock_counts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_products" ADD CONSTRAINT "stock_count_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;