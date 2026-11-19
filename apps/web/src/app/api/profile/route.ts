import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bloodGroups = new Set(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown']);

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function validDateOfBirth(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  const now = new Date();
  const oldest = new Date('1900-01-01T00:00:00.000Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && date <= now && date >= oldest;
}

function parseMeasurement(value: unknown, min: number, max: number) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : NaN;
}

export async function GET(request: NextRequest) {
  const { user, response } = await requireUser(request);
  if (response || !user) return response;
  try {
    const { getFirebaseAdminDb } = await import('@/lib/firebaseAdmin');
    const snapshot = await getFirebaseAdminDb().collection('user_profiles').doc(user.id).get();
    return NextResponse.json({ profile: snapshot.exists ? snapshot.data() : null });
  } catch (error) {
    console.error('Profile read failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Could not load your profile.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser(request);
  if (response || !user) return response;
  try {
    const body = await request.json();
    const displayName = cleanText(body.displayName, 100);
    const dateOfBirth = body.dateOfBirth;
    const heightCm = parseMeasurement(body.heightCm, 30, 250);
    const weightKg = parseMeasurement(body.weightKg, 2, 350);
    const bloodGroup = body.bloodGroup;
    const hasAbha = ['yes', 'no', 'unsure'].includes(body.hasAbha) ? body.hasAbha : null;
    const consentAccepted = body.consentAccepted === true;
    const aiConsent = body.aiConsent === true;
    const documentOcrConsent = body.documentOcrConsent === true;
    const marketplaceConsent = body.marketplaceConsent === true;

    if (!displayName || !validDateOfBirth(dateOfBirth) || Number.isNaN(heightCm) || heightCm === null || Number.isNaN(weightKg) || weightKg === null || !bloodGroups.has(bloodGroup) || !hasAbha || !consentAccepted) {
      return NextResponse.json({ error: 'Please complete the required profile fields and accept the health data notice.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { getFirebaseAdminDb } = await import('@/lib/firebaseAdmin');
    const db = getFirebaseAdminDb();
    const doctorAccount = await db.collection('doctor_profiles').doc(user.id).get();
    if (doctorAccount.exists) return NextResponse.json({ error: 'This account is set up as a doctor. Use a separate account for a patient profile.' }, { status: 409 });
    const ref = db.collection('user_profiles').doc(user.id);
    const previous = await ref.get();
    const profile = {
      user_id: user.id,
      displayName,
      dateOfBirth,
      heightCm,
      weightKg,
      bloodGroup,
      medicalHistory: cleanText(body.medicalHistory, 4000),
      dentalHistory: cleanText(body.dentalHistory, 2000),
      currentTreatments: cleanText(body.currentTreatments, 3000),
      hasAbha,
      isComplete: true,
      healthDataConsentAt: previous.data()?.healthDataConsentAt || now,
      aiConsent,
      aiConsentAt: aiConsent ? now : null,
      documentOcrConsent,
      documentOcrConsentAt: documentOcrConsent ? now : null,
      marketplaceConsent,
      marketplaceConsentAt: marketplaceConsent ? now : null,
      updatedAt: now,
      createdAt: previous.data()?.createdAt || now,
    };
    await ref.set(profile, { merge: true });
    if (!aiConsent) await db.collection('ai_insights').doc(user.id).delete();
    return NextResponse.json({ profile: { ...profile } });
  } catch (error) {
    console.error('Profile save failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Could not save your profile. Please try again.' }, { status: 500 });
  }
}
