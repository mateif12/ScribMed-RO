import "server-only";
import { AppError } from "@/lib/api/errors";
import { hashPassword } from "@/lib/auth/password";
import { AuthError, getIdentityProvider } from "@/lib/auth/providers";
import { getRepository } from "@/lib/database";
import type { RegisterInput } from "@/lib/validation/schemas";
import type { User } from "@/types/domain";

function toAppError(e: unknown): AppError {
  if (e instanceof AuthError) {
    switch (e.reason) {
      case "invalid_credentials":
        return new AppError("UNAUTHENTICATED", e.message);
      case "not_confirmed":
        return new AppError("FORBIDDEN", e.message, { needsConfirmation: true });
      case "user_exists":
        return new AppError("CONFLICT", e.message);
      case "invalid_code":
      case "weak_password":
        return new AppError("VALIDATION_ERROR", e.message);
      case "rate_limited":
        return new AppError("RATE_LIMITED", e.message);
      default:
        return new AppError("PROVIDER_ERROR", e.message);
    }
  }
  if (e instanceof AppError) return e;
  return new AppError("INTERNAL_ERROR", "A apărut o eroare neașteptată.");
}

export async function login(email: string, password: string): Promise<User> {
  try {
    const identity = await getIdentityProvider().signIn(email, password);
    const repo = await getRepository();
    let user = identity.externalId ? await repo.findUserByExternalId(identity.externalId) : null;
    if (!user) {
      user = await repo.findUserByEmail(identity.email);
      // Link the Cognito subject on first login (registration may predate linking).
      if (user && identity.externalId && !user.externalId) await repo.setUserExternalId(user.id, identity.externalId);
    }
    if (!user || !user.isActive) throw new AppError("UNAUTHENTICATED", "E-mail sau parolă incorecte.");
    return user;
  } catch (e) {
    throw toAppError(e);
  }
}

export async function register(input: RegisterInput): Promise<{ user: User | null; needsConfirmation: boolean }> {
  try {
    const repo = await getRepository();
    if (await repo.findUserByEmail(input.email)) {
      throw new AppError("CONFLICT", "Există deja un cont cu acest e-mail.");
    }
    const provider = getIdentityProvider();
    const signUp = await provider.signUp(input.email, input.password);
    try {
      const { user } = await repo.createOrganizationWithOwner({
        organization: { name: input.clinicName, city: input.city || null },
        owner: {
          email: input.email,
          externalId: signUp.externalId,
          passwordHash: provider.name === "mock" ? await hashPassword(input.password) : null,
        },
        profile: { fullName: input.fullName, specialty: input.specialty },
      });
      return { user: signUp.needsConfirmation ? null : user, needsConfirmation: signUp.needsConfirmation };
    } catch (e) {
      if (e instanceof Error && e.message === "EMAIL_EXISTS") {
        throw new AppError("CONFLICT", "Există deja un cont cu acest e-mail.");
      }
      throw e;
    }
  } catch (e) {
    throw toAppError(e);
  }
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
  try {
    await getIdentityProvider().confirmSignUp(email, code);
  } catch (e) {
    throw toAppError(e);
  }
}

export async function forgotPassword(email: string): Promise<{ devCode?: string }> {
  try {
    return await getIdentityProvider().forgotPassword(email);
  } catch (e) {
    throw toAppError(e);
  }
}

export async function resetPassword(email: string, code: string, newPassword: string): Promise<void> {
  try {
    await getIdentityProvider().confirmForgotPassword(email, code, newPassword);
  } catch (e) {
    throw toAppError(e);
  }
}
