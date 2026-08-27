import React, { useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { SwissEphemeris, Planet, HouseSystem } from '@swisseph/browser'
import './styles.css'

type LocationResult = {
  id:number
  name:string
  latitude:number
  longitude:number
  timezone:string
  country?:string
  admin1?:string
}

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

type AspectRow = {
  a: string
  b: string
  separation: number
  aspect: string
  exactness: number
  wholeSign: boolean
}

type DailyTopic = {
  name:string
  houses:number[]
  tone:'Supportive'|'Active'|'Mixed'|'Demanding'|'Quiet'
  score:number
  summary:string
  reasons:string[]
}

type ChartData = {
  utcIso: string
  utcOffsetMinutes:number
  utcOffsetLabel:string
  timezone:string
  locationName:string
  latitude:number
  longitude:number
  jd: number
  ascendant: number
  mc: number
  ascSignIndex: number
  ascSign: string
  planets: PlanetRow[]
  aspects: AspectRow[]
}

const SIGNS = [
  ['Aries','♈','Mars'],['Taurus','♉','Venus'],['Gemini','♊','Mercury'],['Cancer','♋','Moon'],
  ['Leo','♌','Sun'],['Virgo','♍','Mercury'],['Libra','♎','Venus'],['Scorpio','♏','Mars'],
  ['Sagittarius','♐','Jupiter'],['Capricorn','♑','Saturn'],['Aquarius','♒','Saturn'],['Pisces','♓','Jupiter'],
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

const TOPICS = [
  {name:'Self & vitality',houses:[1]},
  {name:'Money & resources',houses:[2]},
  {name:'Home & foundations',houses:[4]},
  {name:'Creativity & pleasure',houses:[5]},
  {name:'Work & health routines',houses:[6]},
  {name:'Relationships',houses:[7]},
  {name:'Study, belief & travel',houses:[9]},
  {name:'Career & reputation',houses:[10]},
  {name:'Friends & community',houses:[11]},
]

function norm(n:number){ return ((n % 360) + 360) % 360 }
function signIndex(lon:number){ return Math.floor(norm(lon) / 30) }
function signDegree(lon:number){ return norm(lon) % 30 }
function houseFromSigns(bodySign:number, ascSign:number){ return ((bodySign - ascSign + 12) % 12) + 1 }
function fmtLon(lon:number){
  const s = signIndex(lon), d = signDegree(lon)
  const deg = Math.floor(d), min = Math.floor((d-deg)*60)
  return `${String(deg).padStart(2,'0')}° ${SIGNS[s][1]} ${SIGNS[s][0]} ${String(min).padStart(2,'0')}′`
}
function angularDistance(a:number,b:number){
  const d = Math.abs(norm(a)-norm(b)); return d > 180 ? 360-d : d
}
function wholeSignDistance(a:number,b:number){
  const d = Math.abs(a-b); return Math.min(d, 12-d)
}
function pad(n:number){ return String(n).padStart(2,'0') }

function getOffsetMinutes(timeZone:string, date:Date){
  const parts = new Intl.DateTimeFormat('en-US',{
    timeZone, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',
    hourCycle:'h23'
  }).formatToParts(date)
  const map:Record<string,string> = {}
  for(const p of parts) if(p.type!=='literal') map[p.type]=p.value
  const asUTC = Date.UTC(+map.year,+map.month-1,+map.day,+map.hour,+map.minute,+map.second)
  return Math.round((asUTC-date.getTime())/60000)
}

function localBirthToUtc(date:string,time:string,timeZone:string){
  const [y,m,d] = date.split('-').map(Number)
  const [hh,mm] = time.split(':').map(Number)
  let guess = new Date(Date.UTC(y,m-1,d,hh,mm))
  for(let i=0;i<3;i++){
    const offset = getOffsetMinutes(timeZone,guess)
    guess = new Date(Date.UTC(y,m-1,d,hh,mm)-offset*60000)
  }
  return {date:guess, offsetMinutes:getOffsetMinutes(timeZone,guess)}
}

function offsetLabel(minutes:number){
  const sign = minutes>=0?'+':'−'
  const a=Math.abs(minutes)
  return `UTC${sign}${Math.floor(a/60)}:${pad(a%60)}`
}

function ageOnDate(birth:string, now:Date){
  const [y,m,d]=birth.split('-').map(Number)
  let age=now.getUTCFullYear()-y
  const before = now.getUTCMonth()+1 < m || (now.getUTCMonth()+1===m && now.getUTCDate()<d)
  if(before) age--
  return Math.max(0,age)
}

function calculateRows(swe:SwissEphemeris,jd:number,ascIdx:number){
  return PLANETS.map(meta=>{
    const pos=swe.calculatePosition(jd,meta.id)
    const sl=norm(pos.longitude),si=signIndex(sl),sd=signDegree(sl)
    return {
      name:meta.name,glyph:meta.glyph,longitude:sl,signIndex:si,sign:SIGNS[si][0],
      degree:Math.floor(sd),minute:Math.floor((sd-Math.floor(sd))*60),
      house:houseFromSigns(si,ascIdx),ruler:SIGNS[si][2],speed:pos.longitudeSpeed,
      retrograde:pos.longitudeSpeed<0
    }
  })
}

function buildAspects(rows:PlanetRow[],orb:number){
  const aspects:AspectRow[]=[]
  for(let i=0;i<rows.length;i++) for(let j=i+1;j<rows.length;j++){
    const sep=angularDistance(rows[i].longitude,rows[j].longitude)
    const ws=wholeSignDistance(rows[i].signIndex,rows[j].signIndex)
    let best=ASPECTS[0],bestDelta=999
    for(const a of ASPECTS){ const delta=Math.abs(sep-a.angle); if(delta<bestDelta){best=a;bestDelta=delta} }
    const wsAsp=ASPECTS.find(a=>a.signDistance===ws)
    if(bestDelta<=orb || wsAsp) aspects.push({
      a:rows[i].name,b:rows[j].name,separation:sep,aspect:wsAsp?.name||best.name,
      exactness:bestDelta,wholeSign:!!wsAsp
    })
  }
  return aspects
}

function dailyTopics(chart:ChartData,swe:SwissEphemeris,birthDate:string){
  const now=new Date()
  const jd=swe.julianDay(now.getUTCFullYear(),now.getUTCMonth()+1,now.getUTCDate(),12)
  const transits=calculateRows(swe,jd,chart.ascSignIndex)
  const age=ageOnDate(birthDate,now)
  const profectedHouse=(age%12)+1
  const profectedSign=(chart.ascSignIndex+profectedHouse-1)%12
  const lord=SIGNS[profectedSign][2]
  const natalLord=chart.planets.find(p=>p.name===lord)

  const benefics=['Venus','Jupiter']
  const malefics=['Mars','Saturn']

  const result:DailyTopic[]=TOPICS.map(topic=>{
    let score=0
    const reasons:string[]=[]
    if(topic.houses.includes(profectedHouse)){
      score+=2
      reasons.push(`Annual profection activates House ${profectedHouse}.`)
    }
    for(const t of transits){
      if(topic.houses.includes(t.house)){
        if(benefics.includes(t.name)){score+=1.25; reasons.push(`${t.name} is moving through this natal house.`)}
        else if(malefics.includes(t.name)){score-=1.1; reasons.push(`${t.name} is moving through this natal house.`)}
        else if(t.name==='Moon'){score+=.35; reasons.push(`The Moon brings short-term movement here today.`)}
        else {score+=.2}
      }
      if(natalLord){
        const sd=wholeSignDistance(t.signIndex,natalLord.signIndex)
        const asp=ASPECTS.find(a=>a.signDistance===sd)
        if(asp && t.name!==lord){
          if(t.name==='Jupiter'||t.name==='Venus'){score+=.45; if(topic.houses.includes(profectedHouse)) reasons.push(`${t.name} ${asp.name.toLowerCase()}s the natal Lord of the Year by sign.`)}
          if(t.name==='Mars'||t.name==='Saturn'){score-=.4; if(topic.houses.includes(profectedHouse)) reasons.push(`${t.name} ${asp.name.toLowerCase()}s the natal Lord of the Year by sign.`)}
        }
      }
    }
    score=Math.max(-3,Math.min(4,score))
    let tone:DailyTopic['tone']='Quiet'
    if(score>=2) tone='Supportive'
    else if(score>=.6) tone='Active'
    else if(score<=-1.3) tone='Demanding'
    else if(score<.2 && score>-.2) tone='Quiet'
    else tone='Mixed'

    const summary =
      tone==='Supportive' ? 'More testimony is gathering around this area; it is a useful place to put conscious effort today.' :
      tone==='Active' ? 'This topic is comparatively active today and may ask for attention, decisions, or movement.' :
      tone==='Demanding' ? 'This area carries more difficult testimony today; favor patience, structure, and fewer assumptions.' :
      tone==='Mixed' ? 'Supportive and difficult testimonies are interwoven here today; treat the topic as nuanced rather than simply good or bad.' :
      'This area is not especially emphasized by the techniques used in this prototype today.'

    return {name:topic.name,houses:topic.houses,tone,score,summary,reasons:reasons.slice(0,3)}
  })

  return {age,profectedHouse,profectedSign:SIGNS[profectedSign][0],lord,result,transits}
}

function App(){
  const [ready,setReady]=useState(false)
  const [status,setStatus]=useState('Loading Swiss Ephemeris…')
  const [swe,setSwe]=useState<SwissEphemeris|null>(null)

  const [date,setDate]=useState('1999-04-23')
  const [time,setTime]=useState('21:10')
  const [locationQuery,setLocationQuery]=useState('Chicago')
  const [locationResults,setLocationResults]=useState<LocationResult[]>([])
  const [location,setLocation]=useState<LocationResult|null>(null)
  const [searching,setSearching]=useState(false)
  const [orb,setOrb]=useState(3)
  const [chart,setChart]=useState<ChartData|null>(null)
  const [selected,setSelected]=useState<string>('Ascendant')
  const [daily,setDaily]=useState<ReturnType<typeof dailyTopics>|null>(null)

  useEffect(()=>{
    let active=true
    const instance=new SwissEphemeris()
    instance.init().then(()=>{if(active){setSwe(instance);setReady(true);setStatus('Ephemeris ready')}})
      .catch(e=>{console.error(e);setStatus('Could not initialize Swiss Ephemeris')})
    return()=>{active=false;try{instance.close()}catch{}}
  },[])

  async function searchLocation(){
    if(locationQuery.trim().length<2) return
    setSearching(true)
    try{
      const url=`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationQuery.trim())}&count=6&language=en&format=json`
      const r=await fetch(url)
      const data=await r.json()
      setLocationResults((data.results||[]) as LocationResult[])
      if(!(data.results||[]).length) setStatus('No matching location found.')
    }catch(e){
      console.error(e); setStatus('Location search failed. Try again.')
    }finally{setSearching(false)}
  }

  function chooseLocation(x:LocationResult){
    setLocation(x)
    setLocationQuery([x.name,x.admin1,x.country].filter(Boolean).join(', '))
    setLocationResults([])
    setStatus(`Location resolved: ${x.timezone}`)
  }

  function calculate(){
    if(!swe || !location){setStatus('Choose a birthplace from the location results first.');return}
    const resolved=localBirthToUtc(date,time,location.timezone)
    const utc=resolved.date
    const hour=utc.getUTCHours()+utc.getUTCMinutes()/60+utc.getUTCSeconds()/3600
    const jd=swe.julianDay(utc.getUTCFullYear(),utc.getUTCMonth()+1,utc.getUTCDate(),hour)
    const houses=swe.calculateHouses(jd,location.latitude,location.longitude,HouseSystem.WholeSign)
    const asc=norm(houses.ascendant),ascIdx=signIndex(asc)
    const rows=calculateRows(swe,jd,ascIdx)
    const built:ChartData={
      utcIso:utc.toISOString(),utcOffsetMinutes:resolved.offsetMinutes,utcOffsetLabel:offsetLabel(resolved.offsetMinutes),
      timezone:location.timezone,locationName:[location.name,location.country].filter(Boolean).join(', '),
      latitude:location.latitude,longitude:location.longitude,jd,ascendant:asc,mc:norm(houses.mc),
      ascSignIndex:ascIdx,ascSign:SIGNS[ascIdx][0],planets:rows,aspects:buildAspects(rows,orb)
    }
    setChart(built);setSelected('Ascendant');setDaily(dailyTopics(built,swe,date))
    setStatus('Calculated locally after resolving birthplace and historical timezone offset')
  }

  useEffect(()=>{
    if(chart && swe){
      setChart({...chart,aspects:buildAspects(chart.planets,orb)})
    }
  },[orb])

  const selectedBody=useMemo(()=>{
    if(!chart)return null
    if(selected==='Ascendant')return{name:'Ascendant',glyph:'ASC',longitude:chart.ascendant,sign:chart.ascSign,house:1,ruler:SIGNS[chart.ascSignIndex][2],retrograde:false,speed:0}
    return chart.planets.find(p=>p.name===selected)||null
  },[chart,selected])

  return <main className="app">
    <header className="hero">
      <div><p className="eyebrow">HELLENISTIC LIFE · PROTOTYPE 02</p><h1>Examine a Life</h1>
      <p className="lede">Enter the birth details. The site resolves place, coordinates, historical UTC offset, and then exposes every major calculation.</p></div>
      <div className={`engine ${ready?'ready':''}`}><span className="dot"/><div><strong>{ready?'Engine ready':'Initializing'}</strong><small>{status}</small></div></div>
    </header>

    <section className="birthPanel">
      <div className="fieldRow">
        <label>Date of birth<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
        <label>Exact local birth time<input type="time" value={time} onChange={e=>setTime(e.target.value)}/></label>
        <div className="locationField">
          <label>Birthplace
            <div className="searchBox"><input value={locationQuery} onChange={e=>{setLocationQuery(e.target.value);setLocation(null)}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();searchLocation()}}} placeholder="City, state or country"/>
            <button type="button" onClick={searchLocation}>{searching?'Searching…':'Find'}</button></div>
          </label>
          {locationResults.length>0&&<div className="results">
            {locationResults.map(x=><button type="button" key={x.id} onClick={()=>chooseLocation(x)}>
              <strong>{x.name}</strong><span>{[x.admin1,x.country].filter(Boolean).join(', ')}</span><small>{x.timezone}</small>
            </button>)}
          </div>}
        </div>
        <button className="primary" onClick={calculate} disabled={!ready||!location}>{ready?(location?'Calculate nativity':'Choose birthplace'):'Loading ephemeris…'}</button>
      </div>
      {location&&<div className="resolved">
        <span>Resolved birthplace</span><strong>{[location.name,location.admin1,location.country].filter(Boolean).join(', ')}</strong>
        <code>{location.latitude.toFixed(4)}°, {location.longitude.toFixed(4)}° · {location.timezone}</code>
      </div>}
    </section>

    {!chart?<section className="emptyState"><div className="orbital"><span>☉</span><span>☽</span><span>♄</span></div><h2>Birthplace determines the clock.</h2>
      <p>You no longer enter UTC manually. Choose a real birthplace and the app resolves its IANA timezone and the offset applicable to the birth date — including half-hour zones such as UTC+5:30.</p></section>:
    <>
      <section className="timelineCalc">
        <div className="timelineTitle"><p className="eyebrow">TIME RESOLUTION</p><h2>Local birth time → Universal Time</h2></div>
        <div className="timeFlow">
          <article><span>01</span><small>Birthplace</small><strong>{chart.locationName}</strong><em>{chart.timezone}</em></article>
          <b>→</b>
          <article><span>02</span><small>Local civil time</small><strong>{date} · {time}</strong><em>as entered</em></article>
          <b>→</b>
          <article><span>03</span><small>Resolved offset</small><strong>{chart.utcOffsetLabel}</strong><em>{chart.utcOffsetMinutes} minutes</em></article>
          <b>→</b>
          <article><span>04</span><small>Universal Time</small><strong>{chart.utcIso.replace('.000Z','Z')}</strong><em>ephemeris input</em></article>
        </div>
      </section>

      <section className="metrics">
        <article><span>Julian Day</span><strong>{chart.jd.toFixed(6)}</strong><small>ephemeris time key</small></article>
        <article><span>Coordinates</span><strong>{chart.latitude.toFixed(4)}°, {chart.longitude.toFixed(4)}°</strong><small>resolved from birthplace</small></article>
        <article><span>Ascendant</span><strong>{fmtLon(chart.ascendant)}</strong><small>House 1 = {chart.ascSign}</small></article>
        <article><span>MC</span><strong>{fmtLon(chart.mc)}</strong><small>angle retained independently</small></article>
      </section>

      {daily&&<section className="daily">
        <div className="sectionHead"><div><p className="eyebrow">TODAY · TRADITIONAL TIMING</p><h2>Where life is activated now</h2>
          <p className="note">Symbolic astrological interpretation, not a factual prediction. Prototype uses annual profection plus today’s traditional planetary transits.</p></div>
          <div className="profection"><span>Age {daily.age}</span><strong>House {daily.profectedHouse}</strong><small>{daily.profectedSign} · Lord: {daily.lord}</small></div>
        </div>
        <div className="topicGrid">{daily.result.map(t=><article key={t.name} className={`tone ${t.tone.toLowerCase()}`}>
          <div className="topicTop"><h3>{t.name}</h3><span>{t.tone}</span></div>
          <p>{t.summary}</p>
          {t.reasons.length>0&&<details><summary>Why?</summary><ul>{t.reasons.map((r,i)=><li key={i}>{r}</li>)}</ul></details>}
        </article>)}</div>
      </section>}

      <section className="workspace">
        <div className="wheelPanel">
          <div className="sectionHead"><div><p className="eyebrow">WHOLE SIGN MAP</p><h2>Sign → house architecture</h2></div><span className="pill">{chart.ascSign} rising</span></div>
          <div className="signRing">{Array.from({length:12},(_,house)=>{
            const si=(chart.ascSignIndex+house)%12, inHouse=chart.planets.filter(p=>p.house===house+1)
            return <button key={house} className="houseCard" onClick={()=>setSelected(inHouse[0]?.name||'Ascendant')}>
              <span className="houseNo">{house+1}</span><span className="signGlyph">{SIGNS[si][1]}</span><strong>{SIGNS[si][0]}</strong><small>ruled by {SIGNS[si][2]}</small>
              <div className="miniPlanets">{inHouse.map(p=><span key={p.name} title={p.name}>{p.glyph}</span>)}</div></button>
          })}</div>
        </div>
        <aside className="inspector"><p className="eyebrow">CALCULATION INSPECTOR</p>{selectedBody&&<>
          <div className="inspectorTitle"><span>{selectedBody.glyph}</span><div><h2>{selectedBody.name}</h2><p>{fmtLon(selectedBody.longitude)}</p></div></div>
          <dl><div><dt>Ecliptic longitude</dt><dd>{selectedBody.longitude.toFixed(6)}°</dd></div><div><dt>Sign</dt><dd>{selectedBody.sign}</dd></div>
          <div><dt>Whole Sign house</dt><dd>{selectedBody.house}</dd></div><div><dt>Domicile ruler</dt><dd>{selectedBody.ruler}</dd></div>
          {selectedBody.name!=='Ascendant'&&<><div><dt>Daily longitude speed</dt><dd>{selectedBody.speed.toFixed(6)}°/day</dd></div><div><dt>Motion</dt><dd>{selectedBody.retrograde?'Retrograde':'Direct'}</dd></div></>}</dl>
          <div className="formula"><span>HOUSE FORMULA</span><code>((planetSign − ascSign + 12) mod 12) + 1</code></div></>}</aside>
      </section>

      <section className="tableSection"><div className="sectionHead"><div><p className="eyebrow">SEVEN WANDERERS</p><h2>Traditional planets</h2></div><span className="pill">Tropical · Whole Sign</span></div>
        <div className="tableWrap"><table><thead><tr><th>Planet</th><th>Longitude</th><th>House</th><th>Sign ruler</th><th>Speed</th><th>Motion</th></tr></thead>
        <tbody>{chart.planets.map(p=><tr key={p.name} className={selected===p.name?'selected':''} onClick={()=>setSelected(p.name)}>
          <td><span className="pg">{p.glyph}</span>{p.name}</td><td>{fmtLon(p.longitude)}</td><td>{p.house}</td><td>{p.ruler}</td><td>{p.speed.toFixed(4)}°/d</td><td>{p.retrograde?<span className="retro">℞ Retrograde</span>:'Direct'}</td>
        </tr>)}</tbody></table></div>
      </section>

      <section className="aspectSection"><div className="sectionHead"><div><p className="eyebrow">CONFIGURATION</p><h2>Aspect geometry</h2></div>
        <label className="orb">Degree orb <input type="range" min="0" max="8" step="0.5" value={orb} onChange={e=>setOrb(Number(e.target.value))}/><b>{orb}°</b></label></div>
        <p className="note">Whole-sign configurations remain visible independently of the degree-orb slider.</p>
        <div className="aspectGrid">{chart.aspects.map((a,i)=><article key={i}><strong>{a.a} — {a.b}</strong><span>{a.aspect}</span><small>{a.separation.toFixed(2)}° · {a.wholeSign?'whole-sign configured':'degree-orb only'}</small></article>)}</div>
      </section>
    </>}
    <footer>Hellenistic Life · calculations first, interpretation second.</footer>
  </main>
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
