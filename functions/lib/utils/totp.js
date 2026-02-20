"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTotp = generateTotp;
exports.generateTotpWindows = generateTotpWindows;
const crypto = __importStar(require("crypto"));
// simple TOTP generator producing numeric codes with dynamic truncation (RFC6238-style)
function generateTotp(secret, stepSeconds = 30, digits = 4) {
    const step = Math.floor(Date.now() / 1000 / stepSeconds);
    const key = Buffer.from(secret, "hex");
    const buf = Buffer.alloc(8);
    // write big-endian counter
    buf.writeUInt32BE(Math.floor(step / Math.pow(2, 32)), 0); // high
    buf.writeUInt32BE(step >>> 0, 4); // low
    const hmac = crypto.createHmac("sha1", key).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % Math.pow(10, digits)).toString();
    return code.padStart(digits, "0");
}
function generateTotpWindows(secret, stepSeconds = 30, digits = 4, window = 1) {
    const codes = [];
    const nowStep = Math.floor(Date.now() / 1000 / stepSeconds);
    for (let i = -window; i <= window; i++) {
        const step = nowStep + i;
        const key = Buffer.from(secret, "hex");
        const buf = Buffer.alloc(8);
        buf.writeUInt32BE(Math.floor(step / Math.pow(2, 32)), 0);
        buf.writeUInt32BE(step >>> 0, 4);
        const hmac = crypto.createHmac("sha1", key).update(buf).digest();
        const offset = hmac[hmac.length - 1] & 0x0f;
        const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % Math.pow(10, digits)).toString();
        codes.push(code.padStart(digits, "0"));
    }
    return codes;
}
