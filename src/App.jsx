import { useState, useEffect, useRef } from 'react'
import { Calendar, Clock, Construction, Cpu, Gauge, Layers, Mountain, Navigation, TrendingUp } from 'lucide-react'

// ── Project constants ──────────────────────────────────────────────────────
const PROJECT_START  = new Date('2025-01-01')
const PROJECT_END    = new Date('2031-12-31')
const TUNNEL_START   = new Date('2026-07-01')
const DEFAULT_DATE   = new Date('2026-05-20')
const SOUTHERN_DIST  = 4500   // m, Clovelly Park → Glandore (per tube)
const NORTHERN_DIST  = 2200   // m, Hilton → Torrensville (per bore)
const SLIDER_MIN     = PROJECT_START.getTime()
const SLIDER_MAX     = PROJECT_END.getTime()

// TBM3 bores northern tube 1, is repositioned back to Hilton, then bores tube 2.
const TB3_P1_DAYS    = Math.ceil(NORTHERN_DIST / 9)          // ~245 days to finish bore 1
const TB3_REPOS_DAYS = 90                                      // 3-month reposition / refurb
const TB3_P2_START   = TB3_P1_DAYS + TB3_REPOS_DAYS           // day drilling resumes for bore 2

// Fit-out starts at breakthrough; runs to PROJECT_END.
// Stages (% of fit-out period): 0-12 bare concrete, 12-30 invert pour,
// 30-45 drainage+slab, 45-60 road base, 60-75 pavement, 75-90 E&M systems,
// 90-100 lighting+safety+commissioning.
const SOUTH_BORE_DAYS   = Math.ceil(SOUTHERN_DIST / 9)                               // ~500 days
const NORTH_BORE2_DAYS  = TB3_P2_START + Math.ceil(NORTHERN_DIST / 9)                // ~580 days
const SOUTH_FITOUT_START = new Date(TUNNEL_START.getTime() + SOUTH_BORE_DAYS  * 86_400_000)
const NORTH_FITOUT_START = new Date(TUNNEL_START.getTime() + NORTH_BORE2_DAYS * 86_400_000)

// ── Geographic layout (left=NORTH/Torrensville, right=SOUTH/Darlington) ───
// Positions as fractions of SVG width — PROPORTIONAL to real-world distances.
//
// Distances:  Northern tunnels 2.2 km · Open-cut ~2.5 km · Southern tunnels 4.5 km
// Ratio: Southern / Northern ≈ 2.05  →  southern span is ~2× wider in SVG.
//
// Route sequence (N→S):
//   Torrensville portal → 2.2km Northern Tunnels → Hilton (open-cut section begins)
//   → open-cut motorway with ramps → Glandore (southern tunnels begin)
//   → 4.5km Southern Twin Tunnels → Clovelly Park portal → surface → Darlington
const GEO = {
  torrensville : 0.050,  // Northern portal (Ashwin Parade, Torrensville)
  brickworks   : 0.068,  // The Brickworks Marketplace, Thebarton — directly beside north portal
  riverTorrens : 0.105,  // River Torrens crossing (approx, tunnel runs under it)
  hilton       : 0.228,  // Hilton — south end of northern tunnel / open-cut begins  (N-tunnel = 0.178 fraction)
  rampJCD      : 0.275,  // James Congdon Dr / Richmond Rd ramp (airport access)
  rampCross    : 0.340,  // Cross Road connection ramp
  rampAnzac    : 0.400,  // Anzac Highway ramp
  glandore     : 0.440,  // Glandore — open-cut ends / southern tunnels begin        (open-cut = 0.212 fraction)
  goodwoodRd   : 0.533,  // Goodwood Rd / Springbank Rd — crosses above southern tunnels
  dawsRd       : 0.625,  // Daws Rd / Melrose Park — crosses above southern tunnels
  seacombeRd   : 0.718,  // Seacombe Rd — crosses above southern tunnels
  clovelly     : 0.805,  // Clovelly Park — southern portal + TBM 1&2 launch box   (S-tunnel = 0.365 fraction ≈ 2.05×)
  marionRd     : 0.870,  // Marion Road / Edwardstown
  darlington   : 0.940,  // Southern terminus (Darlington interchange)
}

// ── State computation ──────────────────────────────────────────────────────
function computeState(date) {
  const isTunnelling = date >= TUNNEL_START
  const daysDrilling = isTunnelling ? Math.floor((date - TUNNEL_START) / 86_400_000) : 0
  const southDist    = isTunnelling ? Math.min(daysDrilling * 9, SOUTHERN_DIST) : 0

  // TBM3 phases:  bore_1 → repositioning → bore_2
  let northDist1 = 0, northDist2 = 0, tb3Phase = 'idle'
  if (isTunnelling) {
    if (daysDrilling < TB3_P1_DAYS) {
      northDist1 = daysDrilling * 9
      tb3Phase   = 'bore_1'
    } else if (daysDrilling < TB3_P2_START) {
      northDist1 = NORTHERN_DIST
      tb3Phase   = 'repositioning'
    } else {
      northDist1 = NORTHERN_DIST
      northDist2 = Math.min((daysDrilling - TB3_P2_START) * 9, NORTHERN_DIST)
      tb3Phase   = northDist2 < NORTHERN_DIST ? 'bore_2' : 'complete'
    }
  }

  const totalDist = southDist * 2 + northDist1 + northDist2
  const totalMax  = SOUTHERN_DIST * 2 + NORTHERN_DIST * 2   // 4 tubes total

  const asm0 = new Date('2026-01-01').getTime()
  const asm1 = TUNNEL_START.getTime()
  const asmF = isTunnelling ? 1 : Math.max(0, (date.getTime() - asm0) / (asm1 - asm0))
  const t3s  = new Date('2026-01-20').getTime()
  const t3F  = isTunnelling ? 1 : Math.max(0, (date.getTime() - t3s) / (asm1 - t3s))

  const endMs   = PROJECT_END.getTime()
  const sFitMs  = SOUTH_FITOUT_START.getTime()
  const nFitMs  = NORTH_FITOUT_START.getTime()
  const southFitoutPct = southDist >= SOUTHERN_DIST
    ? Math.min(100, Math.max(0, (date.getTime() - sFitMs) / (endMs - sFitMs) * 100))
    : 0
  const northFitoutPct = northDist2 >= NORTHERN_DIST
    ? Math.min(100, Math.max(0, (date.getTime() - nFitMs) / (endMs - nFitMs) * 100))
    : 0

  const FADE_MS        = 150 * 86_400_000
  const curMs          = date.getTime()
  const n1BuryMs       = TUNNEL_START.getTime() + TB3_P1_DAYS * 86_400_000

  // Buried cutterhead fades (1→0 over 150 days after each breakthrough)
  const southBuryFade  = southDist  >= SOUTHERN_DIST  ? Math.max(0, 1 - (curMs - sFitMs)   / FADE_MS) : 0
  const northBury1Fade = northDist1 >= NORTHERN_DIST  ? Math.max(0, 1 - (curMs - n1BuryMs) / FADE_MS) : 0
  const northBury2Fade = northDist2 >= NORTHERN_DIST  ? Math.max(0, 1 - (curMs - nFitMs)   / FADE_MS) : 0

  // Spoil shed + launch box fades — each site fades once its bore is complete
  // Hilton shed:       fades after TBM3 bore 1 leaves (n1BuryMs)
  // Hilton launch box: fades after bore 2 arrives back (nFitMs) — it's the bore-2 receiver
  // Clovelly shed + launch box: fade together after south bore done (sFitMs)
  // Torrensville shed: fades after bore 2 complete (nFitMs)
  const hiltonShedFade   = northDist1 >= NORTHERN_DIST ? Math.max(0, 1 - (curMs - n1BuryMs) / FADE_MS) : 1
  const hiltonBoxFade    = northDist2 >= NORTHERN_DIST ? Math.max(0, 1 - (curMs - nFitMs)   / FADE_MS) : 1
  const clovelyFade      = southDist  >= SOUTHERN_DIST ? Math.max(0, 1 - (curMs - sFitMs)   / FADE_MS) : 1
  const torrensFade      = northDist2 >= NORTHERN_DIST ? Math.max(0, 1 - (curMs - nFitMs)   / FADE_MS) : 1

  return {
    date, isTunnelling, daysDrilling,
    southDist,
    northDist1, northDist2, tb3Phase,
    northDist: northDist1,   // backward-compat for TBMPanels
    totalDist, totalMax,
    tbm1Asm : Math.min(100, asmF * 100 + 8),
    tbm2Asm : Math.min(100, asmF * 100),
    tbm3Asm : Math.min(100, t3F  * 100),
    rings   : Math.floor(totalDist / 1.6),
    plantPct: Math.min(100, 60 + (isTunnelling ? Math.min(40, daysDrilling * 0.05) : 0)),
    projPct : Math.round((totalDist / totalMax) * 100),
    southFitoutPct, northFitoutPct,
    southBuryFade, northBury1Fade, northBury2Fade,
    hiltonShedFade, hiltonBoxFade, clovelyFade, torrensFade,
  }
}

// ── Particle hook (spoil flies RIGHTWARD — back from left-facing cutter) ──
function useParticles(active) {
  const [pts, setPts] = useState([])
  useEffect(() => {
    if (!active) { setPts([]); return }
    const id = setInterval(() => {
      const now = Date.now()
      setPts(p => {
        const alive = p.filter(x => now - x.t < 650)
        if (alive.length >= 18) return alive
        return [...alive, {
          id: Math.random(), t: now,
          dx: 6 + Math.random() * 26,
          dy: (Math.random() - 0.5) * 13,
          r : 1.2 + Math.random() * 2.6,
          c : ['#a16207','#92400e','#b45309','#78350f','#d97706'][Math.floor(Math.random() * 5)],
        }]
      })
    }, 65)
    return () => clearInterval(id)
  }, [active])
  return pts
}

// ── Cutterhead (spinning wheel, all TBMs face LEFT) ───────────────────────
function Cutterhead({ cx, cy, r, spinning }) {
  const [ang, setAng] = useState(0)
  const ref = useRef({ ang: 0, raf: null })
  useEffect(() => {
    if (!spinning) return
    const step = () => {
      ref.current.ang = (ref.current.ang + 2.2) % 360
      setAng(ref.current.ang)
      ref.current.raf = requestAnimationFrame(step)
    }
    ref.current.raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(ref.current.raf)
  }, [spinning])

  return (
    <g transform={`rotate(${ang},${cx},${cy})`}>
      <circle cx={cx} cy={cy} r={r} fill="#060d1a" stroke="#38bdf8" strokeWidth="2" />
      <circle cx={cx} cy={cy} r={r * 0.13} fill="#0ea5e9" />
      {[0,1,2,3,4,5,6,7].map(i => {
        const a = (i / 8) * Math.PI * 2
        return <line key={i}
          x1={cx + Math.cos(a) * r * 0.16} y1={cy + Math.sin(a) * r * 0.16}
          x2={cx + Math.cos(a) * r * 0.90} y2={cy + Math.sin(a) * r * 0.90}
          stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" />
      })}
      {[0,1,2,3,4,5,6,7,8,9,10,11].map(i => {
        const a = (i / 12) * Math.PI * 2
        return <circle key={i}
          cx={cx + Math.cos(a) * r * 0.60} cy={cy + Math.sin(a) * r * 0.60}
          r={r * 0.07} fill="#0ea5e9" />
      })}
    </g>
  )
}

// ── TBM unit ──────────────────────────────────────────────────────────────
// facing='left'  → cutterhead on LEFT,  body extends RIGHT (default, bore 1)
// facing='right' → cutterhead on RIGHT, body extends LEFT  (TBM3 bore 2)
//
// The mechanical body is wrapped in an SVG matrix that mirrors it around faceX,
// so the same drawing code works for both directions. Labels are placed OUTSIDE
// that group so text characters are never reversed.
function TBMUnit({ faceX, centreY, r, bodyLen, spinning, label, asm, particles, tunnelling, facing = 'left' }) {
  const mirrored  = facing === 'right'
  // matrix(-1,0,0,1, 2·faceX, 0) reflects every x-coord around x=faceX
  const bodyXform = mirrored ? `matrix(-1,0,0,1,${2 * faceX},0)` : undefined
  // Screen-space midpoint of the body (used for labels)
  const midX      = mirrored ? faceX - bodyLen * 0.45 : faceX + bodyLen * 0.45
  const boxLeft   = mirrored ? faceX - bodyLen * 0.83 : faceX + bodyLen * 0.05
  const arrow     = mirrored ? '►' : '◄'

  return (
    <g>
      {/* ── Mechanical body — mirrored for right-facing ── */}
      <g transform={bodyXform}>
        <rect x={faceX}                  y={centreY - r * 0.90} width={bodyLen * 0.28} height={r * 1.80}
          rx={2} fill="#334155" stroke="#475569" strokeWidth="1" />
        <rect x={faceX + bodyLen * 0.28} y={centreY - r * 0.68} width={bodyLen * 0.72} height={r * 1.36}
          rx={1} fill="#1e293b" stroke="#334155" strokeWidth="1" />
        {[0.37, 0.50, 0.63, 0.78].map((f, i) => (
          <rect key={i} x={faceX + bodyLen * f} y={centreY - r * 0.64}
            width={Math.max(2, bodyLen * 0.024)} height={r * 1.28} fill="#334155" />
        ))}
        <Cutterhead cx={faceX} cy={centreY} r={r * 0.92} spinning={spinning} />
        {/* Particles: under mirror transform, positive dx flies in the correct
            direction away from the cutter face for both facing directions */}
        {particles.map(p => {
          const age = (Date.now() - p.t) / 650
          return (
            <circle key={p.id}
              cx={faceX + p.dx * age * 2.2} cy={centreY + p.dy}
              r={p.r * Math.max(0, 1 - age)} fill={p.c} opacity={Math.max(0, 1 - age)} />
          )
        })}
      </g>

      {/* ── Labels (NOT inside mirror group — text must not reverse) ── */}
      {tunnelling
        ? <text x={midX} y={centreY - r - 5}
            textAnchor="middle" fontSize={8} fill="#7dd3fc">{label} {arrow}</text>
        : <g>
            <rect x={boxLeft} y={centreY - r - 21} width={bodyLen * 0.78} height={16}
              rx={3} fill="#060d1a" stroke="#38bdf8" strokeWidth="0.8" />
            <text x={boxLeft + bodyLen * 0.39} y={centreY - r - 10}
              textAnchor="middle" fontSize={8} fill="#38bdf8">{label}: {Math.round(asm)}%</text>
          </g>
      }
    </g>
  )
}

// ── Buried cutterhead — entombed in concrete at end of tunnel life ────────
// Real practice on T2D and similar projects: the cutterhead is decommissioned
// in place at the breakthrough/receiver box rather than extracted.
function BuriedHead({ cx, cy, r }) {
  return (
    <g>
      {/* Concrete encasement block */}
      <rect x={cx - r * 1.1} y={cy - r * 1.1} width={r * 2.2} height={r * 2.2}
        rx={r * 0.15} fill="#334155" stroke="#64748b" strokeWidth={1} opacity={0.85} />
      {/* Ghosted cutterhead outline */}
      <circle cx={cx} cy={cy} r={r * 0.92}
        fill="none" stroke="#475569" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.6} />
      {/* Spoke remnants */}
      {[0,1,2,3,4,5,6,7].map(i => {
        const a = (i / 8) * Math.PI * 2
        return <line key={i}
          x1={cx + Math.cos(a) * r * 0.16} y1={cy + Math.sin(a) * r * 0.16}
          x2={cx + Math.cos(a) * r * 0.82} y2={cy + Math.sin(a) * r * 0.82}
          stroke="#475569" strokeWidth={1} opacity={0.4} />
      })}
      {/* Burial label */}
      <text x={cx} y={cy - r * 1.25} textAnchor="middle" fontSize={7} fill="#64748b">
        ⚰ entombed
      </text>
    </g>
  )
}

// ── Animated spoil conveyor line ───────────────────────────────────────────
function Conveyor({ x1, y1, x2, y2 }) {
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1c1917" strokeWidth={3.5} />
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="#a16207" strokeWidth={2} strokeDasharray="8 5"
        style={{ animation: 'conveyor-flow 0.45s linear infinite' }} />
    </g>
  )
}

// ── Tunnel profile helpers ────────────────────────────────────────────────
function TubeOutline({ x1, x2, cy, r }) {
  const lx = Math.min(x1, x2), rx = Math.max(x1, x2)
  return (
    <rect x={lx} y={cy - r * 0.88} width={rx - lx} height={r * 1.76}
      rx={3} fill="none" stroke="#334155" strokeWidth={1}
      strokeDasharray="7 4" opacity={0.55} />
  )
}

function CompletedTube({ x1, x2, cy, r }) {
  const lx = Math.min(x1, x2), rx = Math.max(x1, x2)
  const w    = rx - lx
  const rr   = r * 0.88   // outer extrados
  const ri   = r * 0.55   // inner bore void radius (matches TunnelFitout)
  const segW = r * 1.3
  const segs = Math.floor(w / segW)
  return (
    <g>
      {/* Solid white punch-through — erases strata beneath the tube completely */}
      <rect x={lx} y={cy - rr} width={w} height={rr * 2} rx={3} fill="#ffffff" />
      {/* Concrete lining tint */}
      <rect x={lx} y={cy - rr} width={w} height={rr * 2} rx={3} fill="#b0b8c8" opacity={0.9} />
      {/* Inner bore void — near-white, bright and open */}
      <rect x={lx + 2} y={cy - ri} width={Math.max(0, w - 4)} height={ri * 2}
        rx={3} fill="#f0f2f5" />
      {/* Ring joint ticks */}
      {Array.from({ length: segs }).map((_, i) => (
        <line key={i}
          x1={lx + i * segW + segW * 0.5} y1={cy - rr}
          x2={lx + i * segW + segW * 0.5} y2={cy + rr}
          stroke="#6b7280" strokeWidth={0.9} opacity={0.45} />
      ))}
      {/* Bright white border for extra pop */}
      <rect x={lx} y={cy - rr} width={w} height={rr * 2}
        rx={3} fill="none" stroke="#ffffff" strokeWidth={2.5} opacity={0.85} />
    </g>
  )
}

// ── Staged tunnel fit-out interior ────────────────────────────────────────
// Rendered on top of CompletedTube as a % of fit-out work progresses.
// Real post-breakthrough sequence (based on WestConnex / West Gate Tunnel practice):
//   0–12%  : TBM removal, bare concrete                  (nothing extra shown)
//  12–30%  : Invert concrete pour + waterproofing         (gray base fill at bottom)
//  30–45%  : Drainage installation + base slab            (slightly formed floor)
//  45–60%  : Road base course                             (darker formation layer)
//  60–75%  : Road pavement + centre-line markings         (road surface visible)
//  75–90%  : Electrical, mechanical, ventilation systems  (no major visual change)
//  90–100% : LED lighting, safety systems, commissioning  (lights appear)
function TunnelFitout({ x1, x2, cy, r, pct }) {
  if (pct <= 0) return null
  const lx = Math.min(x1, x2), rx = Math.max(x1, x2)
  const w       = rx - lx
  // ri must match CompletedTube so all stages render inside the concrete walls
  const ri      = r * 0.55
  const lightGap = r * 2.8

  // Positions relative to bore void (cy−ri … cy+ri)
  const invertY  = cy + ri * 0.52   // invert pour starts here (lower ~48% of void)
  const slabY    = cy + ri * 0.30   // drainage + base slab top
  const baseY    = cy + ri * 0.14   // road base course top
  const surfaceY = cy + ri * 0.14   // road surface top (same as base; sits on top)
  const surfaceH = ri * 0.28        // wearing course thickness
  const dashY    = cy + ri * 0.28   // centre-line dash y (middle of wearing course)

  return (
    <g>
      {/* 12–30%: Invert concrete pour — fills lowest ~48% of bore void */}
      {pct >= 12 && (
        <rect x={lx} y={invertY} width={w} height={cy + ri - invertY} fill="#52525b" opacity={0.97} />
      )}
      {/* 30–45%: Drainage + base slab buildup */}
      {pct >= 30 && (
        <rect x={lx} y={slabY} width={w} height={cy + ri - slabY} fill="#3f3f46" opacity={0.97} />
      )}
      {/* 45–60%: Road base course */}
      {pct >= 45 && (
        <rect x={lx} y={baseY} width={w} height={cy + ri - baseY} fill="#292524" opacity={0.97} />
      )}
      {/* 60–75%: Road wearing course + centre-line dashes */}
      {pct >= 60 && <>
        <rect x={lx} y={surfaceY} width={w} height={surfaceH} fill="#1c1917" opacity={0.97} />
        {Array.from({ length: Math.floor(w / 18) }).map((_, i) => (
          <line key={i}
            x1={lx + i * 18 + 2} y1={dashY}
            x2={lx + i * 18 + 11} y2={dashY}
            stroke="#fbbf24" strokeWidth={0.8} opacity={0.35} />
        ))}
        <line x1={lx} y1={surfaceY + surfaceH} x2={rx} y2={surfaceY + surfaceH}
          stroke="#e4e4e7" strokeWidth={0.5} opacity={0.22} />
      </>}
      {/* 90–100%: LED ceiling lights — mounted just inside the bore void crown */}
      {pct >= 90 && Array.from({ length: Math.floor(w / lightGap) }).map((_, i) => {
        const lxOff = lx + (i + 0.5) * lightGap
        return (
          <g key={i}>
            <rect x={lxOff - 2} y={cy - ri + 1} width={4} height={3}
              fill="#374151" stroke="#4b5563" strokeWidth={0.5} />
            <circle cx={lxOff} cy={cy - ri + 4} r={1.8} fill="#fde68a" opacity={0.95} />
            <ellipse cx={lxOff} cy={cy - ri * 0.45} rx={lightGap * 0.28} ry={ri * 0.32}
              fill="#fde68a" opacity={0.07} />
          </g>
        )
      })}
    </g>
  )
}

// ── Open-cut motorway section (between northern & southern tunnels) ────────
// This is the below-grade open trough from Hilton to Glandore with ramp connections.
function OpenCutSection({ x1, x2, gndY, depth, finished = false }) {
  const slope = Math.min(18, depth * 0.55)
  const mid   = (x1 + x2) / 2
  const roadW = x2 - x1 - slope * 2
  const dashOpa = finished ? 0.45 : 0.22
  return (
    <g>
      {/* Trough fill */}
      <path
        d={`M ${x1} ${gndY} L ${x1 + slope} ${gndY + depth} L ${x2 - slope} ${gndY + depth} L ${x2} ${gndY} Z`}
        fill="#07111e" />
      {/* Retaining walls */}
      <line x1={x1} y1={gndY} x2={x1 + slope} y2={gndY + depth}
        stroke={finished ? '#64748b' : '#475569'} strokeWidth="1.5" />
      <line x1={x2} y1={gndY} x2={x2 - slope} y2={gndY + depth}
        stroke={finished ? '#64748b' : '#475569'} strokeWidth="1.5" />
      {/* Road surface at trough floor */}
      <rect x={x1 + slope} y={gndY + depth - 5} width={roadW} height={5}
        fill={finished ? '#1c2333' : '#131a26'} />
      {/* Lane dashes */}
      {Array.from({ length: Math.floor(roadW / 28) }).map((_, i) => (
        <line key={i}
          x1={x1 + slope + i * 28 + 3} y1={gndY + depth - 2.5}
          x2={x1 + slope + i * 28 + 16} y2={gndY + depth - 2.5}
          stroke="#fbbf24" strokeWidth="0.8" opacity={dashOpa} />
      ))}
      {/* Kerb edge lines when finished */}
      {finished && <>
        <line x1={x1 + slope} y1={gndY + depth - 5} x2={x2 - slope} y2={gndY + depth - 5}
          stroke="#e2e8f0" strokeWidth={0.6} opacity={0.25} />
        <line x1={x1 + slope} y1={gndY + depth}     x2={x2 - slope} y2={gndY + depth}
          stroke="#e2e8f0" strokeWidth={0.6} opacity={0.20} />
      </>}
      {/* Section label */}
      <text x={mid} y={gndY + depth * 0.55}
        textAnchor="middle" fontSize={7.5}
        fill={finished ? '#475569' : '#334155'} letterSpacing="1">
        {finished ? 'OPEN-CUT MOTORWAY — OPERATIONAL' : 'OPEN-CUT MOTORWAY SECTION'}
      </text>
    </g>
  )
}

// ── Portal ramp dive at tunnel ends ───────────────────────────────────────
// 'toward' = 'left'  → ramp extends LEFT  (Torrensville surface, Glandore inner)
// 'toward' = 'right' → ramp extends RIGHT (Clovelly surface, Hilton inner)
//
// connectY: y-coord where the ramp meets the flat road it connects FROM.
//   null      → surface portal; ramp starts at gndY−5 (road surface)
//   a value   → trough portal; ramp starts at connectY (open-cut trough road)
//
// rampExtent: horizontal length of ramp (default 76 for surface; 44 for trough)
function PortalRamp({ x, gndY, tubeY, r, toward = 'left', finished = false,
                      connectY = null, rampExtent = 76 }) {
  const d       = toward === 'left' ? -1 : 1
  const surfX   = x + d * rampExtent
  const rr      = r * 0.88
  const ri      = r * 0.55
  const floorY  = tubeY + ri * 0.40
  // roadY: where the ramp meets the flat road; cutTopY: top of the dark wedge
  const roadY   = connectY !== null ? connectY       : gndY - 5
  const cutTopY = connectY !== null ? connectY + 5   : gndY

  return (
    <g>
      {/* Excavated cut wedge — dark fill from ramp start down to tube bottom */}
      <polygon
        points={`${x},${cutTopY} ${x},${tubeY + rr} ${surfX},${cutTopY}`}
        fill="#060d1a" />
      {/* Vertical cut wall at the portal face */}
      <line x1={x} y1={cutTopY} x2={x} y2={tubeY + rr}
        stroke="#475569" strokeWidth="1.5" />
      {/* Upper slope line showing earth cut edge */}
      <line x1={x} y1={tubeY - rr} x2={surfX} y2={cutTopY}
        stroke="#334155" strokeWidth="1" opacity={0.5} />

      {/* Ramp road — slopes from road level down to tunnel floor */}
      <line x1={surfX} y1={roadY} x2={x} y2={floorY}
        stroke={finished ? '#23293a' : '#131a26'} strokeWidth="8" strokeLinecap="butt" />

      {/* Lane centre dashes when finished */}
      {finished && [0.12, 0.38, 0.64, 0.88].map((t0, i) => {
        const t1 = Math.min(t0 + 0.17, 0.98)
        return <line key={i}
          x1={surfX + (x - surfX) * t0}  y1={roadY + (floorY - roadY) * t0}
          x2={surfX + (x - surfX) * t1}  y2={roadY + (floorY - roadY) * t1}
          stroke="#fbbf24" strokeWidth={0.9} opacity={0.40} />
      })}

      {/* Portal arch surround */}
      <rect x={x - 7} y={tubeY - rr} width={14} height={rr * 2}
        rx={4} fill="#1e2d3d" stroke={finished ? '#4ade80' : '#94a3b8'} strokeWidth="1.8" />

      {/* Tube cross-section face — concrete annulus + bright bore void */}
      <ellipse cx={x} cy={tubeY} rx={6} ry={rr} fill="#b0b8c8" opacity={0.90} />
      <ellipse cx={x} cy={tubeY} rx={4} ry={ri} fill="#f0f2f5" opacity={0.95} />

      {/* Green operational lights */}
      {finished && <>
        <circle cx={x + d * 7} cy={tubeY - rr * 0.70} r={2} fill="#4ade80" opacity={0.95} />
        <circle cx={x + d * 7} cy={tubeY + rr * 0.60} r={2} fill="#4ade80" opacity={0.95} />
      </>}
    </g>
  )
}

// ── Surface ramp connection in open-cut section ───────────────────────────
function SurfaceRamp({ x, gndY, troughY, label, sub, side = 'right', finished = false, pinH = 36 }) {
  const rampW = 22
  const d = side === 'right' ? 1 : -1
  const surfX = x + d * rampW
  const steps = 3
  const c = finished ? '#4ade80' : '#64748b'
  return (
    <g>
      {/* Ramp road base */}
      <line x1={x} y1={troughY} x2={surfX} y2={gndY}
        stroke={finished ? '#23293a' : '#334155'} strokeWidth={finished ? 4 : 2} />
      {!finished && <line x1={x} y1={troughY} x2={surfX} y2={gndY}
        stroke="#475569" strokeWidth="1" strokeDasharray="4 3" />}
      {finished && Array.from({ length: steps }).map((_, i) => {
        const t0 = (i + 0.1) / steps, t1 = (i + 0.55) / steps
        return <line key={i}
          x1={x + (surfX - x) * t0} y1={troughY + (gndY - troughY) * t0}
          x2={x + (surfX - x) * t1} y2={troughY + (gndY - troughY) * t1}
          stroke="#fbbf24" strokeWidth={0.8} opacity={0.30} />
      })}
      {/* Ground pin — height controlled by pinH to allow staggering nearby labels */}
      <line x1={surfX} y1={gndY} x2={surfX} y2={gndY - pinH}
        stroke={c} strokeWidth="0.8" strokeDasharray={finished ? undefined : '2 2'} opacity="0.6" />
      <circle cx={surfX} cy={gndY - pinH} r="2.5" fill={c} opacity="0.8" />
      <text x={surfX} y={gndY - pinH - 6} textAnchor="middle" fontSize={7.5}
        fill={c} fontWeight="600">{label}</text>
      {sub && <text x={surfX} y={gndY - pinH - 15} textAnchor="middle" fontSize={6.5}
        fill={c} opacity={0.7}>{sub}</text>}
    </g>
  )
}

// ── Launch box ─────────────────────────────────────────────────────────────
function LaunchBox({ cx, gndY, depth, label, sub }) {
  const w = 58
  return (
    <g>
      <rect x={cx - w / 2} y={gndY} width={w} height={depth}
        fill="#fbbf24" opacity={0.05} />
      <rect x={cx - w / 2} y={gndY} width={w} height={depth}
        fill="none" stroke="#fbbf24" strokeWidth={1.5} strokeDasharray="5 3" opacity={0.7} />
      <rect x={cx - w / 2 - 3} y={gndY - 9} width={w + 6} height={9}
        fill="#292524" stroke="#475569" strokeWidth={1} />
      <text x={cx} y={gndY + 14} textAnchor="middle" fontSize={7} fill="#fbbf24">{label}</text>
      {sub && <text x={cx} y={gndY + 24} textAnchor="middle" fontSize={6.5} fill="#fbbf24" opacity={0.7}>{sub}</text>}
    </g>
  )
}

// ── On-site acoustic spoil shed ────────────────────────────────────────────
// Both launch boxes have enclosed spoil sheds. Spoil is conveyor-fed in,
// then trucked ~12km to the Gillman reuse facility (Eastern Parade, Gillman).
function SpoilShed({ cx, gndY, active, label }) {
  const sw = 48, sh = 36
  return (
    <g>
      {/* Shed body */}
      <rect x={cx - sw / 2} y={gndY - sh} width={sw} height={sh}
        fill="#1e293b" stroke="#475569" strokeWidth={1.2} />
      {/* Gabled roof */}
      <polygon
        points={`${cx - sw / 2 - 3},${gndY - sh} ${cx},${gndY - sh - 14} ${cx + sw / 2 + 3},${gndY - sh}`}
        fill="#293548" stroke="#475569" strokeWidth={1} />
      {/* Active intake conveyor ripple */}
      {active && (
        <line x1={cx - sw / 2} y1={gndY - sh / 2} x2={cx - sw / 2 - 18} y2={gndY - sh / 2}
          stroke="#a16207" strokeWidth="1.5" strokeDasharray="4 3"
          style={{ animation: 'conveyor-flow 0.4s linear infinite' }} />
      )}
      {/* Truck exit arrow */}
      {active && (
        <g>
          <line x1={cx + sw / 2} y1={gndY - sh / 2} x2={cx + sw / 2 + 22} y2={gndY - sh / 2}
            stroke="#64748b" strokeWidth="1" strokeDasharray="3 2" />
          <text x={cx + sw / 2 + 24} y={gndY - sh / 2 + 3} fontSize={6} fill="#64748b">→ Gillman</text>
        </g>
      )}
      <text x={cx} y={gndY - 4} textAnchor="middle" fontSize={7} fill="#94a3b8">{label}</text>
      <text x={cx} y={gndY - 14} textAnchor="middle" fontSize={6.5} fill="#475569">Spoil Shed</text>
    </g>
  )
}

// ── Animated truck loop ────────────────────────────────────────────────────
function TruckLoop({ cx, cy, active }) {
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setPhase(p => (p + 1) % 80), 50)
    return () => clearInterval(id)
  }, [active])
  const tx = (phase / 80) * 72
  return (
    <g transform={`translate(${cx - 24}, ${cy})`}>
      <g transform={`translate(${tx}, 0)`}>
        <rect x={0} y={-8} width={26} height={10} rx="2" fill="#374151" stroke="#6b7280" strokeWidth="0.8" />
        <rect x={17} y={-13} width={9} height={5} rx="1" fill="#4b5563" />
        <circle cx={4}  cy={3} r={2.5} fill="#111827" stroke="#6b7280" strokeWidth="0.8" />
        <circle cx={20} cy={3} r={2.5} fill="#111827" stroke="#6b7280" strokeWidth="0.8" />
        {active && <rect x={1} y={-7} width={15} height={Math.min(7, tx * 0.10)}
          fill="#92400e" opacity="0.8" />}
      </g>
    </g>
  )
}

// ── Surface landmark pin ───────────────────────────────────────────────────
function Pin({ x, gndY, label, sub, color, h = 45 }) {
  return (
    <g>
      <line x1={x} y1={gndY} x2={x} y2={gndY - h}
        stroke={color} strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
      <circle cx={x} cy={gndY - h} r="3" fill={color} opacity="0.85" />
      <text x={x} y={gndY - h - 6} textAnchor="middle" fontSize={8} fill={color} fontWeight="600">{label}</text>
      {sub && <text x={x} y={gndY - h - 15} textAnchor="middle" fontSize={6.5} fill={color} opacity={0.6}>{sub}</text>}
    </g>
  )
}

// ── Main geological cross-section SVG ────────────────────────────────────
function GeoSection({ state, W, H }) {
  const gndY = H * 0.30
  const subH = H - gndY
  const gx   = k => GEO[k] * W

  // TBM visual size — needed before troughDepth so depth can reference r
  const r  = Math.min(20, H * 0.052)
  const bL = r * 5.5

  // Tunnel centre-lines (depth as fraction of subsurface height)
  const tubeY1 = gndY + subH * 0.22   // upper tube (TBM1 & TBM3)
  const tubeY2 = gndY + subH * 0.38   // lower tube (TBM2)

  // Open-cut trough spans the full depth of both tunnel bores so they
  // connect flush at Hilton and Glandore — no inner portal ramps needed.
  const troughDepth = tubeY2 - gndY + r * 0.88 + 8

  // Excavation progress fractions
  const sP  = state.southDist  / SOUTHERN_DIST
  const nP1 = state.northDist1 / NORTHERN_DIST
  const nP2 = state.northDist2 / NORTHERN_DIST

  // Face positions
  // TBM1/2 and TBM3-bore1: launch from right (south), advance LEFT (northward)
  const tb12FaceX = gx('clovelly') - sP  * (gx('clovelly') - gx('glandore'))
  const tb3FaceX1 = gx('hilton')   - nP1 * (gx('hilton')   - gx('torrensville'))
  // TBM3 bore 2: TBM was rotated 180° inside the Torrensville receiver box,
  // now launches from torresvilleX and advances RIGHTWARD back toward Hilton.
  const tb3FaceX2 = gx('torrensville') + nP2 * (gx('hilton') - gx('torrensville'))

  const isBoring3_1   = state.tb3Phase === 'bore_1'
  const isRepos3      = state.tb3Phase === 'repositioning'
  const isBoring3_2   = state.tb3Phase === 'bore_2' || state.tb3Phase === 'complete'
  // boreDone: the TBM has broken through — remove machinery, stop conveyors/trucks
  const southFinished = state.southFitoutPct > 0
  const northFinished = state.northFitoutPct > 0
  // allOpen: full fit-out complete, ramps/portals turn green
  const southOpen     = state.southFitoutPct >= 100
  const northOpen     = state.northFitoutPct >= 100
  const allFinished   = southOpen && northOpen

  // Geological strata
  const strata = [
    { label: 'Topsoil / Made Ground',   fill: '#713f12', frac: 0.07 },
    { label: 'Hindmarsh Clay (Upper)',   fill: '#7c3d0c', frac: 0.22 },
    { label: 'Hindmarsh Clay (Lower)',   fill: '#92400e', frac: 0.24 },
    { label: 'Transition Sands/Gravels', fill: '#a16207', frac: 0.20 },
  ]
  let sy = gndY
  const layers = strata.map(s => {
    const lh = subH * s.frac
    const out = { ...s, y: sy, h: lh }
    sy += lh
    return out
  })

  const p1  = useParticles(state.isTunnelling)
  const p2  = useParticles(state.isTunnelling)
  const p3a = useParticles(isBoring3_1)
  const p3b = useParticles(isBoring3_2)

  return (
    <svg width={W} height={H} style={{ display: 'block', background: '#060d1a' }}>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#040a14" />
          <stop offset="100%" stopColor="#081729" />
        </linearGradient>
      </defs>

      {/* Sky */}
      <rect x={0} y={0} width={W} height={gndY} fill="url(#sky)" />

      {/* Geological strata */}
      {layers.map((l, i) => (
        <rect key={i} x={0} y={l.y} width={W} height={l.h} fill={l.fill} opacity={0.47} />
      ))}

      {/* ── Open-cut section (Hilton→Glandore) drawn before road so it cuts the surface ── */}
      <OpenCutSection
        x1={gx('hilton')} x2={gx('glandore')}
        gndY={gndY} depth={troughDepth} finished={allFinished}
      />

      {/* ── Portal ramp dives — both tube bores shown at each outer portal ── */}
      {/* Northern portal — Torrensville: both northern bores dive LEFT */}
      <PortalRamp x={gx('torrensville')} gndY={gndY} tubeY={tubeY1} r={r} toward="left" finished={northOpen} />
      <PortalRamp x={gx('torrensville')} gndY={gndY} tubeY={tubeY2} r={r} toward="left" finished={northOpen} />
      {/* Southern portal — Clovelly Park: both southern bores dive RIGHT */}
      <PortalRamp x={gx('clovelly')} gndY={gndY} tubeY={tubeY1} r={r} toward="right" finished={southOpen} />
      <PortalRamp x={gx('clovelly')} gndY={gndY} tubeY={tubeY2} r={r} toward="right" finished={southOpen} />

      {/* ── Surface road ── */}
      <rect x={0} y={gndY - 6} width={W} height={6} fill="#1c2333" />
      <line x1={0} y1={gndY} x2={W} y2={gndY} stroke="#475569" strokeWidth={1} />
      {/* Road lane dashes */}
      {Array.from({ length: Math.floor(W / 36) }).map((_, i) => (
        <line key={i} x1={i * 36 + 4} y1={gndY - 3} x2={i * 36 + 20} y2={gndY - 3}
          stroke="#fbbf24" strokeWidth="0.6" opacity="0.18" />
      ))}

      {/* ── Corridor label ── */}
      <text x={W / 2} y={gndY - 10} textAnchor="middle" fontSize={8} fill="#374151" letterSpacing="1.5">
        SOUTH ROAD — NORTH-SOUTH MOTORWAY EXTENSION CORRIDOR
      </text>

      {/* ── Cardinal labels ── */}
      <text x={14} y={16} fontSize={9} fill="#2d3748">◄ NORTH</text>
      <text x={W - 14} y={16} textAnchor="end" fontSize={9} fill="#2d3748">SOUTH ►</text>

      {/* ══ SURFACE LANDMARKS ══ */}

      {/* Northern portal label — tall pin so label clears the Brickworks pin beside it */}
      <Pin x={gx('torrensville')} gndY={gndY}
        label="North Portal" sub="Ashwin Pde, Torrensville" color="#34d399" h={72} />

      {/* The Brickworks — immediately east of northern portal; short pin so labels don't collide */}
      <Pin x={gx('brickworks')} gndY={gndY}
        label="The Brickworks" sub="Thebarton" color="#fb923c" h={38} />
      {/* Tiny building icon */}
      <rect x={gx('brickworks') - 7} y={gndY - 38} width={14} height={10}
        fill="#1e293b" stroke="#fb923c" strokeWidth="0.8" opacity="0.9" />
      <rect x={gx('brickworks') - 4} y={gndY - 38} width={3} height={5}
        fill="#fb923c" opacity="0.5" />
      <rect x={gx('brickworks') + 1} y={gndY - 38} width={3} height={5}
        fill="#fb923c" opacity="0.5" />

      {/* River Torrens */}
      <ellipse cx={gx('riverTorrens')} cy={gndY - 3} rx={16} ry={4} fill="#1e40af" opacity={0.65} />
      <Pin x={gx('riverTorrens')} gndY={gndY}
        label="River Torrens" sub="tunnel passes under" color="#60a5fa" h={55} />

      {/* ── Open-cut section ramp connections ── */}
      <SurfaceRamp x={gx('rampJCD')}   gndY={gndY} troughY={gndY + troughDepth}
        label="James Congdon Dr" sub="Richmond Rd / Airport" side="right" finished={allFinished} />
      <SurfaceRamp x={gx('rampCross')} gndY={gndY} troughY={gndY + troughDepth}
        label="Cross Road" sub="interchange" side="right" finished={allFinished} pinH={56} />
      <SurfaceRamp x={gx('rampAnzac')} gndY={gndY} troughY={gndY + troughDepth}
        label="Anzac Highway" sub="connection" side="left" finished={allFinished} pinH={34} />

      {/* Major roads crossing above southern tunnels */}
      <Pin x={gx('goodwoodRd')} gndY={gndY}
        label="Goodwood Rd" sub="Springbank Rd jct" color="#a78bfa" h={45} />
      <Pin x={gx('dawsRd')} gndY={gndY}
        label="Daws Rd" sub="Melrose Park" color="#a78bfa" h={58} />
      <Pin x={gx('seacombeRd')} gndY={gndY}
        label="Seacombe Rd" sub="Seacombe Gardens" color="#a78bfa" h={40} />

      {/* Marion Road */}
      <Pin x={gx('marionRd')} gndY={gndY}
        label="Marion Rd" sub="Edwardstown" color="#a78bfa" h={34} />

      {/* Darlington */}
      <Pin x={gx('darlington')} gndY={gndY}
        label="Darlington" sub="South terminus" color="#34d399" h={48} />

      {/* CBD reference */}
      <text x={gx('brickworks') + 28} y={24} fontSize={7} fill="#2d3748">
        Adelaide CBD ~3 km East →
      </text>

      {/* ══ UNDERGROUND ELEMENTS ══ */}

      {/* ── Launch boxes + spoil sheds — fade out once no longer needed ── */}

      {/* Hilton launch box: receiver for bore 2; fades after bore 2 complete */}
      {state.hiltonBoxFade > 0.02 && (
        <g opacity={state.hiltonBoxFade}>
          <LaunchBox cx={gx('hilton')} gndY={gndY} depth={subH * 0.30}
            label="HILTON LAUNCH BOX" sub="TBM 3 Portal" />
        </g>
      )}
      {/* Hilton spoil shed: active bore 1 only; fades once TBM3 leaves for Torrensville */}
      {state.hiltonShedFade > 0.02 && (
        <g opacity={state.hiltonShedFade}>
          <SpoilShed cx={gx('hilton') + 54} gndY={gndY} active={isBoring3_1} label="Hilton" />
        </g>
      )}

      {/* Clovelly launch box + shed: both fade after southern bore completes */}
      {state.clovelyFade > 0.02 && (
        <g opacity={state.clovelyFade}>
          <LaunchBox cx={gx('clovelly')} gndY={gndY} depth={subH * 0.30}
            label="CLOVELLY PARK" sub="TBM 1 & 2 Portal" />
          <SpoilShed cx={gx('clovelly') + 54} gndY={gndY}
            active={state.isTunnelling && !southFinished} label="Clovelly Pk" />
        </g>
      )}

      {/* Torrensville spoil shed: appears for repos + bore 2; fades after bore 2 complete */}
      {(isBoring3_2 || isRepos3) && state.torrensFade > 0.02 && (
        <g opacity={state.torrensFade}>
          <SpoilShed cx={gx('torrensville') + 42} gndY={gndY} active={isBoring3_2} label="Torrensville" />
        </g>
      )}


{/* ── Planned tunnel outlines ── */}
      {/* Northern bore 1 (tubeY1) and bore 2 (tubeY2) — same horizontal range */}
      <TubeOutline x1={gx('torrensville')} x2={gx('hilton')}   cy={tubeY1} r={r} />
      <TubeOutline x1={gx('torrensville')} x2={gx('hilton')}   cy={tubeY2} r={r} />
      {/* Southern twin bores */}
      <TubeOutline x1={gx('glandore')}     x2={gx('clovelly')} cy={tubeY1} r={r} />
      <TubeOutline x1={gx('glandore')}     x2={gx('clovelly')} cy={tubeY2} r={r} />

      {/* ── Completed lining ──
           Lining grows from the face back to the launch portal as TBMs advance.
           TBM shapes are opaque and drawn on top, hiding the portion beneath them. ── */}
      {/* Northern bore 1 — TBM3 phase 1 */}
      {state.northDist1 > 0 && (
        <CompletedTube x1={tb3FaceX1} x2={gx('hilton')} cy={tubeY1} r={r} />
      )}
      {/* Northern bore 2 — TBM3 rotated, now boring from Torrensville → Hilton (rightward).
           Lining grows from the Torrensville portal rightward to the advancing face. */}
      {state.northDist2 > 0 && (
        <CompletedTube x1={gx('torrensville')} x2={tb3FaceX2} cy={tubeY2} r={r} />
      )}
      {/* Southern twin bores */}
      {state.southDist > 0 && <>
        <CompletedTube x1={tb12FaceX} x2={gx('clovelly')} cy={tubeY1} r={r} />
        <CompletedTube x1={tb12FaceX} x2={gx('clovelly')} cy={tubeY2} r={r} />
      </>}

      {/* ── Staged tunnel fit-out — progresses over years after breakthrough ── */}
      <TunnelFitout x1={gx('glandore')}     x2={gx('clovelly')} cy={tubeY1} r={r} pct={state.southFitoutPct} />
      <TunnelFitout x1={gx('glandore')}     x2={gx('clovelly')} cy={tubeY2} r={r} pct={state.southFitoutPct} />
      <TunnelFitout x1={gx('torrensville')} x2={gx('hilton')}   cy={tubeY1} r={r} pct={state.northFitoutPct} />
      <TunnelFitout x1={gx('torrensville')} x2={gx('hilton')}   cy={tubeY2} r={r} pct={state.northFitoutPct} />

      {/* ── Portal faces — drawn AFTER tubes so they appear in front ──────────── */}
      {/* 4 portals × 2 tube bores = 8 faces total.                              */}
      {/* At inner portals (Hilton/Glandore) the arch faces INTO the open trough  */}
      {[
        { k: 'torrensville', ty: tubeY1, fin: northOpen, d: -1 },
        { k: 'torrensville', ty: tubeY2, fin: northOpen, d: -1 },
        { k: 'hilton',       ty: tubeY1, fin: northOpen, d:  1 },
        { k: 'hilton',       ty: tubeY2, fin: northOpen, d:  1 },
        { k: 'glandore',     ty: tubeY1, fin: southOpen, d: -1 },
        { k: 'glandore',     ty: tubeY2, fin: southOpen, d: -1 },
        { k: 'clovelly',     ty: tubeY1, fin: southOpen, d:  1 },
        { k: 'clovelly',     ty: tubeY2, fin: southOpen, d:  1 },
      ].map(({ k, ty, fin, d }, i) => {
        const px = gx(k), rr = r * 0.88, ri = r * 0.55
        return (
          <g key={i}>
            {/* Portal arch surround — sits flush against tube end */}
            <rect x={px - 8} y={ty - rr} width={16} height={rr * 2}
              rx={4} fill="#1e2d3d" stroke={fin ? '#4ade80' : '#94a3b8'} strokeWidth={1.8} />
            {/* Concrete annulus face */}
            <ellipse cx={px} cy={ty} rx={6} ry={rr} fill="#b0b8c8" opacity={0.90} />
            {/* Bright bore opening */}
            <ellipse cx={px} cy={ty} rx={4} ry={ri} fill="#f0f2f5" opacity={0.95} />
            {/* Green operational lights when tunnel is open */}
            {fin && <>
              <circle cx={px + d * 9} cy={ty - rr * 0.70} r={2} fill="#4ade80" opacity={0.95} />
              <circle cx={px + d * 9} cy={ty + rr * 0.60} r={2} fill="#4ade80" opacity={0.95} />
            </>}
          </g>
        )
      })}

      {/* ── Spoil conveyors — stop and disappear when the relevant bore completes ── */}
      {/* TBM 1 & 2 southern conveyors — active only while boring, removed when southFinished */}
      {state.isTunnelling && !southFinished && <>
        <Conveyor x1={tb12FaceX} y1={tubeY1} x2={gx('clovelly')} y2={tubeY1} />
        <Conveyor x1={tb12FaceX} y1={tubeY2} x2={gx('clovelly')} y2={tubeY2} />
        <Conveyor x1={gx('clovelly')} y1={tubeY2} x2={gx('clovelly')} y2={tubeY1} />
        <Conveyor x1={gx('clovelly')} y1={tubeY1} x2={gx('clovelly')} y2={gndY - 6} />
        <Conveyor x1={gx('clovelly')} y1={gndY - 6} x2={gx('clovelly') + 30} y2={gndY - 18} />
      </>}
      {/* TBM3 bore 1 conveyor — active only during bore_1 phase */}
      {isBoring3_1 && <>
        <Conveyor x1={tb3FaceX1} y1={tubeY1} x2={gx('hilton')} y2={tubeY1} />
        <Conveyor x1={gx('hilton')} y1={tubeY1} x2={gx('hilton')} y2={gndY - 6} />
        <Conveyor x1={gx('hilton')} y1={gndY - 6} x2={gx('hilton') + 30} y2={gndY - 18} />
      </>}
      {/* TBM3 bore 2 — spoil flows leftward to Torrensville; stops when northFinished */}
      {isBoring3_2 && !northFinished && <>
        <Conveyor x1={tb3FaceX2} y1={tubeY2} x2={gx('torrensville')} y2={tubeY2} />
        <Conveyor x1={gx('torrensville')} y1={tubeY2} x2={gx('torrensville')} y2={gndY - 6} />
        <Conveyor x1={gx('torrensville')} y1={gndY - 6} x2={gx('torrensville') + 28} y2={gndY - 18} />
      </>}

      {/* ── TBMs ── */}
      {/* TBM 1 & 2: hidden after cutterheads buried (machinery removed post-breakthrough) */}
      {!southFinished && <>
        {/* TBM 1 — Southern upper, faces LEFT toward Glandore */}
        <TBMUnit faceX={tb12FaceX} centreY={tubeY1} r={r} bodyLen={bL}
          spinning={state.isTunnelling} label="TBM 1" asm={state.tbm1Asm}
          particles={p1} tunnelling={state.isTunnelling} />
        {/* TBM 2 — Southern lower (twin bore), faces LEFT toward Glandore */}
        <TBMUnit faceX={tb12FaceX} centreY={tubeY2} r={r} bodyLen={bL}
          spinning={state.isTunnelling} label="TBM 2" asm={state.tbm2Asm}
          particles={p2} tunnelling={state.isTunnelling} />
      </>}

      {/* TBM 3 — four phases: idle (assembly) → bore 1 → reposition → bore 2 → removed */}
      {state.tb3Phase === 'idle' && (
        // Pre-tunnelling: TBM3 visible in Hilton launch box during assembly
        <TBMUnit faceX={gx('hilton')} centreY={tubeY1} r={r} bodyLen={bL}
          spinning={false} label="TBM 3" asm={state.tbm3Asm}
          particles={[]} tunnelling={false} />
      )}
      {isBoring3_1 && (
        <TBMUnit faceX={tb3FaceX1} centreY={tubeY1} r={r} bodyLen={bL}
          spinning={true} label="TBM 3 Bore 1" asm={state.tbm3Asm}
          particles={p3a} tunnelling={true} />
      )}
      {isRepos3 && (
        // TBM3 has arrived at the Torrensville receiver box and is being rotated 180°.
        <g opacity={0.40}>
          <TBMUnit faceX={gx('torrensville')} centreY={tubeY1} r={r} bodyLen={bL}
            spinning={false} label="TBM 3" asm={100}
            particles={[]} tunnelling={false} facing="left" />
          <text x={gx('torrensville') + bL * 0.4} y={tubeY1 - r - 28}
            textAnchor="middle" fontSize={8} fill="#fbbf24">↺ ROTATING IN RECEIVER BOX</text>
        </g>
      )}
      {/* TBM3 bore 2 — hidden after northern tunnels complete (machinery removed) */}
      {isBoring3_2 && !northFinished && (
        // TBM3 relaunched from Torrensville facing RIGHT — boring back toward Hilton
        <TBMUnit faceX={tb3FaceX2} centreY={tubeY2} r={r} bodyLen={bL}
          spinning={true} label="TBM 3 Bore 2" asm={state.tbm3Asm}
          particles={p3b} tunnelling={true} facing="right" />
      )}

      {/* ── Buried cutterheads — appear at breakthrough then fade out over ~150 days ── */}
      {/* TBM1 & TBM2: entombed at Glandore, fade out during early fit-out */}
      {state.southBuryFade > 0.02 && (
        <g opacity={state.southBuryFade}>
          <BuriedHead cx={gx('glandore')} cy={tubeY1} r={r * 0.92} />
          <BuriedHead cx={gx('glandore')} cy={tubeY2} r={r * 0.92} />
        </g>
      )}
      {/* TBM3 bore 1: entombed at Torrensville, fades during repositioning period */}
      {state.northBury1Fade > 0.02 && state.northDist2 === 0 && (
        <g opacity={state.northBury1Fade}>
          <BuriedHead cx={gx('torrensville')} cy={tubeY1} r={r * 0.92} />
        </g>
      )}
      {/* TBM3 bore 2: entombed at Hilton when second northern tube completes */}
      {state.northBury2Fade > 0.02 && (
        <g opacity={state.northBury2Fade}>
          <BuriedHead cx={gx('hilton')} cy={tubeY2} r={r * 0.92} />
        </g>
      )}

      {/* ── Truck loops at each shed ── */}
      {state.isTunnelling && !southFinished && <>
        <TruckLoop cx={gx('clovelly') + 82} cy={gndY - 2} active />
      </>}
      {isBoring3_1 && <TruckLoop cx={gx('hilton') + 82} cy={gndY - 2} active />}
      {isBoring3_2 && !northFinished && <TruckLoop cx={gx('torrensville') + 36} cy={gndY - 2} active />}

      {/* ── Open-to-traffic indicators — only once full fit-out is complete ── */}
      {southOpen && (
        <g>
          <rect x={gx('clovelly') - 74} y={gndY - 22} width={148} height={17}
            rx={3} fill="#14532d" stroke="#16a34a" strokeWidth={1} opacity={0.9} />
          <text x={gx('clovelly')} y={gndY - 10} textAnchor="middle" fontSize={7.5}
            fill="#4ade80" fontWeight="600">✓ SOUTHERN TUNNELS OPEN</text>
        </g>
      )}
      {northOpen && (
        <g>
          {/* Anchored left so it doesn't clip off the left SVG edge */}
          <rect x={gx('torrensville')} y={gndY - 22} width={100} height={17}
            rx={3} fill="#14532d" stroke="#16a34a" strokeWidth={1} opacity={0.9} />
          <text x={gx('torrensville') + 50} y={gndY - 10} textAnchor="middle" fontSize={7.5}
            fill="#4ade80" fontWeight="600">✓ N. TUNNELS OPEN</text>
        </g>
      )}

      {/* ── Tunnel route labels ── */}
      <text x={(gx('torrensville') + gx('hilton')) / 2} y={tubeY1 - r - 7}
        textAnchor="middle" fontSize={7} fill="#60a5fa" opacity={0.65}>
        Northern Bores (2.2 km each) — TBM 3
      </text>
      <text x={(gx('glandore') + gx('clovelly')) / 2} y={tubeY1 - r - 7}
        textAnchor="middle" fontSize={7} fill="#60a5fa" opacity={0.65}>
        Southern Twin Bore (4.5 km) — TBM 1 &amp; 2
      </text>

      {/* ── Depth ruler ── */}
      {[0, 10, 20, 30, 40].map(d => {
        const py = gndY + (d / 55) * subH
        return (
          <g key={d}>
            <line x1={W - 6} y1={py} x2={W - 2} y2={py} stroke="#1e293b" strokeWidth={1} />
            <text x={W - 8} y={py + 3.5} textAnchor="end" fontSize={7} fill="#374151">{d}m</text>
          </g>
        )
      })}
      <line x1={W - 3} y1={gndY} x2={W - 3} y2={gndY + subH * 0.73}
        stroke="#1e293b" strokeWidth={1} />

      {/* ── Legend ── */}
      <g transform={`translate(${W - 208}, ${H - 90})`}>
        <rect width={202} height={84} rx={4} fill="#040a14" stroke="#1e293b" strokeWidth={1} opacity={0.92} />
        <rect x={6} y={8}  width={13} height={9} rx={2} fill="#78716c" stroke="#e7e5e4" strokeWidth={0.8} opacity={0.9} />
        <text x={25} y={17} fontSize={8.5} fill="#64748b">Concrete lining (as-bored)</text>
        <rect x={6} y={22} width={13} height={9} rx={2} fill="#1c2233" stroke="#fbbf24" strokeWidth={0.5} opacity={0.9} />
        <text x={25} y={31} fontSize={8.5} fill="#64748b">Road pavement (fit-out)</text>
        <circle cx={12} cy={43} r={3} fill="#fde68a" opacity={0.9} />
        <text x={25} y={47} fontSize={8.5} fill="#64748b">LED ceiling lights (fit-out)</text>
        <line x1={6} y1={58} x2={20} y2={58} stroke="#334155" strokeDasharray="4 2" strokeWidth={1.5} />
        <text x={25} y={62} fontSize={8.5} fill="#64748b">Planned bore alignment</text>
        <rect x={6} y={68} width={13} height={8} rx={1} fill="#fbbf24" opacity={0.3} />
        <text x={25} y={76} fontSize={8.5} fill="#64748b">Launch box / portal</text>
      </g>
    </svg>
  )
}

// ── Metric card ────────────────────────────────────────────────────────────
function MetricCard({ icon: Icon, label, value, sub, color = 'cyan', pulse }) {
  const border = { cyan:'border-cyan-800', amber:'border-amber-800', green:'border-green-800', blue:'border-blue-800', orange:'border-orange-800' }
  const text   = { cyan:'text-cyan-400',   amber:'text-amber-400',  green:'text-green-400',  blue:'text-blue-400',  orange:'text-orange-400' }
  return (
    <div className={`border rounded-lg p-3 bg-slate-900 ${border[color]} relative overflow-hidden`}>
      {pulse && <div className="absolute inset-0 bg-current opacity-[0.04] animate-pulse" />}
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className="opacity-60" />
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-xl font-bold font-mono ${text[color]}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-600 mt-0.5">{sub}</div>}
    </div>
  )
}

// ── TBM status panels ──────────────────────────────────────────────────────
function TBMPanels({ state }) {
  const southBoreDone = state.southFitoutPct > 0
  const northBoreDone = state.northFitoutPct > 0

  const southStatusBadge = () => {
    if (state.southFitoutPct >= 100) return { cls: 'bg-blue-950 text-blue-400',  label: '✓ TUNNELS COMPLETE' }
    if (southBoreDone)               return { cls: 'bg-indigo-950 text-indigo-400', label: `⚒ FIT-OUT ${Math.round(state.southFitoutPct)}%` }
    if (state.isTunnelling)          return { cls: 'bg-green-950 text-green-400', label: '● DRILLING' }
    return                                  { cls: 'bg-slate-800 text-slate-500',  label: `● ASSEMBLY ${Math.round(state.tbm1Asm)}%` }
  }

  const tb3StatusBadge = () => {
    if (state.northFitoutPct >= 100) return { cls: 'bg-blue-950 text-blue-400',    label: '✓ TUNNELS COMPLETE' }
    if (northBoreDone)               return { cls: 'bg-indigo-950 text-indigo-400', label: `⚒ FIT-OUT ${Math.round(state.northFitoutPct)}%` }
    const labels = {
      idle:          { cls: 'bg-slate-800 text-slate-500',  label: `● ASSEMBLY ${Math.round(state.tbm3Asm)}%` },
      bore_1:        { cls: 'bg-green-950 text-green-400',  label: '● DRILLING — Bore 1' },
      repositioning: { cls: 'bg-amber-950 text-amber-400',  label: '↺ REPOSITIONING' },
      bore_2:        { cls: 'bg-green-950 text-green-400',  label: '● DRILLING — Bore 2' },
      complete:      { cls: 'bg-indigo-950 text-indigo-400', label: `⚒ FIT-OUT ${Math.round(state.northFitoutPct)}%` },
    }
    return labels[state.tb3Phase] ?? labels.idle
  }

  const sb = southStatusBadge()
  const tb3 = tb3StatusBadge()

  const southBars = [
    { name:'TBM 1', route:'Clovelly Pk → Glandore', dist:state.southDist, max:SOUTHERN_DIST, asm:state.tbm1Asm, c:'#0891b2', tc:'text-cyan-400', bc:'border-cyan-800' },
    { name:'TBM 2', route:'Clovelly Pk → Glandore', dist:state.southDist, max:SOUTHERN_DIST, asm:state.tbm2Asm, c:'#1d4ed8', tc:'text-blue-400', bc:'border-blue-800' },
  ]

  return (
    <div className="grid grid-cols-3 gap-3">
      {southBars.map((t, i) => (
        <div key={i} className={`border rounded-lg p-3 bg-slate-900 ${t.bc}`}>
          <div className={`font-bold text-sm ${t.tc}`}>{t.name}</div>
          <div className="text-[10px] text-slate-500 mb-2">{t.route}</div>
          {!southBoreDone && (
            <div className="mb-1.5">
              <div className="flex justify-between text-[10px] text-slate-600 mb-0.5">
                <span>Assembly</span><span>{Math.round(t.asm)}%</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full">
                <div className="h-full rounded-full transition-all" style={{ width:`${t.asm}%`, background:t.c }} />
              </div>
            </div>
          )}
          <div className="mb-1.5">
            <div className="flex justify-between text-[10px] text-slate-600 mb-0.5">
              <span>Excavated</span>
              <span>{Math.round(t.dist).toLocaleString()}m / {t.max.toLocaleString()}m</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full">
              <div className="h-full rounded-full transition-all"
                style={{ width:`${(t.dist / t.max) * 100}%`, background:t.c }} />
            </div>
          </div>
          {southBoreDone && (
            <div className="mb-1">
              <div className="flex justify-between text-[10px] text-slate-600 mb-0.5">
                <span>Fit-out</span><span>{Math.round(state.southFitoutPct)}%</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full">
                <div className="h-full rounded-full transition-all"
                  style={{ width:`${state.southFitoutPct}%`, background:'#6366f1' }} />
              </div>
            </div>
          )}
          <div className={`mt-1 text-[10px] px-2 py-0.5 rounded-full inline-block font-mono ${sb.cls}`}>
            {sb.label}
          </div>
        </div>
      ))}

      {/* TBM 3 — two bore progress bars + fit-out */}
      <div className="border rounded-lg p-3 bg-slate-900 border-amber-800">
        <div className="font-bold text-sm text-amber-400">TBM 3</div>
        <div className="text-[10px] text-slate-500 mb-2">Hilton ↔ Torrensville (×2 bores)</div>
        <div className="mb-1.5">
          <div className="flex justify-between text-[10px] text-slate-600 mb-0.5">
            <span>Bore 1</span>
            <span>{Math.round(state.northDist1).toLocaleString()}m / {NORTHERN_DIST.toLocaleString()}m</span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full">
            <div className="h-full rounded-full transition-all"
              style={{ width:`${(state.northDist1 / NORTHERN_DIST) * 100}%`, background:'#d97706' }} />
          </div>
        </div>
        <div className="mb-1.5">
          <div className="flex justify-between text-[10px] text-slate-600 mb-0.5">
            <span>Bore 2</span>
            <span>{Math.round(state.northDist2).toLocaleString()}m / {NORTHERN_DIST.toLocaleString()}m</span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full">
            <div className="h-full rounded-full transition-all"
              style={{ width:`${(state.northDist2 / NORTHERN_DIST) * 100}%`, background:'#b45309' }} />
          </div>
        </div>
        {northBoreDone && (
          <div className="mb-1">
            <div className="flex justify-between text-[10px] text-slate-600 mb-0.5">
              <span>Fit-out</span><span>{Math.round(state.northFitoutPct)}%</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full">
              <div className="h-full rounded-full transition-all"
                style={{ width:`${state.northFitoutPct}%`, background:'#6366f1' }} />
            </div>
          </div>
        )}
        <div className={`mt-1 text-[10px] px-2 py-0.5 rounded-full inline-block font-mono ${tb3.cls}`}>
          {tb3.label}
        </div>
      </div>
    </div>
  )
}

// ── Live wall-clock ────────────────────────────────────────────────────────
function LiveClock({ sliderDate }) {
  const [wall, setWall] = useState(new Date())
  useEffect(() => { const id = setInterval(() => setWall(new Date()), 1000); return () => clearInterval(id) }, [])
  const p = n => String(n).padStart(2, '0')
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return (
    <div className="flex items-center gap-2">
      <div className="text-right">
        <div className="text-lg font-mono font-bold text-cyan-400">
          {p(wall.getHours())}:{p(wall.getMinutes())}:{p(wall.getSeconds())}
        </div>
        <div className="text-[10px] text-slate-500">
          Sim: {M[sliderDate.getMonth()]} {sliderDate.getFullYear()}
        </div>
      </div>
      <Clock size={22} className="text-cyan-700" />
    </div>
  )
}

// ── Timeline slider ────────────────────────────────────────────────────────
function TimelineSlider({ value, onChange }) {
  const marks = [
    { date: new Date('2025-01-01'), label: 'Q1 2025: Site Est.' },
    { date: new Date('2026-04-01'), label: 'Q2 2026: Cutterheads' },
    { date: new Date('2026-07-01'), label: 'H2 2026: Tunnelling' },
    { date: new Date('2028-06-01'), label: '2028: N-Tunnels Done' },
    { date: new Date('2031-12-01'), label: '2031: Complete' },
  ]
  const pct = ((value - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100
  return (
    <div className="w-full">
      <div className="relative h-2 bg-slate-800 rounded-full mb-1">
        <div className="absolute left-0 top-0 h-full bg-gradient-to-r from-blue-700 to-cyan-500 rounded-full"
          style={{ width: `${pct}%` }} />
        <input type="range" min={SLIDER_MIN} max={SLIDER_MAX} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
        <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-cyan-400 rounded-full border-2
          border-slate-900 shadow-lg shadow-cyan-500/40 pointer-events-none"
          style={{ left: `calc(${pct}% - 8px)` }} />
      </div>
      <div className="relative h-8">
        {marks.map((m, i) => {
          const mp = ((m.date.getTime() - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100
          const past = value >= m.date.getTime()
          return (
            <div key={i} className="absolute flex flex-col items-center"
              style={{ left: `${mp}%`, transform: 'translateX(-50%)' }}>
              <div className={`w-px h-2 ${past ? 'bg-cyan-500' : 'bg-slate-700'}`} />
              <span className={`text-[7px] text-center whitespace-nowrap ${past ? 'text-cyan-500' : 'text-slate-700'}`}
                style={{ maxWidth: 72 }}>{m.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Root App ───────────────────────────────────────────────────────────────
export default function App() {
  const [sliderVal, setSliderVal] = useState(DEFAULT_DATE.getTime())
  const [hasDragged, setHasDragged] = useState(false)
  const containerRef = useRef(null)
  const [dims, setDims] = useState({ w: 900, h: 400 })

  const sliderDate = new Date(sliderVal)
  const state = computeState(sliderDate)

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = e.contentRect.width
        setDims({ w, h: Math.max(260, Math.round(w * 0.30)) })
      }
    })
    if (containerRef.current) obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const dateStr = `${M[sliderDate.getMonth()]} ${sliderDate.getFullYear()}`

  // Dynamic spoil shed count — mirrors the visibility logic in GeoSection
  const shedCount =
    (state.hiltonShedFade > 0.02 ? 1 : 0) +
    (state.clovelyFade    > 0.02 ? 1 : 0) +
    ((state.tb3Phase === 'bore_2' || state.tb3Phase === 'repositioning' || state.tb3Phase === 'complete') && state.torrensFade > 0.02 ? 1 : 0)
  const shedSub = shedCount === 0
    ? 'All sites decommissioned'
    : shedCount === 1
    ? 'One active site → Gillman'
    : shedCount === 2
    ? 'Two active sites → Gillman'
    : 'Three active sites → Gillman'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col select-none">

      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900 px-5 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-600 to-blue-800 flex items-center justify-center">
            <Mountain size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight">Adelaide T2D North-South Corridor Dashboard</h1>
            <p className="text-[10px] text-slate-600 mt-0.5">
              River Torrens to Darlington — $15.4B · 3 TBMs · 6.7 km twin tunnel · spoil to Gillman
            </p>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-1.5 text-xs">
            {(() => {
              const allOpen     = state.southFitoutPct >= 100 && state.northFitoutPct >= 100
              const anyFitout   = state.southFitoutPct > 0   || state.northFitoutPct > 0
              const [dot, col, lbl] = allOpen
                ? ['bg-blue-400',   'text-blue-400',   'CORRIDOR OPEN']
                : anyFitout
                ? ['bg-indigo-400', 'text-indigo-400', 'FIT-OUT IN PROGRESS']
                : state.isTunnelling
                ? ['bg-green-400 animate-pulse', 'text-green-400', 'ACTIVE TUNNELLING']
                : ['bg-amber-400 animate-pulse', 'text-amber-400', 'PRE-EXCAVATION / ASSEMBLY']
              return <>
                <div className={`w-2 h-2 rounded-full ${dot}`} />
                <span className={col}>{lbl}</span>
              </>
            })()}
          </div>
          <LiveClock sliderDate={sliderDate} />
        </div>
      </header>

      {/* Metrics */}
      <div className="px-4 pt-3 pb-2 grid grid-cols-5 gap-2.5 shrink-0">
        <MetricCard icon={Navigation} label="Total Excavated"
          value={`${Math.round(state.totalDist).toLocaleString()}m`}
          sub={`${state.projPct}% of ${(state.totalMax / 1000).toFixed(1)} km`}
          color="cyan" pulse={state.isTunnelling} />
        <MetricCard icon={Cpu} label="TBMs Drilling"
          value={(() => {
            if (!state.isTunnelling) return '0'
            if (state.southFitoutPct > 0 && state.northFitoutPct > 0) return '0'
            if (state.southFitoutPct > 0) return '1'
            if (state.tb3Phase === 'repositioning') return '2'
            return '3'
          })()}
          sub={(() => {
            if (state.southFitoutPct >= 100 && state.northFitoutPct >= 100) return 'All tunnels open'
            if (state.southFitoutPct > 0 && state.northFitoutPct > 0) return 'Fit-out in progress'
            if (state.southFitoutPct > 0) return 'TBM 3 bore 2 active'
            if (state.northFitoutPct > 0) return 'TBM 1 & 2 active'
            if (state.tb3Phase === 'repositioning') return 'TBM 3 rotating'
            if (state.isTunnelling) return 'All systems active'
            return 'Assembly in progress'
          })()}
          color="green" />
        <MetricCard icon={Layers} label="Rings Installed"
          value={state.rings.toLocaleString()}
          sub={`of ~${Math.round(state.totalMax / 1.6).toLocaleString()} total`}
          color="blue" />
        <MetricCard icon={Construction} label="Spoil Sheds"
          value={String(shedCount)}
          sub={shedSub} color="amber" />
        <MetricCard icon={TrendingUp} label="Project Completion"
          value={`${state.projPct}%`}
          sub="Target: Dec 2031" color="orange" />
      </div>

      {/* Cross-section */}
      <div ref={containerRef}
        className="mx-4 mb-2 rounded-xl overflow-hidden border border-slate-800 shrink-0">
        <div className="bg-slate-900 border-b border-slate-800 px-3 py-1 flex items-center gap-2">
          <Layers size={12} className="text-cyan-500" />
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
            Geological Cross-Section · Torrensville (North) → Darlington (South)
          </span>
          <span className="ml-auto text-[9px] text-slate-700">Schematic — not to scale</span>
        </div>
        <GeoSection state={state} W={dims.w} H={dims.h} />
      </div>

      {/* Timeline */}
      <div className="border-t border-slate-800 bg-slate-900 px-5 py-3 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Calendar size={12} className="text-slate-500" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Project Timeline</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-slate-500">
            <span>Jan 2025</span>
            <div className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 font-mono font-bold text-xs">
              {dateStr}
            </div>
            <span>Dec 2031</span>
          </div>
        </div>
        {!hasDragged && (
          <p className="text-center mb-1.5 animate-pulse">
            <span className="text-[9px] text-cyan-600 tracking-widest font-semibold">
              ← DRAG TO EXPLORE THE TIMELINE →
            </span>
          </p>
        )}
        <TimelineSlider value={sliderVal} onChange={v => { setSliderVal(v); setHasDragged(true) }} />
        <p className="mt-1.5 text-[9px] text-slate-700 text-center">
          {state.isTunnelling
            ? `Excavation day ${state.daysDrilling} — ~9 m/day per TBM — S: ${Math.round(state.southDist).toLocaleString()}m · N: ${Math.round(state.northDist).toLocaleString()}m — trucks to Gillman every 3–4 min`
            : 'Drag slider past Jul 2026 to begin excavation — drill, conveyor, and truck animations gate on at tunnelling commencement'}
        </p>
      </div>

      {/* TBM panels */}
      <div className="mt-auto px-4 mb-3 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <Gauge size={12} className="text-slate-600" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">TBM Status</span>
        </div>
        <TBMPanels state={state} />
      </div>
    </div>
  )
}
