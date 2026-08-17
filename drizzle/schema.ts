import { serial, text, pgTable } from "drizzle-orm/pg-core";

export const Users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().default(""),
  password: text("password").notNull().default(""),
});
