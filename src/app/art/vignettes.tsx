import type { ReactNode } from 'react'

/**
 * Region header vignettes (E1-05): flat, layered cut-paper bands, one per region, in each region's motif
 * colours (docs/design/art-direction.md#regions), at most six colours each. Decorative: the region page
 * names the region in its heading. No people, creatures, logos or real places.
 */
const VIGNETTES: Record<string, ReactNode> = {
  'console-room': (
    <>
      <rect width="480" height="120" fill="#12151a" />
      <circle cx="240" cy="62" r="54" fill="#7de8d8" opacity=".18" />
      <circle cx="240" cy="62" r="34" fill="none" stroke="#7de8d8" strokeWidth="2" opacity=".5" />
      <rect x="212" y="24" width="56" height="74" rx="10" fill="#d2c8ad" />
      <rect x="220" y="32" width="40" height="52" rx="6" fill="#7de8d8" />
      <path
        d="M226 54c4-5 10-5 14 0s10 5 14 0"
        fill="none"
        stroke="#efe9dc"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M230 64c3-4 7-4 10 0s7 4 10 0"
        fill="none"
        stroke="#efe9dc"
        strokeWidth="2"
        strokeLinecap="round"
        opacity=".6"
      />
      <g fill="#6fe0a0">
        <rect x="40" y="30" width="10" height="6" rx="2" />
        <rect x="64" y="46" width="10" height="6" rx="2" />
        <rect x="88" y="30" width="10" height="6" rx="2" />
        <rect x="392" y="46" width="10" height="6" rx="2" />
        <rect x="430" y="30" width="10" height="6" rx="2" />
      </g>
      <g fill="#ffb84d">
        <rect x="112" y="46" width="10" height="6" rx="2" />
        <rect x="370" y="30" width="10" height="6" rx="2" />
      </g>
      <rect y="98" width="480" height="22" fill="#d2c8ad" opacity=".25" />
    </>
  ),
  harbor: (
    <>
      <rect width="480" height="120" fill="#e3f9f4" />
      <path d="M0 84c60-8 120 6 180 0s160-12 300 0v36H0z" fill="#156a70" />
      <path
        d="M40 100c16-5 32-5 48 0M150 106c16-5 32-5 48 0M330 102c16-5 32-5 48 0"
        fill="none"
        stroke="#e3f9f4"
        strokeWidth="2"
        opacity=".6"
      />
      <rect x="150" y="72" width="190" height="10" fill="#156a70" />
      <g>
        <rect x="160" y="50" width="52" height="22" fill="#ef7f5a" />
        <rect x="214" y="50" width="52" height="22" fill="#ffb84d" />
        <rect x="268" y="50" width="52" height="22" fill="#ef7f5a" />
        <rect x="186" y="28" width="52" height="22" fill="#ffb84d" />
        <rect
          x="240"
          y="28"
          width="52"
          height="22"
          fill="#e3f9f4"
          stroke="#156a70"
          strokeWidth="2"
        />
      </g>
      <path
        d="M380 82V22h8v60zM384 22h70v6h-70zM446 28v22"
        fill="none"
        stroke="#156a70"
        strokeWidth="6"
        strokeLinejoin="round"
      />
      <rect x="436" y="50" width="20" height="10" fill="#ffb84d" />
    </>
  ),
  'helm-keep': (
    <>
      <rect width="480" height="120" fill="#ece8f4" />
      <path d="M0 96c80-20 160-24 240-24s160 6 240 24v24H0z" fill="#6f5b93" opacity=".35" />
      <path d="M180 100c20-30 100-30 120 0z" fill="#6f5b93" opacity=".6" />
      <path d="M206 96V42l-8-8V16h14v8h12v-8h18v8h12v-8h14v18l-8 8v54z" fill="#6f5b93" />
      <path d="M230 96V76a10 10 0 0 1 20 0v20z" fill="#2b2147" />
      {/* One arrow slit, high and to the side: two windows over the door would read as a face. */}
      <rect x="252" y="30" width="5" height="16" rx="2" fill="#2b2147" />
      <path
        d="M240 16V0l16 6-16 6"
        fill="#ffb84d"
        stroke="#ffb84d"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <g fill="#6f5b93" opacity=".5">
        <path d="M60 96V70h10v-8h10v8h10v26z" />
        <path d="M400 96V66h10v-8h10v8h10v30z" />
      </g>
    </>
  ),
  chartroom: (
    <>
      <rect width="480" height="120" fill="#fbeedd" />
      <rect x="40" y="70" width="140" height="40" rx="4" fill="#fff3c9" />
      <path d="M52 82h70M52 92h100M52 100h50" stroke="#b0652a" strokeWidth="2" opacity=".5" />
      <path d="M210 104V70a30 30 0 0 1 60 0v34z" fill="#b0652a" />
      <path d="M240 40V22" stroke="#b0652a" strokeWidth="5" strokeLinecap="round" />
      <circle cx="240" cy="76" r="11" fill="none" stroke="#fff3c9" strokeWidth="3" />
      <path d="M240 67v18M231 76h18" stroke="#fff3c9" strokeWidth="2" />
      <g transform="translate(370 64)">
        <circle r="34" fill="#fff3c9" />
        <path d="M0-30L6 0 0 30-6 0z" fill="#b0652a" />
        <path d="M-30 0L0-6 30 0 0 6z" fill="#ffb84d" />
        <circle r="4" fill="#b0652a" />
      </g>
      <rect y="104" width="480" height="16" fill="#b0652a" opacity=".3" />
    </>
  ),
  'mirror-lake': (
    <>
      <rect width="480" height="60" fill="#9fe6da" />
      <circle cx="360" cy="30" r="14" fill="#fffbe6" />
      <path d="M0 60c40-18 90-24 140-14s90 8 130-6 120-12 210 20z" fill="#3f9d8b" />
      <rect y="60" width="480" height="60" fill="#e3f9f4" />
      <path d="M0 60c40 18 90 24 140 14s90-8 130 6 120 12 210-20z" fill="#3f9d8b" opacity=".35" />
      <circle cx="360" cy="90" r="12" fill="#fffbe6" opacity=".7" />
      <g fill="none" stroke="#3f9d8b" strokeWidth="2">
        <ellipse cx="180" cy="94" rx="16" ry="5" opacity=".6" />
        <ellipse cx="180" cy="94" rx="34" ry="10" opacity=".4" />
        <ellipse cx="180" cy="94" rx="54" ry="15" opacity=".25" />
      </g>
    </>
  ),
  signalwood: (
    <>
      <rect width="480" height="120" fill="#e4f2e7" />
      <g fill="#58c98a">
        <path d="M20 110l28-70 28 70z" />
        <path d="M150 110l30-80 30 80z" />
        <path d="M300 110l26-64 26 64z" />
        <path d="M420 110l28-74 28 74z" />
      </g>
      <g fill="#1f6b62">
        <path d="M70 116l32-84 32 84z" />
        <path d="M220 116l34-92 34 92z" />
        <path d="M350 116l30-78 30 78z" />
      </g>
      <g fill="#ffd35c">
        <circle cx="140" cy="54" r="3" />
        <circle cx="200" cy="40" r="3" />
        <circle cx="296" cy="62" r="3" />
        <circle cx="338" cy="36" r="3" />
        <circle cx="410" cy="58" r="3" />
        <circle cx="60" cy="48" r="3" />
      </g>
      <path
        d="M140 54C170 30 180 60 200 40M296 62c20-30 30-10 42-26"
        fill="none"
        stroke="#ffd35c"
        strokeWidth="1.5"
        strokeDasharray="3 5"
        opacity=".8"
      />
      <rect y="112" width="480" height="8" fill="#1f6b62" />
    </>
  ),
  stormwatch: (
    <>
      <rect width="480" height="120" fill="#171c2e" />
      <path
        d="M150 34c0-18 28-26 40-12 10-16 44-10 44 12 20 0 22 26 0 26h-84c-20 0-20-26 0-26z"
        fill="#2b2147"
      />
      <path
        d="M300 26c0-14 22-20 32-10 8-12 34-8 34 10 16 0 18 20 0 20h-66c-16 0-16-20 0-20z"
        fill="#2b2147"
      />
      <path d="M0 120V92c60-10 110-30 170-32h160c50 6 100 20 150 30v30z" fill="#3b4368" />
      <path d="M258 64V24h-6V12h8V4h14v8h8v12h-6v40z" fill="#3b4368" />
      <rect x="264" y="30" width="8" height="12" rx="4" fill="#ffd35c" />
      <path
        d="M220 52l-10 14h10l-8 16"
        fill="none"
        stroke="#ffd35c"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
}

/** Region IDs with a vignette. */
export const VIGNETTE_IDS = Object.keys(VIGNETTES)

/** A region's header vignette, or nothing for a region without one. Decorative. */
export function RegionVignette({ id, className }: { id: string; className?: string }) {
  const art = VIGNETTES[id]
  if (!art) return null
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 480 120"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      data-vignette={id}
    >
      {art}
    </svg>
  )
}
