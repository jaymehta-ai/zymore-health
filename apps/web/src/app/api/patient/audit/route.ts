import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { user, response } = await requireUser(request);
  if (response || !user) return response;
  try {
    const { getFirebaseAdminDb } = await import('@/lib/firebaseAdmin');
    const snapshot = await getFirebaseAdminDb().collection('access_audit').where('patient_uid', '==', user.id).limit(100).get();
    const events = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }) as Record<string, unknown>)
      .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
    return NextResponse.json({ events });
  } catch (error) {
    console.error('Patient access log read failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Could not load your access history.' }, { status: 500 });
  }
}
