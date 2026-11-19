import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { isDoctorReviewStaff } from '@/lib/adminAccess';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { user, response } = await requireUser(request);
  if (response || !user) return response;
  if (!isDoctorReviewStaff(user.id)) return NextResponse.json({ error: 'Doctor review access is not enabled for this account.' }, { status: 403 });
  try {
    const { getFirebaseAdminDb } = await import('@/lib/firebaseAdmin');
    const snapshot = await getFirebaseAdminDb().collection('doctor_profiles').where('verificationStatus', '==', 'pending').get();
    return NextResponse.json({ doctors: snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })) });
  } catch (error) {
    console.error('Doctor review list failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Could not load doctor applications.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser(request);
  if (response || !user) return response;
  if (!isDoctorReviewStaff(user.id)) return NextResponse.json({ error: 'Doctor review access is not enabled for this account.' }, { status: 403 });
  try {
    const body = await request.json();
    const doctorUid = typeof body.doctorUid === 'string' ? body.doctorUid.slice(0, 128) : '';
    const decision = body.decision;
    if (!/^[A-Za-z0-9:_-]{1,128}$/.test(doctorUid) || doctorUid === user.id || !['verified', 'rejected'].includes(decision)) return NextResponse.json({ error: 'Invalid doctor review decision.' }, { status: 400 });
    const { getFirebaseAdminDb } = await import('@/lib/firebaseAdmin');
    const db = getFirebaseAdminDb();
    const ref = db.collection('doctor_profiles').doc(doctorUid);
    const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data()?.verificationStatus !== 'pending') return NextResponse.json({ error: 'This application is no longer pending.' }, { status: 409 });
    const now = new Date().toISOString();
    await ref.update({ verificationStatus: decision, reviewedAt: now, reviewerUid: user.id });
    await db.collection('access_audit').add({ event: `doctor_${decision}`, doctor_uid: doctorUid, actor_uid: user.id, createdAt: now });
    return NextResponse.json({ reviewed: true, decision });
  } catch (error) {
    console.error('Doctor review update failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Could not save this review.' }, { status: 500 });
  }
}
