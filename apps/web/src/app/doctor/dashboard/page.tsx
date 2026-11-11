'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Clock3, LockKeyhole, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { onAuthStateChanged, signOut, type User } from '@firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';

type Grant = { id: string; doctorName: string; scopes: string[]; expiresAt: string; createdAt: string };
type PatientData = { profile?: Record<string, unknown>; history?: Record<string, string>; records?: Array<Record<string, unknown>> };

export default function DoctorDashboard() {
  const router = useRouter(); const [user, setUser] = useState<User | null>(null); const [doctor, setDoctor] = useState<{ fullName?: string; doctorId?: string; verificationStatus?: string } | null>(null);
  const [grants, setGrants] = useState<Grant[]>([]); const [selected, setSelected] = useState<PatientData | null>(null); const [busy, setBusy] = useState(true); const [error, setError] = useState('');
  const load = useCallback(async (current: User) => {
    const token = await current.getIdToken(); const response = await fetch('/api/doctor/grants', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }); const result = await response.json();
    if (response.status === 401) { router.replace('/doctor/login'); return; }
    if (response.status === 404 && result.needsDoctorProfile) { router.replace('/doctor/signup'); return; }
    if (!response.ok) throw new Error(result.error || 'Could not load doctor dashboard.');
    setDoctor(result.doctor); setGrants(result.grants || []);
  }, [router]);
  useEffect(() => { try { return onAuthStateChanged(getFirebaseAuth(), current => { if (!current) router.replace('/doctor/login'); else { setUser(current); void load(current).catch(e => setError(e.message)).finally(() => setBusy(false)); } }); } catch (e) { setError(e instanceof Error ? e.message : 'Firebase is not configured.'); setBusy(false); } }, [load, router]);
  async function openPatient(grantId: string) {
    if (!user) return; setError(''); setSelected(null);
    try { const token = await user.getIdToken(); const response = await fetch(`/api/doctor/patient-data?grantId=${encodeURIComponent(grantId)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Access denied.'); setSelected(result.patient); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open shared information.'); }
  }
  async function logout() { await signOut(getFirebaseAuth()); router.replace('/doctor/login'); }
  if (busy) return <main className="loading">Loading doctor portal…</main>;
  return <div className="shell"><header className="topbar"><div className="brand"><span className="brand-mark"><Activity size={19}/></span>Zymore for Doctors</div><div className="top-right"><span className="secure"><LockKeyhole size={13}/> Patient-approved access</span><button className="signout-button" onClick={logout}><LogOut size={14}/></button></div></header><main className="main doctor-main"><div className="welcome"><div><div className="eyebrow">Clinician workspace</div><h1>Welcome, {doctor?.fullName || 'Doctor'}.</h1><p>Only patient information currently shared with your account appears here.</p></div></div>
    {error&&<div className="error">{error}</div>}
    <section className="card doctor-status"><div className="doctor-id"><span className="icon-badge"><ShieldCheck size={18}/></span><div><span>Your Zymore doctor ID</span><strong>{doctor?.doctorId || 'Pending'}</strong></div></div><span className={`verification-badge ${doctor?.verificationStatus === 'verified' ? 'verified' : ''}`}>{doctor?.verificationStatus === 'verified' ? 'Verified' : 'Pending verification'}</span></section>
    {doctor?.verificationStatus !== 'verified' ? <section className="card verification-pending"><h2>Identity review in progress</h2><p>Patient information stays unavailable until your professional registration is verified. Zymore IDs identify accounts; they do not establish medical licensure.</p><p>For ABDM-enabled discovery and interoperability, the HPR/HPID should be verified through official channels. This prototype uses manual verification.</p></section> : <div className="doctor-columns"><section><div className="section-head"><h2>Patients who shared access</h2><span>{grants.length} active</span></div>{grants.length ? <div className="doctor-grant-list">{grants.map(grant=><article className="card doctor-grant" key={grant.id}><div className="record-icon"><UserRound size={18}/></div><div className="doctor-grant-info"><h3>Patient shared record</h3><p>Includes: {grant.scopes.join(', ')}</p><span><Clock3 size={12}/> Expires {new Date(grant.expiresAt).toLocaleString('en-IN')}</span></div><button className="book" onClick={()=>void openPatient(grant.id)}>Open</button></article>)}</div> : <div className="card empty">No active patient permissions.</div>}</section>
      <section className="card shared-patient">{selected ? <><h2>Shared patient information</h2><p className="privacy-inline">Access is time limited and patient controlled. This view was logged.</p>{selected.profile && <div className="shared-block"><h3>Profile</h3>{Object.entries(selected.profile).map(([key,value])=><p key={key}><strong>{key}</strong>: {String(value || 'Not provided')}</p>)}</div>}{selected.history && <div className="shared-block"><h3>Health history provided by patient</h3>{Object.entries(selected.history).map(([key,value])=><p key={key}><strong>{key}</strong>: {value || 'Not provided'}</p>)}</div>}{selected.records && <div className="shared-block"><h3>Shared records</h3>{selected.records.length ? selected.records.map((record,index)=><p key={index}><strong>{String(record.title || 'Health record')}</strong>: {String(record.summary || '')}</p>) : <p>No records in this scope.</p>}</div>}</> : <div className="shared-empty"><LockKeyhole size={21}/><h2>Patient details stay private</h2><p>Choose a patient permission to open only the sections they authorized.</p></div>}</section></div>}
    <div className="footer-note">Viewing access is logged for patient transparency. Report suspected misuse to the platform for human review.</div>
  </main></div>;
}
