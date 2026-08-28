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
      peak} as SphereForecast
  })
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


type TransitEvidence={
  transit:string;glyph:string;longitude:number;house:number;motion:string;
  target?:string;aspect?:string;orb?:number;phase?:'Applying'|'Separating'|'Exact';
  relevance:string
}

function signedAspectDelta(a:number,b:number,angle:number){
  const raw=norm(a-b)
  const candidates=[raw-angle,raw-(360-angle)]
  return candidates.sort((x,y)=>Math.abs(x)-Math.abs(y))[0]
}

function transitEvidenceForDate(swe:SwissEphemeris,chart:ChartData,birthDate:string,date:Date){
  const jd=swe.julianDay(date.getUTCFullYear(),date.getUTCMonth()+1,date.getUTCDate(),12)
  const transits=calculateRows(swe,jd,chart.ascSignIndex)
  const age=ageOnDate(birthDate,date)
  const profHouse=(age%12)+1
  const profSign=(chart.ascSignIndex+profHouse-1)%12
  const lord=SIGNS[profSign][2]
  const natalLord=chart.planets.find(p=>p.name===lord)

  return transits.map(t=>{
    let best:{target:string;aspect:string;orb:number;phase:'Applying'|'Separating'|'Exact'}|undefined
    for(const natal of chart.planets){
      for(const asp of ASPECTS){
        const delta=signedAspectDelta(t.longitude,natal.longitude,asp.angle)
        const orb=Math.abs(delta)
        if(orb<=6 && (!best || orb<best.orb)){
          const relSpeed=t.speed-natal.speed
          const nextDelta=signedAspectDelta(norm(t.longitude+t.speed*.1),norm(natal.longitude+natal.speed*.1),asp.angle)
          const phase: 'Applying'|'Separating'|'Exact' = orb<.15?'Exact':Math.abs(nextDelta)<orb?'Applying':'Separating'
          best={target:natal.name,aspect:asp.name,orb,phase}
        }
      }
    }
    const relevance=t.house===profHouse?`Transiting the annually activated House ${profHouse}.`:
      natalLord && best?.target===natalLord.name?`Contacting ${lord}, the Lord of the Year.`:
      `Moving through natal House ${t.house}.`
    return {transit:t.name,glyph:t.glyph,longitude:t.longitude,house:t.house,
      motion:t.retrograde?'Retrograde':'Direct',target:best?.target,aspect:best?.aspect,orb:best?.orb,phase:best?.phase,relevance} as TransitEvidence
  })
}

function evidenceForHouse(evidence:TransitEvidence[],house:number){
  return evidence.filter(e=>e.house===house || /Lord of the Year/.test(e.relevance))
    .sort((a,b)=>(a.orb??99)-(b.orb??99)).slice(0,4)
}


type DevotionalTradition='Hindu'|'Greek'|'Roman'

const DEITY_ASSETS = {
  hindu: {
    surya: new URL('./assets/deities/hindu/surya.png', import.meta.url).href,
    chandra: new URL('./assets/deities/hindu/chandra.png', import.meta.url).href,
    budha: new URL('./assets/deities/hindu/budha.png', import.meta.url).href,
    shukra: new URL('./assets/deities/hindu/shukra.png', import.meta.url).href,
    mangala: new URL('./assets/deities/hindu/mangala.png', import.meta.url).href,
    brihaspati: new URL('./assets/deities/hindu/brihaspati.png', import.meta.url).href,
    shani: new URL('./assets/deities/hindu/shani.png', import.meta.url).href,
  },
  greek: {
    helios: new URL('./assets/deities/greek/helios.png', import.meta.url).href,
    selene: new URL('./assets/deities/greek/selene.png', import.meta.url).href,
    hermes: new URL('./assets/deities/greek/hermes.png', import.meta.url).href,
    aphrodite: new URL('./assets/deities/greek/aphrodite.png', import.meta.url).href,
    ares: new URL('./assets/deities/greek/ares.png', import.meta.url).href,
    zeus: new URL('./assets/deities/greek/zeus.png', import.meta.url).href,
    kronos: new URL('./assets/deities/greek/kronos.png', import.meta.url).href,
  },
  roman: {
    sol: new URL('./assets/deities/roman/sol.png', import.meta.url).href,
    luna: new URL('./assets/deities/roman/luna.png', import.meta.url).href,
    mercury: new URL('./assets/deities/roman/mercury.png', import.meta.url).href,
    venus: new URL('./assets/deities/roman/venus.png', import.meta.url).href,
    mars: new URL('./assets/deities/roman/mars.png', import.meta.url).href,
    jupiter: new URL('./assets/deities/roman/jupiter.png', import.meta.url).href,
    saturn: new URL('./assets/deities/roman/saturn.png', import.meta.url).href,
  }
} as const

const DEITY_IMAGES={
  hindu:{
    surya:'https://upload.wikimedia.org/wikipedia/commons/2/22/Surya_graha.JPG',
    chandra:'https://upload.wikimedia.org/wikipedia/commons/0/0b/Chandra_graha.JPG',
    budha:'https://upload.wikimedia.org/wikipedia/commons/4/40/Budha_graha.JPG',
    shukra:'https://upload.wikimedia.org/wikipedia/commons/5/5e/Shukra_graha.JPG',
    mangala:'https://upload.wikimedia.org/wikipedia/commons/3/34/Angraka_graha.JPG',
    brihaspati:'https://upload.wikimedia.org/wikipedia/commons/f/f0/Brihaspati_graha.JPG',
    shani:'https://upload.wikimedia.org/wikipedia/commons/2/25/Shani_graha.JPG'
  },
  classical:{
    sun:'https://upload.wikimedia.org/wikipedia/commons/5/5d/Head_of_the_god_Helios%2C_with_the_traites_of_Alexander_the_Great.jpg',
    moon:'https://upload.wikimedia.org/wikipedia/commons/e/e1/Selene%2C_inv._2268%2C_Roman_copy_from_the_Hadrianic_era%2C_2nd_century_AD%2C_from_a_Hellenistic_original_-_Braccio_Nuovo%2C_Museo_Chiaramonti_-_Vatican_Museums_-_DSC00938.jpg',
    mercury:'https://upload.wikimedia.org/wikipedia/commons/5/56/Hermes_Head_2.jpg',
    venus:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Head_Aphrodite_Glyptothek_Munich.jpg',
    mars:'https://upload.wikimedia.org/wikipedia/commons/2/2a/%22Ares_Borghese%22_1st-2nd_C._AD_Roman_Marble_Copy_of_5th_C._BC_Greek_Bronze_Statue_of_Ares_%28Mars%29_%2827693641433%29.jpg',
    jupiter:'https://upload.wikimedia.org/wikipedia/commons/6/64/Zeus_ba%C5%9F%C4%B1_heykeli.jpg',
    saturn:'https://upload.wikimedia.org/wikipedia/commons/3/3d/Head_of_Kronos_or_of_Saturn_%28formerly_considered_%22Euclid%22%29%2C_on_a_Modern_Bust.jpg'
  }
} as const

const DEITY_SOURCE_LINKS={
  hindu:{
    Sun:'https://commons.wikimedia.org/wiki/File:Surya_graha.JPG',
    Moon:'https://commons.wikimedia.org/wiki/File:Chandra_graha.JPG',
    Mercury:'https://commons.wikimedia.org/wiki/File:Budha_graha.JPG',
    Venus:'https://commons.wikimedia.org/wiki/File:Shukra_graha.JPG',
    Mars:'https://commons.wikimedia.org/wiki/File:Angraka_graha.JPG',
    Jupiter:'https://commons.wikimedia.org/wiki/File:Brihaspati_graha.JPG',
    Saturn:'https://commons.wikimedia.org/wiki/File:Shani_graha.JPG'
  },
  Greek:{
    Sun:'https://commons.wikimedia.org/wiki/File:Head_of_the_god_Helios,_with_the_traites_of_Alexander_the_Great.jpg',
    Moon:'https://commons.wikimedia.org/wiki/File:Selene,_inv._2268,_Roman_copy_from_the_Hadrianic_era,_2nd_century_AD,_from_a_Hellenistic_original_-_Braccio_Nuovo,_Museo_Chiaramonti_-_Vatican_Museums_-_DSC00938.jpg',
    Mercury:'https://commons.wikimedia.org/wiki/File:Hermes_Head_2.jpg',
    Venus:'https://commons.wikimedia.org/wiki/File:Head_Aphrodite_Glyptothek_Munich.jpg',
    Mars:'https://commons.wikimedia.org/wiki/File:%22Ares_Borghese%22_1st-2nd_C._AD_Roman_Marble_Copy_of_5th_C._BC_Greek_Bronze_Statue_of_Ares_(Mars)_(27693641433).jpg',
    Jupiter:'https://commons.wikimedia.org/wiki/File:Zeus_ba%C5%9F%C4%B1_heykeli.jpg',
    Saturn:'https://commons.wikimedia.org/wiki/File:Head_of_Kronos_or_of_Saturn_(formerly_considered_%22Euclid%22),_on_a_Modern_Bust.jpg'
  },
  Roman:{
    Sun:'https://commons.wikimedia.org/wiki/File:Head_of_the_god_Helios,_with_the_traites_of_Alexander_the_Great.jpg',
    Moon:'https://commons.wikimedia.org/wiki/File:Selene,_inv._2268,_Roman_copy_from_the_Hadrianic_era,_2nd_century_AD,_from_a_Hellenistic_original_-_Braccio_Nuovo,_Museo_Chiaramonti_-_Vatican_Museums_-_DSC00938.jpg',
    Mercury:'https://commons.wikimedia.org/wiki/File:Hermes_Head_2.jpg',
    Venus:'https://commons.wikimedia.org/wiki/File:Head_Aphrodite_Glyptothek_Munich.jpg',
    Mars:'https://commons.wikimedia.org/wiki/File:%22Ares_Borghese%22_1st-2nd_C._AD_Roman_Marble_Copy_of_5th_C._BC_Greek_Bronze_Statue_of_Ares_(Mars)_(27693641433).jpg',
    Jupiter:'https://commons.wikimedia.org/wiki/File:Zeus_ba%C5%9F%C4%B1_heykeli.jpg',
    Saturn:'https://commons.wikimedia.org/wiki/File:Head_of_Kronos_or_of_Saturn_(formerly_considered_%22Euclid%22),_on_a_Modern_Bust.jpg'
  }
} as const

function deitySourceLink(planet:string,tradition:DevotionalTradition){
  const sourceTradition = tradition === 'Hindu' ? 'hindu' : tradition
  return DEITY_SOURCE_LINKS[sourceTradition][planet as keyof typeof DEITY_SOURCE_LINKS.hindu]
}

const PLANET_GUIDES:Record<string,{
  Hindu:{name:string,theme:string,image:string},
  Greek:{name:string,theme:string,image:string},
  Roman:{name:string,theme:string,image:string}
}> = {
  Sun:{
    Hindu:{name:'Surya',theme:'clarity, vitality, rightful visibility',image:DEITY_IMAGES.hindu.surya},
    Greek:{name:'Helios',theme:'illumination, witness, conscious direction',image:DEITY_IMAGES.classical.sun},
    Roman:{name:'Sol',theme:'radiance, authority, steadiness of purpose',image:DEITY_IMAGES.classical.sun}
  },
  Moon:{
    Hindu:{name:'Chandra',theme:'mind, feeling, receptivity, rhythm',image:DEITY_IMAGES.hindu.chandra},
    Greek:{name:'Selene',theme:'reflection, cycles, inner response',image:DEITY_IMAGES.classical.moon},
    Roman:{name:'Luna',theme:'rhythm, memory, changing conditions',image:DEITY_IMAGES.classical.moon}
  },
  Mercury:{
    Hindu:{name:'Budha',theme:'intelligence, speech, discernment, exchange',image:DEITY_IMAGES.hindu.budha},
    Greek:{name:'Hermes',theme:'messages, crossings, negotiation, travel',image:DEITY_IMAGES.classical.mercury},
    Roman:{name:'Mercury',theme:'communication, commerce, exchange, movement',image:DEITY_IMAGES.classical.mercury}
  },
  Venus:{
    Hindu:{name:'Shukra',theme:'harmony, attraction, pleasure, reconciliation',image:DEITY_IMAGES.hindu.shukra},
    Greek:{name:'Aphrodite',theme:'beauty, affection, attraction, accord',image:DEITY_IMAGES.classical.venus},
    Roman:{name:'Venus',theme:'relationship, grace, pleasure, social harmony',image:DEITY_IMAGES.classical.venus}
  },
  Mars:{
    Hindu:{name:'Mangala',theme:'courage, discipline, force, decisive action',image:DEITY_IMAGES.hindu.mangala},
    Greek:{name:'Ares',theme:'assertion, conflict, courage, force',image:DEITY_IMAGES.classical.mars},
    Roman:{name:'Mars',theme:'discipline, defense, command, purposeful action',image:DEITY_IMAGES.classical.mars}
  },
  Jupiter:{
    Hindu:{name:'Brihaspati',theme:'wisdom, counsel, teachers, right judgment',image:DEITY_IMAGES.hindu.brihaspati},
    Greek:{name:'Zeus',theme:'authority, order, protection, expansive judgment',image:DEITY_IMAGES.classical.jupiter},
    Roman:{name:'Jupiter',theme:'law, blessing, authority, enlargement',image:DEITY_IMAGES.classical.jupiter}
  },
  Saturn:{
    Hindu:{name:'Shani',theme:'endurance, karma, limits, patience, responsibility',image:DEITY_IMAGES.hindu.shani},
    Greek:{name:'Kronos',theme:'time, limits, consequence, maturation',image:DEITY_IMAGES.classical.saturn},
    Roman:{name:'Saturn',theme:'time, restraint, agriculture, mature order',image:DEITY_IMAGES.classical.saturn}
  }
}

function deityImageFallback(e:React.SyntheticEvent<HTMLImageElement>,planet:string){
  const img=e.currentTarget
  img.onerror=null
  const fallback:Record<string,string>={
    Sun:DEITY_IMAGES.classical.sun,Moon:DEITY_IMAGES.classical.moon,Mercury:DEITY_IMAGES.classical.mercury,
    Venus:DEITY_IMAGES.classical.venus,Mars:DEITY_IMAGES.classical.mars,Jupiter:DEITY_IMAGES.classical.jupiter,Saturn:DEITY_IMAGES.classical.saturn
  }
  img.src=fallback[planet]||DEITY_IMAGES.classical.sun
}

function natalGuideForHouse(chart:ChartData,house:number){
  const sign=(chart.ascSignIndex+house-1)%12
  const ruler=SIGNS[sign][2]
  return {house,sign:SIGNS[sign][0],ruler,guide:PLANET_GUIDES[ruler]}
}

function guidingPlanetToday(evidence:TransitEvidence[],chart:ChartData,birthDate:string){
  const profHouse=(ageOnDate(birthDate,new Date())%12)+1
  const profSign=(chart.ascSignIndex+profHouse-1)%12
  const lord=SIGNS[profSign][2]
  const scored=evidence.map(e=>{
    let score=e.transit===lord?4:0
    if(e.house===profHouse)score+=2.5
    if(e.phase==='Applying')score+=1
    if(e.phase==='Exact')score+=1.5
    if((e.orb??99)<1)score+=1
    return {...e,score}
  }).sort((a,b)=>b.score-a.score)
  return scored[0]||evidence[0]
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


const ASPECT_MEANINGS:Record<string,string>={
  Conjunction:'0° · Two planets join their significations. This intensifies and combines what both planets signify.',
  Sextile:'60° · A cooperative opening. It tends to describe workable opportunities, exchange, or assistance.',
  Square:'90° · Dynamic tension. It tends to demand action, adjustment, effort, or confrontation.',
  Trine:'120° · Flow and continuity. It often describes support, ease, or circumstances that develop with less resistance.',
  Opposition:'180° · Encounter across a polarity. It can describe culmination, confrontation, awareness, or balancing two sides.'
}

type TransitNatalAspect={transit:string;natal:string;aspect:string;orb:number;transitLon:number;natalLon:number}

function transitNatalAspects(transits:PlanetRow[], natal:PlanetRow[], orb=3):TransitNatalAspect[]{
  const out:TransitNatalAspect[]=[]
  for(const t of transits) for(const n of natal){
    const sep=angularDistance(t.longitude,n.longitude)
    for(const a of ASPECTS){
      const delta=Math.abs(sep-a.angle)
      if(delta<=orb) out.push({transit:t.name,natal:n.name,aspect:a.name,orb:delta,transitLon:t.longitude,natalLon:n.longitude})
    }
  }
  return out.sort((a,b)=>a.orb-b.orb)
}

function ChartWheel({chart,transits,transitDate,onSelect,focus,onFocus}:{chart:ChartData;transits:PlanetRow[];transitDate:string;onSelect:(name:string)=>void;focus:string|null;onFocus:(name:string|null)=>void}){
  const size=900,c=size/2
  const aspectR=184
  const natalBaseR=236
  const natalGuideR=276
  const transitBaseR=322
  const transitGuideR=364
  const signInner=394
  const outer=424

  const ascStart=chart.ascSignIndex*30
  const visualDeg=(lon:number)=>norm(195-norm(lon-ascStart))
  const polar=(deg:number,r:number)=>{
    const a=norm(deg)*Math.PI/180
    return [c+r*Math.cos(a),c+r*Math.sin(a)] as const
  }
  const xy=(lon:number,r:number)=>polar(visualDeg(lon),r)
  const wheelGlyph=(sign:number)=>`${SIGNS[sign][1]}\uFE0E`
  const bodyDegree=(lon:number)=>{
    const d=signDegree(lon),deg=Math.floor(d),min=Math.floor((d-deg)*60)
    return `${deg}°${String(min).padStart(2,'0')}′`
  }

  type DisplayPos={name:string;trueDeg:number;displayDeg:number;r:number;labelR:number}
  const layoutBodies=(rows:PlanetRow[],base:number,labelOffset:number):Record<string,DisplayPos>=>{
    const sorted=[...rows].sort((a,b)=>visualDeg(a.longitude)-visualDeg(b.longitude))
    const groups:PlanetRow[][]=[]
    for(const p of sorted){
      const v=visualDeg(p.longitude)
      let placed=false
      for(const g of groups){
        const last=g[g.length-1]
        if(Math.abs(visualDeg(last.longitude)-v)<10){
          g.push(p); placed=true; break
        }
      }
      if(!placed) groups.push([p])
    }
    const out:Record<string,DisplayPos>={}
    groups.forEach(g=>{
      const n=g.length
      const fanStep=n<=2?4.5:n<=4?4:3.4
      const laneStep=18
      g.forEach((p,i)=>{
        const centerOffset=(i-(n-1)/2)*fanStep
        const lane=(i%3)-1
        const trueDeg=visualDeg(p.longitude)
        out[p.name]={
          name:p.name,
          trueDeg,
          displayDeg:trueDeg+centerOffset,
          r:base+lane*laneStep,
          labelR:base+lane*laneStep+labelOffset+(i%2?8:0)
        }
      })
    })
    return out
  }

  const natalPos=layoutBodies(chart.planets,natalBaseR,34)
  const transitPos=layoutBodies(transits,transitBaseR,31)
  const planetByName=Object.fromEntries(chart.planets.map(p=>[p.name,p]))
  const tAspects=transitNatalAspects(transits,chart.planets,3).slice(0,18)
  const aspectClass=(a:string)=>`aspectLine aspect-${a.toLowerCase()}`

  const [ascX,ascY]=xy(chart.ascendant,outer)
  const [ascLX,ascLY]=xy(chart.ascendant,outer+28)
  const [mcX,mcY]=xy(chart.mc,outer)
  const [mcLX,mcLY]=xy(chart.mc,outer+28)

  const isDimmedNatal=(a:{a:string;b:string})=>focus ? !(a.a===focus||a.b===focus) : false
  const isDimmedTransit=(a:{transit:string;natal:string})=>focus ? a.natal!==focus : false

  return <div className="chartWheelWrap">
    <svg className="chartWheel" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Concentric natal and transit chart for ${transitDate}`}>
      {/* Exactly three concentric boundaries:
          1) natal boundary
          2) transit boundary
          3) outer zodiac / house boundary */}
      <circle cx={c} cy={c} r={natalGuideR} className="natalBoundary"/>
      <circle cx={c} cy={c} r={transitGuideR} className="transitBoundary"/>
      <circle cx={c} cy={c} r={outer} className="wheelOuter"/>

      {Array.from({length:12},(_,i)=>{
        const boundaryDeg=195-i*30
        const [x2,y2]=polar(boundaryDeg,outer)
        const centerDeg=180-i*30
        const [gx,gy]=polar(centerDeg,outer-16)
        const sign=(chart.ascSignIndex+i)%12
        return <g key={i} className={`zodiacSector house-${i+1}`}>
          <line x1={c} y1={c} x2={x2} y2={y2} className="sectorRay"/>
          <text x={gx} y={gy-3} textAnchor="middle" dominantBaseline="middle" className="wheelSign">{wheelGlyph(sign)}</text>
          <text x={gx} y={gy+13} textAnchor="middle" className="wheelHouse">{toRoman(i+1)}</text>
        </g>
      })}

      <line x1={c} y1={c} x2={ascX} y2={ascY} className="angleLine ascAngle"/>
      <text x={ascLX} y={ascLY} textAnchor="middle" dominantBaseline="middle" className="angleLabel ascAngleLabel">ASC {bodyDegree(chart.ascendant)}</text>
      <line x1={c} y1={c} x2={mcX} y2={mcY} className="angleLine mcAngle"/>
      <text x={mcLX} y={mcLY} textAnchor="middle" dominantBaseline="middle" className="angleLabel mcAngleLabel">MC {bodyDegree(chart.mc)}</text>

      {chart.aspects.slice(0,20).map((a,i)=>{
        const p1=planetByName[a.a],p2=planetByName[a.b]
        if(!p1||!p2)return null
        const [x1,y1]=xy(p1.longitude,aspectR)
        const [x2,y2]=xy(p2.longitude,aspectR)
        return <line key={`n-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} className={`${aspectClass(a.aspect)} ${isDimmedNatal(a)?'dimmedAspect':''}`}/>
      })}

      {tAspects.map((a,i)=>{
        const [x1,y1]=xy(a.transitLon,aspectR+8)
        const [x2,y2]=xy(a.natalLon,aspectR-8)
        return <line key={`t-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} className={`${aspectClass(a.aspect)} transitAspect ${isDimmedTransit(a)?'dimmedAspect':''}`}/>
      })}

      {chart.planets.map(p=>{
        const pos=natalPos[p.name]
        const [tx,ty]=polar(pos.trueDeg,natalBaseR-18)
        const [x,y]=polar(pos.displayDeg,pos.r)
        const [dx,dy]=polar(pos.displayDeg,pos.labelR)
        const active=focus===p.name
        return <g key={`n-${p.name}`} className={`wheelPlanet natalPlanet ${active?'activePlanet':''} ${focus&&!active?'mutedPlanet':''}`}
          onClick={()=>{onSelect(p.name);onFocus(active?null:p.name)}} role="button" tabIndex={0}
          onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(p.name);onFocus(active?null:p.name)}}}>
          <circle cx={tx} cy={ty} r="3" className="truePoint natalTruePoint"/>
          <line x1={tx} y1={ty} x2={x} y2={y} className="leaderLine natalLeader"/>
          <circle cx={x} cy={y} r="19"/>
          <text x={x} y={y+6} textAnchor="middle" className="bodyGlyph">{p.glyph}</text>
          <line x1={x} y1={y} x2={dx} y2={dy} className="bodyTick natalTick"/>
          <text x={dx} y={dy+3} textAnchor="middle" className="bodyDegree natalDegree">{bodyDegree(p.longitude)}</text>
        </g>
      })}

      {transits.map(p=>{
        const pos=transitPos[p.name]
        const [tx,ty]=polar(pos.trueDeg,transitBaseR-18)
        const [x,y]=polar(pos.displayDeg,pos.r)
        const [dx,dy]=polar(pos.displayDeg,pos.labelR)
        return <g key={`t-${p.name}`} className={`wheelPlanet transitPlanet ${focus?'mutedTransit':''}`}>
          <circle cx={tx} cy={ty} r="3" className="truePoint transitTruePoint"/>
          <line x1={tx} y1={ty} x2={x} y2={y} className="leaderLine transitLeader"/>
          <circle cx={x} cy={y} r="17"/>
          <text x={x} y={y+5} textAnchor="middle" className="bodyGlyph">{p.glyph}</text>
          <line x1={x} y1={y} x2={dx} y2={dy} className="bodyTick transitTick"/>
          <text x={dx} y={dy+3} textAnchor="middle" className="bodyDegree transitDegree">{bodyDegree(p.longitude)}</text>
        </g>
      })}

      <text x={c} y={c-natalGuideR+17} textAnchor="middle" className="ringLabel natalRingLabel">NATAL</text>
      <text x={c} y={c-transitGuideR+17} textAnchor="middle" className="ringLabel transitRingLabel">TRANSITS</text>
    </svg>

    <div className="ringKey">
      <span><i className="natalDot"></i>Natal — fixed</span>
      <span><i className="transitDot"></i>Transits — selected date</span>
      <span><i className="zodiacDot"></i>Signs / houses</span>
      <span><i className="ascKey"></i>ASC</span>
      <span><i className="mcKey"></i>MC</span>
      {focus&&<button type="button" className="clearFocus" onClick={()=>onFocus(null)}>Clear {focus} focus</button>}
    </div>
  </div>
}
type ComicBeat={speaker:string;line:string}
type ComicTradition='Greek'|'Roman'
type OlympusComic={
  title:string; weather:string; beats:ComicBeat[]; planets:string[];
  flair:string; definition:string; example:string; keywords:string[]; aspect:string
}

const COMIC_VOICES:Record<string,{Greek:string;Roman:string}>={
  Sun:{Greek:'Helios',Roman:'Sol'}, Moon:{Greek:'Selene',Roman:'Luna'},
  Mercury:{Greek:'Hermes',Roman:'Mercury'}, Venus:{Greek:'Aphrodite',Roman:'Venus'},
  Mars:{Greek:'Ares',Roman:'Mars'}, Jupiter:{Greek:'Zeus',Roman:'Jupiter'},
  Saturn:{Greek:'Kronos',Roman:'Saturn'}
}
function comicName(planet:string,tradition:ComicTradition){
  const v=COMIC_VOICES[planet]; return v ? v[tradition] : planet
}
function dailyComic(transits:PlanetRow[],date:string,tradition:ComicTradition):OlympusComic{
  const hits:{a:PlanetRow;b:PlanetRow;kind:string;orb:number}[]=[]
  const angles=[['conjunction',0],['sextile',60],['square',90],['trine',120],['opposition',180]] as const
  for(let i=0;i<transits.length;i++)for(let j=i+1;j<transits.length;j++){
    const raw=Math.abs(transits[i].longitude-transits[j].longitude),d=Math.min(raw,360-raw)
    for(const [kind,angle] of angles){const orb=Math.abs(d-angle);if(orb<=5)hits.push({a:transits[i],b:transits[j],kind,orb})}
  }
  hits.sort((x,y)=>x.orb-y.orb)
  const seed=[...date].reduce((n,c)=>n+c.charCodeAt(0),0),hit=hits[0]
  const aspectGuide:Record<string,{flair:string;definition:string;example:string;keywords:string[]}>= {
    conjunction:{
      flair:'Two planetary agendas occupy the same room. The result is concentrated, obvious, and difficult to ignore.',
      definition:'A conjunction (0°) joins two planets in the same part of the zodiac. Their meanings blend and intensify; whether that feels easy or difficult depends on the planets involved.',
      example:'Two priorities suddenly become one project: a conversation turns into a decision, a creative idea becomes a commitment, or two people discover they are trying to solve the same problem.',
      keywords:['fusion','focus','intensity','beginnings','concentration']
    },
    sextile:{
      flair:'A door is unlocked, but you still have to turn the handle. Helpful coincidences reward participation.',
      definition:'A sextile (60°) is a cooperative aspect. It describes an opening, useful contact, or opportunity that tends to work best when someone actively responds to it.',
      example:'A helpful introduction arrives, someone offers exactly the information you needed, or a small opening becomes useful because you actually follow up.',
      keywords:['opportunity','cooperation','contact','skill','movement']
    },
    square:{
      flair:'The gods have scheduled a mandatory character-building exercise. Friction exposes what needs a better strategy.',
      definition:'A square (90°) creates tension between two planetary functions. It often shows pressure, competing demands, or a problem that forces action and adaptation.',
      example:'You want to move quickly but encounter a delay, rule, disagreement, or practical limitation. The obstacle is irritating—and also reveals what the original plan forgot.',
      keywords:['friction','pressure','action','conflict','adjustment']
    },
    trine:{
      flair:'The current is with you. Ease, confidence, and generosity can make something feel almost suspiciously natural.',
      definition:'A trine (120°) is a flowing, supportive aspect. The planets cooperate easily, often describing natural momentum, talent, harmony, or circumstances that require less forcing.',
      example:'A social plan comes together without effort, a creative project suddenly clicks, or help appears at exactly the right moment and makes the whole day feel lighter.',
      keywords:['flow','ease','support','harmony','confidence']
    },
    opposition:{
      flair:'Two gods stand on opposite balconies insisting the other one is being unreasonable. Perspective becomes unavoidable.',
      definition:'An opposition (180°) places two planets across from one another. It highlights polarity, negotiation, projection, and the need to balance two legitimate but competing positions.',
      example:'Someone else reflects the exact issue you were avoiding, or work and relationship demands pull in opposite directions until a compromise becomes necessary.',
      keywords:['polarity','awareness','balance','negotiation','reflection']
    }
  }
  if(!hit){
    const a=transits[seed%transits.length],b=transits[(seed+3)%transits.length]
    const narrator=['Mercury','Jupiter'].find(p=>p!==a.name&&p!==b.name)||'Sun'
    const A=comicName(a.name,tradition),B=comicName(b.name,tradition),C=comicName(narrator,tradition)
    return{title:'A quiet day in the divine court',weather:`No tight major planetary aspect dominates the selected day. ${A} and ${B} keep Olympus moving.`,aspect:'Quiet sky',planets:[a.name,b.name,narrator],beats:[
      {speaker:A,line:'Nothing dramatic on the docket. Suspicious.'},
      {speaker:B,line:'You could simply enjoy a normal day.'},
      {speaker:C,line:'I have already started a rumor, just in case.'}],
      flair:'The sky is comparatively loose. Not every day needs a celestial emergency.',
      definition:'When no tight major aspect dominates, interpretation shifts toward each planet’s sign, house, speed, and smaller contacts rather than one headline configuration.',
      example:'The day feels less like one big event and more like several ordinary choices. You have room to set the tone instead of reacting to a single obvious pressure.',
      keywords:['space','choice','integration','observation','pace']}
  }
  const a=hit.a.name,b=hit.b.name,narrator=['Mercury','Jupiter','Sun'].find(p=>p!==a&&p!==b)||'Moon'
  const A=comicName(a,tradition),B=comicName(b,tradition),C=comicName(narrator,tradition)
  const scripts:Record<string,ComicBeat[]>={
    conjunction:[{speaker:A,line:'Why are you in my chariot?'},{speaker:B,line:'Apparently the cosmos double-booked us.'},{speaker:C,line:'Two gods, one agenda. What could possibly go wrong?'}],
    sextile:[{speaker:A,line:'I found a shortcut.'},{speaker:B,line:'Is it legal?'},{speaker:C,line:'I checked. It is technically celestial.'}],
    square:[{speaker:A,line:'TODAY, NOTHING STANDS IN MY WAY.'},{speaker:B,line:'Excellent. Please begin with Form 27-B.'},{speaker:C,line:'Olympus calls this a “growth opportunity.”'}],
    trine:[{speaker:A,line:'Everything is going suspiciously well.'},{speaker:B,line:'Do not say that out loud.'},{speaker:C,line:'Too late. Hubris has enabled notifications.'}],
    opposition:[{speaker:A,line:'You are clearly the problem.'},{speaker:B,line:'I was literally about to say that.'},{speaker:C,line:'I brought a mirror. You are both welcome.'}]
  }
  const guide=aspectGuide[hit.kind]
  return{
    title:`${a} ${hit.kind} ${b}`,
    weather:`Today's main story · ${a} ${hit.kind} ${b} · ${hit.orb.toFixed(1)}° orb`,
    aspect:hit.kind, planets:[a,b,narrator], beats:scripts[hit.kind],
    flair:guide.flair,
    definition:`${guide.definition} Here, ${a} (${PLANET_GUIDES[a]?.[tradition]?.theme}) meets ${b} (${PLANET_GUIDES[b]?.[tradition]?.theme}).`,
    example:guide.example,
    keywords:guide.keywords
  }
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
  const [devotionalTradition,setDevotionalTradition]=useState<DevotionalTradition>('Hindu')
  const [comicTradition,setComicTradition]=useState<ComicTradition>('Greek')
  const [wheelFocus,setWheelFocus]=useState<string|null>(null)
  const [wheelDate,setWheelDate]=useState(()=>new Date().toISOString().slice(0,10))

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


  const transitEvidence=useMemo(()=>{
    if(!chart||!swe)return []
    return transitEvidenceForDate(swe,chart,date,new Date())
  },[chart,swe,date])


  const guidingTransit=useMemo(()=>{
    if(!chart||!transitEvidence.length)return null
    return guidingPlanetToday(transitEvidence,chart,date)
  },[chart,transitEvidence,date])

  const wheelTransits=useMemo(()=>{
    if(!chart||!swe)return []
    const d=new Date(`${wheelDate}T12:00:00Z`)
    const jd=swe.julianDay(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate(),12)
    return calculateRows(swe,jd,chart.ascSignIndex)
  },[chart,swe,wheelDate])

  function shiftWheelDate(days:number){
    const d=new Date(`${wheelDate}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);setWheelDate(d.toISOString().slice(0,10))
  }

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

  const olympusComic=chart&&wheelTransits.length?dailyComic(wheelTransits,wheelDate,comicTradition):null

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
            <div><span>{toRoman(f.house)} · {f.name}</span><strong>{f.level==='Very High'||f.level==='High'?f.headline:f.level==='Moderate'?'Movement is possible here.':'Relatively quiet.'}</strong><p>{f.detail}</p>
              <details className="predictionWhy"><summary>Why this prediction?</summary>
                <div className="evidenceStack">
                  <p><b>Annual timing:</b> {((ageOnDate(date,new Date())%12)+1)===f.house?`This is your profected house for the year, so events here receive priority.`:`House ${f.house} is not the annual profected house, so it needs stronger transit testimony to become prominent.`}</p>
                  {evidenceForHouse(transitEvidence,f.house).map((e,i)=><div className="evidenceLine" key={`${e.transit}-${i}`}>
                    <span className="planetGlyph">{e.glyph}</span><div><strong>{e.transit} · {fmtLon(e.longitude)}</strong>
                    <small>{e.relevance} {e.target&&e.aspect?`${e.phase} ${e.aspect.toLowerCase()} to natal ${e.target}${e.orb!==undefined?` (${e.orb.toFixed(2)}°)`:''}.`:''} {e.motion}.</small></div>
                  </div>)}
                  {evidenceForHouse(transitEvidence,f.house).length===0&&<p>No major traditional-planet trigger is close enough to highlight for this house today.</p>}
                  <p className="judgment"><b>Judgment:</b> The forecast combines annual activation with today's transiting planets; fast planets can act as short-term triggers while slower planets describe a longer developing condition.</p>
                </div>
              </details>
            </div>
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
            <details className="questionWhy"><summary>Why these houses and dates?</summary>
              <p>Question type selects the relevant topical houses; the engine scans 90 days for annual-profection emphasis and concentrations of traditional planetary testimony in those places.</p>
              <div className="questionHouses">{questionResult.houses.map(h=><span key={h}>{toRoman(h)} · {HOUSE_NAMES[h-1]}</span>)}</div>
              <p><b>Transit logic:</b> the guide looks for the seven traditional planets moving through these houses and for contacts to the current Lord of the Year. The next engine revision will add solar-return confirmation and more rigorous time-lord weighting.</p>
            </details>
          </div>}
        </section>

        <div className="dayMessage">
          <span className="dayGlyph">✦</span>
          <p>{guide.opening}</p>
        </div>

        <section className="counselBlock">
          <nav className="pathChooser" aria-label="Choose a wisdom tradition">
            <span>Receive the counsel through</span>
            <div>{(Object.keys(WISDOM) as WisdomPath[]).map(path=><button type="button" key={path} className={wisdomPath===path?'active':''} onClick={()=>setWisdomPath(path)}>
              <b>{WISDOM[path].symbol}</b>{WISDOM[path].label}
            </button>)}</div>
          </nav>
          <section className="teaching counselTeaching">
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
        </section>

        <section className="transitsNow">
          <div className="transitHead"><div><p className="eyebrow">TRANSITS TODAY</p><h3>What the seven wanderers are doing now</h3></div><span>Tap the reasoning above to see which transit matters to each prediction.</span></div>
          <div className="transitStrip">{transitEvidence.map(e=><article key={e.transit}>
            <span>{e.glyph}</span><div><strong>{e.transit}</strong><small>{fmtLon(e.longitude)} · House {e.house}</small>
            <em>{e.target&&e.aspect?`${e.phase} ${e.aspect} natal ${e.target} · ${e.orb?.toFixed(2)}°`:`${e.motion} · no close major natal aspect`}</em></div>
          </article>)}</div>
        </section>

        <div className="dailyCompass">
          <article><span>SEE</span><h3>{guide.strongest.name}</h3><p>{guide.strength}</p></article>
          <article><span>ACT</span><h3>With proportion</h3><p>Give deliberate attention to {guide.strongest.name.toLowerCase()}. Work with what is active rather than scattering effort across every concern.</p></article>
          <article><span>REFRAIN</span><h3>{guide.tender.name}</h3><p>{guide.caution}</p></article>
        </div>

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

      {guidingTransit && PLANET_GUIDES[guidingTransit.transit] && <section className="devotionalToday">
        <div className="devotionalIntro">
          <p className="eyebrow">A PRESENCE FOR TODAY</p>
          <h2>{guidingTransit.glyph} {guidingTransit.transit} is your guiding planetary principle today.</h2>
          <p>{guidingTransit.relevance} {guidingTransit.target&&guidingTransit.aspect?`${guidingTransit.phase} ${guidingTransit.aspect.toLowerCase()} to natal ${guidingTransit.target} brings this principle closer to the foreground.`:''}</p>
          <div className="traditionTabs">{(['Hindu','Greek','Roman'] as DevotionalTradition[]).map(t=><button type="button" key={t} onClick={()=>setDevotionalTradition(t)} className={devotionalTradition===t?'active':''}>{t}</button>)}</div>
        </div>
        <div className="deityFeature">
          <figure>
            <img src={PLANET_GUIDES[guidingTransit.transit][devotionalTradition].image} loading="eager" onError={e=>deityImageFallback(e,guidingTransit.transit)} alt={`${PLANET_GUIDES[guidingTransit.transit][devotionalTradition].name}, ${devotionalTradition} devotional illustration`}/>
          </figure>
          <div>
            <p className="eyebrow">THROUGH THE {devotionalTradition.toUpperCase()} TRADITION</p>
            <h3>{PLANET_GUIDES[guidingTransit.transit][devotionalTradition].name}</h3>
            <p className="deityThemes">{PLANET_GUIDES[guidingTransit.transit][devotionalTradition].theme}</p>
            <p>Seek this figure or planetary principle symbolically today where you need steadiness, discernment, or perspective. The traditions are presented distinctly rather than as interchangeable names for one deity.</p>
            <blockquote>May I meet this day with the clearest expression of {guidingTransit.transit.toLowerCase()}: neither excess nor avoidance, but the right measure.</blockquote>
            <small>Hellenistic Life reflection · not a traditional prayer or mantra.</small>
            <a className="artSourceLink" href={deitySourceLink(guidingTransit.transit,devotionalTradition)} target="_blank" rel="noreferrer">Artwork source & rights ↗</a>
          </div>
        </div>
      </section>}

      {chart && <section className="natalDevotion">
        <div className="sectionHead"><div><p className="eyebrow">NATAL GUIDANCE BY HOUSE</p><h2>Who presides over each sphere of your life?</h2>
        <p className="note">Each Whole Sign house is linked to its natal sign ruler. Choose a tradition to see the corresponding planetary deity or divine figure associated with that ruler.</p></div>
        <div className="traditionTabs compact">{(['Hindu','Greek','Roman'] as DevotionalTradition[]).map(t=><button type="button" key={t} onClick={()=>setDevotionalTradition(t)} className={devotionalTradition===t?'active':''}>{t}</button>)}</div></div>
        <div className="natalGuideGrid">{Array.from({length:12},(_,i)=>{
          const g=natalGuideForHouse(chart,i+1), d=g.guide[devotionalTradition]
          return <article key={i}>
            <img src={d.image} loading="lazy" onError={e=>deityImageFallback(e,g.ruler)} alt={`${d.name}, guide for House ${i+1}`}/>
            <div><span>{toRoman(i+1)} · {HOUSE_NAMES[i]}</span><h3>{d.name}</h3><small>{g.sign} · ruled by {g.ruler}</small><p>{d.theme}</p><a className="artSourceLink small" href={deitySourceLink(g.ruler,devotionalTradition)} target="_blank" rel="noreferrer">Source / rights ↗</a></div>
          </article>
        })}</div>
      </section>}


      <section className="wheelSection">
        <div className="sectionHead wheelHead"><div><p className="eyebrow">THE NATIVITY IN MOTION</p><h2>Natal wheel + transiting sky</h2>
        <p className="note">House I is centered at the left and the wheel is mirrored horizontally so the zodiac progresses upward from the Ascendant. From the center outward: aspect field, natal placements, transiting placements, then a thin zodiac/house rim. ASC and MC are marked at their exact degrees.</p></div></div>
        <div className="transitDateBar"><button type="button" onClick={()=>shiftWheelDate(-1)}>← Previous</button><label>Transit date<input type="date" value={wheelDate} onChange={e=>setWheelDate(e.target.value)}/></label><button type="button" onClick={()=>setWheelDate(new Date().toISOString().slice(0,10))}>Today</button><button type="button" onClick={()=>shiftWheelDate(1)}>Next →</button></div>
        <div className="wheelLayout"><ChartWheel chart={chart} transits={wheelTransits} transitDate={wheelDate} onSelect={setSelected} focus={wheelFocus} onFocus={setWheelFocus}/>
          <div className="aspectLegend"><p className="eyebrow">ASPECT LEGEND</p><p className="legendIntro">Solid lines are natal aspects. Fainter dashed lines are transit → natal contacts within 3°. Only the five traditional aspects are drawn.</p>
          {ASPECTS.map(a=><article key={a.name}><div><span className={`aspectSwatch ${a.name.toLowerCase()}`}></span><strong>{a.name}</strong><b>{a.angle}°</b></div><p>{ASPECT_MEANINGS[a.name]}</p></article>)}</div>
        </div>
        <div className="transitPlacements"><div><p className="eyebrow">NATAL PLACEMENTS</p>{chart.planets.map(p=><span key={p.name}>{p.glyph} {p.name} · {fmtLon(p.longitude)}</span>)}</div><div><p className="eyebrow">TRANSITS · {wheelDate}</p>{wheelTransits.map(p=><span key={p.name}>{p.glyph} {p.name} · {fmtLon(p.longitude)} · H{p.house}</span>)}</div></div>
      </section>

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

    <section className="credits">
      <div className="sectionHead"><div><p className="eyebrow">CREDITS & SOURCES</p><h2>What this experience is built from</h2>
      <p className="note">We distinguish historical sources, modern interpretation, and illustrative artwork so nothing sacred or scholarly is presented as something it is not.</p></div></div>
      <div className="creditGrid">
        <article><h3>Astrological engine</h3><p><strong>Swiss Ephemeris</strong> via <code>@swisseph/browser</code> for planetary positions, Ascendant, MC, speed, and house calculations. Whole Sign assignment and forecasting logic are implemented in Hellenistic Life.</p></article>
        <article><h3>Daily & natal deity artwork</h3><p>Deity imagery now uses historical/public-domain or CC0 source material. Hindu graha images are from E. A. Rodrigues, <em>The Complete Hindoo Pantheon</em> (1842), public domain. Classical images use museum-quality photographs of Helios, Selene, Hermes, Aphrodite, Ares, Zeus, and Kronos/Saturn from Wikimedia Commons files whose source pages identify them as public domain or CC0 where selected.</p></article>
        <article><h3>Traditions</h3><p>Hindu, Greek, and Roman planetary figures are presented as <strong>distinct traditions with overlapping planetary associations</strong>, not as interchangeable gods. Devotional suggestions are reflective rather than ritual prescriptions.</p></article>
        <article><h3>Scripture & wisdom</h3><p>Quoted passages are used only where a source/translation is named. Text labeled “Hellenistic Life reflection” is original interpretive prose and should not be read as an ancient quotation, mantra, or scripture.</p></article>
        <article><h3>Prediction method</h3><p>Current forecasts combine the natal Whole Sign chart, annual profection, Lord of the Year, traditional planetary transits, natal contacts, applying/separating motion, and topical house mapping. They are symbolic timing judgments rather than guaranteed events.</p></article>
        <article><h3>Visual design</h3><p>Golden-capillary marble, solar ornament, cloud motifs, planetary glyphs, and devotional portrait frames are original interface design elements created for Hellenistic Life.</p></article>
      </div>
      <details className="creditDetails"><summary>Detailed deity image credits</summary>
        <div className="imageCreditList">
          <p><strong>Hindu grahas:</strong> Surya, Chandra, Budha, Shukra, Mangala (Angraka), Brihaspati, and Shani — E. A. Rodrigues, <em>The Complete Hindoo Pantheon</em>, 1842. Public domain via Wikimedia Commons.</p>
          <p><strong>Aphrodite / Venus:</strong> Head of Aphrodite, Glyptothek Munich; photograph by Bibi Saint-Pol, released to the public domain.</p>
          <p><strong>Helios / Sol:</strong> Head of Helios, Archaeological Museum of Rhodes; photograph released to the public domain.</p>
          <p><strong>Hermes / Mercury:</strong> Winged head of Hermes; photograph released under CC0.</p>
          <p><strong>Ares / Mars:</strong> Ares Borghese, Louvre; photograph by Gary Todd, CC0.</p>
          <p><strong>Zeus / Jupiter:</strong> Zeus bust, Istanbul Archaeology Museums; photograph released under CC0.</p>
          <p><strong>Selene / Luna:</strong> Roman copy of Selene, Vatican Museums; photograph by Daderot, CC0.</p>
          <p><strong>Kronos / Saturn:</strong> Head identified as Kronos/Saturn, Vatican Museums; Wikimedia Commons source and license noted on the file page.</p>
        </div>
      </details>
    </section>

    <section className="olympusComic olympusIllustrated" aria-label="Meanwhile, on Olympus">
      <div className="olympusArtworkFrame">
        <img
          src="/olympus-original-panel-v2.png"
          alt="Meanwhile, on Olympus — an original Hellenistic Life illustrated three-panel scene with Aphrodite, Jupiter and Hermes."
        />
      </div>
    </section>

    <section className="rightsIndex">
      <p className="eyebrow">SOURCES · RIGHTS · ATTRIBUTION</p>
      <h2>Credits & source rights</h2>
      <p className="rightsIntro">Artwork links open the source page where the object, photographer or institution, and stated reuse status can be checked. Hellenistic Life distinguishes original writing and calculations from third-party historical material.</p>
      <div className="rightsGrid">
        <article>
          <h3>Hindu planetary artwork</h3>
          <a href={DEITY_SOURCE_LINKS.hindu.Sun} target="_blank" rel="noreferrer">Surya ↗</a>
          <a href={DEITY_SOURCE_LINKS.hindu.Moon} target="_blank" rel="noreferrer">Chandra ↗</a>
          <a href={DEITY_SOURCE_LINKS.hindu.Mercury} target="_blank" rel="noreferrer">Budha ↗</a>
          <a href={DEITY_SOURCE_LINKS.hindu.Venus} target="_blank" rel="noreferrer">Shukra ↗</a>
          <a href={DEITY_SOURCE_LINKS.hindu.Mars} target="_blank" rel="noreferrer">Mangala ↗</a>
          <a href={DEITY_SOURCE_LINKS.hindu.Jupiter} target="_blank" rel="noreferrer">Brihaspati ↗</a>
          <a href={DEITY_SOURCE_LINKS.hindu.Saturn} target="_blank" rel="noreferrer">Shani ↗</a>
        </article>
        <article>
          <h3>Greek / Roman artwork</h3>
          <a href={DEITY_SOURCE_LINKS.Greek.Sun} target="_blank" rel="noreferrer">Helios / Sol ↗</a>
          <a href={DEITY_SOURCE_LINKS.Greek.Moon} target="_blank" rel="noreferrer">Selene / Luna ↗</a>
          <a href={DEITY_SOURCE_LINKS.Greek.Mercury} target="_blank" rel="noreferrer">Hermes / Mercury ↗</a>
          <a href={DEITY_SOURCE_LINKS.Greek.Venus} target="_blank" rel="noreferrer">Aphrodite / Venus ↗</a>
          <a href={DEITY_SOURCE_LINKS.Greek.Mars} target="_blank" rel="noreferrer">Ares / Mars ↗</a>
          <a href={DEITY_SOURCE_LINKS.Greek.Jupiter} target="_blank" rel="noreferrer">Zeus / Jupiter ↗</a>
          <a href={DEITY_SOURCE_LINKS.Greek.Saturn} target="_blank" rel="noreferrer">Kronos / Saturn ↗</a>
        </article>
        <article>
          <h3>Texts & calculation references</h3>
          <a href="https://www.astro.com/swisseph/" target="_blank" rel="noreferrer">Swiss Ephemeris ↗</a>
          <a href="https://www.perseus.tufts.edu/" target="_blank" rel="noreferrer">Perseus Digital Library ↗</a>
          <a href="https://suttacentral.net/" target="_blank" rel="noreferrer">SuttaCentral ↗</a>
          <a href="https://www.gitasupersite.iitk.ac.in/" target="_blank" rel="noreferrer">Gita Supersite · IIT Kanpur ↗</a>
          <p>Astrological interpretations, forecast synthesis, interface copy, wheel layout, and site design are original Hellenistic Life material unless specifically quoted or credited.</p>
        </article>
      </div>
    </section>

<footer className="siteFooter">
      <div className="copyrightMain">
        <strong>Hellenistic Life</strong>
        <span>© 2026 Hellenistic Life. Original site design, writing, calculations, forecast logic, and interpretive presentation reserved to their creator except where third-party material is separately credited.</span>
      </div>
      <div className="createdBy">Created by <strong>Anshul Bhargava</strong></div>
      <p>Historical artworks, scriptures, source texts, planetary/deity names, symbols, and third-party materials remain subject to their respective public-domain, CC0, Creative Commons, institutional, or other stated rights. See Sources · Rights · Attribution above.</p>
    </footer>
  </main>
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
