import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

const connectionString = process.env.DATABASE_URL!

// Prevent multiple connections in development (hot reload)
const globalForDb = globalThis as unknown as { _pgClient?: ReturnType<typeof postgres> }

const sql = globalForDb._pgClient ?? postgres(connectionString, { max: 10 })
if (process.env.NODE_ENV !== "production") globalForDb._pgClient = sql

export const db = drizzle(sql, { schema })
export { sql as pgClient }
