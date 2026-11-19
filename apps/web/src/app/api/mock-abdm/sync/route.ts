import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { mockABDMFetch } from '@/lib/mockAbdm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser(request);
  if (response || !user) return response;
  try {
    const { getFirebaseAdminDb } = await import('@/lib/firebaseAdmin');
    const db = getFirebaseAdminDb();
    const profile = await db.collection('user_profiles').doc(user.id).get();
    if (!profile.data()?.isComplete) return NextResponse.json({ error: 'Complete your health profile first.' }, { status: 409 });

    const bundle = mockABDMFetch(user.id);
    const resources = bundle.entry.map(entry => entry.resource).filter(resource => ['Encounter', 'Observation', 'DiagnosticReport', 'MedicationRequest'].includes(resource.resourceType));
    const batch = db.batch();
    for (const resource of resources) {
      const reference = db.collection('health_records').doc(`${user.id}_mock-${resource.id}`);
      const date = resource.effectiveDateTime || resource.authoredOn || resource.period?.start || bundle.timestamp;
      const code = resource.code?.text || resource.code?.coding?.[0]?.display || resource.medicationCodeableConcept?.text || resource.resourceType;
      let summary = 'Synthetic ABDM demonstration record.';
      if (resource.resourceType === 'Observation') summary = `${code}: ${resource.valueQuantity?.value ?? 'No value'} ${resource.valueQuantity?.unit ?? ''}${resource.interpretation?.[0]?.coding?.[0]?.display ? ` (${resource.interpretation[0].coding[0].display})` : ''}. Simulated data, not a real test result.`;
      if (resource.resourceType === 'MedicationRequest') summary = `${code}. Simulated prescription only; not a real prescription.`;
      if (resource.resourceType === 'Encounter') summary = `${resource.serviceProvider?.display || 'Demo clinic'} visit. Simulated encounter.`;
      if (resource.resourceType === 'DiagnosticReport') summary = `${code}. Simulated report only; not a real test result.`;
      batch.set(reference, {
        user_id: user.id,
        source: 'mock_abdm',
        simulated: true,
        is_demo: true,
        fhir_bundle_id: bundle.id,
        resource_type: resource.resourceType,
        title: String(code).slice(0, 140),
        record_date: date,
        summary: summary.slice(0, 1000),
        fhir: resource,
        created_at: new Date().toISOString(),
      }, { merge: true });
    }
    await batch.commit();
    return NextResponse.json({ imported: resources.length, bundle, notice: 'These records are synthetic demo data. They are not from ABDM and are not real medical records.' });
  } catch (error) {
    console.error('Mock ABDM import failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Could not load the simulated ABDM records.' }, { status: 500 });
  }
}
