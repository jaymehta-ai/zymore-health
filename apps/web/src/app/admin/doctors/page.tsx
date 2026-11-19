'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Activity, Check, X } from 'lucide-react';
import { onAuthStateChanged, type User } from '@firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';

type Application = { uid: string; fullName?: string; specialty?: string; registrationNumber?: string; registrationCouncil?: string; hprId?: string; createdAt?: string };

export default function DoctorReview() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [doctors, setDoctors] = useState<Application[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  async function load(current: User) {
    const response = await fetch('/api/admin/doctors', { headers: { Authorization: `Bearer ${await current.getIdToken()}` }, cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Could not load applications.');
    setDoctors(body.doctors || []);
  }
  useEffect(() => onAuthStateChanged(getFirebaseAuth(), current => {
    if (!current) { router.replace('/login'); return; }
    setUser(current);
    void load(current).catch(e => setError(e.message)).finally(() => setBusy(false));
  }), [router]);
  async function review(doctorUid: string, decision: 'verified' | 'rejected') {
    if (!user) return;
    setError('');
    try {
      const response = await fetch('/api/admin/doctors', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ doctorUid, decision }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not save review.');
      await load(user);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save review.'); }
  }
  if (busy) return <main className="loading">Loading review queue…</main>;
  return <div className="shell"><header className="topbar"><div className="brand"><span className="brand-mark"><Activity size={19}/></span>Zymore review</div><Link href="/admin/reports" className="top-link">Access concerns</Link></header><main className="main access-main"><div className="welcome"><div><div className="eyebrow">Restricted staff workspace</div><h1>Doctor applications</h1><p>Review the details submitted by each clinician before enabling patient access.</p></div></div>{error && <div className="error">{error}</div>}{doctors.length ? <div className="doctor-grant-list">{doctors.map(doctor => <article className="card verification-pending" key={doctor.uid}><h2>{doctor.fullName || 'Doctor applicant'} · {doctor.specialty}</h2><p>Registration: {doctor.registrationNumber} · {doctor.registrationCouncil}</p><p>HPR ID: {doctor.hprId || 'Not provided'} · Submitted {doctor.createdAt ? new Date(doctor.createdAt).toLocaleString('en-IN') : 'date unavailable'}</p><p className="privacy-inline">Verify against the appropriate professional registry before approving. This screen does not perform that verification for you.</p><div className="review-actions"><button className="book" onClick={() => void review(doctor.uid, 'verified')}><Check size={14}/> Approve</button><button className="revoke-button" onClick={() => void review(doctor.uid, 'rejected')}><X size={14}/> Reject</button></div></article>)}</div> : <div className="card empty">No doctor applications are waiting for review.</div>}<p className="footer-note">Access requires this account UID in the server-only DOCTOR_REVIEWER_UIDS environment variable.</p></main></div>;
}
