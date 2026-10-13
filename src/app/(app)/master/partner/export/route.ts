import { exportRoute } from "@/server/master-io/export-route"
import { exportPartners } from "@/server/master-io/partners"

export const GET = exportRoute("partner", (format) => exportPartners(format))
