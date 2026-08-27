import React, { useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { SwissEphemeris, Planet, HouseSystem } from '@swisseph/browser'
import './styles.css'

type PlanetRow = {
  name: string
  glyph: string
  longitude: number
  signIndex: number
  sign: string
  degree: number
  minute: number
  house: number
  ruler: string
  speed: number
  retrograde: boolean
}

type ChartData = {
  utcIso: string
  jd: number
  ascendant: number
  mc: number
  ascSignIndex: number
  ascSign: string
  wholeSignCusps: number[]
  planets: PlanetRow[]
  aspects: AspectRow[]
}

type AspectRow = {
  a: string
  b: string
  separation: number
  aspect: string
  exactness: number
  wholeSign: boolean
}

const SIGNS = [
  ['Aries','♈','Mars'],
  ['Taurus','♉','Venus'],
  ['Gemini','♊','Mercury'],
  ['Cancer','♋','Moon'],
  ['Leo','♌','Sun'],
  ['Virgo','♍','Mercury'],
  ['Libra','♎','Venus'],
  ['Scorpio','♏','Mars'],
  ['Sagittarius','♐','Jupiter'],
  ['Capricorn','♑','Saturn'],
  ['Aquarius','♒','Saturn'],
  ['Pisces','♓','Jupiter'],
] as const

const PLANETS = [
  { id: Planet.Sun, name: 'Sun', glyph: '☉' },
  { id: Planet.Moon, name: 'Moon', glyph: '☽' },
  { id: Planet.Mercury, name: 'Mercury', glyph: '☿' },
  { id: Planet.Venus, name: 'Venus', glyph: '♀' },
  { id: Planet.Mars, name: 'Mars', glyph: '♂' },
  { id: Planet.Jupiter, name: 'Jupiter', glyph: '♃' },
  { id: Planet.Saturn, name: 'Saturn', glyph: '♄' },
] as const

const ASPECTS = [
  { name: 'Conjunction', angle: 0, signDistance: 0 },
  { name: 'Sextile', angle: 60, signDistance: 2 },
  { name: 'Square', angle: 90, signDistance: 3 },
  { name: 'Trine', angle: 120, signDistance: 4 },
  { name: 'Opposition', angle: 180, signDistance: 6 },
]

function norm(n:number){ return ((n % 360) + 360) % 360 }
function signIndex(lon:number){ return Math.floor(norm(lon) / 30) }
function signDegree(lon:number){ return norm(lon) % 30 }
function houseFromSigns(bodySign:number, ascSign:number){ return ((bodySign - ascSign + 12) % 12) + 1 }
function fmtLon(lon:number){
  const s = signIndex(lon)
  const d = signDegree(lon)
  const deg = Math.floor(d)
  const min = Math.floor((d-deg)*60)
  return `${String(deg).padStart(2,'0')}° ${SIGNS[s][1]} ${SIGNS[s][0]} ${String(min).padStart(2,'0')}′`
}
function angularDistance(a:number,b:number){
  const d = Math.abs(norm(a)-norm(b))
  return d > 180 ? 360-d : d
}
function wholeSignDistance(a:number,b:number){
  const d = Math.abs(a-b)
  return Math.min(d, 12-d)
}
function parseUtc(date:string,time:string,offset:string){
  const [y,m,d] = date.split('-').map(Number)
  const [hh,mm] = time.split(':').map(Number)
  const off = Number(offset)
  const utcMs = Date.UTC(y,m-1,d,hh,mm) - off*60*60*1000
  return new Date(utcMs)
}

function App(){
  const [ready,setReady] = useState(false)
  const [status,setStatus] = useState('Loading Swiss Ephemeris…')
  const [swe,setSwe] = useState<SwissEphemeris|null>(null)

  const [date,setDate] = useState('1999-04-23')
  const [time,setTime] = useState('21:10')
  const [offset,setOffset] = useState('-5')
  const [lat,setLat] = useState('41.8781')
  const [lon,setLon] = useState('-87.6298')
  const [orb,setOrb] = useState(3)
  const [chart,setChart] = useState<ChartData|null>(null)
  const [selected,setSelected] = useState<string>('Ascendant')

  useEffect(()=>{
    let active = true
    const instance = new SwissEphemeris()
    instance.init().then(()=>{
      if(!active) return
      setSwe(instance)
      setReady(true)
      setStatus('Ephemeris ready')
    }).catch((e)=>{
      console.error(e)
      setStatus('Could not initialize Swiss Ephemeris')
    })
    return ()=>{ active=false; try{ instance.close() }catch{} }
  },[])

  const selectedBody = useMemo(()=>{
    if(!chart) return null
    if(selected==='Ascendant') return {
      name:'Ascendant', glyph:'ASC', longitude:chart.ascendant,
      sign:chart.ascSign, house:1, ruler:SIGNS[chart.ascSignIndex][2], retrograde:false, speed:0
    }
    const p = chart.planets.find(p=>p.name===selected)
    return p || null
  },[chart,selected])

  function calculate(){
    if(!swe) return
    const latitude = Number(lat), longitude = Number(lon)
    if(!date || !time || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -89.9 || latitude > 89.9 || longitude < -180 || longitude > 180){
      setStatus('Check date, time, latitude, and longitude.')
      return
    }
    const utc = parseUtc(date,time,offset)
    const hour = utc.getUTCHours()+utc.getUTCMinutes()/60+utc.getUTCSeconds()/3600
    const jd = swe.julianDay(utc.getUTCFullYear(), utc.getUTCMonth()+1, utc.getUTCDate(), hour)

    // Whole Sign cusps are derived from the sign containing the Ascendant.
    // We use Swiss Ephemeris to obtain the actual Ascendant/MC angles.
    const houses = swe.calculateHouses(jd, latitude, longitude, HouseSystem.WholeSign)
    const asc = norm(houses.ascendant)
    const ascIdx = signIndex(asc)

    const rows:PlanetRow[] = PLANETS.map(meta=>{
      const pos = swe.calculatePosition(jd, meta.id)
      const sl = norm(pos.longitude)
      const si = signIndex(sl)
      const sd = signDegree(sl)
      const deg = Math.floor(sd)
      const minute = Math.floor((sd-deg)*60)
      return {
        name:meta.name, glyph:meta.glyph, longitude:sl, signIndex:si,
        sign:SIGNS[si][0], degree:deg, minute,
        house:houseFromSigns(si,ascIdx), ruler:SIGNS[si][2],
        speed:pos.longitudeSpeed, retrograde:pos.longitudeSpeed < 0
      }
    })

    const aspects:AspectRow[] = []
    for(let i=0;i<rows.length;i++){
      for(let j=i+1;j<rows.length;j++){
        const sep = angularDistance(rows[i].longitude,rows[j].longitude)
        const ws = wholeSignDistance(rows[i].signIndex,rows[j].signIndex)
        let best = ASPECTS[0], bestDelta = 999
        for(const a of ASPECTS){
          const delta = Math.abs(sep-a.angle)
          if(delta<bestDelta){ best=a; bestDelta=delta }
        }
        if(bestDelta <= orb || ASPECTS.some(a=>a.signDistance===ws)){
          const wsAsp = ASPECTS.find(a=>a.signDistance===ws)
          aspects.push({
            a:rows[i].name,b:rows[j].name,separation:sep,
            aspect: wsAsp?.name || best.name,
            exactness:bestDelta,
            wholeSign:!!wsAsp
          })
        }
      }
    }

    setChart({
      utcIso:utc.toISOString(), jd, ascendant:asc, mc:norm(houses.mc),
      ascSignIndex:ascIdx, ascSign:SIGNS[ascIdx][0],
      wholeSignCusps:Array.from({length:12},(_,i)=>((ascIdx+i)%12)*30),
      planets:rows, aspects
    })
    setSelected('Ascendant')
    setStatus('Calculated locally in your browser')
  }

  return <main className="app">
    <header className="hero">
      <div>
        <p className="eyebrow">HELLENISTIC LIFE LAB · PROTOTYPE 01</p>
        <h1>Examine a Life</h1>
        <p className="lede">A calculation-first Whole Sign astrology workspace. Every conclusion should be traceable to a number.</p>
      </div>
      <div className={`engine ${ready?'ready':''}`}>
        <span className="dot"/><div><strong>{ready?'Engine ready':'Initializing'}</strong><small>{status}</small></div>
      </div>
    </header>

    <section className="inputGrid">
      <label>Date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
      <label>Local time<input type="time" value={time} onChange={e=>setTime(e.target.value)}/></label>
      <label>UTC offset<select value={offset} onChange={e=>setOffset(e.target.value)}>
        {Array.from({length:29},(_,i)=>i-14).map(v=><option key={v} value={v}>{v>=0?'+':''}{v}:00</option>)}
      </select></label>
      <label>Latitude<input inputMode="decimal" value={lat} onChange={e=>setLat(e.target.value)}/></label>
      <label>Longitude<input inputMode="decimal" value={lon} onChange={e=>setLon(e.target.value)}/></label>
      <button className="primary" onClick={calculate} disabled={!ready}>{ready?'Calculate nativity':'Loading ephemeris…'}</button>
    </section>

    {!chart ? <section className="emptyState">
      <div className="orbital">
        <span>☉</span><span>☽</span><span>♄</span>
      </div>
      <h2>Begin with the astronomy.</h2>
      <p>This first prototype calculates UTC, Julian Day, the Ascendant, MC, the seven traditional planets, retrogradation, Whole Sign houses, domicile rulers, and aspect geometry.</p>
    </section> :
    <>
      <section className="metrics">
        <article><span>UTC</span><strong>{chart.utcIso.replace('.000Z','Z')}</strong><small>local time − UTC offset</small></article>
        <article><span>Julian Day</span><strong>{chart.jd.toFixed(6)}</strong><small>ephemeris time key</small></article>
        <article><span>Ascendant</span><strong>{fmtLon(chart.ascendant)}</strong><small>Whole Sign house 1 = {chart.ascSign}</small></article>
        <article><span>MC</span><strong>{fmtLon(chart.mc)}</strong><small>angle retained independently</small></article>
      </section>

      <section className="workspace">
        <div className="wheelPanel">
          <div className="sectionHead"><div><p className="eyebrow">WHOLE SIGN MAP</p><h2>Sign → house architecture</h2></div><span className="pill">{chart.ascSign} rising</span></div>
          <div className="signRing">
            {Array.from({length:12},(_,house)=>{
              const si=(chart.ascSignIndex+house)%12
              const inHouse=chart.planets.filter(p=>p.house===house+1)
              return <button key={house} className="houseCard" onClick={()=>setSelected(inHouse[0]?.name || 'Ascendant')}>
                <span className="houseNo">{house+1}</span>
                <span className="signGlyph">{SIGNS[si][1]}</span>
                <strong>{SIGNS[si][0]}</strong>
                <small>ruled by {SIGNS[si][2]}</small>
                <div className="miniPlanets">{inHouse.map(p=><span key={p.name} title={p.name}>{p.glyph}</span>)}</div>
              </button>
            })}
          </div>
        </div>

        <aside className="inspector">
          <p className="eyebrow">CALCULATION INSPECTOR</p>
          {selectedBody && <>
            <div className="inspectorTitle"><span>{selectedBody.glyph}</span><div><h2>{selectedBody.name}</h2><p>{fmtLon(selectedBody.longitude)}</p></div></div>
            <dl>
              <div><dt>Ecliptic longitude</dt><dd>{selectedBody.longitude.toFixed(6)}°</dd></div>
              <div><dt>Sign</dt><dd>{selectedBody.sign}</dd></div>
              <div><dt>Whole Sign house</dt><dd>{selectedBody.house}</dd></div>
              <div><dt>Domicile ruler</dt><dd>{selectedBody.ruler}</dd></div>
              {selectedBody.name!=='Ascendant' && <><div><dt>Daily longitude speed</dt><dd>{selectedBody.speed.toFixed(6)}°/day</dd></div>
              <div><dt>Motion</dt><dd>{selectedBody.retrograde?'Retrograde':'Direct'}</dd></div></>}
            </dl>
            <div className="formula">
              <span>HOUSE FORMULA</span>
              <code>((planetSign − ascSign + 12) mod 12) + 1</code>
            </div>
          </>}
        </aside>
      </section>

      <section className="tableSection">
        <div className="sectionHead"><div><p className="eyebrow">SEVEN WANDERERS</p><h2>Traditional planets</h2></div><span className="pill">Tropical · Whole Sign</span></div>
        <div className="tableWrap"><table>
          <thead><tr><th>Planet</th><th>Longitude</th><th>House</th><th>Sign ruler</th><th>Speed</th><th>Motion</th></tr></thead>
          <tbody>{chart.planets.map(p=><tr key={p.name} className={selected===p.name?'selected':''} onClick={()=>setSelected(p.name)}>
            <td><span className="pg">{p.glyph}</span>{p.name}</td><td>{fmtLon(p.longitude)}</td><td>{p.house}</td><td>{p.ruler}</td>
            <td>{p.speed.toFixed(4)}°/d</td><td>{p.retrograde?<span className="retro">℞ Retrograde</span>:'Direct'}</td>
          </tr>)}</tbody>
        </table></div>
      </section>

      <section className="aspectSection">
        <div className="sectionHead"><div><p className="eyebrow">CONFIGURATION</p><h2>Aspect geometry</h2></div>
          <label className="orb">Degree orb <input type="range" min="0" max="8" step="0.5" value={orb} onChange={e=>setOrb(Number(e.target.value))}/><b>{orb}°</b></label>
        </div>
        <p className="note">Whole-sign configurations are shown even when the planets are not within the selected degree orb. This keeps sign-based Hellenistic testimony distinct from modern degree-orb filtering.</p>
        <div className="aspectGrid">{chart.aspects.map((a,i)=><article key={i}>
          <strong>{a.a} — {a.b}</strong><span>{a.aspect}</span><small>{a.separation.toFixed(2)}° separation · {a.wholeSign?'whole-sign configured':'degree-orb only'}</small>
        </article>)}</div>
      </section>

      <section className="pipeline">
        <p className="eyebrow">HOW THIS JUDGMENT IS BUILT</p>
        <div className="steps">
          {['Local birth time','UTC conversion','Julian Day','Swiss Ephemeris','Ecliptic longitude','Ascendant sign','Whole Sign house','Traditional condition'].map((s,i)=><div key={s}><span>{i+1}</span><strong>{s}</strong></div>)}
        </div>
      </section>
    </>}
    <footer>Prototype rule: calculations first, interpretation second. No opaque “life score.”</footer>
  </main>
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
