// Local FHIR R4-shaped fixture. This does not call ABDM or contain real patient data.
export function mockABDMFetch(userId: string) {
  const patientRef = `Patient/${userId}`;
  return {
    resourceType: 'Bundle', type: 'collection', timestamp: new Date().toISOString(),
    entry: [
      { resource: { resourceType: 'Patient', id: userId, name: [{ text: 'Demo patient' }], gender: 'unknown' } },
      { resource: {
        resourceType: 'Observation', id: 'lipid-panel-demo', status: 'final',
        category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory', display: 'Laboratory' }] }],
        code: { coding: [{ system: 'http://loinc.org', code: '2093-3', display: 'Total cholesterol' }] },
        subject: { reference: patientRef }, effectiveDateTime: '2026-10-20T09:30:00+05:30',
        valueQuantity: { value: 248, unit: 'mg/dL', system: 'http://unitsofmeasure.org', code: 'mg/dL' },
        interpretation: [{ coding: [{ code: 'H', display: 'High' }] }],
      } },
      { resource: {
        resourceType: 'MedicationRequest', id: 'statin-demo', status: 'active', intent: 'order',
        medicationCodeableConcept: { text: 'Statin therapy (example prescription)' },
        subject: { reference: patientRef }, authoredOn: '2026-10-20',
        dosageInstruction: [{ text: 'As directed by the prescribing clinician' }],
      } },
      { resource: {
        resourceType: 'Encounter', id: 'follow-up-demo', status: 'finished', class: { code: 'AMB' },
        subject: { reference: patientRef }, period: { start: '2026-10-20T09:00:00+05:30' },
        type: [{ text: 'Outpatient follow-up' }],
      } },
    ],
  };
}
