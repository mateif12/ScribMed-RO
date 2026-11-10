import { getEnv } from "@/config/env";
import { AppError } from "@/lib/api/errors";
import { jsonResponse, readJson, withApi } from "@/lib/api/handler";
import { issueSession } from "@/lib/auth/session";
import { register } from "@/services/auth-service";
import { registerSchema, zodMessage } from "@/lib/validation/schemas";

export const runtime = "nodejs";

export const POST = withApi(
  {
    auth: false,
    rateLimit: () => ({ name: "auth", limit: getEnv().RATE_LIMIT_AUTH_PER_15_MIN, windowMs: 15 * 60_000, by: "ip" }),
  },
  async ({ request }) => {
    const parsed = registerSchema.safeParse(await readJson(request, 8192));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", zodMessage(parsed.error));
    const result = await register(parsed.data);
    const res = jsonResponse({ ok: true, needsConfirmation: result.needsConfirmation }, { status: 201 });
    if (result.user) await issueSession(res, result.user);
    return res;
  },
);
