import * as crypto from "crypto";

// simple TOTP generator producing numeric codes with dynamic truncation (RFC6238-style)
export function generateTotp(secret: string, stepSeconds: number = 30, digits: number = 4): string {
  const step = Math.floor(Date.now() / 1000 / stepSeconds);
  const key = Buffer.from(secret, "hex");
  const buf = Buffer.alloc(8);
  // write big-endian counter
  buf.writeUInt32BE(Math.floor(step / Math.pow(2, 32)), 0); // high
  buf.writeUInt32BE(step >>> 0, 4); // low

  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (((hmac as unknown as Buffer).readUInt32BE(offset) & 0x7fffffff) % Math.pow(10, digits)).toString();
  return code.padStart(digits, "0");
}

export function generateTotpWindows(secret: string, stepSeconds: number = 30, digits: number = 4, window: number = 1): string[] {
  const codes: string[] = [];
  const nowStep = Math.floor(Date.now() / 1000 / stepSeconds);
  for (let i = -window; i <= window; i++) {
    const step = nowStep + i;
    const key = Buffer.from(secret, "hex");
    const buf = Buffer.alloc(8);
    buf.writeUInt32BE(Math.floor(step / Math.pow(2, 32)), 0);
    buf.writeUInt32BE(step >>> 0, 4);
    const hmac = crypto.createHmac("sha1", key).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code = (((hmac as unknown as Buffer).readUInt32BE(offset) & 0x7fffffff) % Math.pow(10, digits)).toString();
    codes.push(code.padStart(digits, "0"));
  }
  return codes;
}
