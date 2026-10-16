import { exportRoute } from "@/server/master-io/export-route"
import { exportLocations } from "@/modules/inventory/server/master-io/locations"

// Hanya lokasi di gudang yang boleh dilihat user, ditambah lokasi virtual.
export const GET = exportRoute("lokasi", (format, user) => exportLocations(format, user.id))
