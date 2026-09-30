/**
 * Prisma CLI configuration (Prisma 7 replaced `package.json#prisma` with this).
 *
 * This file is for the CLI only - migrate, db push, seed. The application itself
 * never reads it: at runtime the connection comes from a driver adapter, because
 * in the packaged desktop app the database lives in the user's data directory and
 * that path is not known until the app starts. See src/lib/db.ts.
 */
import path from "node:path";
import { defineConfig, env } from "prisma/config";

// Prisma 7 no longer reads .env by itself. Node 22 can, with no extra dependency.
try {
  process.loadEnvFile();
} catch {
  // No .env present - fine when DATABASE_URL is already set in the environment.
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
