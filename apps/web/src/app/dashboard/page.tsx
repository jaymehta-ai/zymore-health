'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, ArrowUpRight, CalendarDays, ClipboardList, HeartPulse, LockKeyhole, ShieldCheck, ShoppingBag, Sparkles, Stethoscope, TestTube2 } from 'lucide-react';
import { onAuthStateChanged, signOut, type User } from '@firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';

type RecordItem = { resourceType: string; title: string; date: string; summary: string };
type Action = { title: string; vendor: string; price_estimate: string };
type DashboardData = { simulated: boolean; summary: string; clinical_tags: string[]; marketplace_actions: Action[]; isDemo: boolean; records: RecordItem[] };
const icons: Record<string, typeof TestTube2> = { Observation: TestTube2, MedicationRequest: ClipboardList, Encounter: Stethoscope };

export default function Dashboard() {
  const router = useRouter(); const [data, setData] = useState<DashboardData | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(true);
  const load = useCallback(async (user: User) => {
    try { const token = await user.getIdToken(); const response = await fetch('/api/dashboard', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }); if (response.status === 401) { await signOut(getFirebaseAuth()); router.replace('/login'); return; } const body = await response.text(); let result: DashboardData & { error?: string }; try { result = JSON.parse(body); } catch { throw new Error(`Dashboard API returned an empty or non-JSON response (${response.status}). Check the Vercel function logs.`); } if (!response.ok) throw new Error(result.error || `Dashboard request failed (${response.status}).`); setData(result); }
    catch(e) { setError(e instanceof Error ? e.message : 'Unable to load your dashboard.'); } finally { setBusy(false); }
  }, [router]);
  useEffect(() => {
    try { return onAuthStateChanged(getFirebaseAuth(), user => { if (user) void load(user); else router.replace('/login'); }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Firebase is not configured.'); setBusy(false); }
  }, [load, router]);
  async function handleSignOut() { await signOut(getFirebaseAuth()); router.replace('/login'); }
  if (busy) return <main className="loading">Preparing your health dashboard…</main>;
  if (error || !data) return <main className="loading">{error || 'Please sign in to continue.'}</main>;
  return <div className="shell"><header className="topbar"><div className="brand"><span className="brand-mark"><Activity size={19}/></span>Zymore</div><div className="top-right"><span className="secure"><LockKeyhole size={13}/> Private health space</span><button onClick={handleSignOut} style={{border:0,background:'none',color:'#637a8c',fontSize:12,cursor:'pointer'}}>Sign out</button><div className="avatar">Z</div></div></header>
    <main className="main"><div className="welcome"><div><div className="eyebrow">Your personal health record</div><h1>Good to see you.</h1><p>A clearer picture of your health, all in one place.</p></div><div className="date-pill"><CalendarDays size={13} style={{verticalAlign:'middle',marginRight:6}}/>Updated just now</div></div>
      <div className="grid"><section className="card summary"><div className="card-heading"><div style={{display:'flex',alignItems:'center',gap:11}}><span className="icon-badge"><Sparkles size={18}/></span><h2>Your AI Health Summary</h2></div><span className="demo-label">SIMULATED RECORD</span></div><p className="summary-text">{data.summary}</p><div className="tags">{data.clinical_tags.map(tag=><span className="tag" key={tag}>{tag}</span>)}</div></section>
        <aside className="card aside"><div className="score-row"><div className="score">—</div><div><strong>Your record is taking shape</strong><p>Understanding your health starts with the details.</p></div></div><div className="note"><ShieldCheck size={15} style={{flex:'0 0 auto',color:'#138a80'}}/> This is a software generated explanation, not a diagnosis or medical advice.</div></aside></div>
      <section className="section"><div className="section-head"><h2>Your Medical Vault</h2><span>{data.records.length} recent records · simulated</span></div><div className="records">{data.records.map((record,index)=>{const Icon=icons[record.resourceType]||HeartPulse;return <article className="card record" key={`${record.resourceType}-${index}`}><span className="record-icon"><Icon size={18}/></span><div><h3>{record.title}</h3><p>{record.summary}</p><time>{new Date(record.date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</time></div></article>})}</div></section>
      <section className="market"><div className="section-head"><h2>Recommended For You</h2><span>Optional next steps</span></div><div className="market-banner"><span><strong>Sponsored suggestions.</strong> These options are based on the simulated record and are not medical recommendations. Ask your clinician before acting.</span><span style={{flex:'0 0 auto',marginLeft:12}}><ShieldCheck size={16}/></span></div><div className="market-grid">{data.marketplace_actions.length ? data.marketplace_actions.map((action,index)=><article className="card offer" key={`${action.vendor}-${index}`}><div className="offer-top"><div className="vendor"><span className="vendor-mark"><ShoppingBag size={16}/></span>{action.vendor}</div><span className="sponsored">SPONSORED</span></div><h3>{action.title}</h3><p>Optional service · Please verify details with your clinician</p><div className="offer-bottom"><span className="price">{action.price_estimate}</span><button className="book" onClick={()=>window.alert(`Demo only: this would open ${action.vendor}. No booking has been made.`)}>Explore <ArrowUpRight size={13} style={{verticalAlign:'middle'}}/></button></div></article>) : <div className="card empty">No optional services are suggested for this record.</div>}</div></section>
      <div className="footer-note">Your health data belongs to you. Suggestions may be sponsored and are optional. This demo uses simulated data and does not connect to ABDM.<br/>For health concerns, please consult a qualified healthcare professional.</div>
    </main></div>;
}
