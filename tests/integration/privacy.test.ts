import { beforeEach, describe, expect, it } from "vitest";
import { POST as generateNote } from "@/app/api/generate-note/route";
import { POST as transcribe } from "@/app/api/transcribe/route";
import { SYNTHETIC_TRANSCRIPTS } from "@/lib/speech/synthetic-transcripts";
import { fakeWebm, makeRequest, readNdjson, sessionCookieFor, setupWorld } from "../support/helpers";

describe("privacy invariants – full mock workflow", () => {
  let world: Awaited<ReturnType<typeof setupWorld>>;
  beforeEach(async () => {
    world = await setupWorld();
  });

  // 4095 bytes → mock STT returns the synthetic transcript that contains (fake) identifiers.
  it("after transcribe + generate, the database holds only operational metadata", async () => {
    const cookie = await sessionCookieFor(world.a.user);
    const tRes = await transcribe(
      makeRequest("/api/transcribe", { body: fakeWebm(4095) as unknown as BodyInit, headers: { "content-type": "audio/webm", "x-audio-duration": "900" }, cookie }),
    );
    const done = (await readNdjson(tRes)).find((e) => e.stage === "done")!;
    const transcript = (done.result as { transcript: string }).transcript;
    const nRes = await generateNote(makeRequest("/api/generate-note", { json: { transcript }, cookie }));
    expect(nRes.status).toBe(200);

    // Serialise the entire in-memory database and look for any clinical content.
    const dump = JSON.stringify(world.repo, (_k, v) => (v instanceof Map ? [...v.entries()] : v));
    const clinicalFragments = ["amigdal", "penicilin", "paracetamol", "Faringele", "MOTIVELE", "durere", "lombar", "1840512400123", "Marinescu", "ELIMINAT"];
    for (const fragment of clinicalFragments) expect(dump).not.toContain(fragment);
    for (const t of SYNTHETIC_TRANSCRIPTS) expect(dump).not.toContain(t.text.slice(0, 40));

    const events = await world.repo.listRecentUsageEvents({ organizationId: world.a.organization.id }, { limit: 10 });
    expect(events.map((e) => e.type).sort()).toEqual(["note_generated", "transcription_completed"]);
    const tEvent = events.find((e) => e.type === "transcription_completed")!;
    expect(tEvent.audioSeconds).toBe(900);
    expect(tEvent.redactionCount).toBeGreaterThan(0);
  });
});
