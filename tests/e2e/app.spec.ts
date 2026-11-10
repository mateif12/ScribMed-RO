import { expect, test, type Page } from "@playwright/test";

const DEMO = { email: "demo@scribmed.ro", password: "Demo-Parola-2026!" };
const HEADINGS = [
  "1. MOTIVELE PREZENTĂRII",
  "2. ISTORICUL BOLII",
  "3. ANTECEDENTE ȘI ALERGII",
  "4. EXAMEN CLINIC OBIECTIV",
  "5. DIAGNOSTIC PREZUMTIV",
  "6. PLAN DE TRATAMENT ȘI RECOMANDĂRI",
];

async function loginAsDemo(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(DEMO.email);
  await page.getByLabel("Parolă").fill(DEMO.password);
  await page.getByRole("button", { name: "Autentificare" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

const status = (page: Page) => page.getByTestId("consultation-status");

test("landing page presents the product in Romanian", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tu asculți pacientul.");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Noi documentăm consultația.");
  await expect(page.getByRole("link", { name: "Începe gratuit" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Autentificare" }).first()).toBeVisible();
  for (const id of ["cum-functioneaza", "beneficii", "securitate", "preturi"]) {
    await expect(page.locator(`#${id}`)).toBeVisible();
  }
});

test("protected routes redirect unauthenticated users to login", async ({ page }) => {
  await page.goto("/consultation");
  await expect(page).toHaveURL(/\/login\?next=%2Fconsultation/);
});

test("dashboard shows profile, clinic, usage and the main CTA", async ({ page }) => {
  await loginAsDemo(page);
  await expect(page.getByRole("link", { name: "Începe Consultația" })).toBeVisible();
  await expect(page.getByText("Profil medic")).toBeVisible();
  await expect(page.getByText("Clinica Demo Sănătatea")).toBeVisible();
  await expect(page.getByText("Doar metadate operaționale – fără conținut clinic.")).toBeVisible();
});

test("full consultation workflow with microphone, mock providers, editing, clipboard and deletion", async ({ page }) => {
  await loginAsDemo(page);
  await page.getByRole("link", { name: "Începe Consultația" }).click();
  await expect(page).toHaveURL(/\/consultation$/);
  await expect(status(page)).toHaveAttribute("data-status", "idle");

  // Cannot start before confirming the patient was informed.
  const start = page.getByTestId("start-recording");
  await expect(start).toBeDisabled();
  await page.getByTestId("patient-informed").click();
  await expect(start).toBeEnabled();

  await start.click();
  await expect(status(page)).toHaveAttribute("data-status", "recording");
  await expect(page.getByTestId("mic-status")).toContainText("Microfon activ");
  await page.waitForTimeout(2500);
  await expect(page.getByTestId("recording-duration")).not.toHaveText("00:00");

  await page.getByTestId("pause-recording").click();
  await expect(status(page)).toHaveAttribute("data-status", "paused");
  const pausedAt = await page.getByTestId("recording-duration").textContent();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("recording-duration")).toHaveText(pausedAt ?? "");
  await page.getByTestId("resume-recording").click();
  await expect(status(page)).toHaveAttribute("data-status", "recording");
  await page.waitForTimeout(1500);

  await page.getByTestId("finish-and-generate").click();
  await expect(page.getByTestId("processing-steps")).toBeVisible();
  const note = page.getByTestId("note-text");
  await expect(note).toBeVisible({ timeout: 30_000 });
  await expect(status(page)).toHaveAttribute("data-status", "completed");

  const text = await note.inputValue();
  let lastIndex = -1;
  for (const h of HEADINGS) {
    const idx = text.indexOf(h);
    expect(idx, h).toBeGreaterThan(lastIndex);
    lastIndex = idx;
  }
  await expect(page.getByTestId("note-disclaimer")).toContainText(
    "Document generat automat ca suport de redactare. Necesită verificarea și validarea medicului curant.",
  );
  expect(text).not.toMatch(/1840512400123|0712345678|Marinescu/);

  // Doctor edits the note.
  await note.fill(`${text}\n\nObservație adăugată de medic.`);
  await expect(page.getByText("Editată de medic")).toBeVisible();

  // Clipboard export.
  await page.getByTestId("copy-note").click();
  await expect(page.getByTestId("copy-note")).toContainText("Copiat");
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain("Observație adăugată de medic.");
  expect(clip).toContain("6. PLAN DE TRATAMENT ȘI RECOMANDĂRI");

  // Regenerate restores the generated draft.
  await page.getByTestId("regenerate-note").click();
  await expect(status(page)).toHaveAttribute("data-status", "completed", { timeout: 30_000 });
  await expect(page.getByTestId("note-text")).not.toHaveValue(/Observație adăugată de medic/);

  // Nothing clinical in browser storage.
  const storage = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }));
  expect(storage).toEqual({ local: 0, session: 0 });

  // Delete session clears everything.
  await page.getByTestId("delete-session").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(status(page)).toHaveAttribute("data-status", "idle");
  await expect(page.getByTestId("note-text")).toHaveCount(0);
  await expect(page.getByTestId("patient-informed")).not.toBeChecked();

  // The dashboard shows only operational metadata.
  await page.goto("/dashboard");
  const activity = page.getByTestId("recent-activity");
  await expect(activity).toContainText("Fișă generată");
  await expect(activity).toContainText("Sesiune ștearsă");
  await expect(activity).not.toContainText("amigdal");
});

test("cancelling a consultation during recording releases the session", async ({ page }) => {
  await loginAsDemo(page);
  await page.goto("/consultation");
  await page.getByTestId("patient-informed").click();
  await page.getByTestId("start-recording").click();
  await expect(status(page)).toHaveAttribute("data-status", "recording");
  await page.getByTestId("cancel-consultation").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(status(page)).toHaveAttribute("data-status", "idle");
  await expect(page.getByTestId("mic-status")).toContainText("Microfon inactiv");
});

test("microphone permission denial is handled gracefully", async ({ browser }) => {
  const context = await browser.newContext({ permissions: [] });
  const page = await context.newPage();
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  await loginAsDemo(page);
  await page.goto("/consultation");
  await page.getByTestId("patient-informed").click();
  await page.getByTestId("start-recording").click();
  await expect(status(page)).toHaveAttribute("data-status", "error");
  await expect(page.getByTestId("consultation-error")).toContainText("Accesul la microfon a fost refuzat");
  await context.close();
});

test("a new clinic can register and land on its dashboard", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Nume complet").fill("Dr. Test E2E");
  await page.getByLabel("E-mail profesional").fill(email);
  await page.getByLabel("Parolă").fill("Parola-E2E-2026!");
  await page.getByLabel("Clinică / cabinet").fill("Clinica E2E");
  await page.getByLabel("Localitate").fill("Sibiu");
  await page.locator("#acceptTerms").click();
  await page.getByRole("button", { name: "Creează contul" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Clinica E2E")).toBeVisible();
});
