// Akun yang dibuat oleh global-setup lewat seed. Password ini hanya berlaku
// di database tes.
const DEMO_PASSWORD = "demo-e2e-password"

export const ACCOUNTS = {
  admin: {
    name: "Administrator",
    email: "admin@it-inventory.local",
    password: "admin-e2e-password",
  },
  auditor: {
    name: "Demo Auditor",
    email: "auditor@it-inventory.local",
    password: DEMO_PASSWORD,
  },
  gudang: {
    name: "Demo Admin Gudang",
    email: "gudang@it-inventory.local",
    password: DEMO_PASSWORD,
  },
}

export const SEED_ENV = {
  SEED_ADMIN_NAME: ACCOUNTS.admin.name,
  SEED_ADMIN_EMAIL: ACCOUNTS.admin.email,
  SEED_ADMIN_PASSWORD: ACCOUNTS.admin.password,
  SEED_DEMO_USERS: "true",
  SEED_DEMO_PASSWORD: DEMO_PASSWORD,
}
