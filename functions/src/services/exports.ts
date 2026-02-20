import { getStorage } from "firebase-admin/storage";

export function getExportsBucket() {
  return getStorage().bucket();
}
