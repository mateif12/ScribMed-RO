/**
 * Seeds a demo organisation into PostgreSQL (development only, mock auth).
 * Usage: DATABASE_URL=postgres://... npm run db:seed
 */
import { hashPassword } from "../src/lib/auth/password";
import { PostgresRepository } from "../src/lib/database/postgres-repository";

const DEMO = { email: "demo@scribmed.ro", password: "Demo-Parola-2026!" };

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Seed-ul demo nu rulează în producție.");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL lipsește");
  const repo = PostgresRepository.fromUrl(url, process.env.DATABASE_SSL === "true");
  try {
    if (await repo.findUserByEmail(DEMO.email)) {
      console.info("Contul demo există deja.");
      return;
    }
    await repo.createOrganizationWithOwner({
      organization: { name: "Clinica Demo Sănătatea", city: "Cluj-Napoca" },
      owner: { email: DEMO.email, passwordHash: await hashPassword(DEMO.password) },
      profile: { fullName: "Dr. Elena Demo", title: "Medic primar", specialty: "medicina_generala", stampCode: "D00000" },
    });
    console.info(`Cont demo creat: ${DEMO.email}`);
  } finally {
    await repo.close();
  }
}

main().catch((e: Error) => {
  console.error(`Seed eșuat: ${e.message}`);
  process.exit(1);
});
