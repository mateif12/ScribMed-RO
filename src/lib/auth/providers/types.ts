/**
 * Identity provider abstraction. The application keeps its own user /
 * organisation records; the provider only verifies credentials and manages
 * the password lifecycle.
 */
export interface IdentityResult {
  /** Provider subject (Cognito `sub`) or null for local mock auth. */
  externalId: string | null;
  email: string;
}

export interface SignUpResult {
  externalId: string | null;
  needsConfirmation: boolean;
}

export interface ForgotPasswordResult {
  /** Only populated by the mock provider outside production, for demos. */
  devCode?: string;
}

export interface IdentityProvider {
  readonly name: "mock" | "cognito";
  signIn(email: string, password: string): Promise<IdentityResult>;
  signUp(email: string, password: string): Promise<SignUpResult>;
  confirmSignUp(email: string, code: string): Promise<void>;
  forgotPassword(email: string): Promise<ForgotPasswordResult>;
  confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void>;
}

export class AuthError extends Error {
  readonly reason:
    | "invalid_credentials"
    | "not_confirmed"
    | "user_exists"
    | "invalid_code"
    | "weak_password"
    | "rate_limited"
    | "provider";
  constructor(reason: AuthError["reason"], message: string) {
    super(message);
    this.name = "AuthError";
    this.reason = reason;
  }
}
