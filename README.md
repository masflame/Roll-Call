<<<<<<< HEAD
# Roll-Call
Repisotory for the Roll Call QR based class attendance system
=======
# QR Attendance MVP

Production-ready starter for a Firebase-backed QR code attendance system.

## Structure

- `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json` – Firebase project config.
- `functions/` – TypeScript Cloud Functions (session creation, attendance submission, CSV export).
- `web/` – Vite + React front-end with lecturer dashboard and student form.

## Prerequisites

- Node.js 20+
- Firebase CLI (`npm i -g firebase-tools`)
- A Firebase project with Auth, Firestore, Functions, Hosting enabled.

## Setup

1. Copy `.firebaserc` project ID or run `firebase use --add` to link your project.
2. Install dependencies:
   ```bash
   cd functions && npm install
   cd ../web && npm install
   ```
3. Configure environment variables:
   - Create `web/.env` from `.env.example` and fill Firebase keys plus the `submitAttendance` HTTPS endpoint (`https://<region>-<project>.cloudfunctions.net/submitAttendance`).
   - For production, store `CLASS_CODE_SECRET` using `firebase functions:secrets:set CLASS_CODE_SECRET`.
4. Build front-end once for hosting:
   ```bash
   cd web
   npm run build
   ```
5. Serve locally with emulators (optional):
   ```bash
   firebase emulators:start
   ```

## Deploy

# Roll-Call — QR Attendance MVP

Repository for a QR-code based class attendance system backed by Firebase.

## Overview

This project implements a minimal viable product (MVP) for taking attendance using QR codes, with a lecturer dashboard and a student-facing scan form. It uses Firebase for authentication, Firestore for data storage, and Cloud Functions for server-side logic.

## Structure

- `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json` — Firebase project configuration.
- `functions/` — TypeScript Cloud Functions (session creation, attendance submission, CSV export).
- `web/` — Vite + React front-end with lecturer dashboard and student form.

## Prerequisites

- Node.js 20+
- Firebase CLI (`npm i -g firebase-tools`)
- A Firebase project with Auth, Firestore, Functions, Hosting enabled.

## Setup

1. Link your Firebase project (if needed):
   ```bash
   firebase use --add
   ```
2. Install dependencies:
   ```bash
   cd functions && npm install
   cd ../web && npm install
   ```
3. Configure environment variables:
   - Create `web/.env` from `.env.example` and fill Firebase keys plus any endpoints required by functions.
   - For production, store secrets using `firebase functions:secrets:set` as needed.
4. Build the front-end before hosting:
   ```bash
   cd web
   npm run build
   ```
5. (Optional) Run emulators locally for testing:
   ```bash
   firebase emulators:start
   ```

## Deploy

```bash
firebase deploy
```

This deploys Functions and Hosting using the current build output. Adjust CI/CD workflows as needed.

## Key Features

- Secure lecturer authentication with Firebase Auth.
- Firestore collections for lecturers, modules, sessions, and attendance records.
- Cloud Functions for session creation, attendance submission validation, and CSV exports.
- React-based lecturer UI for module management, session control, and analytics.
- Mobile-first student scan form for quick attendance capture.

## Notes

- There are sample `.env.example` files in `web/` for local configuration.
- If you encounter issues with line endings on Windows, add a `.gitattributes` file to normalize line endings.

---

If you'd like, I can open a PR or push this merged README to the remote for you after resolving the rebase (run `git add README.md` and `git rebase --continue`).
