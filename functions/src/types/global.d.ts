declare module "csv-stringify/sync" {
  export function stringify(records: any[], options?: any): string;
}

declare module "firebase-admin" {
  export const initializeApp: any;
}

declare module "firebase-admin/firestore" {
  export type Firestore = any;
  export type FieldValue = any;
  export const FieldValue: FieldValue;
  export type Transaction = any;
  export type QueryDocumentSnapshot<T = any> = any;
  export type DocumentData = any;
  export function getFirestore(): Firestore;
}

declare module "firebase-admin/storage" {
  export function getStorage(): any;
}

declare module "firebase-functions/v2/https" {
  export const onCall: any;
  export const onRequest: any;
  export class HttpsError extends Error {
    constructor(code: string, message?: string);
  }
  export type CallableRequest<T = any> = {
    auth?: { uid: string } | null;
    data: T;
  };
  export type Request = any;
  export type Response = any;
}

declare module "pdfkit" {
  const PDFDocument: any;
  export default PDFDocument;
}

type Buffer = any;
declare const Buffer: Buffer;
