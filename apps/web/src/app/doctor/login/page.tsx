'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { signInWithEmailAndPassword } from '@firebase/auth';
import { Activity } from 'lucide-react';
import { getFirebaseAuth } from '@/lib/firebase';

export default function DoctorLogin() {
  const router = useRouter(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true); const form = new FormData(event.currentTarget);
    try {
      const user = (await signInWithEmailAndPassword(getFirebaseAuth(), String(form.get('email') || '').trim(), String(form.get('password') || ''))).user;
      const token = await user.getIdToken(); const response = await fetch('/api/doctor/profile', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const result = await response.json();
      if (response.status === 404) { setError('No doctor profile is linked to this account. Create a doctor account first.'); return; }
      if (!response.ok) throw new Error(result.error || 'Could not load your doctor profile.');
      if (!result.doctor) { setError('No doctor profile is linked to this account. Create a doctor account first.'); return; }
      router.replace('/doctor/dashboard');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not sign in.'); } finally { setBusy(false); }
  }
  return <main className="auth-wrap"><section className="auth-card"><div className="brand"><span className="brand-mark"><Activity size={19}/></span>Zymore for Doctors</div><h1>Doctor login</h1><p>Sign in to see patient information shared with you.</p><form onSubmit={submit}><label className="field" htmlFor="doctor-email">Email</label><input className="input" id="doctor-email" name="email" type="email" autoComplete="username" required/><label className="field" htmlFor="doctor-password">Password</label><input className="input" id="doctor-password" name="password" type="password" autoComplete="current-password" required/><button className="primary" disabled={busy}>{busy?'Signing in…':'Sign in'}</button>{error&&<div className="error">{error}</div>}</form><div className="auth-switch">New doctor? <Link href="/doctor/signup">Create a doctor account</Link></div><div className="auth-switch"><Link href="/login">Patient sign in</Link></div></section></main>;
}
