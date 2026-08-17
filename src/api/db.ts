import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from "postgres";

const client = postgres(process.env.DATABASE_URL!);

export const db: PostgresJsDatabase = drizzle(client);
