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


function wiseGuide(daily:ReturnType<typeof dailyTopics>){
  const ranked=[...daily.result].sort((a,b)=>b.score-a.score)
  const strongest=ranked[0]
  const tender=[...daily.result].sort((a,b)=>a.score-b.score)[0]
  const activated=daily.result.find(t=>t.houses.includes(daily.profectedHouse)) || strongest

  const houseCounsel:Record<number,string>={
    1:'This is a year of embodiment and authorship. Attend first to what strengthens your capacity to act.',
    2:'The year asks what you possess, what sustains you, and what deserves to be preserved rather than merely accumulated.',
    3:'Movement, messages, siblings, study, and the immediate environment become carriers of fate. Notice what repeatedly arrives at your door.',
    4:'The roots are speaking: home, family, land, memory, and the foundations beneath visible achievement.',
    5:'Creation wants form. Children, pleasure, craft, risk, and the things made from your own generative power ask to be taken seriously.',
    6:'The ordinary day becomes consequential. Work, obligation, health routines, and service reveal where order is needed.',
    7:'Other people become mirrors and agents. Agreements, partners, rivals, and encounters may carry more of the story than solitary effort.',
    8:'Shared resources, dependence, fear, inheritance, and what cannot be controlled ask for sober attention rather than avoidance.',
    9:'The horizon widens through learning, travel, religion, philosophy, teachers, and the search for a larger order.',
    10:'Action becomes visible. Reputation, vocation, authority, and the works by which you are known are drawn forward.',
    11:'Friends, allies, patrons, communities, and hopes for the future become a field of opportunity and discernment.',
    12:'Some matters mature out of sight. Solitude, hidden pressures, withdrawal, and endings require discrimination about what to release and what to protect.'
  }

  const opening=`Your year is being carried through House ${daily.profectedHouse}, ${daily.profectedSign}, under ${daily.lord}. ${houseCounsel[daily.profectedHouse]}`
  const strength=`Today, ${strongest.name.toLowerCase()} receives the clearest emphasis. ${strongest.summary}`
  const caution=tender.score < 0 ? `The more delicate field is ${tender.name.toLowerCase()}. ${tender.summary}` :
    `No life area is strongly burdened in this simplified testimony today; the quieter field is ${tender.name.toLowerCase()}.`
  const practice=`Do not treat the sky as a command. Use it as a way of noticing timing: give proportionate attention to ${activated.name.toLowerCase()}, then compare the symbolism with what is actually occurring.`

  return {opening,strength,caution,practice,strongest,tender}
}



type ForecastWindow='Today'|'7 Days'|'30 Days'
type SphereForecast={house:number;name:string;level:'Very High'|'High'|'Moderate'|'Low'|'Quiet';score:number;headline:string;detail:string;peak?:string}

const HOUSE_NAMES=['Self','Money','Communication','Home','Creativity','Work & Health','Relationships','Shared Resources','Travel & Study','Career','Friends & Hopes','Inner Life']
const HOUSE_HEADLINES=[
  'Personal direction is under emphasis.','Resources and livelihood are moving.','Messages, documents or movement may matter.',
  'Home and foundations are emphasized.','Creative or pleasurable matters are developing.','Obligations and routines ask for attention.',
  'Something may develop through another person.','Shared resources or dependencies need attention.','Foreign, legal, study or travel matters may move.',
  'Something may happen here.','Allies, friends or future plans may become useful.','Private matters are working beneath the surface.'
]

function toRoman(n:number){return ['','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'][n]||String(n)}

function forecastForDate(swe:SwissEphemeris,chart:ChartData,birthDate:string,date:Date):SphereForecast[]{
  const jd=swe.julianDay(date.getUTCFullYear(),date.getUTCMonth()+1,date.getUTCDate(),12)
  const transits=calculateRows(swe,jd,chart.ascSignIndex)
  const age=ageOnDate(birthDate,date)
  const profHouse=(age%12)+1
  const profSign=(chart.ascSignIndex+profHouse-1)%12
  const lord=SIGNS[profSign][2]
  const natalLord=chart.planets.find(p=>p.name===lord)
  return HOUSE_NAMES.map((name,i)=>{
    const house=i+1
    let score=0
    const reasons:string[]=[]
    if(house===profHouse){score+=3;reasons.push(`House ${house} is activated by annual profection.`)}
    for(const t of transits){
      if(t.house===house){
        const v=t.name==='Jupiter'||t.name==='Venus'?1.25:t.name==='Mars'||t.name==='Saturn'?1.05:t.name==='Moon'?.45:.65
        score+=v;reasons.push(`${t.name} is moving through this house.`)
      }
      if(natalLord){
        const sd=wholeSignDistance(t.signIndex,natalLord.signIndex)
        if(ASPECTS.some(a=>a.signDistance===sd)){
          if(house===profHouse) score+=.55
        }
      }
    }
    const level=score>=4?'Very High':score>=2.7?'High':score>=1.4?'Moderate':score>=.55?'Low':'Quiet'
    const detail=level==='Very High'?`${name} is one of the day's strongest fields. ${reasons.slice(0,2).join(' ')}`:
      level==='High'?`There is enough converging testimony for a noticeable development in ${name.toLowerCase()}.`:
      level==='Moderate'?`This sphere is moving, though the testimony is not concentrated enough to promise a major event.`:
      level==='Low'?`Background activity is present, but it may remain secondary.`:'No major activation stands out in the techniques currently used.'
    return {house,name,level,score,headline:HOUSE_HEADLINES[i],detail}
  })
}

function aggregateForecast(swe:SwissEphemeris,chart:ChartData,birthDate:string,days:number){
  const all:SphereForecast[][]=[]
  const peaks:Record<number,{score:number;date:Date}>={}
  for(let n=0;n<days;n++){
    const d=new Date();d.setUTCHours(12,0,0,0);d.setUTCDate(d.getUTCDate()+n)
    const day=forecastForDate(swe,chart,birthDate,d);all.push(day)
    day.forEach(x=>{if(!peaks[x.house]||x.score>peaks[x.house].score)peaks[x.house]={score:x.score,date:new Date(d)}})
  }
  return HOUSE_NAMES.map((name,i)=>{
    const house=i+1, vals=all.map(d=>d[i].score)
    const max=Math.max(...vals),avg=vals.reduce((a,b)=>a+b,0)/vals.length
    const score=max*.7+avg*.3
    const level=score>=4?'Very High':score>=2.7?'High':score>=1.4?'Moderate':score>=.55?'Low':'Quiet'
    const peak=peaks[house]?.date.toLocaleDateString('en-US',{month:'short',day:'numeric'})
    return {house,name,level,score,headline:HOUSE_HEADLINES[i],
      detail:level==='Very High'||level==='High'?`This is an important sphere during the selected period. The strongest concentration appears around ${peak}.`:
      level==='Moderate'?`Some movement is likely during this period, with a local peak around ${peak}.`:
      level==='Low'?`There is background movement, but stronger areas deserve more attention.`:'This sphere is comparatively quiet across the selected period.',
      peak}
  } as SphereForecast)
}

function classifyQuestion(q:string){
  const x=q.toLowerCase()
  if(/visa|immigration|foreign|travel|abroad|passport/.test(x)) return {label:'Visa / foreign affairs',houses:[9,3,10],kind:'clarity'}
  if(/job|career|promotion|boss|work/.test(x)) return {label:'Career',houses:[10,6,2],kind:'development'}
  if(/relationship|love|partner|marriage|dating/.test(x)) return {label:'Relationships',houses:[7,5],kind:'development'}
  if(/money|finance|salary|income|wealth/.test(x)) return {label:'Money',houses:[2,8,11],kind:'movement'}
  if(/home|house|property|move|family/.test(x)) return {label:'Home',houses:[4],kind:'development'}
  return {label:'Your question',houses:[1,10,11],kind:'clarity'}
}

type WisdomPath='Universal'|'Gita'|'Buddhist'|'Tao'|'Stoic'|'Biblical'|'Hellenic'

const WISDOM:Record<WisdomPath,{symbol:string,label:string,verse:string,source:string,note:string}> = {
  Universal:{symbol:'✦',label:'Universal',verse:'Meet the hour that is actually before you; neither rush ahead of it nor turn away from it.',source:'Hellenistic Life · reflection',note:'A non-sectarian synthesis of the day’s counsel.'},
  Gita:{symbol:'🪷',label:'Gita',verse:'Your right is to action alone, not to the fruits thereof at any time.',source:'Bhagavad Gita 2.47 · trans. A. M. Sastry (1897)',note:'Act wholeheartedly; loosen the demand that action guarantee its result.'},
  Buddhist:{symbol:'☸',label:'Buddhist',verse:'It is good to tame the mind, which is difficult to hold in and flighty.',source:'Dhammapada 35 · trans. F. Max Müller (1881)',note:'Notice the first movement of mind before allowing it to become speech or action.'},
  Tao:{symbol:'☯',label:'Tao',verse:'The wise person does not force the moment; attend to what can unfold without strain.',source:'Hellenistic Life · Tao-inspired reflection',note:'For this prototype we paraphrase rather than attribute an unverified scripture translation.'},
  Stoic:{symbol:'🏛',label:'Stoic',verse:'Separate what belongs to your agency from what merely arrives from outside it.',source:'Hellenistic Life · Stoic-inspired reflection',note:'Place effort where choice is possible; meet the remainder with proportion.'},
  Biblical:{symbol:'✧',label:'Biblical',verse:'Let patience have its place before judgment, and let speech be measured.',source:'Hellenistic Life · Biblical-inspired reflection',note:'A thematic reflection for the prototype; verified scripture passages will be curated next.'},
  Hellenic:{symbol:'☉',label:'Hellenic',verse:'Know the measure of the moment, and do not ask one hour to perform the work of another.',source:'Hellenistic Life · Hellenic reflection',note:'A modern reflection shaped by Greek ideas of kairos and measure.'}
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
  const [wisdomPath,setWisdomPath]=useState<WisdomPath>('Buddhist')
  const [forecastWindow,setForecastWindow]=useState<ForecastWindow>('Today')
  const [question,setQuestion]=useState('')
  const [questionResult,setQuestionResult]=useState<{label:string;windows:{date:string;score:number}[];houses:number[]}|null>(null)

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

  const guide = useMemo(()=>daily ? wiseGuide(daily) : null,[daily])


  const sphereForecast=useMemo(()=>{
    if(!chart||!swe)return []
    if(forecastWindow==='Today')return forecastForDate(swe,chart,date,new Date())
    return aggregateForecast(swe,chart,date,forecastWindow==='7 Days'?7:30)
  },[chart,swe,date,forecastWindow])

  function askGuide(q=question){
    if(!chart||!swe||!q.trim())return
    const cls=classifyQuestion(q)
    const candidates:{date:string;score:number}[]=[]
    for(let n=0;n<90;n++){
      const d=new Date();d.setUTCHours(12,0,0,0);d.setUTCDate(d.getUTCDate()+n)
      const f=forecastForDate(swe,chart,date,d)
      const score=cls.houses.reduce((sum,h)=>sum+(f[h-1]?.score||0),0)
      candidates.push({date:d.toLocaleDateString('en-US',{month:'short',day:'numeric'}),score})
    }
    const chosen=[...candidates].sort((a,b)=>b.score-a.score).filter((x,i,a)=>i===0||Math.abs(x.score-a[i-1].score)>.15).slice(0,3)
    setQuestionResult({label:cls.label,windows:chosen,houses:cls.houses})
  }

  return <main className="app">
    <header className="hero heroRich">
      <div className="heroCopy"><p className="eyebrow">HELLENISTIC LIFE · PROTOTYPE 03</p><h1>Know the<br/><em>present hour.</em></h1>
      <p className="lede">A living Hellenistic astrology instrument: first understand what is active in your life now, then descend into the calculations that produced the judgment.</p>
      <div className="heroMotto"><span>γνῶθι καιρόν</span><small>Know the right moment.</small></div></div>
      <figure className="heroArt">
        <img src="https://upload.wikimedia.org/wikipedia/commons/c/c3/Ptolemy%26Astrologia.jpg" alt="Renaissance woodcut of Ptolemy observing the heavens with an armillary sphere"/>
        <figcaption>Astrologia instructing Ptolemy · Erhard Schön, 1515</figcaption>
      </figure>
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
      {daily && guide && <section className="present sanctuary">
        <div className="cloudSky" aria-hidden="true">
          <span className="cloud c1">☁</span><span className="cloud c2">☁</span><span className="cloud c3">☁</span>
          <span className="star s1">✦</span><span className="star s2">·</span><span className="star s3">✧</span>
          <div className="lotusHalo">❀</div>
        </div>

        <div className="morningHeader">
          <div>
            <p className="eyebrow">YOUR DAY · THROUGH THE HEAVENS</p>
            <span className="todayDate">{new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(new Date())}</span>
            <h2>The day before you.</h2>
          </div>
          <div className="yearSeal"><span>YEAR</span><strong>{daily.age}</strong><small>House {daily.profectedHouse} · {daily.lord}</small></div>
        </div>

        <div className="forecastControls">
          {(['Today','7 Days','30 Days'] as ForecastWindow[]).map(w=><button type="button" key={w} className={forecastWindow===w?'active':''} onClick={()=>setForecastWindow(w)}>{w}</button>)}
        </div>

        <div className="lifePulse">
          <div className="pulseHead"><div><p className="eyebrow">{forecastWindow==='Today'?'WHERE LIFE MAY MOVE TODAY':`IMPORTANT AREAS · NEXT ${forecastWindow.toUpperCase()}`}</p>
          <h3>{forecastWindow==='Today'?'Something can happen here.':'The larger pattern.'}</h3></div><span>Showing strongest first</span></div>
          <div className="pulseRows">{[...sphereForecast].sort((a,b)=>b.score-a.score).slice(0,4).map(f=><article key={f.house}>
            <div className={`pulseMark l${f.level.replace(' ','').toLowerCase()}`}>{f.house}</div>
            <div><span>{toRoman(f.house)} · {f.name}</span><strong>{f.level==='Very High'||f.level==='High'?f.headline:f.level==='Moderate'?'Movement is possible here.':'Relatively quiet.'}</strong><p>{f.detail}</p></div>
            <b>{f.level}</b>
          </article>)}</div>
        </div>

        <section className="askGuide">
          <div className="askTitle"><span>✦</span><div><p className="eyebrow">ASK THE GUIDE</p><h3>What would you like clarity about?</h3></div></div>
          <div className="askInput"><input value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')askGuide()}} placeholder="e.g. When will I get more clarity about my visa?"/><button type="button" onClick={()=>askGuide()}>Look ahead</button></div>
          <div className="quickQs">{['visa','career','relationship','money','travel','home'].map(q=><button key={q} type="button" onClick={()=>{setQuestion(`When will I get more clarity about my ${q}?`);setTimeout(()=>{},0)}}>{q}</button>)}</div>
          {questionResult&&<div className="answerWindow">
            <p className="eyebrow">{questionResult.label.toUpperCase()} · NEXT 90 DAYS</p>
            <h4>The strongest windows for movement or clarity</h4>
            <div className="windowLine">{questionResult.windows.map((w,i)=><div key={w.date} className={i===0?'strongest':''}><span>{w.date}</span><b>{i===0?'strongest':'watch'}</b></div>)}</div>
            <p>The astrology is most concentrated around <strong>{questionResult.windows[0]?.date}</strong>. For this question the guide is watching Houses {questionResult.houses.join(', ')} together. This is stronger as a timing signal for <em>movement, information, or clarification</em> than as a guarantee of a particular legal or practical outcome.</p>
            <details><summary>Why these houses and dates?</summary><p>Question type selects the relevant topical houses; the engine then scans 90 days for annual-profection emphasis and concentrations of traditional planetary testimony in those places.</p></details>
          </div>}
        </section>

        <div className="dayMessage">
          <span className="dayGlyph">✦</span>
          <p>{guide.opening}</p>
        </div>

        <nav className="pathChooser" aria-label="Choose a wisdom tradition">
          <span>Receive the counsel through</span>
          <div>{(Object.keys(WISDOM) as WisdomPath[]).map(path=><button type="button" key={path} className={wisdomPath===path?'active':''} onClick={()=>setWisdomPath(path)}>
            <b>{WISDOM[path].symbol}</b>{WISDOM[path].label}
          </button>)}</div>
        </nav>

        <div className="dailyCompass">
          <article><span>SEE</span><h3>{guide.strongest.name}</h3><p>{guide.strength}</p></article>
          <article><span>ACT</span><h3>With proportion</h3><p>Give deliberate attention to {guide.strongest.name.toLowerCase()}. Work with what is active rather than scattering effort across every concern.</p></article>
          <article><span>REFRAIN</span><h3>{guide.tender.name}</h3><p>{guide.caution}</p></article>
        </div>

        <section className="teaching">
          <div className="teachingArt" aria-hidden="true">
            <div className="halo"></div><div className="lotus">❀</div><span className="floatCloud f1">☁</span><span className="floatCloud f2">☁</span>
          </div>
          <div className="teachingCopy">
            <p className="eyebrow">{WISDOM[wisdomPath].symbol} {WISDOM[wisdomPath].label.toUpperCase()} · A TEACHING FOR TODAY</p>
            <blockquote>“{WISDOM[wisdomPath].verse}”</blockquote>
            <cite>{WISDOM[wisdomPath].source}</cite>
            <p>{WISDOM[wisdomPath].note}</p>
          </div>
        </section>

        <details className="whyPanel"><summary>Why is the guide saying this?</summary>
          <div className="methodNotes">
            <span>1 · At age {daily.age}, annual profection activates House {daily.profectedHouse}.</span>
            <span>2 · {daily.profectedSign} therefore becomes the annual sign, ruled by {daily.lord}.</span>
            <span>3 · Today’s seven traditional planets are placed into your natal Whole Sign houses.</span>
            <span>4 · The strongest and more difficult testimonies are compared across life topics.</span>
            <span>5 · The chosen wisdom path does not change the astrology; it changes the contemplative lens.</span>
            <span>6 · Scripture is quoted only where a translation/source has been curated; otherwise the text is explicitly labeled as our reflection.</span>
          </div>
        </details>
      </section>}

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
        <div className="sectionHead"><div><p className="eyebrow">TODAY · THE TESTIMONIES</p><h2>Life areas in motion</h2>
          <p className="note">These are symbolic timing judgments, not factual predictions. Open each area to see the calculation behind the language.</p></div>
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
    <footer>
      <span>Hellenistic Life · calculations first, interpretation second.</span>
      <span>Historical image: Erhard Schön, 1515, public domain via Wikimedia Commons.</span>
    </footer>
  </main>
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
