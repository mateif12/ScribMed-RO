import "server-only";
import { getEnv } from "@/config/env";
import { hashPassword } from "@/lib/auth/password";
import { MemoryRepository } from "./memory-repository";
import { PostgresRepository } from "./postgres-repository";
import type { Repository } from "./repository";

/** Demo credentials for the in-memory development database (mock auth only, never in production). */
export const DEMO_ACCOUNT = {
  email: "demo@scribmed.ro",
  password: "Demo-Parola-2026!",
} as const;

const globalForRepo = globalThis as unknown as { __scribmedRepo?: Repository; __scribmedSeed?: Promise<void> };

export async function seedDemoData(repo: Repository): Promise<void> {
  if (await repo.findUserByEmail(DEMO_ACCOUNT.email)) return;
  await repo.createOrganizationWithOwner({
    organization: { name: "Clinica Demo Sănătatea", city: "Cluj-Napoca", fiscalCode: null },
    owner: { email: DEMO_ACCOUNT.email, passwordHash: await hashPassword(DEMO_ACCOUNT.password) },
    profile: { fullName: "Dr. Elena Demo", title: "Medic primar", specialty: "medicina_generala", stampCode: "D00000" },
  });
}

/** Returns the configured repository (singleton, survives dev hot reloads). */
export async function getRepository(): Promise<Repository> {
  if (!globalForRepo.__scribmedRepo) {
    const env = getEnv();
    globalForRepo.__scribmedRepo =
      env.DATABASE_PROVIDER === "postgres"
        ? PostgresRepository.fromUrl(env.DATABASE_URL ?? "", Boolean(env.DATABASE_SSL))
        : new MemoryRepository();
    if (env.DATABASE_PROVIDER === "memory" && env.AUTH_PROVIDER === "mock" && env.NODE_ENV !== "production") {
      globalForRepo.__scribmedSeed = seedDemoData(globalForRepo.__scribmedRepo);
    }
  }
  if (globalForRepo.__scribmedSeed) await globalForRepo.__scribmedSeed;
  return globalForRepo.__scribmedRepo;
}

/** Test hook. */
export function setRepository(repo: Repository | null): void {
  globalForRepo.__scribmedRepo = repo ?? undefined;
  globalForRepo.__scribmedSeed = undefined;
}

export type { Repository, TenantScope } from "./repository";
