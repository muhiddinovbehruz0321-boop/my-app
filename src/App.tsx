import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import {
  Activity, ArrowDownRight, ArrowRight, Crosshair, Gamepad2, History,
  KeyRound, LogOut, Map as MapIcon, Package, Radio, Settings, Shield,
  Target, Trophy, UserRound, Volume2, Zap,
} from 'lucide-react'
import type { GameMode } from './game/Arena'
import { apiRequest, type MatchRecord, type PlayerProfile } from './services/api'
import './App.css'

const Arena = lazy(() => import('./game/Arena').then((module) => ({ default: module.Arena })))

type Screen = 'HOME' | 'INVENTORY' | 'PROFILE' | 'HISTORY' | 'SETTINGS'
type Preferences = { sensitivity: number; volume: number; quality: string; hitmarkers: boolean }
const preferenceKey = 'breachline-preferences'
const storedPreferences = (): Preferences => {
  try {
    const saved = localStorage.getItem(preferenceKey)
    if (saved) return { ...{ sensitivity: 45, volume: 70, quality: 'HIGH', hitmarkers: true }, ...JSON.parse(saved) as Partial<Preferences> }
  } catch {
    // Ignore malformed local settings and restore the documented defaults.
  }
  return { sensitivity: 45, volume: 70, quality: 'HIGH', hitmarkers: true }
}
const modes: Array<{ label: string; description: string; mode: GameMode | null; icon: typeof Crosshair }> = [
  { label: 'Competitive', description: 'Ranked 5v5 · online', mode: null, icon: Trophy },
  { label: 'Casual', description: 'Unranked 5v5 · online', mode: null, icon: Shield },
  { label: 'Deathmatch', description: 'Free-for-all · online', mode: null, icon: Zap },
  { label: 'Practice with bots', description: 'Offline · 4 hostiles', mode: 'PRACTICE', icon: Crosshair },
  { label: 'Training', description: 'Movement & live-fire range', mode: 'TRAINING', icon: Target },
]

function Brand() {
  return <div className="brand"><div className="brand-mark"><Crosshair size={19} strokeWidth={1.7} /></div><div><div className="brand-name">BREACHLINE</div><div className="brand-sub">TACTICAL OPERATIONS</div></div></div>
}

function Header({ screen, setScreen, profile, online }: {
  screen: Screen
  setScreen: (screen: Screen) => void
  profile: PlayerProfile | null
  online: boolean
}) {
  const tabs: Array<{ label: string; screen: Screen }> = [
    { label: 'OPERATIONS', screen: 'HOME' },
    { label: 'ARMORY', screen: 'INVENTORY' },
    { label: 'AFTER ACTION', screen: 'HISTORY' },
  ]
  return (
    <header className="topbar">
      <Brand />
      <nav className="nav-tabs" aria-label="Main navigation">
        {tabs.map((tab) => <button key={tab.screen} className={`nav-tab ${screen === tab.screen ? 'active' : ''}`} onClick={() => setScreen(tab.screen)}>{tab.label}</button>)}
      </nav>
      <div className="top-actions">
        <div className="server-state"><i className="status-dot" style={{ background: online ? 'var(--accent)' : '#e5a84a', boxShadow: online ? undefined : '0 0 12px #e5a84a70' }} />{online ? 'API ONLINE' : 'LOCAL OPERATIONS'}</div>
        <button className="profile-button" onClick={() => setScreen('PROFILE')} aria-label="Open profile">
          <div className="avatar">{profile?.username?.slice(0, 1).toUpperCase() ?? 'G'}</div>
          <div className="profile-copy"><div className="profile-name">{profile?.username ?? 'GUEST OPERATOR'}</div><div className="profile-rank">{profile ? `${profile.rating} RATING` : 'UNVERIFIED'}</div></div>
        </button>
      </div>
    </header>
  )
}

function Home({ onLaunch, onSelectScreen, notify }: {
  onLaunch: (mode: GameMode) => void
  onSelectScreen: (screen: Screen) => void
  notify: (message: string) => void
}) {
  const chooseMode = (mode: GameMode | null) => mode
    ? onLaunch(mode)
    : notify('Online matchmaking is not enabled yet. Practice with bots is playable offline.')
  return (
    <main className="page">
      <div className="page-heading"><div><div className="eyebrow">COMMAND / FIELD OPERATIONS</div><h1>Choose your operation</h1></div><div className="heading-note">ARDENT DISTRICT · SECTOR 07</div></div>
      <section className="hero">
        <div className="hero-copy">
          <div className="hero-kicker">OPERATION 01 · LIVE FIRE</div>
          <h2>Hold the<br /><span>line.</span></h2>
          <p>Enter the Ardent District. Read the lanes, hold your angle, and make every round count.</p>
          <div className="hero-actions">
            <button className="primary-button" onClick={() => onLaunch('PRACTICE')}><Gamepad2 size={15} /> DEPLOY TO PRACTICE <ArrowRight size={14} /></button>
            <button className="text-button" onClick={() => onLaunch('TRAINING')}>ENTER THE RANGE <ArrowDownRight size={14} /></button>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="hero-blueprint">
            <i className="blueprint-road road-one" /><i className="blueprint-road road-two" />
            <i className="blueprint-block block-one" /><i className="blueprint-block block-two" />
            <i className="blueprint-block block-three" /><i className="blueprint-block block-four" />
            <i className="blueprint-route" /><i className="blueprint-target site-a">A</i><i className="blueprint-target site-b">B</i>
            <i className="blueprint-player" />
          </div>
          <div className="hero-coordinate">FIELD 07 / ARDENT EAST<br /><span>34° 02' 18.6" N &nbsp; 118° 14' 42.1" W</span></div>
          <div className="hero-intel"><i /> LIVE RECON <span>01:42 AGO</span></div>
        </div>
      </section>
      <div className="section-row"><div className="section-title">Select a mode</div><div className="section-meta">LOCAL TRAINING AVAILABLE · ONLINE MODES OFFLINE</div></div>
      <section className="mode-grid">
        {modes.map(({ label, description, mode, icon: Icon }) => (
          <button key={label} className="mode-card" onClick={() => chooseMode(mode)}>
            <Icon className="mode-icon" size={18} strokeWidth={1.7} /><div className="mode-name">{label}</div><div className="mode-desc">{description}</div>
          </button>
        ))}
      </section>
      <div className="lower-grid">
        <section className="panel">
          <div className="panel-head"><div className="panel-title">Active deployment</div><button className="panel-link" onClick={() => onLaunch('PRACTICE')}>BRIEFING <ArrowRight size={12} /></button></div>
          <div className="map-card">
            <div className="map-art"><i className="map-lane a" /><i className="map-lane b" /><i className="map-zone a">A</i><i className="map-zone b">B</i></div>
            <div className="map-info"><div className="eyebrow">TACTICAL MAP · 01</div><div className="map-name">Ardent District</div><div className="map-location">Eastern quarter · Old freight sector</div><div className="map-stats"><span><MapIcon size={12} /> 2 SITES</span><span><Activity size={12} /> 3 LANES</span><span><UserRound size={12} /> 4 BOTS</span></div></div>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><div className="panel-title">Operator briefing</div><button className="panel-link" onClick={() => onSelectScreen('PROFILE')}>PROFILE <ArrowRight size={12} /></button></div>
          <div className="activity-list">
            <div className="activity-item"><div className="activity-mark"><Radio size={14} /></div><div className="activity-info"><strong>Offline practice is ready</strong><span>Four hostiles · one original arena</span></div><span className="activity-result">LIVE</span></div>
            <div className="activity-item"><div className="activity-mark"><KeyRound size={14} /></div><div className="activity-info"><strong>Account services</strong><span>Create a profile to save match records</span></div><button className="panel-link" onClick={() => onSelectScreen('PROFILE')}>OPEN</button></div>
            <div className="activity-item"><div className="activity-mark"><Settings size={14} /></div><div className="activity-info"><strong>Configure your setup</strong><span>Controls, audio & graphics quality</span></div><button className="panel-link" onClick={() => onSelectScreen('SETTINGS')}>OPEN</button></div>
          </div>
        </section>
      </div>
    </main>
  )
}

function SettingsPage({ preferences, setPreferences }: {
  preferences: Preferences
  setPreferences: (value: Preferences) => void
}) {
  const update = (patch: Partial<Preferences>) => setPreferences({ ...preferences, ...patch })
  return (
    <main className="page subpage">
      <div className="page-heading"><div><div className="eyebrow">OPERATOR CONFIGURATION</div><h1>Settings</h1></div></div>
      <section className="panel content-panel settings-grid">
        <div><div className="section-title">Controls</div>
          <div className="setting-row"><div><label htmlFor="sensitivity">Mouse sensitivity</label><small>Saved to this browser</small></div><div><input id="sensitivity" type="range" min="10" max="100" value={preferences.sensitivity} onChange={(event) => update({ sensitivity: Number(event.target.value) })} /><div className="section-meta" style={{ textAlign: 'right' }}>{preferences.sensitivity}</div></div></div>
          <div className="setting-row"><div><label>Hit feedback</label><small>Show hit and elimination notices</small></div><button className={`toggle ${preferences.hitmarkers ? 'on' : ''}`} onClick={() => update({ hitmarkers: !preferences.hitmarkers })} aria-pressed={preferences.hitmarkers}><span /></button></div>
        </div>
        <div><div className="section-title">System</div>
          <div className="setting-row"><div><label htmlFor="volume"><Volume2 size={13} style={{ verticalAlign: 'middle', marginRight: 7 }} />Master volume</label><small>Audio pipeline is not yet implemented</small></div><div><input id="volume" type="range" min="0" max="100" value={preferences.volume} onChange={(event) => update({ volume: Number(event.target.value) })} /><div className="section-meta" style={{ textAlign: 'right' }}>{preferences.volume}%</div></div></div>
          <div className="setting-row"><div><label htmlFor="quality">Graphics preset</label><small>Controls renderer pixel ratio</small></div><select id="quality" value={preferences.quality} onChange={(event) => update({ quality: event.target.value })}><option>LOW</option><option>MEDIUM</option><option>HIGH</option></select></div>
        </div>
      </section>
    </main>
  )
}

const skins = [
  { name: 'Field Standard', finish: 'MATTE / OLIVE', colors: ['#667256', '#222b28'], rarity: 'ISSUED' },
  { name: 'Signal Ember', finish: 'CERAMIC / RUST', colors: ['#b86547', '#242622'], rarity: 'UNCOMMON' },
  { name: 'Night Circuit', finish: 'GRAPHITE / LIME', colors: ['#c6f36a', '#242b29'], rarity: 'RARE' },
]
function InventoryPage({ selected, onSelect }: { selected: string; onSelect: (skin: string) => void }) {
  return (
    <main className="page subpage">
      <div className="page-heading"><div><div className="eyebrow">EQUIPMENT / OPERATOR 07</div><h1>Armory</h1></div><div className="heading-note">PERSONAL ISSUE · NO MARKETPLACE</div></div>
      <section className="panel content-panel">
        <div className="section-row" style={{ marginTop: 0 }}><div className="section-title">VXR-9 Carbine finishes</div><div className="section-meta">SELECTED: {selected.toUpperCase()}</div></div>
        <div className="mode-grid">
          {skins.map((skin) => <button key={skin.name} className={`mode-card ${selected === skin.name ? 'selected' : ''}`} onClick={() => onSelect(skin.name)}><Package size={18} className="mode-icon" /><div style={{ height: 22, marginBottom: 8, background: `linear-gradient(90deg,${skin.colors[0]} 0 14%,${skin.colors[1]} 14% 82%,${skin.colors[0]} 82%)`, clipPath: 'polygon(0 40%,20% 40%,30% 0,68% 0,75% 35%,100% 35%,100% 68%,64% 68%,60% 100%,45% 100%,40% 68%,0 68%)' }} /><div className="mode-name">{skin.name}</div><div className="mode-desc">{skin.rarity} · {skin.finish}</div></button>)}
        </div>
        <p style={{ marginTop: 18, color: 'var(--muted)', fontSize: 11 }}>Original cosmetic previews only. No loot boxes, trading, or real-money purchases.</p>
      </section>
    </main>
  )
}

function ProfilePage({ profile, onAuth, onLogout, busy, error }: {
  profile: PlayerProfile | null
  onAuth: (data: { username?: string; email: string; password: string }, register: boolean) => void
  onLogout: () => void
  busy: boolean
  error: string
}) {
  const [register, setRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  return (
    <main className="page subpage">
      <div className="page-heading"><div><div className="eyebrow">IDENTITY / FIELD RECORD</div><h1>Operator profile</h1></div></div>
      {profile ? <>
        <div className="panel content-panel"><div className="eyebrow">ACTIVE OPERATOR</div><h2 style={{ margin: '9px 0', font: '600 30px Barlow Condensed' }}>{profile.username}</h2><div className="section-meta">{profile.email}</div>
          <div className="profile-stats"><div className="stat-card"><div className="stat-value">{profile.rating}</div><div className="stat-label">Rating</div></div><div className="stat-card"><div className="stat-value">{profile.wins}</div><div className="stat-label">Wins</div></div><div className="stat-card"><div className="stat-value">{profile.kills}</div><div className="stat-label">Eliminations</div></div><div className="stat-card"><div className="stat-value">{profile.losses}</div><div className="stat-label">Losses</div></div></div>
          <button className="secondary-button" onClick={onLogout}><LogOut size={14} /> SIGN OUT</button>
        </div>
      </> : <section className="panel content-panel"><div className="eyebrow">ACCOUNT SERVICES · API REQUIRED</div><div className="section-title" style={{ marginTop: 10 }}>{register ? 'Create operator account' : 'Sign in'}</div><p style={{ marginTop: 8, color: 'var(--muted)', fontSize: 11 }}>Practice works without an account. Sign in to persist your profile and completed match records.</p>
        <form className="auth-form" onSubmit={(event) => { event.preventDefault(); void onAuth({ username: register ? username : undefined, email, password }, register) }}>
          {register && <label>Operator name<input required minLength={3} maxLength={24} value={username} onChange={(event) => setUsername(event.target.value)} placeholder="FIELD_OPERATOR" /></label>}
          <label>Email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="operator@example.com" /></label>
          <label>Password<input required type="password" minLength={8} autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></label>
          {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 11 }}>{error}</div>}
          <button className="primary-button" type="submit" disabled={busy}>{busy ? 'CONNECTING…' : register ? 'CREATE ACCOUNT' : 'SIGN IN'} <ArrowRight size={14} /></button>
        </form>
        <button className="panel-link" style={{ marginTop: 14 }} onClick={() => setRegister(!register)}>{register ? 'Already registered? Sign in' : 'New operator? Create an account'}</button>
      </section>}
    </main>
  )
}

function HistoryPage({ profile, records }: { profile: PlayerProfile | null; records: MatchRecord[] }) {
  return (
    <main className="page subpage">
      <div className="page-heading"><div><div className="eyebrow">OPERATOR RECORDS</div><h1>After action</h1></div></div>
      {!profile ? <section className="panel empty-state">Sign in to save and review match history. Offline practice is available without an account.</section> : records.length === 0 ? <section className="panel empty-state">No completed matches recorded yet. Deploy to practice to create your first entry.</section> :
        <section className="panel"><div className="panel-head"><div className="panel-title">Recent operations</div><div className="section-meta">{records.length} RECORDS</div></div>{records.map((record) => <div key={record.id} className="activity-item" style={{ padding: '0 18px' }}><div className="activity-mark"><History size={14} /></div><div className="activity-info"><strong>{record.mode} · {record.result}{record.verified ? '' : ' · LOCAL / UNVERIFIED'}</strong><span>{new Date(record.createdAt).toLocaleString()} · {Math.floor(record.durationSeconds / 60)}m {record.durationSeconds % 60}s</span></div><span className="activity-result">{record.kills} ELIMS</span></div>)}</section>}
    </main>
  )
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('HOME')
  const [game, setGame] = useState<GameMode | null>(null)
  const [mode, setMode] = useState<GameMode>('PRACTICE')
  const [toast, setToast] = useState('')
  const [online, setOnline] = useState(false)
  const [authToken, setAuthToken] = useState(() => sessionStorage.getItem('breachline-token'))
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [records, setRecords] = useState<MatchRecord[]>([])
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [preferences, setPreferences] = useState<Preferences>(storedPreferences)
  const [selectedSkin, setSelectedSkin] = useState(() => localStorage.getItem('breachline-skin') ?? 'Field Standard')

  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3500)
  }
  useEffect(() => { localStorage.setItem(preferenceKey, JSON.stringify(preferences)) }, [preferences])
  useEffect(() => {
    void apiRequest<{ status: string }>('/api/health').then((health) => setOnline(health.status === 'ok')).catch(() => setOnline(false))
  }, [])
  useEffect(() => {
    if (!authToken) { setProfile(null); setRecords([]); return }
    void Promise.all([
      apiRequest<{ profile: PlayerProfile }>('/api/profile', {}, authToken),
      apiRequest<{ matches: MatchRecord[] }>('/api/matches', {}, authToken),
    ]).then(([profileResponse, historyResponse]) => {
      setProfile(profileResponse.profile)
      setRecords(historyResponse.matches)
    }).catch((error: Error) => {
      sessionStorage.removeItem('breachline-token')
      setAuthToken(null)
      setProfile(null)
      setAuthError(error.message)
    })
  }, [authToken])

  const authenticate = async (data: { username?: string; email: string; password: string }, register: boolean) => {
    setAuthBusy(true); setAuthError('')
    try {
      const response = await apiRequest<{ token: string; profile: PlayerProfile }>(`/api/auth/${register ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify(data) })
      sessionStorage.setItem('breachline-token', response.token)
      setAuthToken(response.token)
      setProfile(response.profile)
      notify(`Welcome, ${response.profile.username}.`)
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Authentication failed.')
    } finally { setAuthBusy(false) }
  }
  const logout = () => {
    sessionStorage.removeItem('breachline-token')
    setAuthToken(null); setProfile(null); setRecords([])
    notify('Signed out.')
  }
  const completeMatch = useCallback(async (result: { mode: string; result: string; kills: number; durationSeconds: number }) => {
    if (!authToken) return
    try {
      const response = await apiRequest<{ match: MatchRecord }>('/api/matches', { method: 'POST', body: JSON.stringify(result) }, authToken)
      setRecords((old) => [response.match, ...old].slice(0, 20))
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not save this match.')
    }
  }, [authToken])
  if (game) return <Suspense fallback={<main className="game-shell" style={{ display: 'grid', placeItems: 'center', color: 'var(--accent)' }}>LOADING FIELD SYSTEMS…</main>}><Arena mode={game} onExit={() => setGame(null)} onComplete={completeMatch} sensitivity={preferences.sensitivity} quality={preferences.quality} weaponSkin={selectedSkin} /></Suspense>
  const launch = (selectedMode: GameMode) => { setMode(selectedMode); setGame(selectedMode) }
  return (
    <div className="app-shell">
      <Header screen={screen} setScreen={setScreen} profile={profile} online={online} />
      {screen === 'HOME' && <Home onLaunch={launch} onSelectScreen={setScreen} notify={notify} />}
      {screen === 'INVENTORY' && <InventoryPage selected={selectedSkin} onSelect={(skin) => { localStorage.setItem('breachline-skin', skin); setSelectedSkin(skin) }} />}
      {screen === 'SETTINGS' && <SettingsPage preferences={preferences} setPreferences={setPreferences} />}
      {screen === 'PROFILE' && <ProfilePage profile={profile} onAuth={authenticate} onLogout={logout} busy={authBusy} error={authError} />}
      {screen === 'HISTORY' && <HistoryPage profile={profile} records={records} />}
      {toast && <div className="toast" role="status">{toast}</div>}
      <footer style={{ maxWidth: 1420, width: '100%', margin: 'auto', padding: '0 clamp(20px,5vw,84px) 25px', color: '#66716b', font: '10px Barlow Condensed', letterSpacing: 1.4 }}>
        BREACHLINE FIELD SYSTEMS · ORIGINAL PROTOTYPE · LOCAL PRACTICE {mode ? `· LAST SELECTED ${mode}` : ''}
      </footer>
    </div>
  )
}
