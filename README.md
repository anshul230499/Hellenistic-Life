# Hellenistic Life

Interactive, calculation-first Hellenistic astrology prototype using tropical zodiac and Whole Sign Houses.

## Prototype 03

This version adds:

- Birthplace search instead of manual latitude / longitude
- Automatic latitude and longitude resolution
- IANA timezone resolution from the selected birthplace
- Historical UTC offset calculation for the actual birth date
- Fractional offsets such as UTC+5:30 handled automatically
- A visible Local Time → UTC calculation timeline
- Annual profection for the current age
- Lord of the Year
- A daily life-area view using profection + today's seven traditional planetary transits
- Expandable explanations for why each life area is marked Supportive, Active, Mixed, Demanding, or Quiet

The daily section is presented as symbolic astrological interpretation, not factual prediction.

## Stack

- React
- TypeScript
- Vite
- `@swisseph/browser`
- Open-Meteo Geocoding API for location → coordinates + IANA timezone
- Browser `Intl.DateTimeFormat` for historical timezone/DST offset resolution

## Run

```bash
npm install
npm run dev
```

## Vercel

Repository name: `hellenistic-life`
Vercel project: `hellenistic-life`

Build command:

```text
npm run build
```

Output:

```text
dist
```

## Calculation philosophy

The project should expose the calculation trail instead of hiding it.

For birth time:

```text
Birthplace
→ coordinates
→ IANA timezone
→ historical UTC offset
→ Universal Time
→ Julian Day
→ Swiss Ephemeris
→ Ascendant / planets
→ Whole Sign houses
→ traditional timing and judgment
```

## Next

- Sect
- Exaltations and traditional dignity
- Solar visibility / under-the-beams / combustion
- Applying vs separating aspects
- Bonification and maltreatment
- Lots of Fortune and Spirit
- More rigorous daily testimony weighting
- Source annotations by ancient author / text

## Prototype 03 design direction

The home experience now answers the user's primary question first: **What is happening in my life right now?**

It adds:

- A historically inspired hero using a public-domain 1515 astronomical woodcut
- A "Present Chapter" reading before technical tables
- A calm guide voice that synthesizes the annual profection and daily testimony
- "What is strongest", "Where to use care", and "The counsel"
- Expandable methodology so the guide never becomes an opaque oracle
- Clear distinction between ancient technique and modern interpretive synthesis
- More classical typography, seals, manuscript-like spacing, and astronomical ornament

The guiding product principle is:

> Wisdom first. Calculations always available underneath.

The site should feel like consulting a learned ancient astrologer who is also willing to show every line of the mathematics.
