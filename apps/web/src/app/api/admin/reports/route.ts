import { NextRequest, NextResponse } from 'next/server';
import { isDoctorReviewStaff } from '@/lib/adminAccess';
import { requireUser } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { user, response } = await requireUser(request);
  if (response || !user) return response;
  if (!isDoctorReviewStaff(user.id)) return NextResponse.json({ error: 'Staff review access is not enabled for this account.' }, { status: 403 });
  try {
    const { getFirebaseAdminDb } = await import('@/lib/firebaseAdmin');
    const snapshot = await getFirebaseAdminDb().collection('access_reports').where('status', 'in', ['needs_review', 'under_review']).limit(100).get();
    const reports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ reports });
  } catch (error) {
    console.error('Access report queue failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Could not load access reports.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser(request);
  if (response || !user) return response;
  if (!isDoctorReviewStaff(user.id)) return NextResponse.json({ error: 'Staff review access is not enabled for this account.' }, { status: 403 });
  try {
    const body = await request.json();
    const reportId = typeof body.reportId === 'string' ? body.reportId : '';
    const status = body.status;
    const reviewNote = typeof body.reviewNote === 'string' ? body.reviewNote.trim().slice(0, 1500) : '';
    if (!/^[A-Za-z0-9]{20}$/.test(reportId) || !['under_review', 'closed', 'escalated'].includes(status) || reviewNote.length < 5) return NextResponse.json({ error: 'Choose a review status and add a short staff note.' }, { status: 400 });
    const { getFirebaseAdminDb } = await import('@/lib/firebaseAdmin');
    const db = getFirebaseAdminDb();
    const ref = db.collection('access_reports').doc(reportId);
    const snapshot = await ref.get();
    if (!snapshot.exists || !['needs_review', 'under_review'].includes(String(snapshot.data()?.status))) return NextResponse.json({ error: 'This report is no longer awaiting review.' }, { status: 409 });
    const now = new Date().toISOString();
    await ref.update({ status, reviewNote, reviewedAt: now, reviewerUid: user.id });
    await db.collection('access_audit').add({ event: 'access_report_reviewed', patient_uid: snapshot.data()?.patient_uid, doctor_uid: snapshot.data()?.doctor_uid, doctorId: snapshot.data()?.doctorId, report_id: reportId, review_status: status, actor_uid: user.id, createdAt: now });
    return NextResponse.json({ reviewed: true, status });
  } catch (error) {
    console.error('Access report update failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Could not update this report.' }, { status: 500 });
  }
}
