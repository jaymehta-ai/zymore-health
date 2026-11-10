'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Activity, ShieldCheck } from 'lucide-react';
import { createUserWithEmailAndPassword, sendEmailVerification } from '@firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';

export default function Register() {
  const router = useRouter(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    const form = new FormData(event.currentTarget); const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    try {
      const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
      await sendEmailVerification(credential.user);
      router.push('/dashboard');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create account.'); } finally { setBusy(false); }
  }
  return <main className="auth-wrap"><section className="auth-card"><div className="brand"><span className="brand-mark"><Activity size={19}/></span>Zymore</div><h1>Your health, in one place.</h1><p>Create your free account to keep your records together and understand them more easily.</p><form onSubmit={submit}><label className="field" htmlFor="email">Email address</label><input className="input" id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required/><label className="field" htmlFor="password">Password (10+ characters)</label><input className="input" id="password" name="password" type="password" minLength={10} autoComplete="new-password" required/><button className="primary" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>{error&&<div className="error">{error}</div>}</form><div className="auth-switch">Already have an account? <Link href="/login">Sign in</Link></div><div className="footer-note"><ShieldCheck size={13} style={{verticalAlign:'middle',marginRight:4}}/> Your health information is private. Never share your password.</div></section></main>;
}
