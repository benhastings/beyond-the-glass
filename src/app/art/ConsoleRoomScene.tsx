import './scene.css'

/** The scene's layers, back to front (E1-04): the Crossing (E1-06) moves them separately. */
export const CONSOLE_ROOM_LAYERS = [
  'back',
  'desk',
  'monitor-left',
  'monitor-right',
  'glass',
  'props',
] as const

/** Where the glass sits in the scene's viewBox: the Crossing pushes in toward this point. */
export const GLASS_CENTER = { x: 320, y: 238, width: 640, height: 540 }

/** What the scene shows, for the page's screen-reader description (the art itself is decorative). */
export const CONSOLE_ROOM_DESCRIPTION =
  'A dim operations room late at night, around 1998: three CRT monitors on a desk under a wall of status lights, a beige tower, a pager and a coffee mug. The middle monitor glows aqua, its surface rippling like water, with a bright landscape inside it.'

/**
 * The Console Room (E1-04): flat, layered cut-paper SVG, from the approved concept
 * (docs/design/concepts/approved/Main.dc.html). Decorative: the page gives the description in text.
 * Idle motion (status lights, a gentle CRT flicker under 3 Hz, the glass breathing once) runs for five
 * seconds and stops; with reduced motion nothing moves and the glass rests at 85 %.
 */
export function ConsoleRoomScene({
  className,
  fill = false,
}: {
  className?: string
  /** Cover the whole box (the Crossing) instead of fitting inside it. */
  fill?: boolean
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio={fill ? 'xMidYMid slice' : 'xMidYMid meet'}
      viewBox="0 0 640 540"
      className={className}
      data-scene="console-room"
    >
      <defs>
        <radialGradient id="cr-mSpill" cx="50%" cy="46%" r="55%">
          <stop offset="0" stopColor="#7de8d8" stopOpacity=".42" />
          <stop offset=".55" stopColor="#7de8d8" stopOpacity=".08" />
          <stop offset="1" stopColor="#7de8d8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="cr-mSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bff4ea" />
          <stop offset=".6" stopColor="#fff1bf" />
          <stop offset="1" stopColor="#ffd98a" />
        </linearGradient>
        <linearGradient id="cr-mWall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a1f27" />
          <stop offset="1" stopColor="#232a34" />
        </linearGradient>
        <pattern id="cr-mLights" width="22" height="22" patternUnits="userSpaceOnUse">
          <rect x="4" y="6" width="10" height="6" rx="2" fill="#2f6a4c" />
        </pattern>
        <clipPath id="cr-mGlass">
          <rect x="232" y="172" width="176" height="132" rx="14" />
        </clipPath>
        <linearGradient id="cr-night" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1222" />
          <stop offset="1" stopColor="#1d2b4a" />
        </linearGradient>
      </defs>
      <g data-layer="back">
        <rect width="640" height="540" fill="url(#cr-mWall)" />
        <g>
          <rect
            x="6"
            y="150"
            width="30"
            height="206"
            rx="4"
            fill="url(#cr-night)"
            stroke="#39424e"
            strokeWidth="2"
          />
          <path d="M6 253h30" stroke="#39424e" strokeWidth="2" />
          <circle cx="16" cy="170" r="1.5" fill="#efe9dc" />
          <circle cx="27" cy="196" r="1.2" fill="#efe9dc" opacity=".7" />
          <circle cx="14" cy="226" r="1" fill="#efe9dc" opacity=".6" />
          <circle cx="26" cy="282" r="1.4" fill="#efe9dc" opacity=".8" />
          <path d="M24 300a7 7 0 1 0 6 10a6 6 0 0 1-6-10z" fill="#fff3c9" opacity=".85" />
        </g>
        <rect
          x="40"
          y="36"
          width="560"
          height="96"
          rx="8"
          fill="#161b22"
          stroke="#39424e"
          strokeWidth="2"
        />
        <rect x="52" y="44" width="536" height="80" fill="url(#cr-mLights)" />
        <rect
          className="btg-light"
          style={{ animationDelay: '0s' }}
          x="144"
          y="50"
          width="10"
          height="6"
          rx="2"
          fill="#6fe0a0"
        />
        <rect
          className="btg-light"
          style={{ animationDelay: '0.7s' }}
          x="320"
          y="72"
          width="10"
          height="6"
          rx="2"
          fill="#6fe0a0"
        />
        <rect
          className="btg-light"
          style={{ animationDelay: '0.3s' }}
          x="474"
          y="50"
          width="10"
          height="6"
          rx="2"
          fill="#6fe0a0"
        />
        <rect
          className="btg-light"
          style={{ animationDelay: '1.1s' }}
          x="210"
          y="94"
          width="10"
          height="6"
          rx="2"
          fill="#ffb84d"
        />
        <rect
          className="btg-light"
          style={{ animationDelay: '0.5s' }}
          x="430"
          y="94"
          width="10"
          height="6"
          rx="2"
          fill="#ffb84d"
        />
        <rect
          className="btg-light"
          style={{ animationDelay: '0.9s' }}
          x="518"
          y="72"
          width="10"
          height="6"
          rx="2"
          fill="#ff7a66"
        />
        <rect
          className="btg-light"
          style={{ animationDelay: '0.2s' }}
          x="78"
          y="94"
          width="10"
          height="6"
          rx="2"
          fill="#6fe0a0"
        />
        <ellipse
          className="btg-glass-breath"
          cx="320"
          cy="250"
          rx="300"
          ry="230"
          fill="url(#cr-mSpill)"
        />
      </g>
      <g data-layer="desk">
        <rect x="0" y="392" width="640" height="148" fill="#2b241d" />
        <rect x="0" y="392" width="640" height="10" fill="#4a3d30" />
        <path d="M210 402h220l70 138H140z" fill="#7de8d8" opacity=".10" />
      </g>
      <g data-layer="monitor-left">
        <g>
          <rect x="44" y="196" width="160" height="150" rx="12" fill="#b9af95" />
          <rect x="44" y="330" width="160" height="16" rx="6" fill="#9a9079" />
          <rect x="58" y="210" width="132" height="106" rx="10" fill="#0c140f" />
          <g className="btg-crt" fill="#58c98a">
            <rect x="68" y="222" width="74" height="5" />
            <rect x="68" y="234" width="104" height="5" />
            <rect x="68" y="246" width="56" height="5" />
            <rect x="68" y="258" width="96" height="5" />
            <rect x="68" y="270" width="66" height="5" />
            <rect x="68" y="282" width="88" height="5" />
            <rect x="68" y="294" width="12" height="7" />
          </g>
          <rect x="100" y="346" width="48" height="46" fill="#9a9079" />
          <rect x="84" y="384" width="80" height="10" rx="4" fill="#b9af95" />
        </g>
      </g>
      <g data-layer="monitor-right">
        <g>
          <rect x="436" y="196" width="160" height="150" rx="12" fill="#b9af95" />
          <rect x="436" y="330" width="160" height="16" rx="6" fill="#9a9079" />
          <rect x="450" y="210" width="132" height="106" rx="10" fill="#17100a" />
          <g className="btg-crt" style={{ animationDelay: '0.25s' }} fill="#ffb84d">
            <rect x="460" y="222" width="110" height="5" />
            <rect x="460" y="238" width="30" height="20" />
            <rect x="496" y="238" width="30" height="20" opacity=".5" />
            <rect x="532" y="238" width="30" height="20" />
            <rect x="460" y="264" width="30" height="20" opacity=".5" />
            <rect x="496" y="264" width="30" height="20" />
            <rect x="532" y="264" width="30" height="20" opacity=".5" />
            <rect x="460" y="294" width="84" height="5" />
          </g>
          <rect x="492" y="346" width="48" height="46" fill="#9a9079" />
          <rect x="476" y="384" width="80" height="10" rx="4" fill="#b9af95" />
        </g>
      </g>
      <g data-layer="glass">
        <g>
          <rect x="212" y="152" width="216" height="186" rx="16" fill="#d2c8ad" />
          <rect x="212" y="318" width="216" height="20" rx="8" fill="#b0a68c" />
          <circle cx="404" cy="328" r="4" fill="#7de8d8" />
          <rect x="232" y="172" width="176" height="132" rx="14" fill="url(#cr-mSky)" />
          <g clipPath="url(#cr-mGlass)">
            <circle cx="352" cy="232" r="22" fill="#fff8dc" />
            <path d="M232 262c30-26 58-26 86-6s56 16 90-14v62H232z" fill="#58b7a4" />
            <path d="M232 280c36-18 70-14 100 0s52 10 76-6v30H232z" fill="#1f7f7c" />
            <path
              d="M300 304c8-18 22-30 44-36"
              stroke="#fff1bf"
              strokeWidth="5"
              strokeLinecap="round"
              fill="none"
            />
            <g className="btg-glass-breath" fill="none" stroke="#ffffff" strokeWidth="2.5">
              <ellipse cx="320" cy="238" rx="26" ry="16" opacity=".9" />
              <ellipse cx="320" cy="238" rx="54" ry="34" opacity=".6" />
              <ellipse cx="320" cy="238" rx="84" ry="54" opacity=".35" />
            </g>
          </g>
          <rect
            x="232"
            y="172"
            width="176"
            height="132"
            rx="14"
            fill="none"
            stroke="#7de8d8"
            strokeWidth="3"
          />
          <rect x="290" y="338" width="60" height="54" fill="#b0a68c" />
          <rect x="266" y="382" width="108" height="12" rx="5" fill="#d2c8ad" />
        </g>
      </g>
      <g data-layer="props">
        <g>
          <rect x="232" y="420" width="176" height="46" rx="6" fill="#cfc5aa" />
          <g fill="#a79d84">
            <rect x="240" y="427" width="160" height="7" rx="2" />
            <rect x="240" y="438" width="160" height="7" rx="2" />
            <rect x="240" y="449" width="38" height="9" rx="2" />
            <rect x="284" y="449" width="76" height="9" rx="2" />
            <rect x="366" y="449" width="34" height="9" rx="2" />
          </g>
        </g>
        <g>
          <rect
            x="76"
            y="430"
            width="74"
            height="40"
            rx="8"
            fill="#20262e"
            stroke="#59636f"
            strokeWidth="2"
          />
          <rect x="84" y="438" width="44" height="14" rx="3" fill="#8fb39a" />
          <rect x="88" y="443" width="26" height="4" fill="#20262e" />
          <circle cx="139" cy="458" r="4" fill="#ff7a66" />
        </g>
        <g>
          <path d="M470 424h48v40a10 10 0 0 1-10 10h-28a10 10 0 0 1-10-10z" fill="#e7dfcc" />
          <path d="M518 434h8a9 9 0 0 1 0 18h-8" fill="none" stroke="#e7dfcc" strokeWidth="6" />
          <ellipse cx="494" cy="424" rx="24" ry="5" fill="#3a2a1e" />
          <path
            d="M486 410c-6-8 6-12 0-20M500 410c-6-8 6-12 0-20"
            fill="none"
            stroke="#8a929c"
            strokeWidth="2"
            strokeLinecap="round"
            opacity=".7"
          />
        </g>
        <g>
          <rect x="560" y="404" width="64" height="124" rx="6" fill="#cfc5aa" />
          <rect x="568" y="414" width="48" height="12" rx="2" fill="#a79d84" />
          <rect x="568" y="432" width="48" height="12" rx="2" fill="#a79d84" />
          <rect x="574" y="436" width="22" height="3" fill="#59636f" />
          <circle cx="576" cy="462" r="4" fill="#6fe0a0" />
          <rect x="590" y="458" width="22" height="8" rx="3" fill="#a79d84" />
        </g>
      </g>
    </svg>
  )
}
