import { randomBytes } from "crypto";
import { hashToken } from "./session";

const API_KEY_PREFIX = "sk_live_";
const PREFIX_DISPLAY_LENGTH = API_KEY_PREFIX.length + 6;

export function generateApiKey(): { rawKey: string; keyHash: string; keyPrefix: string } {
  const rawKey = API_KEY_PREFIX + randomBytes(24).toString("base64url");
  return { rawKey, keyHash: hashToken(rawKey), keyPrefix: rawKey.slice(0, PREFIX_DISPLAY_LENGTH) };
}

export function hashApiKey(rawKey: string): string {
  return hashToken(rawKey);
}
