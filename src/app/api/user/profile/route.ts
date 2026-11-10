import { AppError } from "@/lib/api/errors";
import { corsPreflight, jsonResponse, readJson, withApi } from "@/lib/api/handler";
import { profilePatchSchema, zodMessage } from "@/lib/validation/schemas";
import { getProfile, updateProfile } from "@/services/profile-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApi({ auth: true }, async ({ auth }) => jsonResponse(await getProfile(auth!)));

export const PATCH = withApi(
  { auth: true, rateLimit: { name: "profile", limit: 30, windowMs: 60_000, by: "user" } },
  async ({ request, auth }) => {
    const parsed = profilePatchSchema.safeParse(await readJson(request, 8192));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", zodMessage(parsed.error));
    return jsonResponse(await updateProfile(auth!, parsed.data));
  },
);

export const OPTIONS = corsPreflight;
