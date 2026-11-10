import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * OPT-IN live suite against REAL Azure Speech + Amazon Bedrock.
 * Requires credentials in .env.local (SPEECH_PROVIDER=azure, NOTE_PROVIDER=bedrock, …)
 * and LIVE_E2E_AUDIO=<path to a SYNTHETIC Romanian dialogue, 16-bit PCM WAV>.
 * Chromium plays the WAV file as the microphone input.
 * Never use recordings of real patients.
 */
const PORT = 3202;
const audio = process.env.LIVE_E2E_AUDIO ? path.resolve(process.env.LIVE_E2E_AUDIO) : "";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /live\.spec\.ts/,
  timeout: 15 * 60_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "off", locale: "ro-RO", permissions: ["microphone", "clipboard-read", "clipboard-write"] },
  projects: [
    {
      name: "chromium-live",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            ...(audio ? [`--use-file-for-fake-audio-capture=${audio}`] : []),
          ],
        },
      },
    },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { APP_URL: `http://localhost:${PORT}`, NEXT_TELEMETRY_DISABLED: "1", NEXT_DIST_DIR: ".next-e2e-live" },
  },
});
