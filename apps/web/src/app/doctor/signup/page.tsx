'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { createUserWithEmailAndPassword, sendEmailVerification } from '@firebase/auth';
import { Activity, ShieldCheck } from 'lucide-react';
import { getFirebaseAuth } from '@/lib/firebase';

export default function DoctorSignup() {
  const router = useRouter(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(['fullName', 'specialty', 'registrationNumber', 'registrationCouncil', 'hprId'].map(key => [key, String(form.get(key) || '').trim()]));
    try {
      const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), String(form.get('email') || '').trim(), String(form.get('password') || ''));
      await sendEmailVerification(credential.user);
      const token = await credential.user.getIdToken();
      const response = await fetch('/api/doctor/profile', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not create the doctor profile.');
      router.replace('/doctor/dashboard');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create the doctor account.'); } finally { setBusy(false); }
  }
  return <main className="onboarding-wrap"><header className="onboarding-brand"><div className="brand"><span className="brand-mark"><Activity size={19}/></span>Zymore</div><Link className="top-link" href="/doctor/login">Doctor login</Link></header><form className="onboarding-card doctor-form" onSubmit={submit}><div className="eyebrow">Clinician access</div><h1>Create a doctor account</h1><p className="section-copy">New profiles remain pending until credentials are independently checked. A Zymore doctor ID identifies your account; it does not prove licensure.</p><div className="form-grid">
    <label className="form-field form-wide">Full name<input className="input" name="fullName" maxLength={100} autoComplete="name" required/></label>
    <label className="form-field">Specialty<input className="input" name="specialty" maxLength={100} required/></label>
    <label className="form-field">Professional registration number<input className="input" name="registrationNumber" maxLength={100} required/></label>
    <label className="form-field form-wide">Registering medical council<input className="input" name="registrationCouncil" maxLength={150} placeholder="For example, State Medical Council" required/></label>
    <label className="form-field form-wide">ABDM HPR ID <span className="optional">optional</span><input className="input" name="hprId" maxLength={100}/></label>
    <label className="form-field form-wide">Email<input className="input" type="email" name="email" autoComplete="email" required/></label>
    <label className="form-field form-wide">Password (10+ characters)<input className="input" type="password" name="password" minLength={10} autoComplete="new-password" required/></label>
  </div><div className="verification-note"><ShieldCheck size={16}/> Your identity and registration will be reviewed before you can access patient information.</div>{error&&<div className="error">{error}</div>}<button className="primary onboarding-submit" disabled={busy}>{busy?'Creating account…':'Create doctor account'}</button><div className="onboarding-bottom">Patient? <Link href="/register">Create a patient account</Link></div></form></main>;
}
