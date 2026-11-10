// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseNdjsonChunk } from "@/lib/api/client";
import { copyTextToClipboard } from "@/lib/consultation/clipboard";
import {
  classifyGetUserMediaError,
  containerMime,
  detectRecordingSupport,
  pickSupportedMimeType,
} from "@/lib/consultation/media";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("clipboard", () => {
  it("uses the async Clipboard API when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await copyTextToClipboard("1. MOTIVELE PREZENTĂRII")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("1. MOTIVELE PREZENTĂRII");
  });

  it("falls back to execCommand and removes the temporary element", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    const exec = vi.fn().mockReturnValue(true);
    (document as unknown as { execCommand: typeof exec }).execCommand = exec;
    expect(await copyTextToClipboard("text fișă")).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
  });

  it("reports failure when no mechanism works", async () => {
    vi.stubGlobal("navigator", {});
    (document as unknown as { execCommand: () => boolean }).execCommand = () => false;
    expect(await copyTextToClipboard("x")).toBe(false);
  });
});

describe("media capability helpers", () => {
  it("prefers webm/opus, falls back in order", () => {
    expect(pickSupportedMimeType(() => true)).toBe("audio/webm;codecs=opus");
    expect(pickSupportedMimeType((m) => m === "audio/mp4")).toBe("audio/mp4");
    expect(pickSupportedMimeType(() => false)).toBeNull();
  });

  it("classifies getUserMedia errors", () => {
    expect(classifyGetUserMediaError({ name: "NotAllowedError" })).toBe("permission_denied");
    expect(classifyGetUserMediaError({ name: "NotFoundError" })).toBe("no_device");
    expect(classifyGetUserMediaError({ name: "NotReadableError" })).toBe("device_busy");
    expect(classifyGetUserMediaError(new Error("?"))).toBe("unknown");
  });

  it("detects unsupported browsers and insecure contexts", () => {
    expect(detectRecordingSupport(undefined)).toBe("unsupported");
    expect(detectRecordingSupport({ isSecureContext: false } as unknown as Window & typeof globalThis)).toBe("insecure_context");
    expect(detectRecordingSupport({ isSecureContext: true, navigator: {} } as unknown as Window & typeof globalThis)).toBe("unsupported");
    expect(
      detectRecordingSupport({
        isSecureContext: true,
        navigator: { mediaDevices: { getUserMedia: () => undefined } },
        MediaRecorder: function MediaRecorder() {},
      } as unknown as Window & typeof globalThis),
    ).toBeNull();
  });

  it("strips codec parameters", () => {
    expect(containerMime("audio/webm;codecs=opus")).toBe("audio/webm");
  });
});

describe("NDJSON progress parsing", () => {
  it("returns complete events and keeps the partial remainder", () => {
    const { events, rest } = parseNdjsonChunk('{"stage":"received"}\n{"stage":"transcr');
    expect(events).toEqual([{ stage: "received" }]);
    expect(rest).toBe('{"stage":"transcr');
  });
});

describe("browser storage policy", () => {
  it("clinical modules never reference persistent browser storage", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const roots = ["src/lib/consultation", "src/hooks", "src/components/consultation", "src/lib/api/client.ts"];
    const files: string[] = [];
    const walk = (p: string) => {
      if (fs.statSync(p).isDirectory()) fs.readdirSync(p).forEach((f) => walk(path.join(p, f)));
      else files.push(p);
    };
    roots.forEach(walk);
    for (const f of files) {
      // Strip comments: documentation may legitimately mention these APIs.
      const src = fs
        .readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(src, f).not.toMatch(/localStorage|sessionStorage|indexedDB|caches\.open|serviceWorker/);
    }
  });
});
