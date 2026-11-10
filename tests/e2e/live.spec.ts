import { expect, test } from "@playwright/test";

const enabled = process.env.LIVE_E2E === "1" && Boolean(process.env.LIVE_E2E_AUDIO);
const seconds = Number(process.env.LIVE_E2E_SECONDS ?? 60);

test.skip(!enabled, "Set LIVE_E2E=1 and LIVE_E2E_AUDIO=<synthetic WAV> to run against real providers.");

test("LIVE: synthetic speech → Azure → redaction → Bedrock Claude → note → clipboard → deletion", async ({ page, request }) => {
  const health = await (await request.get("/api/health")).json();
  expect(health.providers, "configure SPEECH_PROVIDER=azure and NOTE_PROVIDER=bedrock").toMatchObject({ speech: "azure", notes: "bedrock" });

  await page.goto("/login");
  if (process.env.LIVE_E2E_EMAIL) {
    await page.getByLabel("E-mail").fill(process.env.LIVE_E2E_EMAIL);
    await page.getByLabel("Parolă").fill(process.env.LIVE_E2E_PASSWORD ?? "");
  }
  await page.getByRole("button", { name: "Autentificare" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/consultation");
  await page.getByTestId("patient-informed").click();
  await page.getByTestId("start-recording").click();
  await page.waitForTimeout(seconds * 1000);
  await page.getByTestId("finish-and-generate").click();

  const note = page.getByTestId("note-text");
  await expect(note).toBeVisible({ timeout: 10 * 60_000 });
  const text = await note.inputValue();
  for (const h of ["1. MOTIVELE PREZENTĂRII", "2. ISTORICUL BOLII", "3. ANTECEDENTE ȘI ALERGII", "4. EXAMEN CLINIC OBIECTIV", "5. DIAGNOSTIC PREZUMTIV", "6. PLAN DE TRATAMENT ȘI RECOMANDĂRI"]) {
    expect(text).toContain(h);
  }
  await expect(page.getByTestId("note-disclaimer")).toBeVisible();
  await page.getByTestId("copy-note").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
  await page.getByTestId("delete-session").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(page.getByTestId("consultation-status")).toHaveAttribute("data-status", "idle");
});
