# Zymore Health: Technical Field Guide

> Hackathon preparation guide. Read this on a phone, or use the contents links to jump to a topic. This guide describes the repository as implemented; it does not claim production clinical readiness.

## Contents

1. [30-second explanation](#1-30-second-explanation)
2. [Architecture at a glance](#2-architecture-at-a-glance)
3. [Technology choices](#3-technology-choices)
4. [Repository map](#4-repository-map)
5. [How the main flows work](#5-how-the-main-flows-work)
6. [Data model](#6-data-model)
7. [API route guide](#7-api-route-guide)
8. [Security, consent, and privacy](#8-security-consent-and-privacy)
9. [AI and document OCR](#9-ai-and-document-ocr)
10. [Run and deploy](#10-run-and-deploy)
11. [Known boundaries and honest answers](#11-known-boundaries-and-honest-answers)
12. [Likely technical questions](#12-likely-technical-questions)

## 1. 30-second explanation

Zymore is a web prototype for a patient-controlled health-record vault. Patients create a profile, add notes and medical documents, and optionally ask Gemini to explain saved health information or extract text from a document. They can give a verified doctor a time-limited grant to read selected parts of their record or add a clinic note. Firebase Authentication identifies accounts; Next.js server routes verify Firebase ID tokens and use Firebase Admin to access Firestore. File bytes are kept in a private Supabase Storage bucket. A synthetic FHIR-shaped dataset demonstrates a possible ABDM integration, but there is no live ABDM connection.

The key design idea is that a doctor must have both a verified doctor profile and a current grant from the patient. A grant names the doctor, its scopes, and its expiry. Patient reads, downloads, additions, revocations, and review actions are written to an audit collection.

## 2. Architecture at a glance

```text
Browser (Next.js pages + Firebase client Auth)
          │ Firebase ID token in Authorization: Bearer ...
          ▼
Next.js App Router API routes (Node.js)
          ├── verify token ── Firebase Admin Auth
          ├── profiles, grants, records, audits ── Cloud Firestore
          ├── uploaded PDF/image bytes ── private Supabase Storage (S3 API)
          └── optional OCR / explanation ── Google Gemini API

Firestore browser rules: deny every direct read and write.
```

The browser does not talk directly to Firestore or Supabase Storage. It uses Firebase's client SDK for sign-in, obtains an ID token, and sends that token to the Next.js API. API routes authenticate the token with Firebase Admin, derive the user's UID from the verified token, check ownership/role/grant as needed, and then read or write data on the server.

## 3. Technology choices

- **Next.js 16 App Router** provides page routing, server API route handlers, and deployment as one web application. API routes explicitly use the Node.js runtime where Node libraries and Firebase Admin are needed.
- **React 19 and TypeScript 5** implement interactive pages and typed request/response structures. The `@/*` alias points to `apps/web/src/*`.
- **Firebase Authentication** supports patient email/password and Google sign-in, and doctor email/password. Firebase issues the ID token sent to the API. Phone sign-in is not implemented.
- **Firebase Admin + Cloud Firestore** are the server-side identity verifier and application database. Firestore has no ORM/schema migration layer; routes validate and shape the documents themselves.
- **Supabase Storage** is used as a private object bucket through its S3-compatible endpoint and AWS SDK v3 client. Firestore stores file metadata and an opaque object key, not the file bytes.
- **Google Gemini (`@google/genai`)** optionally creates a constrained summary and extracts visible health-document text. It is called only from server code using a server-only key.
- **Lucide React** supplies interface icons. CSS is maintained in the app's global stylesheet, including responsive layouts.
- **Vercel** is the documented hosting target, with `apps/web` as the project root. The root npm workspace exposes the common commands.

## 4. Repository map

### Root and infrastructure

- `package.json` — npm workspace definition, root `dev`, `build`, `start`, and `check` commands, Node 24 engine, and the gRPC dependency override.
- `package-lock.json` — exact dependency resolution for reproducible npm installs.
- `.env.example` — names and example values for client Firebase settings and server Firebase, Gemini, and Supabase settings. It contains placeholders, not working credentials. `DOCTOR_REVIEWER_UIDS` is described in the README but is not currently listed in this example file.
- `.gitignore` — excludes dependencies, build output, environment files, and coverage output.
- `README.md` — initial Firebase/Supabase/Gemini setup, local run and Vercel deployment instructions, and demo/privacy notes.
- `firebase.json` — points Firebase CLI to `firebase/firestore.rules`.
- `firebase/firestore.rules` — denies all direct browser reads and writes to Firestore; server Admin SDK requests bypass these rules and must enforce authorization in route code.
- `supabase/` — reserved project directory; there are no checked-in Supabase database migrations in this repository. Supabase is only used for object storage here.
- `docs/TECHNICAL_GUIDE.md` — this architecture, file, and implementation guide.

### Web application configuration

- `apps/web/package.json` — app dependencies and Next.js, TypeScript-check, and start scripts.
- `apps/web/next.config.mjs` — marks `firebase-admin` as a server external package.
- `apps/web/tsconfig.json` — strict TypeScript settings, Next.js plugin, and source alias.
- `apps/web/next-env.d.ts` — Next.js-generated TypeScript declarations.
- `apps/web/AGENTS.md` — repository-specific instruction that this installed Next.js version has breaking changes and its local guides should be consulted before code edits.

### UI pages (`apps/web/src/app/`)

- `layout.tsx` — global document shell, stylesheet import, and browser title/description.
- `page.tsx` — redirects `/` to `/login`.
- `globals.css` — visual system, auth/profile/dashboard/doctor/admin styles, and mobile breakpoints.
- `login/page.tsx` — patient sign-in with email/password or Google; asks `/api/profile` whether to go to onboarding or the dashboard.
- `register/page.tsx` — patient email/password or Google account creation; sends email verification for password sign-ups.
- `onboarding/page.tsx` — profile entry/edit screen and separate required storage consent and optional AI, OCR, and marketplace consent controls.
- `dashboard/page.tsx` — patient vault: profile summary, AI summary, record upload/review/download/delete, synthetic demo import, and JSON export.
- `access/page.tsx` — patient sharing controls, active/past grants, revocation, recent audit events, and concern reporting.
- `doctor/login/page.tsx` — doctor email/password login, requiring an existing doctor profile.
- `doctor/signup/page.tsx` — creates a Firebase account and submits clinician details for pending manual review.
- `doctor/dashboard/page.tsx` — verified clinician's grant list, scoped patient viewer, attached-file download, and optional clinic-note entry.
- `admin/doctors/page.tsx` — restricted staff queue to approve or reject pending doctor profiles.
- `admin/reports/page.tsx` — restricted staff queue to mark patient concerns under review, closed, or escalated with a note.

### Server API (`apps/web/src/app/api/`)

Every protected route calls `requireUser` before accessing user data. The route path/method list and behavior are in [API route guide](#7-api-route-guide).

- `health/route.ts` — unauthenticated liveness response; it only says the web API process responded, not that Firebase, Supabase, or Gemini are ready.
- `profile/route.ts` — patient profile get/save and consent persistence.
- `dashboard/route.ts` — profile and record aggregation plus consent-controlled Gemini summary/cache.
- `patient/records/route.ts` — upload, review/update, and delete a patient's record and associated file.
- `patient/export/route.ts` — authenticated JSON export of profile, record metadata/notes, and saved AI insight.
- `patient/grants/route.ts` — patient grant listing, creation, and revocation.
- `patient/audit/route.ts` — patient's recent access audit events.
- `patient/report/route.ts` — submits a concern tied to one of that patient's audit events.
- `doctor/profile/route.ts` — doctor profile read/create; new profile starts pending.
- `doctor/grants/route.ts` — returns active, unexpired grants for a verified clinician.
- `doctor/patient-data/route.ts` — returns only sections authorized by a grant and logs the view.
- `doctor/patient-records/route.ts` — adds a clinician-authored note only when the grant includes `add_records`.
- `records/[recordId]/file/route.ts` — streams the private file to its owner or to a verified doctor with a live `records` scope.
- `mock-abdm/sync/route.ts` — imports the local synthetic FHIR-shaped examples into Firestore; never calls ABDM.
- `admin/doctors/route.ts` — reviewer-allowlist-protected list and decision endpoint for doctor applications.
- `admin/reports/route.ts` — reviewer-allowlist-protected access-concern queue and review endpoint.

### Shared server/client libraries (`apps/web/src/lib/`)

- `firebase.ts` — lazy browser Firebase app/Auth initialization from `NEXT_PUBLIC_FIREBASE_*` values.
- `firebaseAdmin.ts` — lazy server Admin SDK initialization from service-account environment variables; translates escaped `\\n` into PEM newlines and validates the key markers.
- `serverAuth.ts` — extracts the Bearer token, verifies it with Firebase Admin Auth, and returns the UID or a JSON 401/500 response.
- `profileClient.ts` — after sign-in, fetches `/api/profile` and selects `/dashboard` or `/onboarding`.
- `adminAccess.ts` — checks a UID against the server-only comma-separated `DOCTOR_REVIEWER_UIDS` allowlist.
- `supabaseStorage.ts` — creates and caches an AWS S3 client configured for Supabase's S3 endpoint, credentials, region, and bucket.
- `gemini.ts` — structured Gemini document extraction and health-summary generation, model fallback chain, prompt rules, output checks, and length limits.
- `mockAbdm.ts` — deterministic synthetic FHIR Bundle builder with explicit demo markers and fabricated patient/clinic examples.

## 5. How the main flows work

### Patient sign-up and profile

1. The browser creates/signs in the account with Firebase Authentication.
2. It gets a Firebase ID token and calls `/api/profile` with `Authorization: Bearer <token>`.
3. `serverAuth.ts` verifies the token; the server uses the verified Firebase UID as the profile document ID.
4. `/onboarding` collects the required profile fields and required health-data storage consent. Optional AI explanation, document OCR, and marketplace choices are separate booleans.
5. `/api/profile` validates date, numeric ranges, blood group, and required consent, prevents an account with a doctor profile from becoming a patient profile, then writes `user_profiles/{uid}`.
6. If AI consent is switched off, the saved `ai_insights/{uid}` document is deleted.

### Upload, OCR, and review

1. The patient submits a title, type, date, optional note, and PDF/JPEG/PNG/WebP file to `POST /api/patient/records` as multipart form data.
2. The route checks the verified user, completed profile, allowed MIME type, 4 MB size limit, file signature, date, title, and whether either a note exists or OCR consent plus Gemini configuration are available.
3. The original bytes are uploaded to the private Supabase bucket using a random `records/<UUID>` key. Firestore receives a `health_records` metadata document.
4. When OCR consent is on and Gemini is configured, the same in-memory file bytes are sent to Gemini. The extracted content is saved with `status: needs_review`; failures save `status: failed` while keeping the file and any patient note.
5. The UI displays the OCR text and facts for patient review. `PATCH /api/patient/records` stores the patient's confirmed text and date and changes OCR state to `confirmed`.
6. Dashboard summary input includes user-uploaded record notes only when non-empty; thus an OCR extraction does not enter the explanation context until the patient confirms it. The user must also have AI consent on.
7. `DELETE /api/patient/records` verifies ownership, deletes the Supabase object, then deletes Firestore metadata.

### Doctor approval and patient sharing

1. A clinician registers through Firebase Auth and submits their name, specialty, registration details, council, and optional HPR ID. The server creates `doctor_profiles/{uid}` with a random `ZMD-...` identifier and `verificationStatus: pending`.
2. A staff UID listed in `DOCTOR_REVIEWER_UIDS` can review the submitted details in `/admin/doctors`. A reviewer manually checks the relevant professional registry; the application itself does not verify the registry. The decision and reviewer UID are saved and audited.
3. A patient enters the doctor's Zymore ID, chooses scopes (`profile`, `history`, `records`, `add_records`), and chooses a lifetime from 1 to 168 hours. The server confirms the doctor exists and is verified, creates an active grant with expiry, and writes an audit event.
4. A verified doctor can list only their own active grants. Opening one checks grant ownership, status, expiry, and verification again. The route returns only the sections named in its scopes and records `patient_data_viewed`.
5. A doctor may add a record only if `add_records` is granted. A Firestore transaction rechecks the grant and creates the clinic record and audit event together.
6. Patient revocation sets grant status to `revoked` and records an audit event. Read/file routes check the grant at use time; previously viewed or downloaded copies cannot be recalled.

### Synthetic ABDM demonstration

`POST /api/mock-abdm/sync` calls `mockABDMFetch`, which returns hard-coded sample FHIR resources (Encounter, Observation, DiagnosticReport, MedicationRequest). The API writes them with `source: mock_abdm`, `simulated: true`, and demo labels. IDs are deterministic per sample, so repeat import merges/overwrites those same sample docs. No network request to ABDM or use of a real ABHA is involved.

## 6. Data model

Firestore collections are created implicitly when routes write documents; there is no checked-in schema migration. User-scoped documents use Firebase Auth UIDs where practical.

- **`user_profiles/{uid}`** — display name, date of birth, height, weight, blood group, self-reported medical/dental/treatment notes, ABHA status (`yes/no/unsure` only), completeness, timestamps, and separate consent flags/timestamps.
- **`doctor_profiles/{uid}`** — clinician-submitted identity/registration fields, generated `doctorId`, status (`pending`, `verified`, `rejected`), and reviewer metadata.
- **`health_records/{recordId}`** — `user_id`, source (`user`, `clinic`, `mock_abdm`), simulation flag, type/title/date/summary, timestamps, optional FHIR object, and optional file metadata/path. Original uploaded bytes are elsewhere.
- **`access_grants/{grantId}`** — patient and doctor UIDs, public doctor ID/name snapshot, unique scopes, active/revoked state, create/expiry/revoke timestamps, and creator.
- **`access_audit/{eventId}`** — event name, actor UID, related patient/doctor/grant/record IDs, scopes/status where relevant, and ISO timestamp.
- **`access_reports/{reportId}`** — patient-submitted concern, linked audit event, doctor identifiers, status, timestamps, and staff review note/UID.
- **`ai_insights/{uid}`** — generated patient summary, filtered tags/actions, SHA-256 input hash, generated timestamp, and demo indicator.
- **`ai_summary_locks/{uid}`** — short-lived input-specific claim used to reduce duplicate concurrent Gemini summary requests; lock window is 90 seconds.

Dates in these documents are generally ISO strings, not Firestore Timestamp values. Data is schemaless; route validation, UID checks, and consistent field names are important.

## 7. API route guide

All paths are relative to the app origin. Unless stated otherwise, routes require `Authorization: Bearer <Firebase ID token>`.

- `GET /api/health` — process liveness; no auth.
- `GET, POST /api/profile` — retrieve or validate/save signed-in patient's profile and consent choices.
- `GET /api/dashboard` — return current user's profile, records, summary state, and optional AI insight.
- `POST, PATCH, DELETE /api/patient/records` — upload a file/note, confirm OCR or save a note/date, or remove an owned record and its file.
- `GET /api/patient/export` — download JSON containing profile, health-record metadata, and AI insight; file bytes are excluded.
- `GET, POST, DELETE /api/patient/grants` — list grants, create scoped expiring grant, revoke owned grant.
- `GET /api/patient/audit` — return up to 100 recent patient events (ordered newest first in the route).
- `POST /api/patient/report` — attach a minimum-length concern to one of the caller's audit events.
- `GET, POST /api/doctor/profile` — get/create clinician profile. Creation rejects an account that already has a patient profile.
- `GET /api/doctor/grants` — list current doctor's active, unexpired grants; non-verified doctors receive no grants.
- `GET /api/doctor/patient-data?grantId=...` — scoped patient profile/history/records, with view audit.
- `POST /api/doctor/patient-records` — create a clinic note under a live `add_records` scope; record and audit are transactional.
- `GET /api/records/{recordId}/file?grantId=...` — private file stream for its owner or authorized doctor; doctor downloads are audited and the grant is rechecked before response.
- `POST /api/mock-abdm/sync` — import synthetic examples for a completed patient profile.
- `GET, POST /api/admin/doctors` — reviewer-only pending queue and approve/reject decision.
- `GET, POST /api/admin/reports` — reviewer-only concern queue and under-review/closed/escalated outcome.

## 8. Security, consent, and privacy

### Controls present in this code

- Firestore client rules deny all direct reads/writes. The browser only uses Firebase Auth, while privileged Firestore operations stay server-side.
- Every protected route verifies a Firebase ID token; route authorization uses its verified UID rather than trusting a client-supplied user ID.
- File objects are in a private bucket. The browser requests a server route to download them; it does not receive a public bucket URL.
- Upload validates MIME type, size, and file signature, uses a random object key, and disables caching on the stored object.
- Doctor data reads check verified clinician status, matching doctor UID, active grant, expiry, and requested scopes. File download also requires the `records` scope.
- Optional Gemini uses distinct patient choices for summary, OCR, and marketplace suggestions. OCR must be reviewed before it becomes eligible summary input.
- AI prompts explicitly treat uploaded/health text as untrusted input and prohibit diagnosis or treatment changes. The route constrains output shape/length and filters tags/actions.
- Staff review is allowlisted by server-side Firebase UID. Decisions and patient access events are written to the audit collection.
- Authenticated export is marked `private, no-store`; it omits raw file bytes and storage object paths.

### Consent flags mean different things

- `healthDataConsentAt` is required to save the profile and records the first acceptance time; the user can edit profile fields later.
- `aiConsent` gates summary generation. Turning it off deletes the cached insight.
- `documentOcrConsent` allows uploaded file bytes to be sent to Gemini for extraction; it does not by itself enable summaries.
- `marketplaceConsent` allows optional suggestion output, which is additionally conditioned on a non-simulated clinic record.
- Doctor sharing is a separate, explicit, scoped grant with expiry and revocation.

### Important security limits to understand

This is a hackathon prototype, not a completed security/compliance assessment. Firebase Admin bypasses Firestore rules, so every server route is security-critical. The reviewer allowlist is a basic access gate, not MFA or a full staff identity system. Audit entries are application-written records, not a tamper-proof or independently monitored audit service. There is no documented rate limiting, abuse monitoring, retention/deletion policy for all account data, encryption-key management policy, formal penetration test, or end-to-end compliance certification in this repository. Be accurate about these limits if asked.

## 9. AI and document OCR

### Health explanation

The dashboard API prepares a context object from self-reported health notes and saved records. A SHA-256 hash of the clinical input and marketplace consent is compared to the saved insight. If it differs and the user opted into AI, the API claims a short Firestore lock, calls Gemini, and saves the result. Concurrent requests can reuse a fresh result or report that work is pending. When Gemini fails after a previous insight exists, the API can return that prior text marked stale.

The model is instructed to produce a two-sentence plain-language explanation, not diagnose, infer conditions, or advise treatment. Schema validation and additional filters limit tags/actions to content supported by input. Synthetic records are marked and the prompt asks Gemini to describe them as synthetic. This is prompt/output guardrailing, not a guarantee that generative output is clinically correct.

### OCR

The `extractHealthDocument` function accepts PDF, JPEG, PNG, and WebP bytes. It calls Gemini with a structured JSON schema for document type/date, transcription, and facts with units/page/confidence. The prompt requests omission of identity fields and forbids guessing unreadable values. Result sizes and fact counts are capped. OCR output is stored as `needs_review`; the patient confirms or edits a summary and date before the dashboard includes it in AI context.

### Model selection and fallbacks

`GEMINI_MODEL` chooses the first model. If it is in the fallback list, the code proceeds down the configured list; if it is not recognized, it tries that model then the fallback list. Calls use one SDK retry attempt and explicit timeouts. Invalid API-key errors stop further model attempts. The list lives in `apps/web/src/lib/gemini.ts`; model availability can change and must be checked against the current Google AI configuration before a live demo.

## 10. Run and deploy

### Local

1. Install Node.js 24.x.
2. Configure Firebase Auth and Firestore, create a private Supabase Storage bucket with S3 credentials, and optionally configure Gemini.
3. Copy `.env.example` values into `apps/web/.env.local`; provide real server credentials locally, never commit them.
4. From the repository root run `npm install`, then `npm run dev`.
5. Open `http://localhost:3000`.

`npm run check` runs `tsc --noEmit`; `npm run build` creates the production build; `npm start` starts the built app. These commands are defined in the root workspace.

### Deploy

The README documents importing this GitHub repository into Vercel with **Root Directory** set to `apps/web`. Add environment variables in Vercel, use Firebase's authorized domains setting for the deployment domain, and keep secrets server-only. `NEXT_PUBLIC_FIREBASE_*` values are intentionally browser-visible Firebase web app configuration; service-account, Gemini, reviewer, and Supabase S3 secrets must never use the `NEXT_PUBLIC_` prefix.

### Environment variable groups

- Browser Firebase: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`.
- Firebase Admin: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.
- Reviewer allowlist: `DOCTOR_REVIEWER_UIDS` (comma-separated Firebase UIDs; server only).
- Gemini: `GEMINI_API_KEY`, optional `GEMINI_MODEL`.
- Supabase Storage S3: `SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_REGION`, `SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY`, `SUPABASE_STORAGE_BUCKET`.

## 11. Known boundaries and honest answers

- **ABDM:** There is no live ABDM/ABHA authentication, consent manager, gateway, or data sync. The demo button imports local synthetic FHIR-shaped examples. ABHA is only a self-reported yes/no/unsure field; no Aadhaar or ABHA number is collected.
- **FHIR:** The demo objects resemble FHIR resources and include FHIR metadata/profile URLs. The app does not implement a full FHIR server, terminology validation, conformance testing, or production mapping pipeline.
- **Medical use:** Gemini text is explanatory UI output, not a diagnosis, risk score, or treatment plan. The prototype is not validated for clinical decisions.
- **Doctor verification:** Staff review is manual. The software stores submitted credentials and review outcome; it does not query a medical council or verify a professional registry automatically.
- **Marketplace:** Suggestions are generated only under the consent and input gates, are limited to named vendors in the output schema, and the Explore action is a demo alert. No booking, sale, or vendor API call occurs.
- **Storage split:** Firestore holds descriptions, notes, OCR and record metadata. Supabase holds uploaded bytes. The JSON export excludes file bytes; users must download attachments separately before any account deletion process.
- **Delete semantics:** Deleting an uploaded user record removes its object then Firestore doc. There is no account-wide deletion workflow in the current UI/API.
- **Testing:** This repository defines a TypeScript check but does not include a dedicated automated test suite for business flows. Do not claim end-to-end security or clinical tests have passed unless you run and document them separately.
- **Operational readiness:** Configure all integrations before demoing. `/api/health` is only a basic process liveness endpoint and does not probe dependencies.

## 12. Likely technical questions

### Why Firebase and Supabase together?

Firestore is convenient for structured, UID-owned profile/record/grant documents and Admin SDK access. Supabase Storage keeps large binary files out of Firestore. The code uses Supabase's private bucket through its S3 API, so server routes can gate each download.

### How do you prevent a doctor from guessing another patient's ID?

The doctor API does not accept a patient UID as authorization. It takes a grant ID, then checks that the stored grant belongs to the signed-in doctor's verified UID, remains active, and is unexpired. The route returns only authorized scopes and rechecks grant state around sensitive operations.

### What happens when a patient revokes access?

The grant is marked revoked rather than deleted, with an audit event. Subsequent API reads/downloads fail their active-grant checks. Revocation cannot recall information already viewed or copied.

### How does the app keep unreviewed OCR out of summaries?

The extracted text remains inside the record's OCR field with `needs_review` status. Dashboard summary input uses the record's `summary`, not the pending extraction. The patient must submit the reviewed text via PATCH; then that summary can enter the AI context if AI consent is enabled.

### Is Gemini making diagnoses?

The intended behavior is no: prompts prohibit diagnosis, inference, and treatment changes; the result is constrained to an explanation and optional tags/actions. But a language model can still be wrong, so this prototype cannot be represented as a clinically validated decision-support product.

### What is logged?

The app writes application events for grant creation/revocation, doctor list views, patient data views, file downloads, clinic record additions, patient concerns, and staff review decisions. This is an application audit trail in Firestore, not a tamper-proof compliance log.

### What would you build next?

For a real-world pilot: formal threat model and independent security review; robust audit/monitoring and rate limits; account lifecycle, retention, and deletion; tested authorization edge cases; verified clinician identity integration; consent and ABDM integration through official channels; privacy/legal/compliance review; and clinical safety evaluation. For the product demo, prioritize one polished end-to-end journey with synthetic data and clearly narrate these boundaries.

---

**Source of truth:** implementation files in this repository. If code changes, update this guide so it stays aligned with the product.
