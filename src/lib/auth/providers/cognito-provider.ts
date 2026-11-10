import { createHmac } from "node:crypto";
import {
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  InitiateAuthCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { AuthError, type ForgotPasswordResult, type IdentityProvider, type IdentityResult, type SignUpResult } from "./types";

export interface CognitoConfig {
  region: string;
  userPoolId: string;
  clientId: string;
  clientSecret?: string;
}

/**
 * AWS Cognito User Pools provider (USER_PASSWORD_AUTH flow, server-side).
 * The app client must have ALLOW_USER_PASSWORD_AUTH enabled. The ID token
 * returned by Cognito is verified (signature, issuer, audience, expiry) and
 * then discarded – the app issues its own short-lived HttpOnly session cookie.
 */
export class CognitoIdentityProvider implements IdentityProvider {
  readonly name = "cognito" as const;
  private readonly client: CognitoIdentityProviderClient;
  private readonly verifier: ReturnType<typeof CognitoJwtVerifier.create<{ userPoolId: string; tokenUse: "id"; clientId: string }>>;

  constructor(private readonly config: CognitoConfig) {
    this.client = new CognitoIdentityProviderClient({ region: config.region });
    this.verifier = CognitoJwtVerifier.create({
      userPoolId: config.userPoolId,
      tokenUse: "id",
      clientId: config.clientId,
    });
  }

  private secretHash(username: string): string | undefined {
    if (!this.config.clientSecret) return undefined;
    return createHmac("sha256", this.config.clientSecret).update(username + this.config.clientId).digest("base64");
  }

  private mapError(err: unknown): AuthError {
    const name = (err as { name?: string })?.name ?? "";
    switch (name) {
      case "NotAuthorizedException":
      case "UserNotFoundException":
        return new AuthError("invalid_credentials", "E-mail sau parolă incorecte.");
      case "UserNotConfirmedException":
        return new AuthError("not_confirmed", "Contul nu a fost confirmat. Verificați e-mailul.");
      case "UsernameExistsException":
        return new AuthError("user_exists", "Există deja un cont cu acest e-mail.");
      case "CodeMismatchException":
      case "ExpiredCodeException":
        return new AuthError("invalid_code", "Codul este invalid sau a expirat.");
      case "InvalidPasswordException":
        return new AuthError("weak_password", "Parola nu respectă politica de securitate.");
      case "TooManyRequestsException":
      case "LimitExceededException":
        return new AuthError("rate_limited", "Prea multe încercări. Reîncercați mai târziu.");
      default:
        return new AuthError("provider", "Serviciul de autentificare nu este disponibil.");
    }
  }

  async signIn(email: string, password: string): Promise<IdentityResult> {
    try {
      const secretHash = this.secretHash(email);
      const res = await this.client.send(
        new InitiateAuthCommand({
          AuthFlow: "USER_PASSWORD_AUTH",
          ClientId: this.config.clientId,
          AuthParameters: { USERNAME: email, PASSWORD: password, ...(secretHash ? { SECRET_HASH: secretHash } : {}) },
        }),
      );
      if (res.ChallengeName) {
        // MFA / NEW_PASSWORD_REQUIRED challenges are not implemented in the MVP.
        throw new AuthError("provider", "Contul necesită un pas suplimentar de autentificare (neimplementat în MVP).");
      }
      const idToken = res.AuthenticationResult?.IdToken;
      if (!idToken) throw new AuthError("provider", "Răspuns de autentificare invalid.");
      const payload = await this.verifier.verify(idToken);
      return { externalId: payload.sub, email: String(payload.email ?? email).toLowerCase() };
    } catch (err) {
      if (err instanceof AuthError) throw err;
      throw this.mapError(err);
    }
  }

  async signUp(email: string, password: string): Promise<SignUpResult> {
    try {
      const res = await this.client.send(
        new SignUpCommand({
          ClientId: this.config.clientId,
          Username: email,
          Password: password,
          SecretHash: this.secretHash(email),
          UserAttributes: [{ Name: "email", Value: email }],
        }),
      );
      return { externalId: res.UserSub ?? null, needsConfirmation: !res.UserConfirmed };
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async confirmSignUp(email: string, code: string): Promise<void> {
    try {
      await this.client.send(
        new ConfirmSignUpCommand({
          ClientId: this.config.clientId,
          Username: email,
          ConfirmationCode: code,
          SecretHash: this.secretHash(email),
        }),
      );
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async forgotPassword(email: string): Promise<ForgotPasswordResult> {
    try {
      await this.client.send(
        new ForgotPasswordCommand({ ClientId: this.config.clientId, Username: email, SecretHash: this.secretHash(email) }),
      );
    } catch (err) {
      const mapped = this.mapError(err);
      // Do not reveal whether the account exists.
      if (mapped.reason !== "invalid_credentials") throw mapped;
    }
    return {};
  }

  async confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void> {
    try {
      await this.client.send(
        new ConfirmForgotPasswordCommand({
          ClientId: this.config.clientId,
          Username: email,
          ConfirmationCode: code,
          Password: newPassword,
          SecretHash: this.secretHash(email),
        }),
      );
    } catch (err) {
      throw this.mapError(err);
    }
  }
}
