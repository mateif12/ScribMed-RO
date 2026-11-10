import { getEnv } from "@/config/env";
import { AppError } from "@/lib/api/errors";
import { jsonResponse, readJson, withApi } from "@/lib/api/handler";
import { issueSession } from "@/lib/auth/session";
import { login } from "@/services/auth-service";
import { loginSchema, zodMessage } from "@/lib/validation/schemas";

export const runtime = "nodejs";

export const POST = withApi(
  {
    auth: false,
    rateLimit: () => ({ name: "auth", limit: getEnv().RATE_LIMIT_AUTH_PER_15_MIN, windowMs: 15 * 60_000, by: "ip" }),
  },
  async ({ request }) => {
    const parsed = loginSchema.safeParse(await readJson(request, 4096));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", zodMessage(parsed.error));
    const user = await login(parsed.data.email, parsed.data.password);
    const res = jsonResponse({ ok: true });
    await issueSession(res, user);
    return res;
  },
);
