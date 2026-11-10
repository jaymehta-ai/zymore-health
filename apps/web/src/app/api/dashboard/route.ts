import { NextRequest, NextResponse } from 'next/server';
import { analyzeHealth } from '@/lib/gemini';
import { mockABDMFetch } from '@/lib/mockAbdm';
import { requireUser } from '@/lib/serverAuth';
import { getFirebaseAdminDb } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { user, response } = await requireUser(request);
    if (response || !user) return response;
    const db = getFirebaseAdminDb();
    const bundle = mockABDMFetch(user.id);
    const analysis = await analyzeHealth(bundle);
    const records = bundle.entry.filter(({ resource }) => ['Observation', 'MedicationRequest', 'Encounter'].includes(resource.resourceType)).map(({ resource }) => ({
      user_id: user.id,
      resource_type: resource.resourceType,
      title: resource.resourceType === 'Observation' ? 'Lipid panel' : resource.resourceType === 'MedicationRequest' ? 'Example prescription' : 'Outpatient follow-up',
      record_date: resource.effectiveDateTime || resource.authoredOn || resource.period?.start,
      summary: resource.resourceType === 'Observation' ? `Total cholesterol: ${resource.valueQuantity?.value ?? '—'} ${resource.valueQuantity?.unit ?? ''}` : resource.resourceType === 'MedicationRequest' ? resource.medicationCodeableConcept?.text ?? 'Example prescription' : 'Follow-up visit (simulated)',
      fhir: resource,
      id: `${user.id}_${resource.id}`,
    }));
    const batch = db.batch();
    records.forEach(record => {
      const { id, ...data } = record;
      batch.set(db.collection('health_records').doc(id), data, { merge: true });
    });
    batch.set(db.collection('ai_insights').doc(user.id), {
      user_id: user.id, patient_summary: analysis.patient_summary, clinical_tags: analysis.clinical_tags,
      marketplace_actions: analysis.marketplace_actions, generated_at: new Date().toISOString(), is_demo: analysis.isDemo,
    }, { merge: true });
    await batch.commit();
    return NextResponse.json({ simulated: true, summary: analysis.patient_summary, clinical_tags: analysis.clinical_tags, marketplace_actions: analysis.marketplace_actions, isDemo: analysis.isDemo, records: records.map(({ resource_type, title, record_date, summary }) => ({ resourceType: resource_type, title, date: record_date, summary })) });
  } catch (error) {
    console.error('Dashboard API error:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Could not load your dashboard. Check Supabase setup and try again.' }, { status: 500 });
  }
}
