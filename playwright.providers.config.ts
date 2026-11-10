import { defineConfig, devices } from "@playwright/test";

/**
 * E2E suite that runs the REAL provider adapters (Azure Speech REST client,
 * Anthropic Bedrock SDK with SigV4 signing) against local contract stubs
 * (tests/e2e/stubs/provider-stubs.ts). No cloud credentials, synthetic data only.
 */
const PORT = 3201;
const STUB_PORT = 4010;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /providers\.spec\.ts/,
  timeout: 90_000,
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
      name: "chromium-providers",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
      },
    },
  ],
  webServer: [
    {
      command: "npx tsx tests/e2e/stubs/provider-stubs.ts",
      url: `http://localhost:${STUB_PORT}/__stub/health`,
      reuseExistingServer: false,
      env: { STUB_PORT: String(STUB_PORT) },
    },
    {
      command: `npx next dev -p ${PORT}`,
      url: `http://localhost:${PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        APP_URL: `http://localhost:${PORT}`,
        NEXT_TELEMETRY_DISABLED: "1",
        NEXT_DIST_DIR: ".next-e2e-providers",
        AUTH_PROVIDER: "mock",
        DATABASE_PROVIDER: "memory",
        SPEECH_PROVIDER: "azure",
        AZURE_SPEECH_KEY: "stub-azure-key",
        AZURE_SPEECH_ENDPOINT: `http://localhost:${STUB_PORT}`,
        AZURE_SPEECH_LOCALE: "ro-RO",
        NOTE_PROVIDER: "bedrock",
        BEDROCK_REGION: "eu-central-1",
        BEDROCK_MODEL_ID: "anthropic.claude-sonnet-5-5",
        BEDROCK_ENDPOINT_URL: `http://localhost:${STUB_PORT}/anthropic`,
        // Dummy static credentials so the SDK signs with SigV4 offline. Not real keys.
        AWS_ACCESS_KEY_ID: "AKIASTUBSTUBSTUBSTUB",
        AWS_SECRET_ACCESS_KEY: "stub-secret-not-a-real-key",
        AWS_SESSION_TOKEN: "",
        AWS_PROFILE: "",
        RATE_LIMIT_AUTH_PER_15_MIN: "100",
      },
    },
  ],
});
