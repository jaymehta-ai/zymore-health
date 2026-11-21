'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, ArrowUpRight, HeartPulse, ShieldCheck } from 'lucide-react';
import { onAuthStateChanged, type User } from '@firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';

type ProfileValues = {
  displayName: string; dateOfBirth: string; heightCm: string; weightKg: string; bloodGroup: string;
  allergies: string; emergencyContact: string;
  medicalHistory: string; dentalHistory: string; currentTreatments: string; hasAbha: string;
  consentAccepted: boolean; aiConsent: boolean; documentOcrConsent: boolean; marketplaceConsent: boolean;
};

const emptyProfile: ProfileValues = {
  displayName: '', dateOfBirth: '', heightCm: '', weightKg: '', bloodGroup: '',
  allergies: '', emergencyContact: '',
  medicalHistory: '', dentalHistory: '', currentTreatments: '', hasAbha: 'unsure',
  consentAccepted: false, aiConsent: false, documentOcrConsent: false, marketplaceConsent: false,
};

export default function Onboarding() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [values, setValues] = useState<ProfileValues>(emptyProfile);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => onAuthStateChanged(getFirebaseAuth(), async currentUser => {
    if (!currentUser) { router.replace('/login'); return; }
    const editMode = new URLSearchParams(window.location.search).get('edit') === '1';
    setUser(currentUser);
    setValues(previous => ({ ...previous, displayName: currentUser.displayName || currentUser.email?.split('@')[0] || '' }));
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch('/api/profile', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (response.ok) {
        const { profile } = await response.json();
        if (profile?.isComplete && !editMode) { router.replace('/dashboard'); return; }
        if (profile) setValues(previous => ({ ...previous, ...profile, consentAccepted: Boolean(profile.healthDataConsentAt), heightCm: String(profile.heightCm || ''), weightKg: String(profile.weightKg || '') }));
      }
    } catch { setError('Could not load your saved profile. You can still complete the form.'); }
  }), [router]);

  function change<K extends keyof ProfileValues>(key: K, value: ProfileValues[K]) {
    setValues(previous => ({ ...previous, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      if (!user) throw new Error('Please sign in to continue.');
      const token = await user.getIdToken();
      const response = await fetch('/api/profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...values, heightCm: Number(values.heightCm), weightKg: Number(values.weightKg) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save your profile.');
      router.replace('/dashboard');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save your profile.'); } finally { setBusy(false); }
  }

  return <main className="onboarding-wrap">
    <header className="onboarding-brand"><div className="brand"><span className="brand-mark"><Activity size={19}/></span>Zymore</div><span className="secure"><ShieldCheck size={14}/> Your health details stay in your account</span></header>
    <form className="onboarding-card" onSubmit={submit}>
      <div className="onboarding-intro"><span className="icon-badge"><HeartPulse size={18}/></span><div><div className="eyebrow">First, a little about you</div><h1>Build your health profile</h1><p>Share only what you’re comfortable adding. You can update this information later.</p></div></div>

      <section className="form-section"><h2>About you</h2><div className="form-grid">
        <label className="form-field form-wide">Full name<input className="input" name="displayName" autoComplete="name" maxLength={100} required value={values.displayName} onChange={e => change('displayName', e.target.value)}/></label>
        <label className="form-field">Date of birth<input className="input" name="dateOfBirth" type="date" autoComplete="bday" required value={values.dateOfBirth} onChange={e => change('dateOfBirth', e.target.value)}/></label>
        <label className="form-field">Height (cm)<input className="input" name="heightCm" type="number" min="30" max="250" step="0.1" required value={values.heightCm} onChange={e => change('heightCm', e.target.value)}/></label>
        <label className="form-field">Weight (kg)<input className="input" name="weightKg" type="number" min="2" max="350" step="0.1" required value={values.weightKg} onChange={e => change('weightKg', e.target.value)}/></label>
        <label className="form-field">Blood group <span className="optional">if known</span><select className="input" name="bloodGroup" required value={values.bloodGroup} onChange={e => change('bloodGroup', e.target.value)}><option value="">Choose one</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'].map(group => <option key={group} value={group}>{group === 'Unknown' ? 'I don’t know' : group}</option>)}</select></label>
      </div></section>

      <section className="form-section"><h2>Emergency & Medical Alerts <span className="optional">critical for ER and visits</span></h2><div className="form-grid">
        <label className="form-field form-wide">Known drug allergies & reactions<input className="input" name="allergies" maxLength={1500} placeholder="e.g., Penicillin (hives), Sulfa antibiotics, NSAIDs, or 'None known'" value={values.allergies} onChange={e => change('allergies', e.target.value)}/></label>
        <label className="form-field form-wide">Emergency contact (Name & Phone)<input className="input" name="emergencyContact" maxLength={200} placeholder="e.g., Priya Sharma (Sister) - +91 98765 43210" value={values.emergencyContact} onChange={e => change('emergencyContact', e.target.value)}/></label>
      </div></section>

      <section className="form-section"><h2>Your health background <span className="optional">all optional</span></h2><div className="form-grid">
        <label className="form-field form-wide">Past health issues<textarea className="input textarea" name="medicalHistory" maxLength={4000} placeholder="For example, asthma or a past surgery. Include dates if you remember them." value={values.medicalHistory} onChange={e => change('medicalHistory', e.target.value)}/></label>
        <label className="form-field">Dental history or concerns<textarea className="input textarea" name="dentalHistory" maxLength={2000} placeholder="For example, braces, sensitivity, or a recent dental procedure." value={values.dentalHistory} onChange={e => change('dentalHistory', e.target.value)}/></label>
        <label className="form-field">Current treatment or medicines<textarea className="input textarea" name="currentTreatments" maxLength={3000} placeholder="Include the name and dose only if you know it." value={values.currentTreatments} onChange={e => change('currentTreatments', e.target.value)}/></label>
      </div></section>

      <section className="form-section"><h2>Ayushman Bharat Health Account (ABHA)</h2><p className="section-copy">ABHA is India’s digital health account for consent-based sharing of records. This demo does not connect to ABDM yet.</p><div className="radio-row">{[['yes', 'I have an ABHA'], ['no', 'I don’t have one'], ['unsure', 'I’m not sure']].map(([value, label]) => <label className="radio-option" key={value}><input type="radio" name="hasAbha" value={value} checked={values.hasAbha === value} onChange={() => change('hasAbha', value)}/>{label}</label>)}</div><a className="abha-link" href="https://abha.abdm.gov.in/abha/v3/" target="_blank" rel="noreferrer">Visit the official ABHA portal to create or manage your account <ArrowUpRight size={14}/></a><p className="privacy-inline">We do not collect Aadhaar numbers here. If you choose to create ABHA, enter identity details only on an official ABDM flow.</p></section>

      <section className="consent-section"><label className="consent-row required-consent"><input type="checkbox" required checked={values.consentAccepted} onChange={e => change('consentAccepted', e.target.checked)}/><span><strong>Save my health profile</strong><small>I consent to storing the details I provide in my Zymore account to show them back to me.</small></span></label><label className="consent-row"><input type="checkbox" checked={values.aiConsent} onChange={e => change('aiConsent', e.target.checked)}/><span><strong>Use Gemini for health explanations (optional)</strong><small>If selected, health history, treatment details, and notes I add may be sent to Google’s Gemini API to generate plain-language summaries.</small></span></label><label className="consent-row"><input type="checkbox" checked={values.documentOcrConsent} onChange={e => change('documentOcrConsent', e.target.checked)}/><span><strong>Let Gemini read uploaded documents (optional)</strong><small>If selected, each PDF or image I upload may be sent to Google’s Gemini API for text extraction. The extracted text is saved in Firebase for my review; it is used in a health summary only after I confirm it and enable health explanations.</small></span></label><label className="consent-row"><input type="checkbox" checked={values.marketplaceConsent} onChange={e => change('marketplaceConsent', e.target.checked)}/><span><strong>Show optional health service suggestions (optional)</strong><small>Suggestions will only be shown when there is relevant health information, and will be clearly labelled.</small></span></label><p className="consent-footnote">You can leave the optional choices unchecked. This is not a medical service or a replacement for your clinician.</p></section>
      {error && <div className="error">{error}</div>}
      <button className="primary onboarding-submit" disabled={busy}>{busy ? 'Saving your profile…' : 'Save and continue'}</button>
      <div className="onboarding-bottom">Already have an account? <Link href="/login">Sign out and switch account</Link></div>
    </form>
  </main>;
}
