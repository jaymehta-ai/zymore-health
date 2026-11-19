import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { extractHealthDocument } from '@/lib/gemini';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const allowedRecordTypes = new Set(['Lab result', 'Prescription', 'Discharge summary', 'Imaging', 'Vaccination', 'Other document']);

function validFileSignature(type: string, bytes: Uint8Array) {
  if (type === 'application/pdf') return new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';
  if (type === 'image/png') return bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10';
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/webp') return new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
  return false;
}

function validRecordDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && date <= new Date();
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser(request);
  if (response || !user) return response;
  let storagePath = '';
  try {
    const form = await request.formData();
    const file = form.get('file');
    const title = String(form.get('title') || '').trim().slice(0, 140);
    const summary = String(form.get('summary') || '').trim().slice(0, 3000);
    const requestedType = String(form.get('resourceType') || 'Other document');
    const resourceType = allowedRecordTypes.has(requestedType) ? requestedType : 'Other document';
    const recordDate = String(form.get('recordDate') || '');
    if (!(file instanceof File) || !title || !validRecordDate(recordDate)) return NextResponse.json({ error: 'Add a title, valid date, and PDF or image file.' }, { status: 400 });
    if (!allowedTypes.has(file.type) || file.size < 1 || file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'Choose a PDF, JPEG, PNG, or WebP file up to 4 MB.' }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!validFileSignature(file.type, bytes)) return NextResponse.json({ error: 'The file contents do not match the selected document type.' }, { status: 400 });

    const { getFirebaseAdminDb } = await import('@/lib/firebaseAdmin');
    const { getSupabaseS3 } = await import('@/lib/supabaseStorage');
    const { PutObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const db = getFirebaseAdminDb();
    const profile = await db.collection('user_profiles').doc(user.id).get();
    const profileData = profile.data();
    if (!profileData?.isComplete) return NextResponse.json({ error: 'Complete your health profile first.' }, { status: 409 });
    const documentOcrConsent = profileData.documentOcrConsent === true;
    const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);
    if (!summary && (!documentOcrConsent || !geminiConfigured)) return NextResponse.json({ error: 'Add a short note, or enable document OCR consent and configure Gemini so the file can be read.' }, { status: 400 });

    const { client: storage, bucketName } = getSupabaseS3();
    storagePath = `records/${randomUUID()}`;
    await storage.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: storagePath,
      Body: Buffer.from(bytes),
      ContentType: file.type,
      CacheControl: 'no-store',
    }));

    const recordRef = db.collection('health_records').doc();
    const createdAt = new Date().toISOString();
    const ocrStatus = documentOcrConsent && geminiConfigured ? 'processing' : documentOcrConsent ? 'unavailable' : 'not_requested';
    try {
      await recordRef.create({
        user_id: user.id,
        source: 'user',
        simulated: false,
        storage_provider: 'supabase',
        resource_type: resourceType,
        title,
        summary,
        record_date: `${recordDate}T12:00:00.000Z`,
        file_name: file.name.slice(0, 180),
        file_path: storagePath,
        content_type: file.type,
        file_size: file.size,
        ocr_extraction: { status: ocrStatus },
        created_at: createdAt,
      });
    } catch (error) {
      await storage.send(new DeleteObjectCommand({ Bucket: bucketName, Key: storagePath })).catch(() => undefined);
      throw error;
    }

    let finalOcrStatus = ocrStatus;
    if (documentOcrConsent && geminiConfigured) {
      try {
        const extraction = await extractHealthDocument(bytes, file.type);
        await recordRef.update({ ocr_extraction: { status: 'needs_review', ...extraction, generated_at: new Date().toISOString() } });
        finalOcrStatus = 'needs_review';
      } catch (error) {
        finalOcrStatus = 'failed';
        await recordRef.update({ ocr_extraction: { status: 'failed', generated_at: new Date().toISOString() } });
        console.error('Gemini document OCR failed:', error instanceof Error ? error.message : 'unknown error');
      }
    }
    return NextResponse.json({ record: { id: recordRef.id, title, summary, resourceType, date: `${recordDate}T12:00:00.000Z`, fileName: file.name, source: 'user', ocrStatus: finalOcrStatus } }, { status: 201 });
  } catch (error) {
    console.error('Health record upload failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Could not save the record. Check the Supabase Storage configuration and try again.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const { user, response } = await requireUser(request);
  if (response || !user) return response;
  try {
    const body = await request.json();
    const recordId = typeof body.recordId === 'string' ? body.recordId : '';
    const confirmedSummary = typeof body.confirmedSummary === 'string' ? body.confirmedSummary.trim().slice(0, 3000) : '';
    const confirmedDate = typeof body.recordDate === 'string' ? body.recordDate : '';
    if (!/^[A-Za-z0-9]{20}$/.test(recordId) || confirmedSummary.length < 10) return NextResponse.json({ error: 'Review the extracted text and keep at least 10 characters.' }, { status: 400 });
    if (!validRecordDate(confirmedDate)) return NextResponse.json({ error: 'Choose a valid date from the document.' }, { status: 400 });
    const { getFirebaseAdminDb } = await import('@/lib/firebaseAdmin');
    const db = getFirebaseAdminDb();
    const ref = db.collection('health_records').doc(recordId);
    const snapshot = await ref.get();
    const record = snapshot.data();
    if (!snapshot.exists || record?.user_id !== user.id || record.source !== 'user') return NextResponse.json({ error: 'Record not found.' }, { status: 404 });
    const now = new Date().toISOString();
    if (record.ocr_extraction?.status === 'needs_review') {
      await ref.update({ summary: confirmedSummary, record_date: `${confirmedDate}T12:00:00.000Z`, ocr_extraction: { ...record.ocr_extraction, status: 'confirmed', reviewed_at: now } });
      return NextResponse.json({ confirmed: true });
    }
    await ref.update({ summary: confirmedSummary, record_date: `${confirmedDate}T12:00:00.000Z`, note_updated_at: now });
    return NextResponse.json({ saved: true });
  } catch (error) {
    console.error('OCR review save failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Could not save your OCR review.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { user, response } = await requireUser(request);
  if (response || !user) return response;
  try {
    const { recordId } = await request.json();
    if (typeof recordId !== 'string' || !/^[A-Za-z0-9]{20}$/.test(recordId)) return NextResponse.json({ error: 'Invalid record.' }, { status: 400 });
    const { getFirebaseAdminDb } = await import('@/lib/firebaseAdmin');
    const db = getFirebaseAdminDb();
    const recordRef = db.collection('health_records').doc(recordId);
    const snapshot = await recordRef.get();
    if (!snapshot.exists || snapshot.data()?.user_id !== user.id) return NextResponse.json({ error: 'Record not found.' }, { status: 404 });
    const record = snapshot.data();
    if (record?.storage_provider === 'supabase' && typeof record.file_path === 'string' && /^records\/[a-f0-9-]{36}$/.test(record.file_path)) {
      const { getSupabaseS3 } = await import('@/lib/supabaseStorage');
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      const { client, bucketName } = getSupabaseS3();
      await client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: record.file_path }));
    }
    await recordRef.delete();
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('Health record deletion failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Could not remove this record.' }, { status: 500 });
  }
}
