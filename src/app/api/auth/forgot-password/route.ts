import { getEnv } from "@/config/env";
import { AppError } from "@/lib/api/errors";
import { jsonResponse, readJson, withApi } from "@/lib/api/handler";
import { forgotPassword } from "@/services/auth-service";
import { forgotPasswordSchema, zodMessage } from "@/lib/validation/schemas";

export const runtime = "nodejs";

export const POST = withApi(
  {
    auth: false,
    rateLimit: () => ({ name: "auth-reset", limit: getEnv().RATE_LIMIT_AUTH_PER_15_MIN, windowMs: 15 * 60_000, by: "ip" }),
  },
  async ({ request }) => {
    const parsed = forgotPasswordSchema.safeParse(await readJson(request, 2048));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", zodMessage(parsed.error));
    const result = await forgotPassword(parsed.data.email);
    // Identical response whether or not the account exists. devCode only from the mock provider outside production.
    return jsonResponse({ ok: true, ...(result.devCode ? { devCode: result.devCode } : {}) });
  },
);
