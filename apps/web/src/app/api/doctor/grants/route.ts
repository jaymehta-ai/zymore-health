import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { user, response } = await requireUser(request);
  if (response || !user) return response;
  try {
    const { getFirebaseAdminDb } = await import('@/lib/firebaseAdmin');
    const db = getFirebaseAdminDb();
    const doctor = await db.collection('doctor_profiles').doc(user.id).get();
    if (!doctor.exists) return NextResponse.json({ error: 'Doctor profile not found.', needsDoctorProfile: true }, { status: 404 });
    if (doctor.data()?.verificationStatus !== 'verified') return NextResponse.json({ doctor: doctor.data(), grants: [], pendingVerification: true });
    const snapshot = await db.collection('access_grants').where('doctor_uid', '==', user.id).get();
    const now = Date.now();
    const grants = snapshot.docs.map(doc => {
      const grant = doc.data();
      return { id: doc.id, doctorName: grant.doctorName, scopes: grant.scopes, expiresAt: grant.expiresAt, createdAt: grant.createdAt, status: grant.status };
    }).filter(grant => grant.status === 'active' && Date.parse(grant.expiresAt) > now);
    await db.collection('access_audit').add({ event: 'doctor_grant_list_viewed', doctor_uid: user.id, doctorId: doctor.data()?.doctorId, actor_uid: user.id, createdAt: new Date().toISOString() });
    return NextResponse.json({ doctor: doctor.data(), grants });
  } catch (error) {
    console.error('Doctor access list failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Could not load patient permissions.' }, { status: 500 });
  }
}
