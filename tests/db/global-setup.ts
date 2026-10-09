import { resetTestDatabase } from "../test-database"

export default async function setup() {
  await resetTestDatabase()
}
