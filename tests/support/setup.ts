// Deterministic, provider-free test environment.
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.APP_URL = "http://localhost:3000";
process.env.SESSION_SECRET = "test-session-secret-0123456789-abcdefghijklmnop";
process.env.AUTH_PROVIDER = "mock";
process.env.DATABASE_PROVIDER = "memory";
process.env.SPEECH_PROVIDER = "mock";
process.env.NOTE_PROVIDER = "mock";
process.env.MOCK_PROVIDER_LATENCY_MS = "0";
process.env.MAX_AUDIO_BYTES = String(2 * 1024 * 1024);
