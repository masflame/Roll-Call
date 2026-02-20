import crypto from "crypto";
import { CLASS_CODE_SECRET } from "../config";

export function hashCode(code: string): string {
  return crypto.createHmac("sha256", CLASS_CODE_SECRET).update(code).digest("hex");
}

export function safeEquals(storedHash: string, providedCode: string): boolean {
  if (!storedHash) return false;
  const providedHash = hashCode(providedCode);
  return crypto.timingSafeEqual(Buffer.from(storedHash, "hex"), Buffer.from(providedHash, "hex"));
}
