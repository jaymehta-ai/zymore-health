'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Activity, ArrowUpRight, CalendarDays, ClipboardList, HeartPulse, LockKeyhole, ShieldCheck, ShoppingBag, Sparkles, Stethoscope, TestTube2, UserRound } from 'lucide-react';
import { onAuthStateChanged, signOut, type User } from '@firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';

type RecordItem = { resourceType: string; title: string; date: string; summary: string };
type Action = { title: string; vendor: string; price_estimate: string };
type DashboardData = {
  profile: { displayName: string; age: number; heightCm: number; weightKg: number; bloodGroup: string; hasAbha: string; aiConsent: boolean };
  summary: string | null; clinical_tags: string[]; marketplace_actions: Action[];
  records: RecordItem[]; hasClinicalContext: boolean; aiConfigured: boolean; aiFailed: boolean;
};
const icons: Record<string, typeof TestTube2> = { Observation: TestTube2, MedicationRequest: ClipboardList, Encounter: Stethoscope, SelfReported: HeartPulse };

export default function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);

  const load = useCallback(async (user: User) => {
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/dashboard', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const body = await response.json();
      if (response.status === 401) { await signOut(getFirebaseAuth()); router.replace('/login'); return; }
      if (response.status === 409 && body.needsOnboarding) { router.replace('/onboarding'); return; }
      if (!response.ok) throw new Error(body.error || `Dashboard request failed (${response.status}).`);
      setData(body);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load your dashboard.'); }
    finally { setBusy(false); }
  }, [router]);

  useEffect(() => {
    try { return onAuthStateChanged(getFirebaseAuth(), user => { if (user) void load(user); else router.replace('/login'); }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Firebase is not configured.'); setBusy(false); }
  }, [load, router]);

  async function handleSignOut() { await signOut(getFirebaseAuth()); router.replace('/login'); }
  if (busy) return <main className="loading">Preparing your health dashboard…</main>;
  if (error || !data) return <main className="loading">{error || 'Please sign in to continue.'}</main>;

  const abhaLabel = data.profile.hasAbha === 'yes' ? 'You said you have an ABHA' : data.profile.hasAbha === 'no' ? 'No ABHA reported' : 'ABHA status not sure';
  return <div className="shell"><header className="topbar"><div className="brand"><span className="brand-mark"><Activity size={19}/></span>Zymore</div><div className="top-right"><span className="secure"><LockKeyhole size={13}/> Private health space</span><Link className="top-link" href="/access">Doctor access</Link><Link className="top-link" href="/onboarding?edit=1">Edit profile</Link><button onClick={handleSignOut} className="signout-button">Sign out</button><div className="avatar">{data.profile.displayName.charAt(0).toUpperCase()}</div></div></header>
    <main className="main"><div className="welcome"><div><div className="eyebrow">Your personal health record</div><h1>Hello, {data.profile.displayName}.</h1><p>Your health details and records, in one place.</p></div><div className="date-pill"><CalendarDays size={13} style={{verticalAlign:'middle',marginRight:6}}/>Your private health space</div></div>

      <section className="profile-strip card"><div className="profile-fact"><span className="profile-fact-label">Age</span><strong>{data.profile.age}</strong><span>years</span></div><div className="profile-fact"><span className="profile-fact-label">Height</span><strong>{data.profile.heightCm}</strong><span>cm</span></div><div className="profile-fact"><span className="profile-fact-label">Weight</span><strong>{data.profile.weightKg}</strong><span>kg</span></div><div className="profile-fact"><span className="profile-fact-label">Blood group</span><strong>{data.profile.bloodGroup === 'Unknown' ? 'Not known' : data.profile.bloodGroup || 'Not added'}</strong></div><div className="abha-fact"><strong>{abhaLabel}</strong><span>ABDM connection is not enabled in this demo.</span></div><Link href="/onboarding?edit=1" className="edit-profile-link">Edit details</Link></section>

      <section className="card summary"><div className="card-heading"><div className="card-title"><span className="icon-badge"><Sparkles size={18}/></span><div><div className="eyebrow">Optional AI explanation</div><h2>Gemini Health Summary</h2></div></div>{data.summary && <span className="ai-label">AI GENERATED</span>}</div>
        {data.summary ? <><p className="summary-text">{data.summary}</p>{data.clinical_tags.length > 0 && <div className="tags">{data.clinical_tags.map(tag => <span className="tag" key={tag}>{tag}</span>)}</div>}</> : <p className="summary-empty">{!data.profile.aiConsent ? <>Gemini is off. You can opt in from <Link href="/onboarding?edit=1">your profile settings</Link>.</> : !data.hasClinicalContext ? 'Add a health issue, dental concern, current treatment, or health record to see an explanation here.' : !data.aiConfigured ? 'Gemini is not configured yet. Your health details have not been sent to an AI service.' : data.aiFailed ? 'Gemini could not prepare a summary right now. Your saved profile and records are still available.' : 'No summary is available yet.'}</p>}
      </section>

      <section className="section"><div className="section-head"><h2>Your Medical Vault</h2><span>Information you provided</span></div>{data.records.length ? <div className="records">{data.records.map((record,index) => {const Icon=icons[record.resourceType]||ClipboardList;return <article className="card record" key={`${record.resourceType}-${index}`}><span className="record-icon"><Icon size={18}/></span><div><h3>{record.title}</h3><p>{record.summary}</p><time>Added {new Date(record.date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})} · Provided by you</time></div></article>})}</div> : <div className="card empty-vault"><span className="record-icon"><UserRound size={18}/></span><div><strong>Your profile is ready.</strong><p>You haven’t added past health issues, treatment details, or medical records yet.</p><Link href="/onboarding?edit=1">Add or update profile details</Link></div></div>}</section>

      {data.marketplace_actions.length > 0 && <section className="market"><div className="section-head"><h2>Optional health services</h2><span>Shown with your permission</span></div><div className="market-banner"><span><strong>Sponsored suggestions.</strong> These are optional, based on documented records, and are not medical advice.</span><ShieldCheck size={16}/></div><div className="market-grid">{data.marketplace_actions.map((action,index)=><article className="card offer" key={`${action.vendor}-${index}`}><div className="offer-top"><div className="vendor"><span className="vendor-mark"><ShoppingBag size={16}/></span>{action.vendor}</div><span className="sponsored">SPONSORED</span></div><h3>{action.title}</h3><p>Optional service · Please verify details with your clinician</p><div className="offer-bottom"><span className="price">{action.price_estimate}</span><button className="book" onClick={()=>window.alert(`Demo only: this would open ${action.vendor}. No booking has been made.`)}>Explore <ArrowUpRight size={13} style={{verticalAlign:'middle'}}/></button></div></article>)}</div></section>}
      <div className="footer-note">Your health data belongs to you. This app does not currently connect to ABDM or import hospital records.<br/>For health concerns, please consult a qualified healthcare professional.</div>
    </main></div>;
}
