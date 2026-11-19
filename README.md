# Zymore Health

Next.js App Router application configured for Vercel, Firebase Authentication, Cloud Firestore, private Supabase Storage, and Gemini. Firebase remains the system of record for patient profiles, health records, OCR results, AI summaries, access grants, and audit events. Supabase stores uploaded PDF and image files only. The ABDM demo adapter returns synthetic FHIR-shaped data and does not connect to ABDM.

## Project layout

```text
apps/web/                 Next.js app, API route handlers, dashboard
apps/web/src/lib/         Firebase clients, token verification, Gemini, mock ABDM data
firebase/firestore.rules  Deny direct client access to Firestore health data
```

## Firebase setup

1. Create a Firebase project and register a Web app.
2. In **Authentication -> Sign-in method**, enable **Email/Password** and any other sign-in methods you plan to use.
3. In **Authentication -> Settings -> Authorized domains**, add `localhost` and your Vercel domain.
4. Create a **Cloud Firestore** database. In the Firebase console's Rules tab, publish `firebase/firestore.rules`.
5. Create a Firebase service account with access to Firebase Authentication and Firestore. Put its project ID, client email, and private key in server-only environment variables. For the private key, preserve newlines as `\n` in Vercel's value.
6. Copy the Web app's API key, auth domain, project ID, and app ID into `apps/web/.env.local` using the ignored `.env.example` as a reference.
7. Set `DOCTOR_REVIEWER_UIDS` to a comma-separated allowlist of Firebase Auth user UIDs for the staff doctor review screen. Do not expose this setting with a `NEXT_PUBLIC_` prefix.

## Supabase Storage setup

1. Create a Supabase project. Choose the Mumbai region if it is available for your project.
2. In **Storage**, create a private bucket, for example `health-records`. Keep it private; the application serves files only through authenticated Next.js routes.
3. Enable the Storage S3 protocol in the Supabase Storage settings and create S3 access credentials there. Use the storage-only access key and secret, not a Supabase database password or a `NEXT_PUBLIC_` key.
4. Add the endpoint and credentials to `apps/web/.env.local` and to the Vercel project's server environment variables. The endpoint format is `https://<project-ref>.storage.supabase.co/storage/v1/s3`; use the region shown in Supabase's S3 settings.
5. Set `SUPABASE_STORAGE_BUCKET` to the private bucket name. Uploads are limited to 4 MB in this MVP.

Only the file bytes go to Supabase. Firebase stores the file's title, date, owner, content type, and opaque storage path, alongside the OCR result and patient notes. Gemini receives the file for OCR only when the patient enables the separate document OCR consent. OCR output remains in Firebase and requires patient review before it can be included in a health summary.

## Gemini setup

Set `GEMINI_API_KEY` to a server-only API key. `GEMINI_MODEL` selects the first model to try; if it fails, the service moves through the supported fallback list in `apps/web/src/lib/gemini.ts`. Summaries are cached in Firebase against their clinical input and are refreshed when that input changes and AI consent is enabled.

## Run locally

Use Node.js 24.x. Copy the ignored `.env.example` values into `apps/web/.env.local`, configure Firebase, Supabase Storage, and Gemini, then run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The sign-up screen uses Firebase Authentication. Phone sign-in is not enabled in this starter.

## Deploy to Vercel

Import the private Git repository into Vercel and set **Root Directory** to `apps/web`. Add the required environment variables from `.env.example` to the Vercel project's server environment variables, then deploy and add the Vercel hostname to Firebase Authentication's authorized domains. Keep `.env*` files out of Git and never add server credentials with a `NEXT_PUBLIC_` prefix.

## Demo and privacy

The **Load synthetic ABDM demo** action adds clearly labeled fake FHIR records to the signed-in user's vault. It makes no request to ABDM. Do not use real patient data until consent, retention, security, audit, provider terms, and applicable legal and compliance requirements have been reviewed.
