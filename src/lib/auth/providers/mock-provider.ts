import { randomInt } from "node:crypto";
import type { Repository } from "@/lib/database/repository";
import { hashPassword, verifyPassword } from "../password";
import { AuthError, type ForgotPasswordResult, type IdentityProvider, type IdentityResult, type SignUpResult } from "./types";

/** A syntactically valid hash that never matches – used to equalise timing for unknown users. */
const DUMMY_HASH = ["scrypt", "16384", "8", "1", "AAAAAAAAAAAAAAAAAAAAAA==", "A".repeat(88)].join("$");

/**
 * Local identity provider for development and tests. Passwords are stored as
 * scrypt hashes in the application database. Refused in production unless
 * ALLOW_MOCK_AUTH_IN_PRODUCTION=true (see env validation).
 */
export class MockIdentityProvider implements IdentityProvider {
  readonly name = "mock" as const;
  private resetCodes = new Map<string, { code: string; expires: number; attempts: number }>();

  constructor(
    private readonly repo: () => Promise<Repository>,
    private readonly exposeDevCodes: boolean,
  ) {}

  async signIn(email: string, password: string): Promise<IdentityResult> {
    const user = await (await this.repo()).findUserByEmail(email);
    // Always run a hash comparison to reduce user-enumeration timing differences.
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new AuthError("invalid_credentials", "E-mail sau parolă incorecte.");
    return { externalId: null, email: user.email };
  }

  async signUp(): Promise<SignUpResult> {
    // The password hash is stored by the auth service together with the user row.
    return { externalId: null, needsConfirmation: false };
  }

  async confirmSignUp(): Promise<void> {
    /* no-op: mock accounts are active immediately */
  }

  async forgotPassword(email: string): Promise<ForgotPasswordResult> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const user = await (await this.repo()).findUserByEmail(email);
    if (user) this.resetCodes.set(user.email, { code, expires: Date.now() + 15 * 60_000, attempts: 0 });
    // Same response shape for unknown e-mails (no account enumeration).
    return this.exposeDevCodes ? { devCode: code } : {};
  }

  async confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void> {
    const repo = await this.repo();
    const user = await repo.findUserByEmail(email);
    const entry = user ? this.resetCodes.get(user.email) : undefined;
    if (entry) entry.attempts += 1;
    if (!user || !entry || entry.expires < Date.now() || entry.attempts > 5 || entry.code !== code) {
      throw new AuthError("invalid_code", "Codul de resetare este invalid sau a expirat.");
    }
    this.resetCodes.delete(user.email);
    await repo.setUserPasswordHash(user.id, await hashPassword(newPassword));
  }
}
