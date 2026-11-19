import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ recordId: string }> }) {
  const { user, response } = await requireUser(request);
  if (response || !user) return response;
  const { recordId } = await context.params;
  if (!/^[A-Za-z0-9]{20}$/.test(recordId)) return NextResponse.json({ error: 'Invalid record.' }, { status: 400 });
  try {
    const { getFirebaseAdminDb } = await import('@/lib/firebaseAdmin');
    const db = getFirebaseAdminDb();
    const recordSnapshot = await db.collection('health_records').doc(recordId).get();
    const record = recordSnapshot.data();
    if (!recordSnapshot.exists || record?.storage_provider !== 'supabase' || typeof record.file_path !== 'string' || !/^records\/[a-f0-9-]{36}$/.test(record.file_path)) return NextResponse.json({ error: 'File not found.' }, { status: 404 });

    const grantId = request.nextUrl.searchParams.get('grantId');
    let actorIsOwner = record.user_id === user.id;
    let authorizedGrantId = '';
    let doctorId: string | undefined;
    if (!actorIsOwner && grantId && /^[A-Za-z0-9]{20}$/.test(grantId)) {
      const doctorSnapshot = await db.collection('doctor_profiles').doc(user.id).get();
      const grantSnapshot = await db.collection('access_grants').doc(grantId).get();
      const grant = grantSnapshot.data();
      if (doctorSnapshot.data()?.verificationStatus === 'verified' && grant?.doctor_uid === user.id && grant.patient_uid === record.user_id && grant.status === 'active' && Date.parse(grant.expiresAt) > Date.now() && Array.isArray(grant.scopes) && grant.scopes.includes('records')) {
        actorIsOwner = true;
        authorizedGrantId = grantId;
        doctorId = String(doctorSnapshot.data()?.doctorId || '');
        await db.collection('access_audit').add({ event: 'patient_record_downloaded', patient_uid: record.user_id, doctor_uid: user.id, doctorId, grant_id: grantId, record_id: recordId, actor_uid: user.id, createdAt: new Date().toISOString() });
      }
    }
    if (!actorIsOwner) return NextResponse.json({ error: 'You do not have permission to open this file.' }, { status: 403 });
    const { getSupabaseS3 } = await import('@/lib/supabaseStorage');
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { client, bucketName } = getSupabaseS3();
    const file = await client.send(new GetObjectCommand({ Bucket: bucketName, Key: record.file_path }));
    if (!file.Body) return NextResponse.json({ error: 'File not found.' }, { status: 404 });
    const bytes = await file.Body.transformToByteArray();
    if (authorizedGrantId) {
      const finalGrant = await db.collection('access_grants').doc(authorizedGrantId).get();
      const grant = finalGrant.data();
      if (grant?.doctor_uid !== user.id || grant.patient_uid !== record.user_id || grant.status !== 'active' || Date.parse(grant.expiresAt) <= Date.now()) return NextResponse.json({ error: 'Patient access was revoked or expired.' }, { status: 403 });
    }
    const fileName = String(record.file_name || 'health-record').replace(/[^\x20-\x7E]/g, '_').replace(/[\r\n"\\/]/g, '_').slice(0, 120);
    const contentType = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(String(record.content_type)) ? String(record.content_type) : 'application/octet-stream';
    const body = new Uint8Array(bytes.byteLength);
    body.set(bytes);
    return new NextResponse(body.buffer, { headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    console.error('Health record download failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Could not open this file.' }, { status: 500 });
  }
}
