import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/v1';
const GROUPS = ['A_POSITIVE', 'A_NEGATIVE', 'B_POSITIVE', 'B_NEGATIVE', 'AB_POSITIVE', 'AB_NEGATIVE', 'O_POSITIVE', 'O_NEGATIVE'];
const DEMO_COORDINATOR = { email: 'coordinator@example.test', password: 'BloodDemo2026!' };
const DEMO_DONOR = { email: 'anaya@example.test', password: 'DonorDemo123!' };

type BloodRequest = {
  id: number; bloodGroup: string; units: number; hospitalName: string; area: string;
  urgency: string; verified: boolean; expiresAt: string; createdAt: string;
};
type DonorProfile = {
  id: number; displayName: string; bloodGroup: string; phone: string; area: string;
  latitude: number; longitude: number; available: boolean; lastDonationAt: string | null;
};
type Match = { donorId: number; displayName: string; bloodGroup: string; area: string; distanceKm: number; phone: string; eligibility: string };

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new Error(message || `Request failed (${response.status})`);
  }
  return body as T;
}

function App() {
  const [requests, setRequests] = useState<BloodRequest[]>([]);
  const [coordinatorToken, setCoordinatorToken] = useState('');
  const [donorToken, setDonorToken] = useState('');
  const [profile, setProfile] = useState<DonorProfile | null>(null);
  const [eligibility, setEligibility] = useState<{ eligible: boolean; nextEligibleAt: string | null; reason: string; rule: string } | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchingRequest, setMatchingRequest] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [donorLoginEmail, setDonorLoginEmail] = useState(DEMO_DONOR.email);
  const [donorLoginPassword, setDonorLoginPassword] = useState(DEMO_DONOR.password);
  const [coordinatorEmail, setCoordinatorEmail] = useState(DEMO_COORDINATOR.email);
  const [coordinatorPassword, setCoordinatorPassword] = useState(DEMO_COORDINATOR.password);

  const notify = (text: string, kind: 'success' | 'error' = 'success') => setNotice({ text, kind });
  const refreshRequests = useCallback(async () => {
    setRequests(await request<BloodRequest[]>('/blood-requests'));
  }, []);

  useEffect(() => { refreshRequests().catch((error) => notify(error.message, 'error')); }, [refreshRequests]);

  const withBusy = async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); }
    catch (error) { notify(error instanceof Error ? error.message : 'Something went wrong', 'error'); }
    finally { setBusy(false); }
  };

  async function loadDonor(token: string) {
    const [nextProfile, nextEligibility] = await Promise.all([
      request<DonorProfile>('/donors/me', {}, token),
      request<typeof eligibility>('/donors/me/eligibility', {}, token),
    ]);
    setProfile(nextProfile);
    setEligibility(nextEligibility);
  }

  async function loginCoordinator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await withBusy(async () => {
      const result = await request<{ accessToken: string }>('/auth/login', {
        method: 'POST', body: JSON.stringify({ email: coordinatorEmail, password: coordinatorPassword }),
      });
      setCoordinatorToken(result.accessToken);
      notify('Coordinator signed in.');
      await refreshRequests();
    });
  }

  async function loginDonor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await withBusy(async () => {
      const result = await request<{ accessToken: string }>('/auth/login', {
        method: 'POST', body: JSON.stringify({ email: donorLoginEmail, password: donorLoginPassword }),
      });
      setDonorToken(result.accessToken);
      await loadDonor(result.accessToken);
      notify('Donor signed in.');
    });
  }

  async function registerDonor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const lastDonationAt = String(data.get('lastDonationAt') || '');
    const body = {
      email: String(data.get('email')), password: String(data.get('password')),
      displayName: String(data.get('displayName')), bloodGroup: String(data.get('bloodGroup')),
      phone: String(data.get('phone')), area: String(data.get('area')),
      latitude: Number(data.get('latitude')), longitude: Number(data.get('longitude')),
      ...(lastDonationAt ? { lastDonationAt: new Date(lastDonationAt).toISOString() } : {}),
    };
    await withBusy(async () => {
      const result = await request<{ accessToken: string }>('/auth/register', { method: 'POST', body: JSON.stringify(body) });
      setDonorToken(result.accessToken);
      await loadDonor(result.accessToken);
      notify('Donor registered and signed in.');
      form.reset();
    });
  }

  async function updateDonor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!donorToken || !profile) return;
    const data = new FormData(event.currentTarget);
    const lastDonationAt = String(data.get('lastDonationAt') || '');
    const phone = String(data.get('phone') || '');
    const body = {
      displayName: String(data.get('displayName')), area: String(data.get('area')),
      latitude: Number(data.get('latitude')), longitude: Number(data.get('longitude')),
      available: data.get('available') === 'on',
      ...(phone ? { phone } : {}),
      ...(lastDonationAt ? { lastDonationAt: new Date(lastDonationAt).toISOString() } : {}),
    };
    await withBusy(async () => {
      await request('/donors/me', { method: 'PATCH', body: JSON.stringify(body) }, donorToken);
      await loadDonor(donorToken);
      notify('Donor profile updated.');
    });
  }

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!coordinatorToken) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const expiresAt = new Date(String(data.get('expiresAt'))).toISOString();
    const body = {
      bloodGroup: String(data.get('bloodGroup')), units: Number(data.get('units')),
      hospitalName: String(data.get('hospitalName')), area: String(data.get('area')),
      latitude: Number(data.get('latitude')), longitude: Number(data.get('longitude')),
      urgency: String(data.get('urgency')), expiresAt,
    };
    await withBusy(async () => {
      const created = await request<BloodRequest>('/blood-requests', { method: 'POST', body: JSON.stringify(body) }, coordinatorToken);
      notify(`Request #${created.id} created. Verify it to enable matching.`);
      form.reset();
      await refreshRequests();
    });
  }

  async function verifyRequest(id: number) {
    if (!coordinatorToken) return;
    await withBusy(async () => {
      await request(`/blood-requests/${id}/verify`, { method: 'POST' }, coordinatorToken);
      notify(`Request #${id} verified.`);
      await refreshRequests();
    });
  }

  async function findMatches(item: BloodRequest) {
    if (!coordinatorToken) return;
    await withBusy(async () => {
      const result = await request<Match[]>(`/blood-requests/${item.id}/matches?maxDistanceKm=50`, { method: 'POST' }, coordinatorToken);
      setMatches(result);
      setMatchingRequest(item.id);
      notify(`${result.length} eligible donor${result.length === 1 ? '' : 's'} found for request #${item.id}.`);
    });
  }

  async function closeRequest(item: BloodRequest, action: 'fulfill' | 'cancel') {
    if (!coordinatorToken) return;
    await withBusy(async () => {
      await request(`/blood-requests/${item.id}/${action}`, { method: 'POST' }, coordinatorToken);
      if (matchingRequest === item.id) { setMatches([]); setMatchingRequest(null); }
      notify(`Request #${item.id} ${action === 'fulfill' ? 'fulfilled' : 'cancelled'}.`);
      await refreshRequests();
    });
  }

  const donorDate = useMemo(() => profile?.lastDonationAt ? new Date(profile.lastDonationAt).toISOString().slice(0, 10) : '', [profile]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top"><span className="brand-mark">+</span><span>CommonGood<span className="brand-dot">.</span></span></a>
        <div className="topbar-right"><span className="api-indicator"><i /> API connected</span><a className="docs-link" href="http://localhost:3000/docs" target="_blank" rel="noreferrer">API docs ↗</a></div>
      </header>

      <main id="top" className="page-wrap">
        <section className="hero">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> COMMUNITY BLOOD DONATION</div>
            <h1>Good people,<br /><em>right on time.</em></h1>
            <p className="hero-copy">A simple way for communities to connect urgent blood requests with nearby, eligible donors.</p>
            <div className="hero-pills"><span>● Verified requests</span><span>● Nearby matches</span><span>● Private donor details</span></div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <div className="heart-card"><span>+</span></div>
            <div className="float-label label-top"><b>3</b><span>nearby matches</span></div>
            <div className="float-label label-bottom"><span className="pulse-dot" /> Request active</div>
            <div className="spark spark-a">✳</div><div className="spark spark-b">✳</div>
          </div>
        </section>

        {notice && <div className={`notice ${notice.kind}`} role="status"><span>{notice.kind === 'success' ? '✓' : '!'}</span>{notice.text}<button onClick={() => setNotice(null)} aria-label="Dismiss">×</button></div>}

        <section className="section-heading">
          <div><div className="eyebrow">GET STARTED</div><h2>Choose your part in the story</h2></div>
          <p>Use a demo login or register a new donor profile.<br />Tokens stay in this browser tab only.</p>
        </section>

        <div className="role-grid">
          <section className="panel donor-panel">
            <div className="panel-head"><div className="role-icon donor-icon">♥</div><div><div className="role-tag">FOR DONORS</div><h3>Be there for someone</h3></div><span className={`session-badge ${donorToken ? 'online' : ''}`}>{donorToken ? 'SIGNED IN' : 'DONOR'}</span></div>
            {!donorToken ? <>
              <form onSubmit={loginDonor} className="form-stack">
                <div className="form-title">Sign in to your profile</div>
                <label>Email<input type="email" value={donorLoginEmail} onChange={(e) => setDonorLoginEmail(e.target.value)} required /></label>
                <label>Password<input type="password" value={donorLoginPassword} onChange={(e) => setDonorLoginPassword(e.target.value)} required /></label>
                <button className="button button-primary" disabled={busy}>Sign in as donor <span>→</span></button>
                <div className="demo-hint">Demo: anaya@example.test · DonorDemo123!</div>
              </form>
              <details className="register-details">
                <summary>New donor? Create a profile <span>＋</span></summary>
                <form onSubmit={registerDonor} className="form-stack register-form">
                  <div className="field-row"><label>Full name<input name="displayName" required minLength={2} placeholder="Your name" /></label><label>Blood group<select name="bloodGroup" required>{GROUPS.map((group) => <option key={group}>{group}</option>)}</select></label></div>
                  <div className="field-row"><label>Email<input name="email" type="email" required placeholder="you@example.com" /></label><label>Password<input name="password" type="password" minLength={10} required placeholder="At least 10 characters" /></label></div>
                  <label>Phone<input name="phone" required placeholder="+91 ..." /></label>
                  <label>Area<input name="area" required placeholder="Neighborhood or area" /></label>
                  <div className="field-row"><label>Latitude<input name="latitude" type="number" step="any" min="-90" max="90" required defaultValue="18.5074" /></label><label>Longitude<input name="longitude" type="number" step="any" min="-180" max="180" required defaultValue="73.8077" /></label></div>
                  <label>Last donation date <span className="optional">(optional)</span><input name="lastDonationAt" type="date" /></label>
                  <button className="button button-outline" disabled={busy}>Register as a donor <span>→</span></button>
                </form>
              </details>
            </> : <>
              {profile && <div className="profile-summary"><span className="blood-chip">{profile.bloodGroup.replace('_', ' ')}</span><div><b>{profile.displayName}</b><span>{profile.area} · {profile.available ? 'Available to donate' : 'Not currently available'}</span></div><button className="text-button" onClick={() => { setDonorToken(''); setProfile(null); setEligibility(null); }}>Sign out</button></div>}
              {eligibility && <div className={`eligibility ${eligibility.eligible ? 'eligible' : 'not-eligible'}`}><span>{eligibility.eligible ? '✓' : '◷'}</span><div><b>{eligibility.eligible ? 'Estimated eligible' : 'Eligibility not confirmed'}</b><small>{eligibility.reason}{eligibility.nextEligibleAt ? ` Next estimated date: ${new Date(eligibility.nextEligibleAt).toLocaleDateString()}.` : ''}</small></div></div>}
              <form onSubmit={updateDonor} className="form-stack profile-form">
                <div className="form-title">Keep your profile up to date</div>
                <label>Name<input name="displayName" required defaultValue={profile?.displayName} /></label>
                <label>Area<input name="area" required defaultValue={profile?.area} /></label>
                <div className="field-row"><label>Latitude<input name="latitude" type="number" step="any" required defaultValue={profile?.latitude} /></label><label>Longitude<input name="longitude" type="number" step="any" required defaultValue={profile?.longitude} /></label></div>
                <label>Last donation date <span className="optional">(leave blank to keep current)</span><input name="lastDonationAt" type="date" defaultValue={donorDate} /></label>
                <label>Update phone <span className="optional">(optional)</span><input name="phone" type="tel" placeholder="Leave blank to keep current" /></label>
                <label className="checkbox-label"><input name="available" type="checkbox" defaultChecked={profile?.available} /> I’m currently available to be contacted</label>
                <div className="button-row"><button className="button button-outline" disabled={busy}>Save profile</button><button type="button" className="button button-quiet" onClick={() => withBusy(async () => { await loadDonor(donorToken); notify('Eligibility refreshed.'); })}>Refresh eligibility</button></div>
              </form>
            </>}
          </section>

          <section className="panel coordinator-panel">
            <div className="panel-head"><div className="role-icon coordinator-icon">⌖</div><div><div className="role-tag">FOR COORDINATORS</div><h3>Make the connection</h3></div><span className={`session-badge ${coordinatorToken ? 'online' : ''}`}>{coordinatorToken ? 'SIGNED IN' : 'COORDINATOR'}</span></div>
            {!coordinatorToken ? <form onSubmit={loginCoordinator} className="form-stack">
              <div className="form-title">Sign in to manage requests</div>
              <label>Email<input type="email" value={coordinatorEmail} onChange={(e) => setCoordinatorEmail(e.target.value)} required /></label>
              <label>Password<input type="password" value={coordinatorPassword} onChange={(e) => setCoordinatorPassword(e.target.value)} required /></label>
              <button className="button button-dark" disabled={busy}>Sign in as coordinator <span>→</span></button>
              <div className="demo-hint">Demo: coordinator@example.test · BloodDemo2026!</div>
            </form> : <>
              <div className="coordinator-signed"><span className="signed-check">✓</span><div><b>You’re signed in as coordinator</b><small>Verify requests, find compatible donors, and close fulfilled needs.</small></div><button className="text-button" onClick={() => { setCoordinatorToken(''); setMatches([]); }}>Sign out</button></div>
              <form onSubmit={createRequest} className="form-stack create-form">
                <div className="form-title">Create a blood request</div>
                <div className="field-row"><label>Blood group<select name="bloodGroup" required>{GROUPS.map((group) => <option key={group}>{group}</option>)}</select></label><label>Units needed<input name="units" type="number" min="1" max="10" defaultValue="1" required /></label></div>
                <label>Hospital name<input name="hospitalName" required defaultValue="City Hospital (Demo)" /></label>
                <label>Area<input name="area" required defaultValue="Shivajinagar" /></label>
                <div className="field-row"><label>Latitude<input name="latitude" type="number" step="any" required defaultValue="18.5204" /></label><label>Longitude<input name="longitude" type="number" step="any" required defaultValue="73.8567" /></label></div>
                <div className="field-row"><label>Urgency<select name="urgency" defaultValue="URGENT"><option>ROUTINE</option><option>URGENT</option><option>CRITICAL</option></select></label><label>Expires at<input name="expiresAt" type="datetime-local" required defaultValue={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16)} /></label></div>
                <button className="button button-dark" disabled={busy}>Create request <span>＋</span></button>
              </form>
            </>}
          </section>
        </div>

        <section className="requests-section">
          <div className="section-heading requests-heading"><div><div className="eyebrow">LIVE REGISTRY</div><h2>Active blood requests <span className="count-pill">{requests.length}</span></h2></div><button className="button button-quiet refresh-button" onClick={() => withBusy(refreshRequests)} disabled={busy}>↻ Refresh</button></div>
          {requests.length === 0 ? <div className="empty-state"><div className="empty-icon">♡</div><b>No active requests right now</b><span>New requests appear here; a coordinator must verify them before matching.</span></div> : <div className="request-grid">{requests.map((item) => <article className="request-card" key={item.id}>
            <div className="request-card-top"><span className="blood-chip large">{item.bloodGroup.replace('_', ' ')}</span><span className={`urgency ${item.urgency.toLowerCase()}`}>{item.urgency}</span></div>
            <div className="request-id">REQUEST #{item.id} <span className={item.verified ? 'verified' : 'unverified'}>{item.verified ? '✓ VERIFIED' : 'PENDING VERIFICATION'}</span></div>
            <h3>{item.hospitalName}</h3><p className="request-area">⌖ {item.area} <span>·</span> {item.units} {item.units === 1 ? 'unit' : 'units'} needed</p>
            <div className="expires">Expires {new Date(item.expiresAt).toLocaleString()}</div>
            {coordinatorToken && <div className="request-actions"><button className="mini-button" onClick={() => verifyRequest(item.id)} disabled={busy || item.verified}>Verify</button><button className="mini-button match-button" onClick={() => findMatches(item)} disabled={busy || !item.verified}>Find donors</button><button className="mini-button" onClick={() => closeRequest(item, 'fulfill')} disabled={busy}>Fulfilled</button><button className="mini-button danger-mini" onClick={() => closeRequest(item, 'cancel')} disabled={busy}>Cancel</button></div>}
          </article>)}</div>}
        </section>

        {matchingRequest !== null && <section className="matches-section">
          <div className="section-heading requests-heading"><div><div className="eyebrow">COORDINATOR VIEW · REQUEST #{matchingRequest}</div><h2>Closest eligible donors <span className="count-pill">{matches.length}</span></h2></div><button className="text-button" onClick={() => { setMatchingRequest(null); setMatches([]); }}>Close results ×</button></div>
          {matches.length === 0 ? <div className="empty-state compact"><b>No eligible donors found within 50 km.</b><span>Try another compatible request, or broaden the search radius later.</span></div> : <div className="match-grid">{matches.map((match) => <article className="match-card" key={match.donorId}><div className="match-distance">{match.distanceKm}<small>km away</small></div><div className="match-info"><b>{match.displayName}</b><span>{match.bloodGroup.replace('_', ' ')} · {match.area}</span><small>{match.eligibility}</small><a href={`tel:${match.phone}`}>☎ {match.phone}</a></div><span className="match-rank">MATCH</span></article>)}</div>}
          <p className="medical-note">Eligibility is an estimate only. Confirm donor availability and medical eligibility directly.</p>
        </section>}

        <footer><span>CommonGood <b>·</b> Local prototype</span><span>Donor eligibility is an estimate, not medical clearance.</span><a href="http://localhost:3000/docs" target="_blank" rel="noreferrer">Explore API docs ↗</a></footer>
      </main>
      {busy && <div className="busy-indicator"><span /> Working…</div>}
    </div>
  );
}

export default App;
