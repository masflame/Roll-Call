"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashCode = hashCode;
exports.safeEquals = safeEquals;
const crypto_1 = __importDefault(require("crypto"));
const config_1 = require("../config");
function hashCode(code) {
    return crypto_1.default.createHmac("sha256", config_1.CLASS_CODE_SECRET).update(code).digest("hex");
}
function safeEquals(storedHash, providedCode) {
    if (!storedHash)
        return false;
    const providedHash = hashCode(providedCode);
    return crypto_1.default.timingSafeEqual(Buffer.from(storedHash, "hex"), Buffer.from(providedHash, "hex"));
}
