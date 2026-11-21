import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { analyzeHealth, type HealthAnalysis } from '@/lib/gemini';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

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
    const { getFirebaseAdminDb } = await import('@/lib/firebaseAdmin');
    const db = getFirebaseAdminDb();
    const profileSnapshot = await db.collection('user_profiles').doc(user.id).get();
    const profile = profileSnapshot.data();
    if (!profile?.isComplete) return NextResponse.json({ needsOnboarding: true }, { status: 409 });

    const savedRecords = await db.collection('health_records').where('user_id', '==', user.id).get();
    const savedRecordData: Array<Record<string, unknown> & { id: string }> = savedRecords.docs.map(document => ({ id: document.id, ...document.data() }));
    const records = savedRecordData
      .filter(record => record.source === 'user' || record.source === 'clinic' || record.source === 'mock_abdm')
      .map(record => ({
        id: record.id,
        resourceType: String(record.resource_type || 'Document'),
        title: String(record.title || 'Health record'),
        date: String(record.record_date || record.created_at || profile.updatedAt),
        summary: String(record.summary || 'Health record provided by you.'),
        source: String(record.source || 'user'),
        simulated: record.simulated === true,
        fileName: typeof record.file_name === 'string' ? record.file_name : null,
        filePath: typeof record.file_path === 'string' ? record.file_path : null,
        ocrExtraction: record.ocr_extraction && typeof record.ocr_extraction === 'object' ? record.ocr_extraction : null,
        fhir: record.fhir || null,
      })).sort((left, right) => left.id.localeCompare(right.id));

    const clinicalRecords = records.filter(record => record.source !== 'user' || record.summary.trim().length > 0);
    const clinicalInput = {
      selfReported: {
        allergies: profile.allergies || '',
        medicalHistory: profile.medicalHistory || '',
        dentalHistory: profile.dentalHistory || '',
        currentTreatments: profile.currentTreatments || '',
      },
      records: clinicalRecords.map(({ id, resourceType, title, date, summary, source, simulated, fhir }) => ({ id, resourceType, title, date, summary, source, simulated, fhir })),
    };
    const hasClinicalContext = Object.values(clinicalInput.selfReported).some(value => value.trim().length > 0) || clinicalRecords.length > 0;
    const summaryInput = { clinicalInput, allowMarketplace: profile.marketplaceConsent === true };
    const inputHash = createHash('sha256').update(JSON.stringify(summaryInput)).digest('hex');
    const insightRef = db.collection('ai_insights').doc(user.id);
    const insightSnapshot = await insightRef.get();
    let savedInsight = insightSnapshot.data();
    const cacheMatches = savedInsight?.input_hash === inputHash;
    let analysis: HealthAnalysis | null = cacheMatches && profile.aiConsent === true
      ? {
          patient_summary: String(savedInsight?.patient_summary || ''),
          clinical_tags: Array.isArray(savedInsight?.clinical_tags) ? savedInsight.clinical_tags : [],
          marketplace_actions: Array.isArray(savedInsight?.marketplace_actions) ? savedInsight.marketplace_actions : [],
        }
      : null;
    let aiFailed = false;
    let aiPending = false;
    let summaryStale = false;

    if (!cacheMatches && profile.aiConsent === true && hasClinicalContext && process.env.GEMINI_API_KEY) {
      const lockRef = db.collection('ai_summary_locks').doc(user.id);
      try {
        const claim = await db.runTransaction(async transaction => {
          const [freshInsight, lockSnapshot] = await Promise.all([transaction.get(insightRef), transaction.get(lockRef)]);
          if (freshInsight.data()?.input_hash === inputHash) return { state: 'cached' as const, insight: freshInsight.data() };
          const lock = lockSnapshot.data();
          if (lock?.input_hash === inputHash && Number(lock.lock_until) > Date.now()) return { state: 'pending' as const };
          transaction.set(lockRef, { input_hash: inputHash, lock_until: Date.now() + 90_000 });
          return { state: 'claimed' as const };
        });
        if (claim.state === 'cached' && claim.insight) {
          const cachedInsight = claim.insight;
          savedInsight = cachedInsight;
          analysis = { patient_summary: String(cachedInsight.patient_summary || ''), clinical_tags: Array.isArray(cachedInsight.clinical_tags) ? cachedInsight.clinical_tags : [], marketplace_actions: Array.isArray(cachedInsight.marketplace_actions) ? cachedInsight.marketplace_actions : [] };
        } else if (claim.state === 'pending') {
          aiPending = true;
        } else {
          analysis = await analyzeHealth({
            ...clinicalInput,
            note: 'Records marked simulated are demo-only FHIR data and must be described as simulated, not as verified patient history.',
          }, profile.marketplaceConsent === true && records.some(record => record.source === 'clinic' && !record.simulated));
          if (analysis) {
            const newInsight = {
              user_id: user.id,
              ...analysis,
              input_hash: inputHash,
              generated_at: new Date().toISOString(),
              is_demo: records.some(record => record.simulated),
            };
            await db.runTransaction(async transaction => {
              const currentLock = await transaction.get(lockRef);
              if (currentLock.data()?.input_hash === inputHash) {
                transaction.set(insightRef, newInsight);
                transaction.delete(lockRef);
              }
            });
            savedInsight = newInsight;
          } else {
            await db.runTransaction(async transaction => {
              const currentLock = await transaction.get(lockRef);
              if (currentLock.data()?.input_hash === inputHash) transaction.delete(lockRef);
            });
          }
        }
      } catch (error) {
        aiFailed = true;
        await db.runTransaction(async transaction => {
          const currentLock = await transaction.get(lockRef);
          if (currentLock.data()?.input_hash === inputHash) transaction.delete(lockRef);
        }).catch(() => undefined);
        console.error('Gemini health summary failed:', error instanceof Error ? error.message : 'unknown error');
      }
    }

    if (!analysis && savedInsight?.patient_summary && profile.aiConsent === true && hasClinicalContext) {
      analysis = {
        patient_summary: String(savedInsight.patient_summary),
        clinical_tags: Array.isArray(savedInsight.clinical_tags) ? savedInsight.clinical_tags : [],
        marketplace_actions: Array.isArray(savedInsight.marketplace_actions) ? savedInsight.marketplace_actions : [],
      };
      summaryStale = !cacheMatches;
    }

    const profileRecords = [
      ['Known allergies', profile.allergies],
      ['Emergency contact', profile.emergencyContact],
      ['Past health issues', profile.medicalHistory],
      ['Dental history', profile.dentalHistory],
      ['Current treatment', profile.currentTreatments],
    ].filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0)
      .map(([title, summary]) => ({ resourceType: 'SelfReported', title, date: String(profile.updatedAt), summary, source: 'user', simulated: false, id: `profile-${title}` }));

    return NextResponse.json({
      simulated: false,
      profile: {
        displayName: profile.displayName,
        age: calculateAge(profile.dateOfBirth),
        heightCm: profile.heightCm,
        weightKg: profile.weightKg,
        bloodGroup: profile.bloodGroup,
        allergies: profile.allergies || '',
        emergencyContact: profile.emergencyContact || '',
        hasAbha: profile.hasAbha,
        aiConsent: profile.aiConsent === true,
        documentOcrConsent: profile.documentOcrConsent === true,
      },
      summary: analysis?.patient_summary || null,
      clinical_tags: analysis?.clinical_tags || [],
      marketplace_actions: profile.marketplaceConsent === true ? analysis?.marketplace_actions || [] : [],
      summaryGeneratedAt: savedInsight?.generated_at || null,
      summaryStale,
      aiPending,
      isDemo: records.some(record => record.simulated),
      hasClinicalContext,
      aiConfigured: Boolean(process.env.GEMINI_API_KEY),
      aiFailed,
      records: [...profileRecords, ...records.map(({ fhir: _fhir, filePath: _filePath, ...record }) => record)],
    });
  } catch (error) {
    console.error('Dashboard API failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Could not load your dashboard. Please try again.' }, { status: 500 });
  }
}
