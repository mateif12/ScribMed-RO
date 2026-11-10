import { jsonResponse, withApi } from "@/lib/api/handler";
import { clearSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export const POST = withApi({ auth: false }, async () => {
  const res = jsonResponse({ ok: true });
  clearSession(res);
  return res;
});
