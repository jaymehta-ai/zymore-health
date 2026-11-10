'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Activity } from 'lucide-react';
import { getFirebaseAuth } from '@/lib/firebase';
import { signInWithEmailAndPassword } from '@firebase/auth';

export default function Login() {
  const router = useRouter(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true); const form = new FormData(event.currentTarget);
    const email = String(form.get('email') || '').trim(); const password = String(form.get('password') || '');
    try {
      await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
      router.push('/dashboard');
    } catch(e) { setError(e instanceof Error ? e.message : 'Could not sign in.'); } finally { setBusy(false); }
  }
  return <main className="auth-wrap"><section className="auth-card"><div className="brand"><span className="brand-mark"><Activity size={19}/></span>Zymore</div><h1>Welcome back.</h1><p>Sign in to pick up where you left off.</p><form onSubmit={submit}><label className="field" htmlFor="email">Email address</label><input className="input" id="email" name="email" type="email" autoComplete="username" required/><label className="field" htmlFor="password">Password</label><input className="input" id="password" name="password" type="password" autoComplete="current-password" required/><button className="primary" disabled={busy}>{busy?'Signing in…':'Sign in'}</button>{error&&<div className="error">{error}</div>}</form><div className="auth-switch">New to Zymore? <Link href="/register">Create an account</Link></div></section></main>;
}
