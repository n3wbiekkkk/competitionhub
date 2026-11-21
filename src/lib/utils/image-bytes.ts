const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function hasAllowedImageSignature(
  bytes: Uint8Array,
  declaredMime: string,
): boolean {
  const mime = declaredMime.toLowerCase();
  if (mime === "image/jpg") return hasAllowedImageSignature(bytes, "image/jpeg");
  if (mime === "image/jpeg") return JPEG.every((byte, index) => bytes[index] === byte);
  if (mime === "image/png") return PNG.every((byte, index) => bytes[index] === byte);
  if (mime === "image/webp") {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  return false;
}
