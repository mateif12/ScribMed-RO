import { jsonResponse, withApi } from "@/lib/api/handler";
import { listOrganizationMembers } from "@/services/profile-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owners and administrators can list members of THEIR organisation only. */
export const GET = withApi({ auth: true, roles: ["owner", "admin"] }, async ({ auth }) =>
  jsonResponse({ members: await listOrganizationMembers(auth!) }),
);
