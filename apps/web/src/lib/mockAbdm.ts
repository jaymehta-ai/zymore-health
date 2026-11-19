/** Demo-only ABDM adapter. It never calls ABDM and contains no real patient data. */
export function mockABDMFetch(userId: string) {
  void userId;
  const patientId = 'synthetic-demo-patient';
  const encounterId = 'demo-encounter-lipid-review';
  const observedAt = '2026-10-20T09:30:00.000Z';
  return {
    resourceType: 'Bundle',
    id: 'zymore-synthetic-abdm-sample',
    type: 'collection',
    meta: { profile: ['http://hl7.org/fhir/StructureDefinition/Bundle'], tag: [{ system: 'https://zymore.example/demo', code: 'simulated', display: 'Synthetic demonstration data' }] },
    identifier: { system: 'https://zymore.example/demo', value: 'SYNTHETIC-DEMO-BUNDLE-0001' },
    timestamp: observedAt,
    entry: [
      { fullUrl: `urn:uuid:${patientId}`, resource: {
        resourceType: 'Patient', id: patientId,
        identifier: [{ system: 'https://zymore.example/demo-patient-id', value: 'SYNTHETIC-PATIENT-0001' }],
        name: [{ text: 'Synthetic demo patient' }], gender: 'unknown',
        meta: { profile: ['http://hl7.org/fhir/StructureDefinition/Patient'] },
      } },
      { fullUrl: `urn:uuid:${encounterId}`, resource: {
        resourceType: 'Encounter', id: encounterId, status: 'finished', class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
        subject: { reference: `Patient/${patientId}` }, period: { start: '2026-10-20T09:00:00.000Z', end: observedAt },
        serviceProvider: { display: 'Demo Community Clinic (simulated)' },
        meta: { profile: ['http://hl7.org/fhir/StructureDefinition/Encounter'] },
      } },
      { fullUrl: 'urn:uuid:demo-observation-total-cholesterol', resource: {
        resourceType: 'Observation', id: 'demo-observation-total-cholesterol', status: 'final', category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory', display: 'Laboratory' }] }],
        code: { coding: [{ system: 'http://loinc.org', code: '2093-3', display: 'Cholesterol [Mass/volume] in Serum or Plasma' }], text: 'Total cholesterol' },
        subject: { reference: `Patient/${patientId}` }, encounter: { reference: `Encounter/${encounterId}` }, effectiveDateTime: observedAt,
        valueQuantity: { value: 246, unit: 'mg/dL', system: 'http://unitsofmeasure.org', code: 'mg/dL' }, interpretation: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', code: 'H', display: 'High' }] }],
        meta: { profile: ['http://hl7.org/fhir/StructureDefinition/Observation'] },
      } },
      { fullUrl: 'urn:uuid:demo-observation-ldl', resource: {
        resourceType: 'Observation', id: 'demo-observation-ldl', status: 'final', category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory', display: 'Laboratory' }] }],
        code: { coding: [{ system: 'http://loinc.org', code: '13457-7', display: 'Cholesterol in LDL [Mass/volume] in Serum or Plasma by calculation' }], text: 'LDL cholesterol' },
        subject: { reference: `Patient/${patientId}` }, encounter: { reference: `Encounter/${encounterId}` }, effectiveDateTime: observedAt,
        valueQuantity: { value: 162, unit: 'mg/dL', system: 'http://unitsofmeasure.org', code: 'mg/dL' }, interpretation: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', code: 'H', display: 'High' }] }],
        meta: { profile: ['http://hl7.org/fhir/StructureDefinition/Observation'] },
      } },
      { fullUrl: 'urn:uuid:demo-diagnostic-report-lipid', resource: {
        resourceType: 'DiagnosticReport', id: 'demo-diagnostic-report-lipid', status: 'final', category: [{ coding: [{ system: 'http://loinc.org', code: '24331-1', display: 'Lipid panel' }] }],
        code: { text: 'Lipid profile (simulated)' }, subject: { reference: `Patient/${patientId}` }, encounter: { reference: `Encounter/${encounterId}` }, effectiveDateTime: observedAt,
        result: [{ reference: 'Observation/demo-observation-total-cholesterol' }, { reference: 'Observation/demo-observation-ldl' }], conclusion: 'Synthetic demonstration report only. Not a real patient result.',
        meta: { profile: ['http://hl7.org/fhir/StructureDefinition/DiagnosticReport'] },
      } },
      { fullUrl: 'urn:uuid:demo-medication-statin', resource: {
        resourceType: 'MedicationRequest', id: 'demo-medication-statin', status: 'active', intent: 'order',
        medicationCodeableConcept: { text: 'Atorvastatin 10 mg (simulated prescription)' }, subject: { reference: `Patient/${patientId}` }, encounter: { reference: `Encounter/${encounterId}` }, authoredOn: '2026-10-20',
        dosageInstruction: [{ text: 'Take one tablet once daily; demonstration text only.' }],
        requester: { display: 'Demo clinician (not a real prescriber)' },
        meta: { profile: ['http://hl7.org/fhir/StructureDefinition/MedicationRequest'] },
      } },
    ],
  };
}
