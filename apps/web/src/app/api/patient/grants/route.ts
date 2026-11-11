import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { getFirebaseAdminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allowedScopes = new Set(['profile', 'history', 'records']);

export async function GET(request: NextRequest) {
  const { user, response } = await requireUser(request);
  if (response || !user) return response;
  try {
    const result = await getFirebaseAdminDb().collection('access_grants').where('patient_uid', '==', user.id).get();
    return NextResponse.json({ grants: result.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
  } catch { return NextResponse.json({ error: 'Could not load sharing permissions.' }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser(request);
  if (response || !user) return response;
  try {
    const body = await request.json();
    const doctorId = typeof body.doctorId === 'string' ? body.doctorId.trim().toUpperCase() : '';
    const requestedScopes = Array.isArray(body.scopes) ? body.scopes.filter((scope: unknown): scope is string => typeof scope === 'string' && allowedScopes.has(scope)) : [];
    const hours = Number(body.hours);
    if (!doctorId || requestedScopes.length === 0 || !Number.isInteger(hours) || hours < 1 || hours > 168 || body.confirmed !== true) {
      return NextResponse.json({ error: 'Choose a doctor, information to share, and an access duration of 1 to 168 hours.' }, { status: 400 });
    }

    const db = getFirebaseAdminDb();
    const doctorQuery = await db.collection('doctor_profiles').where('doctorId', '==', doctorId).limit(1).get();
    if (doctorQuery.empty) return NextResponse.json({ error: 'That Zymore doctor ID was not found.' }, { status: 404 });
    const doctorDoc = doctorQuery.docs[0];
    const doctor = doctorDoc.data();
    if (doctor.verificationStatus !== 'verified') return NextResponse.json({ error: 'This doctor is not verified yet, so health information cannot be shared.' }, { status: 403 });
    const patientProfile = await db.collection('user_profiles').doc(user.id).get();
    if (!patientProfile.data()?.isComplete) return NextResponse.json({ error: 'Complete your health profile before sharing information.' }, { status: 409 });
    const now = Date.now();
    const expiresAt = new Date(now + hours * 60 * 60 * 1000).toISOString();
    const ref = db.collection('access_grants').doc();
    const grant = {
      patient_uid: user.id,
      doctor_uid: doctorDoc.id,
      doctorId,
      doctorName: String(doctor.fullName || 'Verified doctor'),
      scopes: [...new Set(requestedScopes)],
      status: 'active',
      createdAt: new Date(now).toISOString(),
      expiresAt,
      createdBy: 'patient',
    };
    const batch = db.batch();
    batch.create(ref, grant);
    batch.create(db.collection('access_audit').doc(), { event: 'grant_created', patient_uid: user.id, doctor_uid: doctorDoc.id, doctorId, grant_id: ref.id, scopes: grant.scopes, expiresAt, actor_uid: user.id, createdAt: new Date().toISOString() });
    await batch.commit();
    return NextResponse.json({ grant: { id: ref.id, ...grant } }, { status: 201 });
  } catch (error) {
    console.error('Access grant creation failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Could not create this sharing permission.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { user, response } = await requireUser(request);
  if (response || !user) return response;
  try {
    const { grantId } = await request.json();
    if (typeof grantId !== 'string' || !/^[A-Za-z0-9]{20}$/.test(grantId)) return NextResponse.json({ error: 'Invalid sharing permission.' }, { status: 400 });
    const db = getFirebaseAdminDb();
    const ref = db.collection('access_grants').doc(grantId);
    const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data()?.patient_uid !== user.id) return NextResponse.json({ error: 'Sharing permission not found.' }, { status: 404 });
    if (snapshot.data()?.status === 'active') {
      const now = new Date().toISOString();
      const batch = db.batch();
      batch.update(ref, { status: 'revoked', revokedAt: now, revokedBy: user.id });
      batch.create(db.collection('access_audit').doc(), { event: 'grant_revoked', patient_uid: user.id, doctor_uid: snapshot.data()?.doctor_uid, doctorId: snapshot.data()?.doctorId, grant_id: grantId, actor_uid: user.id, createdAt: now });
      await batch.commit();
    }
    return NextResponse.json({ revoked: true });
  } catch (error) {
    console.error('Access grant revocation failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Could not revoke this sharing permission.' }, { status: 500 });
  }
}
