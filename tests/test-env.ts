// Database khusus tes, terpisah dari database development. Isinya dikosongkan
// setiap kali tes jalan, jadi namanya wajib berakhiran _test (dicek di resetTestDatabase).
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://it_inventory:it_inventory@localhost:5433/it_inventory_test"
