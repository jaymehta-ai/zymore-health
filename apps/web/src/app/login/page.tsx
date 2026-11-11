'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Activity } from 'lucide-react';
import { getFirebaseAuth } from '@/lib/firebase';
import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup } from '@firebase/auth';
import { getPostAuthPath } from '@/lib/profileClient';

export default function Login() {
  const router = useRouter(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true); const form = new FormData(event.currentTarget);
    const email = String(form.get('email') || '').trim(); const password = String(form.get('password') || '');
    try {
      const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
      router.replace(await getPostAuthPath(credential.user));
    } catch(e) { setError(e instanceof Error ? e.message : 'Could not sign in.'); } finally { setBusy(false); }
  }
  async function googleSignIn() {
    setError(''); setBusy(true);
    try {
      const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' });
      const credential = await signInWithPopup(getFirebaseAuth(), provider);
      router.replace(await getPostAuthPath(credential.user));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not sign in with Google.'); } finally { setBusy(false); }
  }
  return <main className="auth-wrap"><section className="auth-card"><div className="brand"><span className="brand-mark"><Activity size={19}/></span>Zymore</div><h1>Welcome back.</h1><p>Sign in to pick up where you left off.</p><button type="button" className="google-button" onClick={googleSignIn} disabled={busy}><GoogleMark/>Continue with Google</button><div className="auth-divider"><span>or sign in with email</span></div><form onSubmit={submit}><label className="field" htmlFor="email">Email address</label><input className="input" id="email" name="email" type="email" autoComplete="username" required/><label className="field" htmlFor="password">Password</label><input className="input" id="password" name="password" type="password" autoComplete="current-password" required/><button className="primary" disabled={busy}>{busy?'Signing in…':'Sign in'}</button>{error&&<div className="error">{error}</div>}</form><div className="auth-switch">New to Zymore? <Link href="/register">Create an account</Link></div><div className="auth-switch"><Link href="/doctor/login">Doctor portal</Link></div></section></main>;
}

function GoogleMark() { return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94a11.1 11.1 0 0 1-4.8 7.3l7.73 6C44.38 38.17 46.98 31.88 46.98 24.55Z"/><path fill="#FBBC05" d="M10.53 28.59A14.3 14.3 0 0 1 9.75 24c0-1.6.28-3.14.77-4.59l-7.98-6.2A23.9 23.9 0 0 0 0 24c0 3.9.94 7.59 2.56 10.78l7.97-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.78l-7.73-6c-2.14 1.44-4.88 2.3-8.17 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>; }
