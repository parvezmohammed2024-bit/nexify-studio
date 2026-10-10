import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import https from "node:https";
import { AppError } from "@/lib/domain";
export function publicIp(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113) ||
      (a === 192 && b === 0 && c === 2)
    );
  }
  // Only global unicast IPv6; reject mapped IPv4, loopback and link-local.
  return (
    isIP(ip) === 6 && /^[23][0-9a-f]{3}:/i.test(ip) && !/^2001:db8:/i.test(ip)
  );
}
export function sniffMedia(buffer: Buffer): {
  mime: string;
  kind: "image" | "video";
  extension: string;
} {
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return { mime: "image/png", kind: "image", extension: "png" };
  if (
    buffer.length >= 12 &&
    buffer[0] === 255 &&
    buffer[1] === 216 &&
    buffer[2] === 255
  )
    return { mime: "image/jpeg", kind: "image", extension: "jpg" };
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  )
    return { mime: "image/webp", kind: "image", extension: "webp" };
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp")
    return { mime: "video/mp4", kind: "video", extension: "mp4" };
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]))
  )
    return { mime: "video/webm", kind: "video", extension: "webm" };
  throw new AppError(
    "File content is not a supported image or video.",
    415,
    "INVALID_MEDIA",
  );
}
export async function downloadMedia(rawUrl: string) {
  const url = new URL(rawUrl);
  const hosts = (process.env.PROVIDER_MEDIA_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !hosts.includes(url.hostname.toLowerCase()) ||
    isIP(url.hostname)
  )
    throw new AppError(
      "Provider output hostname is not approved. Add its verified exact hostname to PROVIDER_MEDIA_HOSTS.",
      409,
      "MEDIA_HOST_BLOCKED",
    );
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !publicIp(a.address)))
    throw new AppError(
      "Provider output resolves to a private or reserved address.",
      403,
    );
  const pinned = addresses[0];
  return new Promise<{
    buffer: Buffer;
    mime: string;
    kind: "image" | "video";
    extension: string;
  }>((resolve, reject) => {
    let settled = false;
    const finishError = (e: unknown) => {
      if (!settled) {
        settled = true;
        reject(e);
      }
    };
    const req = https.get(
      url,
      {
        family: pinned.family,
        lookup: (_host, _opts, callback) =>
          callback(null, pinned.address, pinned.family),
        headers: { Accept: "image/*,video/*" },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          finishError(
            new AppError(
              "Media server rejected download or redirected. Redirects are disabled.",
              502,
            ),
          );
          return;
        }
        const limit = 100 * 1024 * 1024;
        if (Number(res.headers["content-length"] || 0) > limit) {
          res.destroy();
          finishError(
            new AppError(
              "Provider media exceeds the 100 MB retention limit.",
              413,
            ),
          );
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > limit) {
            res.destroy();
            finishError(new AppError("Media is too large.", 413));
          } else chunks.push(chunk);
        });
        res.on("error", finishError);
        res.on("end", () => {
          if (settled) return;
          try {
            const buffer = Buffer.concat(chunks);
            const media = sniffMedia(buffer);
            if (media.kind === "image" && size > 25 * 1024 * 1024)
              throw new AppError("Image exceeds 25 MB.", 413);
            settled = true;
            resolve({ buffer, ...media });
          } catch (e) {
            finishError(e);
          }
        });
      },
    );
    // Wall-clock deadline, not an idle socket timeout.
    const timer = setTimeout(
      () => req.destroy(new AppError("Media download timed out.", 504)),
      20_000,
    );
    req.on("close", () => clearTimeout(timer));
    req.on("error", finishError);
  });
}
export async function limitedBody(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("Upload body is missing.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new AppError("Upload exceeds the configured size limit.", 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
