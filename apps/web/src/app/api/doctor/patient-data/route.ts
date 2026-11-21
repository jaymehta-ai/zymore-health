import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function ageFrom(dateOfBirth: string) {
  const birth = new Date(`${dateOfBirth}T00:00:00.000Z`);
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  if (now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

export async function GET(request: NextRequest) {
  const { user, response } = await requireUser(request);
  if (response || !user) return response;
  const grantId = request.nextUrl.searchParams.get('grantId') || '';
  if (!/^[A-Za-z0-9]{20}$/.test(grantId)) return NextResponse.json({ error: 'Invalid patient permission.' }, { status: 400 });

  try {
    const { getFirebaseAdminDb } = await import('@/lib/firebaseAdmin');
    const db = getFirebaseAdminDb();
    const doctor = await db.collection('doctor_profiles').doc(user.id).get();
    if (!doctor.exists || doctor.data()?.verificationStatus !== 'verified') return NextResponse.json({ error: 'A verified doctor profile is required.' }, { status: 403 });
    const grantRef = db.collection('access_grants').doc(grantId);
    const grantSnapshot = await grantRef.get();
    const grant = grantSnapshot.data();
    if (!grantSnapshot.exists || grant?.doctor_uid !== user.id || grant.status !== 'active' || Date.parse(grant.expiresAt) <= Date.now()) {
      return NextResponse.json({ error: 'This patient permission is unavailable or has expired.' }, { status: 403 });
    }

    const patientSnapshot = await db.collection('user_profiles').doc(grant.patient_uid).get();
    const profile = patientSnapshot.data();
    if (!profile) return NextResponse.json({ error: 'Patient profile is unavailable.' }, { status: 404 });
    const scopes = new Set<string>(grant.scopes || []);
    const patient: Record<string, unknown> = {};
    if (scopes.has('profile')) {
      patient.profile = {
        displayName: profile.displayName,
        age: ageFrom(profile.dateOfBirth),
        heightCm: profile.heightCm,
        weightKg: profile.weightKg,
        bloodGroup: profile.bloodGroup,
        allergies: profile.allergies || 'None reported',
        emergencyContact: profile.emergencyContact || 'Not provided',
      };
    }
    if (scopes.has('history')) {
      patient.history = {
        allergies: profile.allergies || 'None reported',
        medicalHistory: profile.medicalHistory || '',
        dentalHistory: profile.dentalHistory || '',
        currentTreatments: profile.currentTreatments || '',
        emergencyContact: profile.emergencyContact || 'Not provided',
      };
    }
    if (scopes.has('profile') || scopes.has('history')) {
      patient.allergies = profile.allergies || '';
      patient.emergencyContact = profile.emergencyContact || '';
    }
    if (scopes.has('records')) {
      const records = await db.collection('health_records').where('user_id', '==', grant.patient_uid).get();
      const storedRecords: Array<Record<string, unknown> & { id: string }> = records.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      patient.records = storedRecords.filter(record => ['user', 'clinic', 'mock_abdm'].includes(String(record.source))).map(record => ({ id: record.id, resource_type: record.resource_type, title: record.title, record_date: record.record_date, summary: record.summary, file_name: record.file_name || null, simulated: record.simulated === true, source: record.source, fhir: record.fhir || null }));
    }

    await db.collection('access_audit').add({ event: 'patient_data_viewed', patient_uid: grant.patient_uid, doctor_uid: user.id, doctorId: doctor.data()?.doctorId, grant_id: grantId, scopes: [...scopes], actor_uid: user.id, createdAt: new Date().toISOString() });
    const finalGrant = await grantRef.get();
    if (finalGrant.data()?.status !== 'active' || Date.parse(finalGrant.data()?.expiresAt || '') <= Date.now()) return NextResponse.json({ error: 'Access was revoked or expired.' }, { status: 403 });
    return NextResponse.json({ patient, grant: { id: grantId, scopes: [...scopes], expiresAt: grant.expiresAt } });
  } catch (error) {
    console.error('Authorized patient data read failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Could not retrieve shared patient information.' }, { status: 500 });
  }
}
