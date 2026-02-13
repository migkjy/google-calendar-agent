import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

import * as schema from "@/models/schema";

let _db: NeonHttpDatabase<typeof schema> | null = null;

export const db: NeonHttpDatabase<typeof schema> = new Proxy(
  {} as NeonHttpDatabase<typeof schema>,
  {
    get(_, prop) {
      if (!_db) {
        const sql = neon(process.env.DATABASE_URL!);
        _db = drizzle(sql, { schema });
      }
      return (_db as unknown as Record<string | symbol, unknown>)[prop];
    },
  },
);
