import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3200);

export default defineConfig({
  testDir: "tests/e2e",
  testIgnore: [/providers\.spec\.ts/, /live\.spec\.ts/],
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    locale: "ro-RO",
    permissions: ["microphone", "clipboard-read", "clipboard-write"],
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          // Synthetic microphone: Chromium generates a test tone; no real audio is captured.
          args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
        },
      },
    },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      AUTH_PROVIDER: "mock",
      DATABASE_PROVIDER: "memory",
      SPEECH_PROVIDER: "mock",
      NOTE_PROVIDER: "mock",
      MOCK_PROVIDER_LATENCY_MS: "300",
      APP_URL: `http://localhost:${PORT}`,
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_DIST_DIR: ".next-e2e",
      RATE_LIMIT_AUTH_PER_15_MIN: "100",
    },
  },
});
