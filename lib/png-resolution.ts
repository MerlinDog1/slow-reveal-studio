const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

// PNG's reflected CRC-32, applied only to the new 13-byte type/data payload.
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Set physical resolution on a browser-encoded PNG without decoding/re-encoding
 * pixels. All non-pHYs chunks (including alpha/colour data) remain byte-identical.
 * pHYs uses integer pixels/metre, so the requested dpi is rounded accordingly.
 * https://www.w3.org/TR/png-3/#11pHYs
 */
export function withPngResolution(
  png: Uint8Array,
  dpi: number,
): Uint8Array<ArrayBuffer> {
  const pixelsPerMetre = Math.round(dpi / 0.0254);
  if (
    !Number.isFinite(dpi) ||
    pixelsPerMetre < 1 ||
    pixelsPerMetre > 0x7fffffff
  )
    throw new Error("PNG resolution must be a positive, representable DPI.");
  if (PNG_SIGNATURE.some((byte, index) => png[index] !== byte))
    throw new Error("Invalid PNG signature.");

  const physical = new Uint8Array(21);
  const physicalView = new DataView(physical.buffer);
  physicalView.setUint32(0, 9);
  physical.set([112, 72, 89, 115], 4); // pHYs
  physicalView.setUint32(8, pixelsPerMetre);
  physicalView.setUint32(12, pixelsPerMetre);
  physical[16] = 1; // Metres, rather than an unspecified pixel aspect ratio.
  physicalView.setUint32(17, crc32(physical.subarray(4, 17)));

  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: Uint8Array[] = [png.subarray(0, 8)];
  let outputLength = 8;
  let offset = 8;
  let hasImageData = false;
  let hasEnd = false;
  while (offset < png.length) {
    if (png.length - offset < 12) throw new Error("Truncated PNG chunk.");
    const length = view.getUint32(offset);
    const end = offset + length + 12;
    if (length > 0x7fffffff || end > png.length)
      throw new Error("Invalid PNG chunk length.");
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    if (offset === 8 ? type !== "IHDR" || length !== 13 : type === "IHDR")
      throw new Error("Invalid PNG header.");
    if (type === "pHYs") {
      if (length !== 9) throw new Error("Invalid PNG resolution chunk.");
    } else {
      chunks.push(png.subarray(offset, end));
      outputLength += end - offset;
    }
    if (type === "IHDR") {
      chunks.push(physical);
      outputLength += physical.length;
    }
    if (type === "IDAT") hasImageData = true;
    if (type === "IEND") {
      if (length !== 0 || end !== png.length)
        throw new Error("Invalid PNG ending.");
      hasEnd = true;
    }
    offset = end;
  }
  if (!hasImageData || !hasEnd) throw new Error("Incomplete PNG image.");
  const output = new Uint8Array(outputLength);
  offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
