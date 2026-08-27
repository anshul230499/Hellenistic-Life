# Examine a Life — Hellenistic Life Lab

A calculation-first prototype for a Greek/Hellenistic Whole Sign astrology website.

## Prototype 01 calculates

- Local birth time → UTC using an explicit UTC offset
- Julian Day
- Tropical ecliptic longitude for the seven traditional planets
- Ascendant and MC
- Whole Sign house assignment
- Traditional domicile ruler of every sign
- Daily longitudinal speed and retrogradation
- Whole-sign aspect configuration + optional degree-orb comparison
- An interactive calculation inspector showing how the result was derived

## Stack

- React + TypeScript + Vite
- `@swisseph/browser` (Swiss Ephemeris WebAssembly)
- Static browser-side calculations
- Vercel compatible

## Run locally

```bash
npm install
npm run dev
```

## Deploy to Vercel

1. Create a new GitHub repository.
2. Upload all files from this folder to the repository root.
3. In Vercel choose **Add New → Project**.
4. Import the GitHub repository.
5. Framework preset should detect **Vite**.
6. Build command: `npm run build`
7. Output directory: `dist`
8. Deploy.

## Important prototype choices

### Whole Sign means Whole Sign

The Swiss Ephemeris is used to calculate the physical Ascendant angle. The sign containing that Ascendant becomes House 1. Every following zodiac sign becomes the next house.

House number:

```text
((planetSignIndex - ascendantSignIndex + 12) mod 12) + 1
```

### Why latitude/longitude + UTC offset are explicit

This keeps the calculation inspectable and prevents a city-search service from silently introducing a timezone or DST error.

For production, add:

- place autocomplete
- historical IANA timezone resolution
- automatic DST handling
- a visible "calculation audit" panel showing the resolved UTC time before chart calculation

### Next Hellenistic modules

1. Sect — based on whether the Sun is above or below the local horizon
2. Essential dignity / domicile and exaltation
3. Angularity by Whole Sign and by quadrant
4. Bonification / maltreatment
5. Applying and separating configurations
6. Lots of Fortune and Spirit, with sect-dependent formulae
7. Annual profections
8. Lord of the Year
9. Zodiacal Releasing
10. Source annotations: Valens, Dorotheus, Antiochus, Ptolemy, etc.

## Accuracy note

This prototype uses the browser Swiss Ephemeris wrapper. Before relying on the site for research or publication, validate representative charts against a trusted Swiss Ephemeris reference and add automated regression tests.
