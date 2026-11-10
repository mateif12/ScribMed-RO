import { getEnv } from "@/config/env";
import { AppError } from "@/lib/api/errors";
import { jsonResponse, readJson, withApi } from "@/lib/api/handler";
import { resetPassword } from "@/services/auth-service";
import { resetPasswordSchema, zodMessage } from "@/lib/validation/schemas";

export const runtime = "nodejs";

export const POST = withApi(
  {
    auth: false,
    rateLimit: () => ({ name: "auth-reset", limit: getEnv().RATE_LIMIT_AUTH_PER_15_MIN, windowMs: 15 * 60_000, by: "ip" }),
  },
  async ({ request }) => {
    const parsed = resetPasswordSchema.safeParse(await readJson(request, 2048));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", zodMessage(parsed.error));
    await resetPassword(parsed.data.email, parsed.data.code, parsed.data.newPassword);
    return jsonResponse({ ok: true });
  },
);
