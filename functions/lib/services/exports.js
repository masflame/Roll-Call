"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getExportsBucket = getExportsBucket;
const storage_1 = require("firebase-admin/storage");
function getExportsBucket() {
    return (0, storage_1.getStorage)().bucket();
}
