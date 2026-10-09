import { pgEnum, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core"

// Path relatif (bukan alias @/) karena schema juga dibaca oleh drizzle-kit dan script CLI.
import { ROLES } from "../../../lib/permissions"

import { users } from "./auth"

export const appRole = pgEnum("app_role", ROLES)

// Satu user boleh punya lebih dari satu peran (PRD bagian 3).
// Akses per gudang ditambahkan di M1-03.
export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: appRole().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.role] })],
)
