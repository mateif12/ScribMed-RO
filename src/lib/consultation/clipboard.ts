/**
 * Copies text to the clipboard. Uses the async Clipboard API when available,
 * otherwise a temporary off-screen textarea fallback (removed immediately).
 */
export async function copyTextToClipboard(text: string, doc: Document | undefined = typeof document !== "undefined" ? document : undefined): Promise<boolean> {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy path
    }
  }
  if (!doc) return false;
  const ta = doc.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  doc.body.appendChild(ta);
  try {
    ta.select();
    return typeof doc.execCommand === "function" ? doc.execCommand("copy") : false;
  } finally {
    ta.value = "";
    doc.body.removeChild(ta);
  }
}
