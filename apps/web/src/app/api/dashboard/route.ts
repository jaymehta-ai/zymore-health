import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { getFirebaseAdminDb } from '@/lib/firebaseAdmin';
import { analyzeHealth, type HealthAnalysis } from '@/lib/gemini';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function calculateAge(dateOfBirth: string) {
  const birth = new Date(`${dateOfBirth}T00:00:00.000Z`);
  const today = new Date();
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  if (today.getUTCMonth() < birth.getUTCMonth() || (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

export async function GET(request: NextRequest) {
  const { user, response } = await requireUser(request);
  if (response || !user) return response;

  try {
    const db = getFirebaseAdminDb();
    const profileSnapshot = await db.collection('user_profiles').doc(user.id).get();
    const profile = profileSnapshot.data();
    if (!profile?.isComplete) return NextResponse.json({ needsOnboarding: true }, { status: 409 });

    const savedRecords = await db.collection('health_records').where('user_id', '==', user.id).get();
    const records = savedRecords.docs
      .map(document => document.data())
      .filter(record => record.source === 'user' && record.is_demo !== true)
      .map(record => ({
        resourceType: String(record.resource_type || 'Document'),
        title: String(record.title || 'Health record'),
        date: String(record.record_date || record.created_at || profile.updatedAt),
        summary: String(record.summary || 'Health record provided by you.'),
        fhir: record.fhir || null,
      }));

    const reportedHistory = [profile.medicalHistory, profile.dentalHistory, profile.currentTreatments].some(value => typeof value === 'string' && value.trim().length > 0);
    const hasClinicalContext = reportedHistory || records.length > 0;
    let analysis: HealthAnalysis | null = null;
    let aiFailed = false;
    if (profile.aiConsent === true && hasClinicalContext) {
      const context = {
        selfReported: {
          medicalHistory: profile.medicalHistory || '',
          dentalHistory: profile.dentalHistory || '',
          currentTreatments: profile.currentTreatments || '',
        },
        documentedRecords: records.map(({ fhir, title, date, summary, resourceType }) => ({ resourceType, title, date, summary, fhir })),
      };
      try {
        analysis = await analyzeHealth(context, profile.marketplaceConsent === true && records.length > 0);
      } catch (error) {
        aiFailed = true;
        console.error('Gemini health summary failed:', error instanceof Error ? error.message : 'unknown error');
      }
      if (analysis) {
        await db.collection('ai_insights').doc(user.id).set({
          user_id: user.id,
          patient_summary: analysis.patient_summary,
          clinical_tags: analysis.clinical_tags,
          marketplace_actions: analysis.marketplace_actions,
          generated_at: new Date().toISOString(),
          is_demo: false,
        }, { merge: true });
      }
    }

    const profileRecords = [
      ['Past health issues', profile.medicalHistory],
      ['Dental history', profile.dentalHistory],
      ['Current treatment', profile.currentTreatments],
    ].filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0)
      .map(([title, summary]) => ({ resourceType: 'SelfReported', title, date: String(profile.updatedAt), summary }));

    return NextResponse.json({
      simulated: false,
      profile: {
        displayName: profile.displayName,
        age: calculateAge(profile.dateOfBirth),
        heightCm: profile.heightCm,
        weightKg: profile.weightKg,
        bloodGroup: profile.bloodGroup,
        hasAbha: profile.hasAbha,
        aiConsent: profile.aiConsent === true,
      },
      summary: analysis?.patient_summary || null,
      clinical_tags: analysis?.clinical_tags || [],
      marketplace_actions: analysis?.marketplace_actions || [],
      isDemo: false,
      hasClinicalContext,
      aiConfigured: Boolean(process.env.GEMINI_API_KEY),
      aiFailed,
      records: [...profileRecords, ...records.map(({ fhir: _fhir, ...record }) => record)],
    });
  } catch (error) {
    console.error('Dashboard API failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Could not load your dashboard. Please try again.' }, { status: 500 });
  }
}
