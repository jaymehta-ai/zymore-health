'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Activity, ArrowUpRight, CalendarDays, ClipboardList, Download, FileText, HeartPulse, LockKeyhole, ShieldCheck, ShoppingBag, Sparkles, Stethoscope, TestTube2, Trash2, Upload, UserRound } from 'lucide-react';
import { onAuthStateChanged, signOut, type User } from '@firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';

type OcrExtraction = { status: string; document_type?: string; document_date?: string; extracted_text?: string; facts?: { label: string; value: string; unit?: string; page?: string; confidence?: string }[] };
type RecordItem = { id: string; resourceType: string; title: string; date: string; summary: string; source: string; simulated: boolean; fileName?: string | null; ocrExtraction?: OcrExtraction | null };
type Action = { title: string; vendor: string; price_estimate: string };
type DashboardData = {
  profile: { displayName: string; age: number; heightCm: number; weightKg: number; bloodGroup: string; hasAbha: string; aiConsent: boolean; documentOcrConsent: boolean };
  summary: string | null; clinical_tags: string[]; marketplace_actions: Action[]; summaryStale: boolean;
  records: RecordItem[]; hasClinicalContext: boolean; aiConfigured: boolean; aiFailed: boolean; aiPending: boolean; isDemo: boolean;
};
const icons: Record<string, typeof TestTube2> = { Observation: TestTube2, MedicationRequest: ClipboardList, Encounter: Stethoscope, SelfReported: HeartPulse };

export default function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(true);
  const [recordBusy, setRecordBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [ocrBusyId, setOcrBusyId] = useState('');

  const load = useCallback(async (currentUser: User) => {
    try {
      const response = await fetch('/api/dashboard', { headers: { Authorization: `Bearer ${await currentUser.getIdToken()}` }, cache: 'no-store' });
      const body = await response.json();
      if (response.status === 401) { await signOut(getFirebaseAuth()); router.replace('/login'); return; }
      if (response.status === 409 && body.needsOnboarding) { router.replace('/onboarding'); return; }
      if (!response.ok) throw new Error(body.error || `Dashboard request failed (${response.status}).`);
      setData(body);
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load your dashboard.'); }
    finally { setBusy(false); }
  }, [router]);

  useEffect(() => {
    try { return onAuthStateChanged(getFirebaseAuth(), currentUser => { if (currentUser) { setUser(currentUser); void load(currentUser); } else router.replace('/login'); }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Firebase is not configured.'); setBusy(false); }
  }, [load, router]);

  async function handleSignOut() { await signOut(getFirebaseAuth()); router.replace('/login'); }

  async function uploadRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const formElement = event.currentTarget;
    setError(''); setNotice(''); setRecordBusy(true);
    try {
      const response = await fetch('/api/patient/records', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}` }, body: new FormData(formElement) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not upload record.');
      formElement.reset();
      setNotice(result.record.ocrStatus === 'needs_review' ? 'File stored. Review Gemini’s extracted text below before it is used in your health summary.' : 'Record saved to your vault.');
      await load(user);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not upload record.'); }
    finally { setRecordBusy(false); }
  }

  async function importDemoRecords() {
    if (!user) return;
    setError(''); setNotice(''); setDemoBusy(true);
    try {
      const response = await fetch('/api/mock-abdm/sync', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load demo records.');
      setNotice(result.notice);
      await load(user);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load demo records.'); }
    finally { setDemoBusy(false); }
  }

  async function downloadFile(record: RecordItem) {
    if (!user) return;
    setError('');
    try {
      const response = await fetch(`/api/records/${encodeURIComponent(record.id)}/file`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      if (!response.ok) { const body = await response.json(); throw new Error(body.error || 'Could not download file.'); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = record.fileName || record.title; link.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not download file.'); }
  }

  async function removeRecord(recordId: string) {
    if (!user || !window.confirm('Remove this health record and its uploaded file?')) return;
    setError(''); setNotice('');
    try {
      const response = await fetch('/api/patient/records', { method: 'DELETE', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ recordId }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not remove record.');
      setNotice('Record removed.'); await load(user);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not remove record.'); }
  }

  async function confirmOcr(recordId: string, confirmedSummary: string, recordDate: string) {
    if (!user) return;
    setError(''); setNotice(''); setOcrBusyId(recordId);
    try {
      const response = await fetch('/api/patient/records', { method: 'PATCH', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ recordId, confirmedSummary, recordDate }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not save your OCR review.');
      setNotice('Your reviewed notes are saved in Firebase. Gemini will use them in a summary only if health explanations are enabled.');
      await load(user);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save your OCR review.'); }
    finally { setOcrBusyId(''); }
  }

  async function exportData() {
    if (!user) return;
    setError('');
    try {
      const response = await fetch('/api/patient/export', { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      if (!response.ok) { const body = await response.json(); throw new Error(body.error || 'Could not export data.'); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = 'zymore-health-export.json'; link.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not export data.'); }
  }

  if (busy) return <main className="loading">Preparing your health dashboard…</main>;
  if (error && !data) return <main className="loading">{error}</main>;
  if (!data) return <main className="loading">Please sign in to continue.</main>;

  const abhaLabel = data.profile.hasAbha === 'yes' ? 'You said you have an ABHA' : data.profile.hasAbha === 'no' ? 'No ABHA reported' : 'ABHA status not sure';
  return <div className="shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><Activity size={19}/></span>Zymore</div>
      <div className="top-right"><span className="secure"><LockKeyhole size={13}/> Private health space</span><Link className="top-link" href="/access">Doctor access</Link><Link className="profile-icon-link" href="/onboarding?edit=1" aria-label="Open your profile and add health details" title="Profile and health details"><UserRound size={17}/></Link><button onClick={handleSignOut} className="signout-button">Sign out</button><div className="avatar">{data.profile.displayName.charAt(0).toUpperCase()}</div></div>
    </header>
    <main className="main">
      <div className="welcome"><div><div className="eyebrow">Your personal health record</div><h1>Hello, {data.profile.displayName}.</h1><p>Your health details and records, in one place.</p></div><div className="date-pill"><CalendarDays size={13} style={{ verticalAlign: 'middle', marginRight: 6 }}/>Your private health space</div></div>
      <section className="profile-strip card"><div className="profile-fact"><span className="profile-fact-label">Age</span><strong>{data.profile.age}</strong><span>years</span></div><div className="profile-fact"><span className="profile-fact-label">Height</span><strong>{data.profile.heightCm}</strong><span>cm</span></div><div className="profile-fact"><span className="profile-fact-label">Weight</span><strong>{data.profile.weightKg}</strong><span>kg</span></div><div className="profile-fact"><span className="profile-fact-label">Blood group</span><strong>{data.profile.bloodGroup === 'Unknown' ? 'Not known' : data.profile.bloodGroup || 'Not added'}</strong></div><div className="abha-fact"><strong>{abhaLabel}</strong><span>ABHA is not connected in this demo.</span></div><Link href="/onboarding?edit=1" className="edit-profile-link">Edit details</Link></section>

      <section className="card summary"><div className="card-heading"><div className="card-title"><span className="icon-badge"><Sparkles size={18}/></span><div><div className="eyebrow">Optional AI explanation</div><h2>Gemini Health Summary</h2></div></div>{data.summary && <span className="ai-label">{data.summaryStale ? 'PREVIOUS SUMMARY' : 'SAVED SUMMARY'}</span>}</div>
        {data.summary ? <><p className="summary-text">{data.summary}</p>{data.summaryStale && <p className="privacy-inline">New health information is saved. {data.aiFailed ? 'Gemini could not refresh this summary, so it may not include the latest records.' : data.aiPending ? 'Another request is preparing the updated summary.' : 'This saved summary may not include the latest records yet.'}</p>}{data.isDemo && <p className="demo-warning">This summary may include synthetic ABDM demo records. They are not real patient results.</p>}{data.clinical_tags.length > 0 && <div className="tags">{data.clinical_tags.map(tag => <span className="tag" key={tag}>{tag}</span>)}</div>}</> : <p className="summary-empty">{!data.profile.aiConsent ? <>Gemini is off. You can opt in from <Link href="/onboarding?edit=1">your profile settings</Link>.</> : !data.hasClinicalContext ? 'Add a health issue, dental concern, current treatment, or health record to see an explanation here.' : !data.aiConfigured ? 'Gemini is not configured yet. Your health details have not been sent to an AI service.' : data.aiPending ? 'Gemini is preparing a summary from your updated health information.' : data.aiFailed ? 'Gemini could not prepare a summary right now. Your saved profile and records are still available.' : 'No summary is available yet.'}</p>}
      </section>

      {(error || notice) && <div className={error ? 'error' : 'success-notice'}>{error || notice}</div>}
      <section className="section">
        <div className="section-head vault-heading"><div><h2>Your Medical Vault</h2><span>Files and health details you choose to save</span></div><button className="secondary-button" onClick={() => void importDemoRecords()} disabled={demoBusy}>{demoBusy ? 'Loading demo…' : 'Load synthetic ABDM demo'}</button></div>
        <div className="card upload-card">
            <div className="upload-intro"><span className="icon-badge"><Upload size={17}/></span><div><strong>Add a health record</strong><p>The PDF or image is stored in your private Supabase bucket. The note and extracted text are stored in Firebase.</p></div></div>
          <form className="record-upload-form" onSubmit={uploadRecord}>
            <label className="form-field">Record title<input className="input" name="title" maxLength={140} placeholder="For example, October lipid profile" required/></label>
            <label className="form-field">Type<select className="input" name="resourceType" defaultValue="Lab result"><option>Lab result</option><option>Prescription</option><option>Discharge summary</option><option>Imaging</option><option>Vaccination</option><option>Other document</option></select></label>
            <label className="form-field">Record date<input className="input" name="recordDate" type="date" max={new Date().toISOString().slice(0, 10)} required/></label>
            <label className="form-field form-wide">What should this record show?<textarea className="input textarea" name="summary" maxLength={3000} placeholder="Add a note, or leave blank if you enabled Gemini document OCR. Review OCR text before it is used in a summary." required={!(data.profile.documentOcrConsent && data.aiConfigured)}/></label>
            <label className="form-field form-wide">PDF or image<input className="input file-input" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required/></label>
            <p className="privacy-inline form-wide">{data.profile.documentOcrConsent ? 'Your document OCR consent is on. Gemini will receive the file for extraction; the extracted text stays in Firebase and waits for your review.' : <>Document OCR is off. You can enable it in <Link href="/onboarding?edit=1">your profile settings</Link>; otherwise add a note yourself.</>}</p>
            <button className="primary upload-submit" disabled={recordBusy}>{recordBusy ? 'Saving record…' : 'Add to my vault'}</button>
          </form>
        </div>
        {data.records.length ? <div className="records record-list">{data.records.map((record, index) => {
          const Icon = icons[record.resourceType] || FileText;
          const sourceLabel = record.source === 'clinic' ? 'Added by clinic' : record.source === 'mock_abdm' ? 'Synthetic ABDM simulator' : record.source === 'user' ? 'Added by you' : 'Profile detail';
          const ocr = record.ocrExtraction;
          const extractionText = ocr ? [record.summary ? `My note:\n${record.summary}` : '', ocr.extracted_text || '', ...(ocr.facts || []).map(fact => `${fact.label}: ${fact.value}${fact.unit ? ` ${fact.unit}` : ''}${fact.page ? ` (page ${fact.page})` : ''}`)].filter(Boolean).join('\n\n').slice(0, 3000) : '';
          return <article className="card record" key={record.id || `${record.resourceType}-${index}`}>
            <span className="record-icon"><Icon size={18}/></span><div className="record-content"><div className="record-heading"><h3>{record.title}</h3>{record.simulated && <span className="demo-label">DEMO DATA</span>}</div><p>{record.summary}</p><time>{new Date(record.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · {sourceLabel}</time>{record.fileName && <span className="file-name">{record.fileName}</span>}
              <div className="record-actions">{record.fileName && <button className="text-button" onClick={() => void downloadFile(record)}><Download size={13}/> Download file</button>}{record.source === 'user' && <button className="text-button danger-text" onClick={() => void removeRecord(record.id)}><Trash2 size={13}/> Remove</button>}</div>
              {ocr?.status === 'needs_review' && <div className="ocr-review"><h4>Review Gemini’s extraction</h4><p>Check the values against the original document. Edit this text before confirming; only your confirmed version can be used in a health summary.</p>{ocr.document_type && <span className="file-name">Detected type: {ocr.document_type}{ocr.document_date ? ` · Date found: ${ocr.document_date}` : ''}</span>}<ul>{(ocr.facts || []).map((fact, factIndex) => <li key={`${fact.label}-${factIndex}`}><strong>{fact.label}:</strong> {fact.value}{fact.unit ? ` ${fact.unit}` : ''}{fact.page ? ` · Page ${fact.page}` : ''}<span className="confidence-label">{fact.confidence || 'low'} confidence</span></li>)}</ul><form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void confirmOcr(record.id, String(form.get('confirmedSummary') || ''), String(form.get('recordDate') || '')); }}><label className="form-field">Reviewed notes<textarea className="input textarea" name="confirmedSummary" maxLength={3000} minLength={10} defaultValue={extractionText} required/></label><label className="form-field">Record date<input className="input" name="recordDate" type="date" max={new Date().toISOString().slice(0, 10)} defaultValue={record.date.slice(0, 10)} required/></label><button className="secondary-button" disabled={ocrBusyId === record.id}>{ocrBusyId === record.id ? 'Saving review…' : 'Confirm and save extraction'}</button></form></div>}
              {ocr?.status === 'failed' && <p className="privacy-inline">Gemini could not read this file. The file remains in your vault; any note you entered is still saved.</p>}
              {ocr?.status === 'confirmed' && <p className="ocr-confirmed">OCR text reviewed and saved in Firebase.</p>}
              {record.source === 'user' && !record.summary && ocr?.status !== 'needs_review' && <form className="record-note-form" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void confirmOcr(record.id, String(form.get('confirmedSummary') || ''), String(form.get('recordDate') || '')); }}><label className="form-field">Add a note for this record<textarea className="input textarea" name="confirmedSummary" minLength={10} maxLength={3000} placeholder="Describe what this record contains." required/></label><label className="form-field">Record date<input className="input" name="recordDate" type="date" max={new Date().toISOString().slice(0, 10)} defaultValue={record.date.slice(0, 10)} required/></label><button className="secondary-button">Save note</button></form>}
            </div>
          </article>;
        })}</div> : <div className="card empty-vault"><span className="record-icon"><UserRound size={18}/></span><div><strong>Your profile is ready.</strong><p>You haven’t added past health issues, treatment details, or medical records yet.</p><Link href="/onboarding?edit=1">Add health history</Link></div></div>}
      </section>

      {data.marketplace_actions.length > 0 && <section className="market"><div className="section-head"><h2>Optional health services</h2><span>Shown with your permission</span></div><div className="market-banner"><span><strong>Sponsored suggestions.</strong> These are optional, based on documented records, and are not medical advice.</span><ShieldCheck size={16}/></div><div className="market-grid">{data.marketplace_actions.map((action, index) => <article className="card offer" key={`${action.vendor}-${index}`}><div className="offer-top"><div className="vendor"><span className="vendor-mark"><ShoppingBag size={16}/></span>{action.vendor}</div><span className="sponsored">SPONSORED</span></div><h3>{action.title}</h3><p>Optional service · Please verify details with your clinician</p><div className="offer-bottom"><span className="price">{action.price_estimate}</span><button className="book" onClick={() => window.alert(`Demo only: this would open ${action.vendor}. No booking has been made.`)}>Explore <ArrowUpRight size={13} style={{ verticalAlign: 'middle' }}/></button></div></article>)}</div></section>}
      <div className="vault-footer-actions"><button className="text-button" onClick={() => void exportData()}><Download size={14}/> Export my data</button></div>
      <div className="footer-note">Your health data belongs to you. The ABDM connection shown here is a synthetic simulator and does not contact ABDM.<br/>For health concerns, please consult a qualified healthcare professional.</div>
    </main>
  </div>;
}
