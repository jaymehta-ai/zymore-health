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
    const [profile, recordSnapshots, insight] = await Promise.all([
      db.collection('user_profiles').doc(user.id).get(),
      db.collection('health_records').where('user_id', '==', user.id).get(),
      db.collection('ai_insights').doc(user.id).get(),
    ]);
    const records = recordSnapshots.docs.map(doc => {
      const { file_path: _filePath, ...record } = doc.data();
      return { id: doc.id, ...record };
    });
    const payload = {
      exportedAt: new Date().toISOString(),
      profile: profile.data() || null,
      healthRecords: records,
      aiInsight: insight.data() || null,
      note: 'Files are not embedded in this JSON export. Download each attached file from the authenticated dashboard before deleting your account.',
    };
    return new NextResponse(JSON.stringify(payload, null, 2), { headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="zymore-health-export.json"',
      'Cache-Control': 'private, no-store',
    } });
  } catch (error) {
    console.error('Patient data export failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Could not export your health data.' }, { status: 500 });
  }
}
