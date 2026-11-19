'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Activity } from 'lucide-react';
import { onAuthStateChanged, type User } from '@firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';

type Report = { id: string; details?: string; doctorId?: string; status?: string; createdAt?: string; audit_event_id?: string };

export default function AccessReportReview() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  async function load(current: User) {
    const response = await fetch('/api/admin/reports', { headers: { Authorization: `Bearer ${await current.getIdToken()}` }, cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Could not load reports.');
    setReports(body.reports || []);
  }
  useEffect(() => onAuthStateChanged(getFirebaseAuth(), current => {
    if (!current) { router.replace('/login'); return; }
    setUser(current); void load(current).catch(e => setError(e.message)).finally(() => setBusy(false));
  }), [router]);
  async function review(reportId: string, status: 'under_review' | 'closed' | 'escalated') {
    if (!user) return;
    setError('');
    try {
      const response = await fetch('/api/admin/reports', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ reportId, status, reviewNote: notes[reportId] || '' }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not update report.');
      await load(user);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update report.'); }
  }
  if (busy) return <main className="loading">Loading access concerns…</main>;
  return <div className="shell"><header className="topbar"><div className="brand"><span className="brand-mark"><Activity size={19}/></span>Zymore review</div><Link href="/admin/doctors" className="top-link">Doctor applications</Link></header><main className="main access-main"><div className="welcome"><div><div className="eyebrow">Restricted staff workspace</div><h1>Patient access concerns</h1><p>Record a human review outcome. This queue does not determine legal liability or replace a formal investigation.</p></div></div>{error && <div className="error">{error}</div>}{reports.length ? <div className="doctor-grant-list">{reports.map(report => <article className="card verification-pending" key={report.id}><h2>Report about {report.doctorId || 'a doctor account'}</h2><p>{report.details || 'No report details were supplied.'}</p><p className="privacy-inline">Submitted {report.createdAt ? new Date(report.createdAt).toLocaleString('en-IN') : 'date unavailable'} · Audit event {report.audit_event_id || 'not linked'}</p><label className="form-field">Staff review note<textarea className="input textarea" minLength={5} maxLength={1500} value={notes[report.id] || ''} onChange={event => setNotes(current => ({ ...current, [report.id]: event.target.value }))} placeholder="Record the steps taken or the reason for escalation." required/></label><div className="review-actions"><button className="secondary-button" onClick={() => void review(report.id, 'under_review')}>Mark under review</button><button className="book" onClick={() => void review(report.id, 'escalated')}>Escalate</button><button className="revoke-button" onClick={() => void review(report.id, 'closed')}>Close review</button></div></article>)}</div> : <div className="card empty">No patient concerns are waiting for review.</div>}</main></div>;
}
