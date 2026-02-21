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

## Deployment issues & fixes

During a recent deployment we encountered several issues; below are the problems, root causes, and the fixes applied so the project builds and runs correctly on Vercel + Firebase Functions.

- Missing root `package.json` build script
   - Symptom: Vercel build logs showed `npm error Missing script: "build"` because Vercel ran from the repo root and expected a `build` script there.
   - Fix: Added a minimal repo-root `package.json` with a `build` script that runs the frontend build (`cd web && npm run build`). Commit: `ci: add root build script`.

- Invalid `package.json` content created with a PowerShell here-string
   - Symptom: The root `package.json` was saved with PowerShell wrapper markers and was invalid JSON, causing errors.
   - Fix: Rewrote `package.json` to valid JSON. Commit: `ci: fix root package.json format`.

- Firebase env vars not provided to Vite at build time (blank API key)
   - Symptom: Production app threw `Firebase: Error (auth/invalid-api-key)` and the login page remained blank.
   - Root cause: Build-time Vite env vars (prefixed with `VITE_`) were not set in Vercel.
   - Fix: Add the required `VITE_` environment variables to Vercel project settings (or via `npx vercel env add`) using values from `web/.env.local`. These include `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, and optionally `VITE_FIREBASE_FUNCTIONS_REGION`.

- CORS errors calling Cloud Functions from the deployed frontend
   - Symptom: Browser blocked POSTs to Cloud Functions (e.g. `createSession`, `submitAttendance`) with `No 'Access-Control-Allow-Origin' header` on preflight OPTIONS requests.
   - Root cause: Functions did not return the `Access-Control-Allow-Origin` header for the Vercel origin(s) used in production.
   - Fixes applied:
      - Added deployment aliases (e.g. `https://roll-call-tau.vercel.app`, `https://roll-call-eu0z3171h-masflames-projects.vercel.app`) to the functions `allowedOrigins` whitelist in `functions/lib/index.js` so `applyCorsHeaders` sets `Access-Control-Allow-Origin` correctly.
      - Added an HTTP wrapper `createSessionHttp` (an `onRequest` handler) which explicitly handles `OPTIONS` preflight requests, sets CORS headers via `applyCorsHeaders`, verifies the incoming Firebase ID token, and performs the same session-creation logic as the callable function. This supports direct `fetch()` calls from the browser when needed.
      - Note: Prefer using `httpsCallable(functions, 'createSession')` from the client when possible; callable functions avoid some CORS issues. If using direct `fetch`, include `Authorization: Bearer <idToken>` header.

- Function deploy timeout / failed to load
   - Symptom: `firebase deploy --only functions` returned `User code failed to load. Cannot determine backend specification. Timeout after 10000` during deployment.
   - Root cause: Possible long-running or heavy initialization at module top-level in functions code, or transient deploy issues.
   - Mitigation: Ensure heavy work (network calls, large sync tasks) is not performed at module import time; move work into handlers where possible. Re-deploy after changes. Check Firebase Functions logs for full stack traces if timeouts persist.

- Frontend runtime ReferenceError in analytics view
   - Symptom: Analytics page was blank with `ReferenceError: alpha is not defined` in the production bundle.
   - Fix: Defined `alpha` before use in `web/src/components/ModuleAnalyticsView.tsx` heatmap rendering. Commit: `fix(analytics): define alpha in ModuleAnalyticsView heatmap`.

If you want, I can:
- Add a CI step to set Vercel env vars automatically (if you provide the values in a secure location),
- Move more cloud function top-level work into lazy handlers to avoid deployment timeouts, and
- Add a short troubleshooting guide for future deployments.

---

If you want this section edited or expanded, tell me what additional details to include (timestamps, commit IDs, or links to deployment logs) and I'll update the README and push the changes.
