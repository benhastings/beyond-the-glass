/** Where each region's pin goes, by content region ID, in the map's viewBox (900 × 640). */
export const MAP_SPOTS: Record<string, readonly [number, number]> = {
  // Just below each landmark, so the pin doesn't cover it.
  'console-room': [112, 566],
  harbor: [372, 592],
  'helm-keep': [668, 492],
  chartroom: [772, 334],
  'mirror-lake': [490, 366],
  signalwood: [178, 330],
  stormwatch: [330, 196],
}
export const MAP_SIZE = { width: 900, height: 640 }

/**
 * The world map of the Reach (E1-05), from the approved concept (docs/design/concepts/approved/Reach.dc.html).
 * Each region is its own group (`#map-region-<content region ID>`), so a region can be highlighted and the
 * others dimmed. Decorative: the map's links and the list view carry the places and their status in text.
 */
export function WorldMap({
  highlight,
  className,
}: {
  highlight?: string | undefined
  className?: string
}) {
  const dim = (id: string) =>
    highlight && highlight !== id
      ? 'opacity-45 transition-opacity motion-safe:duration-200'
      : 'transition-opacity motion-safe:duration-200'
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 900 640"
      className={className}
      data-map="reach"
    >
      <defs>
        <linearGradient id="map-pSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9fe6da" />
          <stop offset=".5" stopColor="#fff3c9" />
        </linearGradient>
        <radialGradient id="map-pDoor" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#7de8d8" stopOpacity=".9" />
          <stop offset="1" stopColor="#7de8d8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g data-layer="ground">
        <rect width="900" height="640" fill="url(#map-pSky)" />
        <circle cx="730" cy="92" r="44" fill="#fffbe6" />
        <circle cx="730" cy="92" r="70" fill="none" stroke="#fffbe6" strokeWidth="2" opacity=".7" />
        <path d="M0 210C120 130 250 150 330 150s260 60 570 10v480H0z" fill="#bfe6d6" />
      </g>
      <g id="map-region-stormwatch" data-region={'stormwatch'} className={dim('stormwatch')}>
        <path
          d="M262 62c0-22 32-30 46-14 12-18 50-10 50 14 22 0 24 30 0 30h-96c-22 0-22-30 0-30z"
          fill="#3b4368"
        />
        <path d="M316 152V84h-8V70h12V58h20v12h12v14h-8v68z" fill="#3b4368" />
        <rect x="325" y="92" width="10" height="14" rx="5" fill="#ffd35c" />
        <path
          d="M300 96l-10 16h12l-8 18"
          fill="none"
          stroke="#ffd35c"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <g data-layer="hills">
        <path d="M0 300C200 236 400 272 600 250s200-10 300 20v370H0z" fill="#7cc9b2" />
      </g>
      <g id="map-region-signalwood" data-region={'signalwood'} className={dim('signalwood')}>
        <g fill="#1f6b62">
          <path d="M110 250l16 34H94z" />
          <path d="M144 238l18 40h-36z" />
          <path d="M180 248l16 34h-32z" />
          <path d="M216 236l18 40h-36z" />
          <path d="M252 250l16 34h-32z" />
          <path d="M128 272l18 38h-36z" />
          <path d="M166 268l18 40h-36z" />
          <path d="M204 272l18 38h-36z" />
          <path d="M240 270l16 36h-32z" />
        </g>
        <g fill="#ffd35c">
          <circle cx="150" cy="262" r="3" />
          <circle cx="196" cy="282" r="3" />
          <circle cx="232" cy="258" r="3" />
        </g>
      </g>
      <g id="map-region-mirror-lake" data-region={'mirror-lake'} className={dim('mirror-lake')}>
        <ellipse cx="490" cy="304" rx="118" ry="30" fill="#e3f9f4" />
        <ellipse
          cx="490"
          cy="304"
          rx="78"
          ry="16"
          fill="none"
          stroke="#3f9d8b"
          strokeWidth="2.5"
          opacity=".6"
        />
        <ellipse cx="520" cy="300" rx="20" ry="5" fill="#fffbe6" />
      </g>
      <g id="map-region-chartroom" data-region={'chartroom'} className={dim('chartroom')}>
        <path d="M742 290v-30a30 30 0 0 1 60 0v30z" fill="#b0652a" />
        <path d="M772 230v-18" stroke="#b0652a" strokeWidth="5" strokeLinecap="round" />
        <circle cx="772" cy="266" r="10" fill="none" stroke="#fff3c9" strokeWidth="3" />
        <path d="M772 258v16M764 266h16" stroke="#fff3c9" strokeWidth="2" />
      </g>
      <g data-layer="shore">
        <path d="M0 446C200 400 420 432 600 412s220-34 300-12v240H0z" fill="#2f8f80" />
      </g>
      <g id="map-region-helm-keep" data-region={'helm-keep'} className={dim('helm-keep')}>
        <path d="M610 452c20-34 120-34 140 0z" fill="#236f66" />
        <path d="M646 440v-70l-8-8v-22h14v10h12v-10h18v10h12v-10h14v22l-8 8v70z" fill="#6f5b93" />
        <path d="M670 440v-24a10 10 0 0 1 20 0v24z" fill="#2b2147" />
        <path
          d="M680 340v-22l16 7-16 7"
          fill="#ffb84d"
          stroke="#ffb84d"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </g>
      <g id="map-region-harbor" data-region={'harbor'} className={dim('harbor')}>
        <path d="M230 640c10-80 250-100 290 0z" fill="#156a70" />
        <path
          d="M290 610c20-8 40-8 60 0M400 620c20-8 40-8 60 0"
          fill="none"
          stroke="#7de8d8"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <g>
          <rect x="318" y="476" width="50" height="22" fill="#ffb84d" />
          <rect x="372" y="476" width="50" height="22" fill="#ef7f5a" />
          <rect x="344" y="452" width="50" height="22" fill="#e3f9f4" />
          <rect x="318" y="500" width="50" height="22" fill="#e3f9f4" />
          <rect x="372" y="500" width="50" height="22" fill="#ffb84d" />
          <path
            d="M450 522V420h52M450 420l-24 30M490 420v26"
            fill="none"
            stroke="#10272c"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </g>
      </g>
      <g id="map-region-console-room" data-region={'console-room'} className={dim('console-room')}>
        <circle cx="112" cy="470" r="64" fill="url(#map-pDoor)" />
        <rect x="84" y="428" width="56" height="74" rx="10" fill="#d2c8ad" />
        <rect x="92" y="436" width="40" height="52" rx="6" fill="#12151a" />
        <rect x="98" y="444" width="16" height="4" fill="#58c98a" />
        <rect x="98" y="452" width="24" height="4" fill="#58c98a" />
        <rect x="98" y="460" width="12" height="4" fill="#ffb84d" />
      </g>
      <g id="map-trail" data-layer="trail">
        <path
          d="M146 506c110 26 150 16 224 2s210-4 300-52 180-86 110-150-180 40-300 30-200-6-270-46 40-100 112-138"
          fill="none"
          stroke="#10272c"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray="1 16"
          opacity=".25"
        />
        <path
          d="M146 506c110 26 150 16 224 2s210-4 300-52 180-86 110-150-180 40-300 30-200-6-270-46 40-100 112-138"
          fill="none"
          stroke="#fffbe6"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray="1 16"
        />
      </g>
    </svg>
  )
}
