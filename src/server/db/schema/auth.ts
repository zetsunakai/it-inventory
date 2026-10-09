import { relations, sql } from "drizzle-orm"
import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

// Tabel milik Better Auth. Dibuat dari `npx auth@latest generate`
// (usePlural, generateId "uuid"), lalu disesuaikan dengan konvensi repo:
// nama kolom dari casing snake_case dan timestamp with time zone.
// Kalau mengubah plugin Better Auth, generate ulang lalu bandingkan.

const id = () =>
  uuid()
    .default(sql`gen_random_uuid()`)
    .primaryKey()

const tz = () => timestamp({ withTimezone: true })

export const users = pgTable("users", {
  id: id(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().default(false).notNull(),
  image: text(),
  // Dari plugin twoFactor.
  twoFactorEnabled: boolean().default(false).notNull(),
  createdAt: tz().defaultNow().notNull(),
  updatedAt: tz()
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    expiresAt: tz().notNull(),
    token: text().notNull().unique(),
    createdAt: tz().defaultNow().notNull(),
    updatedAt: tz()
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text(),
    userAgent: text(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
)

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: tz(),
    refreshTokenExpiresAt: tz(),
    scope: text(),
    password: text(),
    createdAt: tz().defaultNow().notNull(),
    updatedAt: tz()
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)],
)

export const verifications = pgTable(
  "verifications",
  {
    id: id(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: tz().notNull(),
    createdAt: tz().defaultNow().notNull(),
    updatedAt: tz()
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
)

// Dari plugin twoFactor: secret TOTP dan backup code per user.
export const twoFactors = pgTable(
  "two_factors",
  {
    id: id(),
    secret: text().notNull(),
    backupCodes: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    verified: boolean().default(true),
    failedVerificationCount: integer().default(0),
    lockedUntil: tz(),
  },
  (table) => [
    index("two_factors_secret_idx").on(table.secret),
    index("two_factors_user_id_idx").on(table.userId),
  ],
)

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  twoFactors: many(twoFactors),
}))

export const twoFactorsRelations = relations(twoFactors, ({ one }) => ({
  user: one(users, { fields: [twoFactors.userId], references: [users.id] }),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}))

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}))
