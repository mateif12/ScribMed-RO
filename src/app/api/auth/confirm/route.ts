import { getEnv } from "@/config/env";
import { AppError } from "@/lib/api/errors";
import { jsonResponse, readJson, withApi } from "@/lib/api/handler";
import { confirmSignUp } from "@/services/auth-service";
import { confirmSignUpSchema, zodMessage } from "@/lib/validation/schemas";

export const runtime = "nodejs";

export const POST = withApi(
  {
    auth: false,
    rateLimit: () => ({ name: "auth", limit: getEnv().RATE_LIMIT_AUTH_PER_15_MIN, windowMs: 15 * 60_000, by: "ip" }),
  },
  async ({ request }) => {
    const parsed = confirmSignUpSchema.safeParse(await readJson(request, 2048));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", zodMessage(parsed.error));
    await confirmSignUp(parsed.data.email, parsed.data.code);
    return jsonResponse({ ok: true });
  },
);
