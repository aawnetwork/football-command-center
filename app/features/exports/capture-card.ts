import { toPng } from "html-to-image";

export async function captureCard(source: HTMLElement) {
  const sourceWindow = source.ownerDocument.defaultView;
  if (!sourceWindow || !source.isConnected) throw new Error("This card is no longer available. Select it again.");
  await source.ownerDocument.fonts.ready;
  await document.fonts.ready;
  const clone = document.importNode(source, true);
  const originals = [source, ...Array.from(source.querySelectorAll<HTMLElement>("*"))];
  const copies = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("*"))];
  // Freeze the real rendered appearance, including inherited league colours.
  // The live React tree is never altered and can continue refreshing.
  originals.forEach((original, index) => {
    const copy = copies[index];
    const computed = sourceWindow.getComputedStyle(original);
    for (const property of Array.from(computed)) copy.style.setProperty(property, computed.getPropertyValue(property));
    if (original.tagName !== "IMG" && original.tagName !== "SVG") copy.style.height = "auto";
  });
  clone.querySelectorAll("[data-export-omit], button, input, select, textarea").forEach((node) => node.remove());
  clone.style.width = `${Math.ceil(source.getBoundingClientRect().width)}px`;
  clone.style.margin = "0";
  clone.style.maxHeight = "none";
  clone.style.transform = "none";
  clone.querySelectorAll<HTMLElement>("div").forEach((node) => {
    if (node.querySelector("table")) { node.style.overflow = "visible"; node.style.maxHeight = "none"; }
  });
  // Require visible logos to embed successfully rather than silently dropping them.
  await Promise.all(Array.from(clone.querySelectorAll<HTMLImageElement>("img")).map(async (image) => {
    if (image.hidden || image.style.display === "none") return;
    const response = await fetch(image.src, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error("A team logo could not load. Try again when the connection is available.");
    const blob = await response.blob();
    image.src = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    image.removeAttribute("srcset");
    image.loading = "eager";
    await image.decode();
  }));
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-100000px;top:0;pointer-events:none;background:transparent;";
  const canvasArea = document.createElement("div");
  canvasArea.style.cssText = "padding:12px;width:max-content;background:transparent;";
  canvasArea.appendChild(clone);
  host.appendChild(canvasArea);
  document.body.appendChild(host);
  try {
    const width = Math.ceil(canvasArea.getBoundingClientRect().width);
    const height = Math.ceil(canvasArea.getBoundingClientRect().height);
    if (width * height * 4 > 32_000_000 || height * 2 > 16_000) throw new Error("This table is too large for one PNG at 2× resolution.");
    const dataUrl = await toPng(canvasArea, { width, height, pixelRatio: 2, preferredFontFormat: "woff2" });
    return { dataUrl, width: width * 2, height: height * 2 };
  } finally { host.remove(); }
}
