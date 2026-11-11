import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { user, response } = await requireUser(request);
  if (response || !user) return response;
  try {
    const { getFirebaseAdminDb } = await import('@/lib/firebaseAdmin');
    const snapshot = await getFirebaseAdminDb().collection('doctor_profiles').doc(user.id).get();
    return NextResponse.json({ doctor: snapshot.exists ? snapshot.data() : null });
  } catch (error) {
    console.error('Doctor profile read failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Could not load your doctor profile.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser(request);
  if (response || !user) return response;
  try {
    const { getFirebaseAdminDb } = await import('@/lib/firebaseAdmin');
    const db = getFirebaseAdminDb();
    const patient = await db.collection('user_profiles').doc(user.id).get();
    if (patient.exists) return NextResponse.json({ error: 'This account is already set up as a patient. Use a separate account for a doctor profile.' }, { status: 409 });
    const ref = db.collection('doctor_profiles').doc(user.id);
    const existing = await ref.get();
    if (existing.exists) return NextResponse.json({ doctor: existing.data() }, { status: 200 });

    const body = await request.json();
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim().slice(0, 100) : '';
    const specialty = typeof body.specialty === 'string' ? body.specialty.trim().slice(0, 100) : '';
    const registrationNumber = typeof body.registrationNumber === 'string' ? body.registrationNumber.trim().slice(0, 100) : '';
    const registrationCouncil = typeof body.registrationCouncil === 'string' ? body.registrationCouncil.trim().slice(0, 150) : '';
    const hprId = typeof body.hprId === 'string' ? body.hprId.trim().slice(0, 100) : '';
    if (!fullName || !specialty || !registrationNumber || !registrationCouncil) return NextResponse.json({ error: 'Add your name, specialty, registration number, and registering council.' }, { status: 400 });

    const doctor = {
      user_id: user.id,
      doctorId: `ZMD-${randomBytes(6).toString('hex').toUpperCase()}`,
      fullName,
      specialty,
      registrationNumber,
      registrationCouncil,
      hprId,
      verificationStatus: 'pending',
      createdAt: new Date().toISOString(),
    };
    await ref.create(doctor);
    return NextResponse.json({ doctor }, { status: 201 });
  } catch (error) {
    console.error('Doctor profile creation failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Could not create your doctor profile.' }, { status: 500 });
  }
}
