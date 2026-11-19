import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validRecordDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && date <= new Date();
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser(request);
  if (response || !user) return response;
  try {
    const body = await request.json();
    const grantId = typeof body.grantId === 'string' ? body.grantId : '';
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 140) : '';
    const summary = typeof body.summary === 'string' ? body.summary.trim().slice(0, 3000) : '';
    const recordDate = typeof body.recordDate === 'string' ? body.recordDate : '';
    const resourceType = ['Lab result', 'Prescription', 'Visit note', 'Other clinic record'].includes(body.resourceType) ? body.resourceType : 'Visit note';
    if (!/^[A-Za-z0-9]{20}$/.test(grantId) || !title || summary.length < 10 || !validRecordDate(recordDate)) {
      return NextResponse.json({ error: 'Add a valid permission, title, date, and at least 10 characters of clinical note.' }, { status: 400 });
    }

    const { getFirebaseAdminDb } = await import('@/lib/firebaseAdmin');
    const db = getFirebaseAdminDb();
    const doctorSnapshot = await db.collection('doctor_profiles').doc(user.id).get();
    if (doctorSnapshot.data()?.verificationStatus !== 'verified') return NextResponse.json({ error: 'Verified doctor access is required.' }, { status: 403 });
    const grantRef = db.collection('access_grants').doc(grantId);
    const recordRef = db.collection('health_records').doc();
    const auditRef = db.collection('access_audit').doc();
    const now = new Date().toISOString();
    let patientUid = '';
    await db.runTransaction(async transaction => {
      const grantSnapshot = await transaction.get(grantRef);
      const grant = grantSnapshot.data();
      if (!grantSnapshot.exists || grant?.doctor_uid !== user.id || grant.status !== 'active' || Date.parse(grant.expiresAt) <= Date.now() || !Array.isArray(grant.scopes) || !grant.scopes.includes('add_records')) {
        throw new Error('This permission does not allow adding clinic records or has expired.');
      }
      patientUid = String(grant.patient_uid);
      const fhir = {
        resourceType: 'DocumentReference',
        status: 'current',
        type: { text: resourceType },
        subject: { reference: `Patient/${patientUid}` },
        date: now,
        description: title,
        content: [],
        extension: [{ url: 'https://zymore.example/fhir/StructureDefinition/clinician-note', valueString: summary }],
      };
      transaction.create(recordRef, {
        user_id: patientUid,
        source: 'clinic',
        simulated: false,
        created_by: user.id,
        doctor_id: doctorSnapshot.data()?.doctorId,
        resource_type: resourceType,
        title,
        summary,
        record_date: `${recordDate}T12:00:00.000Z`,
        fhir,
        created_at: now,
      });
      transaction.create(auditRef, { event: 'clinic_record_added', patient_uid: patientUid, doctor_uid: user.id, doctorId: doctorSnapshot.data()?.doctorId, grant_id: grantId, record_id: recordRef.id, actor_uid: user.id, createdAt: now });
    });
    return NextResponse.json({ created: true, recordId: recordRef.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('permission does not allow')) return NextResponse.json({ error: message }, { status: 403 });
    console.error('Clinic record creation failed:', message || 'unknown error');
    return NextResponse.json({ error: 'Could not add this clinic record.' }, { status: 500 });
  }
}
