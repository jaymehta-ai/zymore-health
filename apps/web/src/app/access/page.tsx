'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Activity, ArrowLeft, Clock3, LockKeyhole, ShieldCheck } from 'lucide-react';
import { onAuthStateChanged, type User } from '@firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';

type Grant = { id: string; doctorName: string; doctorId: string; scopes: string[]; status: string; expiresAt: string };
type Audit = { id: string; event: string; doctor_uid?: string; doctorId?: string; createdAt: string; scopes?: string[] };

export default function PatientAccess() {
  const router = useRouter(); const [user, setUser] = useState<User | null>(null); const [grants, setGrants] = useState<Grant[]>([]); const [events, setEvents] = useState<Audit[]>([]);
  const [doctorId, setDoctorId] = useState(''); const [scopes, setScopes] = useState(['profile', 'history', 'records']); const [hours, setHours] = useState('24'); const [busy, setBusy] = useState(true); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const load = useCallback(async (current: User) => {
    const token = await current.getIdToken(); const headers = { Authorization: `Bearer ${token}` };
    const [grantResponse, auditResponse] = await Promise.all([fetch('/api/patient/grants', { headers, cache: 'no-store' }), fetch('/api/patient/audit', { headers, cache: 'no-store' })]);
    const [grantData, auditData] = await Promise.all([grantResponse.json(), auditResponse.json()]);
    if (grantResponse.status === 401) { router.replace('/login'); return; }
    if (!grantResponse.ok) throw new Error(grantData.error || 'Could not load access settings.');
    setGrants(grantData.grants || []); setEvents(auditData.events || []);
  }, [router]);
  useEffect(() => { try { return onAuthStateChanged(getFirebaseAuth(), current => { if (!current) router.replace('/login'); else { setUser(current); void load(current).catch(e => setError(e.message)).finally(() => setBusy(false)); } }); } catch (e) { setError(e instanceof Error ? e.message : 'Firebase is not configured.'); setBusy(false); } }, [load, router]);
  async function tokenHeaders() { if (!user) throw new Error('Please sign in.'); return { Authorization: `Bearer ${await user.getIdToken()}` }; }
  async function addGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('');
    try { const headers = await tokenHeaders(); const response = await fetch('/api/patient/grants', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ doctorId, scopes, hours: Number(hours), confirmed: true }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not share access.'); setNotice(`Access shared with ${data.grant.doctorName}.`); setDoctorId(''); await load(user!); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not share access.'); }
  }
  async function revoke(grantId: string) {
    setError(''); setNotice('');
    try { const headers = await tokenHeaders(); const response = await fetch('/api/patient/grants', { method: 'DELETE', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ grantId }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not revoke access.'); setNotice('Access revoked.'); await load(user!); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not revoke access.'); }
  }
  async function reportEvent(auditId: string) {
    const details = window.prompt('Describe your concern about this access event. Do not include new health details.');
    if (!details) return;
    try { const headers = await tokenHeaders(); const response = await fetch('/api/patient/report', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ auditId, details }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not submit the report.'); setNotice(result.message); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not submit the report.'); }
  }
  function toggleScope(scope: string) { setScopes(current => current.includes(scope) ? current.filter(item => item !== scope) : [...current, scope]); }
  if (busy) return <main className="loading">Loading sharing settings…</main>;
  return <div className="shell"><header className="topbar"><div className="brand"><span className="brand-mark"><Activity size={19}/></span>Zymore</div><Link href="/dashboard" className="top-link"><ArrowLeft size={14}/> Back to health record</Link></header><main className="main access-main"><div className="welcome"><div><div className="eyebrow">Your records, your choice</div><h1>Doctor access</h1><p>Only share with a verified doctor you trust. You can revoke access at any time.</p></div></div>
    {error&&<div className="error">{error}</div>}{notice&&<div className="success-notice">{notice}</div>}
    <section className="card access-form-card"><h2>Share with a doctor</h2><p className="section-copy">Ask your doctor for their Zymore ID. Their identity and registration must be verified before they can receive access.</p><form onSubmit={addGrant}><label className="form-field">Doctor’s Zymore ID<input className="input" value={doctorId} onChange={e=>setDoctorId(e.target.value)} placeholder="ZMD-…" required/></label><fieldset className="scope-fieldset"><legend>Information to share</legend>{[['profile','Basic profile'],['history','Health and treatment history'],['records','Medical records']].map(([scope,label])=><label className="scope-check" key={scope}><input type="checkbox" checked={scopes.includes(scope)} onChange={()=>toggleScope(scope)}/>{label}</label>)}</fieldset><label className="form-field access-duration">Access ends after<select className="input" value={hours} onChange={e=>setHours(e.target.value)}><option value="1">1 hour</option><option value="8">8 hours</option><option value="24">24 hours</option><option value="72">3 days</option><option value="168">7 days</option></select></label><label className="access-confirm"><input type="checkbox" required/>I authorize this specific doctor to view the selected information until the expiry time shown above.</label><button className="primary" disabled={scopes.length===0}>Share selected information</button></form><p className="privacy-inline"><LockKeyhole size={13}/> Every access is logged. Revoking blocks future reads; information already viewed or copied cannot be remotely recalled.</p></section>
    <section className="section"><div className="section-head"><h2>Active and past permissions</h2><span>Revoke any active permission</span></div>{grants.length ? <div className="access-list">{grants.map(grant=><article className="card access-row" key={grant.id}><div className="record-icon"><ShieldCheck size={18}/></div><div className="access-row-info"><h3>{grant.doctorName}</h3><p>{grant.doctorId} · {grant.scopes.join(', ')}</p><span><Clock3 size={12}/> {grant.status==='active'&&Date.parse(grant.expiresAt)>Date.now()?'Expires':'Expired/revoked'} {new Date(grant.expiresAt).toLocaleString('en-IN')}</span></div>{grant.status==='active'&&Date.parse(grant.expiresAt)>Date.now()&&<button className="revoke-button" onClick={()=>void revoke(grant.id)}>Revoke now</button>}</article>)}</div> : <div className="card empty">You haven’t shared your record with a doctor yet.</div>}</section>
    <section className="section"><div className="section-head"><h2>Access activity</h2><span>Recent events</span></div>{events.length ? <div className="card audit-list">{events.map(item=><div className="audit-row" key={item.id}><span className="audit-dot"/><div><strong>{item.event.replaceAll('_',' ')}</strong><span>{item.doctorId || 'Doctor account'}{item.scopes?.length ? ` · ${item.scopes.join(', ')}` : ''}</span></div><time>{new Date(item.createdAt).toLocaleString('en-IN')}</time>{item.event==='patient_data_viewed'&&<button className="report-button" onClick={()=>void reportEvent(item.id)}>Report concern</button>}</div>)}</div> : <div className="card empty">No doctor access activity yet.</div>}<p className="privacy-inline">Reports are recorded for platform review. A report is not an automatic legal finding or penalty.</p></section>
    <div className="footer-note">Emergency access requires an appropriate legal and consent pathway. This prototype does not allow doctors to bypass patient authorization.</div>
  </main></div>;
}
