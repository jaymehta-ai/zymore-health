# Zymore Health — System Architecture & Technical Specification

Zymore Health is a patient-centric, zero-trust health data vault designed to bridge clinical fragmentation across hospitals, clinics, and emergency care settings.

---

## 1. System Overview

In emergency and follow-up clinical visits across different healthcare institutions, attending clinicians lack access to unified medical histories, previous prescriptions, active medication regimens, and life-critical drug allergy information. 

Zymore Health provides an interoperable digital health vault where:
- **Patients** own, curate, and verify their medical history and uploaded documents.
- **Google Gemini** extracts structured clinical entities (medications, dosages, observations, lab panels) from unstructured documents with human-in-the-loop review.
- **Clinicians** receive time-limited, scoped access grants to view clinical summaries, vital records, and critical drug allergy alerts at the point of care.
- **HL7 FHIR & ABDM** compatibility ensures long-term alignment with national digital health standards.

---

## 2. Architecture & Data Flow

```
   Browser Client (Next.js 16 + React 19)
             │
             │ Firebase ID Token in Authorization: Bearer <token>
             ▼
   Next.js App Router API Routes (Node.js Runtime)
             ├── 1. Verify Token & Extract UID ── Firebase Admin Auth
             ├── 2. Scoped Access & Metadata  ── Cloud Firestore
             ├── 3. Encrypted File Storage    ── Private Supabase S3 Bucket
             └── 4. Multimodal OCR & Insights ── Google Gemini API (@google/genai)
```

### Security Isolation
- **Direct Database Access Denied:** Firestore client rules deny all direct browser reads and writes. All operations are mediated by authenticated server-side API handlers using the Firebase Admin SDK.
- **Private Object Storage:** File bytes reside in an encrypted private S3 bucket. Downloads are streamed strictly via authenticated, grant-verified server endpoints.
- **Bearer Token Verification:** Every protected endpoint verifies the Firebase Auth ID token and validates caller roles and ownership.

---

## 3. Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | Next.js 16 (App Router) | Unified React 19 SSR and Node.js API route handlers |
| **Language** | TypeScript 5 (Strict Mode) | End-to-end typed contracts and request validation |
| **Authentication** | Firebase Authentication | Identity management for patients and verified doctors |
| **System of Record** | Google Cloud Firestore | NoSQL document storage for profiles, grants, and audit events |
| **Multimodal AI** | Google Gemini (`@google/genai`) | Medical document entity extraction & plain-language synthesis |
| **Binary Storage** | Supabase Storage (S3 API) | Private encrypted bucket for medical scans and PDFs |
| **Styling & UI** | Custom CSS + Lucide Icons | Accessible, responsive, mobile-first design system |

---

## 4. Key Subsystems

### A. Multimodal Document Ingestion & Verification
1. Patients upload medical files (PDF, JPEG, PNG, WebP) up to 4 MB.
2. The server stores the raw bytes in private storage and invokes the Google Gemini API with a strict JSON schema.
3. Gemini extracts:
   - `document_type`: e.g., Lab Report, Discharge Summary, Prescription
   - `document_date`: Document timestamp
   - `extracted_text`: Concise transcription
   - `facts`: Array of `{ label, value, unit, page, confidence }`
4. Extracted data is saved in Firestore with `status: "needs_review"`.
5. **Human-in-the-Loop:** Extracted information does not enter the patient's active clinical summary until the patient reviews and confirms it.

### B. Emergency & Point-of-Care Doctor Sharing
1. **Clinician Onboarding:** Clinicians register and submit medical council and license details, generating a unique `doctorId` (e.g., `ZMD-XXXXXX`).
2. **Staff Verification:** Staff reviewers approve clinician accounts before patient records can be accessed.
3. **Scoped Grants:** Patients grant access to a specific doctor by entering their `doctorId` and selecting:
   - **Scopes:** `profile`, `history`, `records`, `add_records`
   - **Duration:** 1 hour, 8 hours, 24 hours, 3 days, or 7 days
4. **Point-of-Care Alerting:** When an authorized doctor opens the patient file:
   - A **Critical Drug Allergy Alert Banner** highlights any reported adverse reactions immediately.
   - Emergency contact numbers and active medication regimens are surfaced prominently.
5. **Add Clinic Record:** Doctors with the `add_records` scope can append clinical notes or new prescriptions directly to the patient's vault.

### C. In-Case-of-Emergency (ICE) Summary
- Patients have a dedicated Emergency Medical Card displaying:
  - Full Name, Age, Blood Group
  - Known Drug Allergies & Contraindications
  - Emergency Contact Name & Phone
  - Active Prescriptions / Medication Highlights
- Designed for rapid identification by emergency responders and hospital triage staff.

### D. Comprehensive Audit Trail
Every read, grant generation, revocation, record view, and file download writes an immutable record to the `access_audit` collection:
- `actor_uid`: Who initiated the action
- `patient_uid` & `doctor_uid`: Parties involved
- `event`: e.g., `patient_data_viewed`, `patient_record_downloaded`
- `createdAt`: ISO 8601 timestamp

Patients can review access logs directly from their access dashboard and submit concern reports for staff investigation.

---

## 5. API Reference Summary

| Method | Endpoint | Description | Scopes / Auth |
| :--- | :--- | :--- | :--- |
| `GET/POST` | `/api/profile` | Read or update patient profile & consent | Patient Bearer Token |
| `GET` | `/api/dashboard` | Vault overview, records, and Gemini summary | Patient Bearer Token |
| `POST/PATCH/DELETE` | `/api/patient/records` | Upload, review OCR, or delete records | Patient Bearer Token |
| `GET/POST/DELETE` | `/api/patient/grants` | Manage doctor access grants | Patient Bearer Token |
| `GET` | `/api/patient/audit` | View patient access history log | Patient Bearer Token |
| `GET/POST` | `/api/doctor/profile` | Doctor profile & registration status | Doctor Bearer Token |
| `GET` | `/api/doctor/grants` | List active, unexpired patient permissions | Verified Doctor |
| `GET` | `/api/doctor/patient-data` | Scoped patient profile, history, and alerts | Verified Doctor + Valid Grant |
| `POST` | `/api/doctor/patient-records` | Add clinician note to patient vault | Verified Doctor + `add_records` scope |
| `GET` | `/api/records/[recordId]/file`| Securely stream uploaded medical file | Owner or Authorized Doctor |
| `POST` | `/api/mock-abdm/sync` | Load synthetic HL7 FHIR demonstration bundle | Patient Bearer Token |
