import { exportRoute } from "@/server/master-io/export-route"
import { exportProducts } from "@/modules/it-inventory/server/master-io/products"

export const GET = exportRoute("produk", (format) => exportProducts(format))
