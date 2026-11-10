import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/api/errors";
import { normalizeMime, readBodyWithLimit, sniffAudioContainer, validateAudioPayload, wipeBuffer } from "@/lib/validation/audio";

const webm = () => {
  const b = new Uint8Array(2048);
  b.set([0x1a, 0x45, 0xdf, 0xa3]);
  return b;
};

describe("audio validation", () => {
  it("normalises MIME types", () => {
    expect(normalizeMime("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(normalizeMime(null)).toBe("");
  });

  it("sniffs containers by magic bytes", () => {
    expect(sniffAudioContainer(webm())).toBe("audio/webm");
    const ogg = new Uint8Array(16);
    ogg.set([0x4f, 0x67, 0x67, 0x53]);
    expect(sniffAudioContainer(ogg)).toBe("audio/ogg");
    const wav = new Uint8Array(16);
    wav.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
    expect(sniffAudioContainer(wav)).toBe("audio/wav");
    expect(sniffAudioContainer(new TextEncoder().encode("<html><script>"))).toBeNull();
  });

  it("accepts valid audio and rejects wrong type, spoofed content, too small and too large", () => {
    expect(validateAudioPayload(webm(), "audio/webm", 10_000)).toBe("audio/webm");
    const codes = (fn: () => unknown) => {
      try {
        fn();
        return null;
      } catch (e) {
        return (e as AppError).code;
      }
    };
    expect(codes(() => validateAudioPayload(webm(), "video/mp4", 10_000))).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(codes(() => validateAudioPayload(webm(), "audio/ogg", 10_000))).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(codes(() => validateAudioPayload(new Uint8Array(10), "audio/webm", 10_000))).toBe("VALIDATION_ERROR");
    expect(codes(() => validateAudioPayload(webm(), "audio/webm", 1500))).toBe("PAYLOAD_TOO_LARGE");
  });

  it("reads a stream with a hard limit and aborts early", async () => {
    const make = (n: number) =>
      new ReadableStream<Uint8Array>({
        start(c) {
          for (let i = 0; i < n; i++) c.enqueue(new Uint8Array(1000));
          c.close();
        },
      });
    expect((await readBodyWithLimit(make(3), 5000)).byteLength).toBe(3000);
    await expect(readBodyWithLimit(make(10), 5000)).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
    await expect(readBodyWithLimit(null, 5000)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("wipes buffers (best effort)", () => {
    const b = new Uint8Array([1, 2, 3]);
    wipeBuffer(b);
    expect([...b]).toEqual([0, 0, 0]);
  });
});
