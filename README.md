# Zymore Health

Next.js App Router starter configured for Vercel, Firebase Authentication, and Cloud Firestore. The ABDM adapter is a FHIR-shaped local simulator; it does not connect to ABDM or contain real patient records.

## Project layout

```text
apps/web/                 Next.js app, API route handlers, dashboard
apps/web/src/lib/         Firebase clients, token verification, Gemini, FHIR simulator
firebase/firestore.rules  Client access rules for health data
.env.example              Environment template (intentionally gitignored)
```

## Firebase setup

1. Create a Firebase project and register a Web app.
2. In **Authentication → Sign-in method**, enable **Email/Password**.
3. In **Authentication → Settings → Authorized domains**, add `localhost` and your Vercel domain.
4. Create a **Cloud Firestore** database. In the Firebase console's Rules tab, publish `firebase/firestore.rules`.
5. Copy the Web app's API key, auth domain, project ID, and app ID into a root `.env.local` using `.env.example` as a reference.
6. Create a Firebase service account with access to Firebase Authentication and Firestore. Put its project ID, client email, and private key in the server-only environment variables. For the private key, preserve newlines as `\n` in Vercel's value.
7. Add a Gemini API key if you want live analysis. Without it, the dashboard uses the demo analysis.

The Admin SDK credentials must never use a `NEXT_PUBLIC_` prefix. Firestore rules deny all direct browser reads/writes; the Next.js API verifies Firebase ID tokens and accesses Firestore through the Admin SDK.

## Run locally

Use Node.js 24.12 or newer. Copy the ignored root `.env.example` values into `apps/web/.env.local`, then run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The sign-up screen uses Firebase Email/Password Auth. Phone sign-in is not enabled in this starter; Firebase phone auth requires an SMS/verification flow and can be added separately.

## Deploy to Vercel

Import the private Git repository into Vercel and set **Root Directory** to `apps/web`. Vercel should detect Next.js. Add all variables from `.env.example` to **Project Settings → Environment Variables**; do not add `.env*` files to Git. Deploy and add the Vercel hostname to Firebase Auth's authorized domains.

## Privacy note

The health records and generated insight in this demo are simulated. Do not use real patient data until consent, retention, security, audit, provider terms, and applicable legal/compliance requirements have been reviewed.
