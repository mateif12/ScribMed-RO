import "server-only";
import { getEnv } from "@/config/env";
import { getRepository } from "@/lib/database";
import { CognitoIdentityProvider } from "./cognito-provider";
import { MockIdentityProvider } from "./mock-provider";
import type { IdentityProvider } from "./types";

let instance: IdentityProvider | null = null;

export function getIdentityProvider(): IdentityProvider {
  if (instance) return instance;
  const env = getEnv();
  instance =
    env.AUTH_PROVIDER === "cognito"
      ? new CognitoIdentityProvider({
          region: env.COGNITO_REGION,
          userPoolId: env.COGNITO_USER_POOL_ID ?? "",
          clientId: env.COGNITO_CLIENT_ID ?? "",
          clientSecret: env.COGNITO_CLIENT_SECRET,
        })
      : new MockIdentityProvider(getRepository, env.NODE_ENV !== "production");
  return instance;
}

export function setIdentityProvider(p: IdentityProvider | null): void {
  instance = p;
}

export * from "./types";
