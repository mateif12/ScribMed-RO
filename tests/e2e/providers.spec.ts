import { expect, test } from "@playwright/test";

const STUB = "http://localhost:4010";

test("browser mic → Azure adapter → PII redaction → Bedrock SDK (SigV4) → note → clipboard → session destruction", async ({ page, request }) => {
  // Login (demo account, in-memory DB)
  await page.goto("/login");
  await page.getByRole("button", { name: "Autentificare" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const health = await (await request.get("/api/health")).json();
  expect(health.providers).toMatchObject({ speech: "azure", notes: "bedrock" });

  await page.goto("/consultation");
  await page.getByTestId("patient-informed").click();
  await page.getByTestId("start-recording").click();
  await expect(page.getByTestId("consultation-status")).toHaveAttribute("data-status", "recording");
  await page.waitForTimeout(3000);
  await page.getByTestId("finish-and-generate").click();

  const note = page.getByTestId("note-text");
  await expect(note).toBeVisible({ timeout: 60_000 });
  const text = await note.inputValue();
  expect(text).toContain("1. MOTIVELE PREZENTĂRII");
  expect(text).toContain("6. PLAN DE TRATAMENT ȘI RECOMANDĂRI");
  await expect(page.getByText("Mod demonstrativ")).toHaveCount(0); // real providers, not mock

  // The browser only ever receives the redacted transcript.
  await page.locator("summary").filter({ hasText: "Transcriere de-identificată" }).click();
  const transcript = await page.getByTestId("redacted-transcript").textContent();
  expect(transcript).toContain("[CNP_ELIMINAT]");
  expect(transcript).toContain("[TELEFON_ELIMINAT]");
  expect(transcript).not.toMatch(/1840512400123|0712345678|Marinescu/);

  // Contract stubs saw exactly one valid call each and no leaked identifiers.
  const stats = await (await request.get(`${STUB}/__stub/stats`)).json();
  expect(stats.contractViolations).toEqual([]);
  expect(stats.leaks).toBe(0);
  expect(stats.azureTranscribe).toBe(1);
  expect(stats.bedrock).toBe(1);

  // Clipboard export
  await page.getByTestId("copy-note").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);

  // Session destruction
  await page.getByTestId("delete-session").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(page.getByTestId("consultation-status")).toHaveAttribute("data-status", "idle");
  await expect(page.getByTestId("note-text")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});
