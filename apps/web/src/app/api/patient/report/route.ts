import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser(request);
  if (response || !user) return response;
  try {
    const { getFirebaseAdminDb } = await import('@/lib/firebaseAdmin');
    const body = await request.json();
    const auditId = typeof body.auditId === 'string' ? body.auditId : '';
    const details = typeof body.details === 'string' ? body.details.trim().slice(0, 3000) : '';
    if (!/^[A-Za-z0-9]{20}$/.test(auditId) || details.length < 10) return NextResponse.json({ error: 'Choose an access event and add at least 10 characters about your concern.' }, { status: 400 });
    const db = getFirebaseAdminDb();
    const eventSnapshot = await db.collection('access_audit').doc(auditId).get();
    if (!eventSnapshot.exists || eventSnapshot.data()?.patient_uid !== user.id) return NextResponse.json({ error: 'That access event was not found in your history.' }, { status: 404 });
    const event = eventSnapshot.data()!;
    const report = await db.collection('access_reports').add({
      patient_uid: user.id,
      doctor_uid: event.doctor_uid || null,
      doctorId: event.doctorId || null,
      audit_event_id: auditId,
      details,
      status: 'needs_review',
      createdAt: new Date().toISOString(),
    });
    await db.collection('access_audit').add({ event: 'access_concern_reported', patient_uid: user.id, doctor_uid: event.doctor_uid || null, doctorId: event.doctorId || null, audit_event_id: auditId, report_id: report.id, actor_uid: user.id, createdAt: new Date().toISOString() });
    return NextResponse.json({ submitted: true, message: 'Your report was recorded for review.' }, { status: 201 });
  } catch (error) {
    console.error('Access concern report failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Could not submit your report.' }, { status: 500 });
  }
}
