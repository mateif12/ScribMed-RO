import { AppError } from "@/lib/api/errors";
import { jsonResponse, readJson, withApi } from "@/lib/api/handler";
import { consultationEventSchema, zodMessage } from "@/lib/validation/schemas";
import { recordConsultationEvent } from "@/services/consultation-service";

export const runtime = "nodejs";

/** Records operational, content-free consultation lifecycle events. */
export const POST = withApi(
  { auth: true, rateLimit: { name: "events", limit: 120, windowMs: 60 * 60_000, by: "user" } },
  async ({ request, auth }) => {
    const parsed = consultationEventSchema.safeParse(await readJson(request, 1024));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", zodMessage(parsed.error));
    if (parsed.data.type === "consultation_started" && parsed.data.patientInformed !== true) {
      throw new AppError("VALIDATION_ERROR", "Confirmați informarea pacientului înainte de a începe.");
    }
    await recordConsultationEvent(auth!, parsed.data.type);
    return jsonResponse({ ok: true });
  },
);
