import { loadProgress, type LoadOptions } from './migrations.ts'
import { CURRENT_VERSION, type Progress } from './schema.ts'

/**
 * The progress code (E3-03): `BTG1.<z|j>.<base64url payload>.<crc32>`.
 * - `z`: the JSON compressed with deflate-raw (CompressionStream); `j`: uncompressed, for browsers without it.
 * - The CRC32 (8 hex digits) covers everything between the first and last dot, so a typo, a missing
 *   character or a truncated paste is caught before anything is decoded.
 * Scenario snapshots are left out: they're large, and mid-scenario state belongs to one browser.
 */

export const CODE_PREFIX = 'BTG1.'

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

/** CRC-32 (IEEE), as zlib and PNG compute it. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const utf8 = new TextEncoder()
const fromUtf8 = new TextDecoder('utf-8', { fatal: true })

export function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new SyntaxError('not base64url')
  const bin = atob(
    text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4),
  )
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function pipeBytes(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

/** What can go into a code: everything except scenario snapshots. */
export function exportable(p: Progress): Progress {
  return {
    ...p,
    scenarios: Object.fromEntries(
      Object.entries(p.scenarios).map(([id, s]) => {
        const copy = { ...s }
        Reflect.deleteProperty(copy, 'snapshot')
        return [id, copy]
      }),
    ),
  }
}

export interface EncodeOptions {
  /** Use compression when available (default true). Tests turn it off to exercise the fallback. */
  compress?: boolean
}

export async function encodeProgress(p: Progress, opts: EncodeOptions = {}): Promise<string> {
  const json = utf8.encode(JSON.stringify(exportable(p)))
  const compress = (opts.compress ?? true) && typeof CompressionStream === 'function'
  const body = `${compress ? 'z' : 'j'}.${toBase64Url(compress ? await pipeBytes(json, new CompressionStream('deflate-raw')) : json)}`
  return `${CODE_PREFIX}${body}.${crc32(utf8.encode(body)).toString(16).padStart(8, '0')}`
}

export type DecodeResult = { ok: true; progress: Progress } | { ok: false; error: string }

export const CODE_ERRORS = {
  notACode: 'This doesn’t look like a Beyond the Glass progress code. Codes start with BTG1.',
  checksum:
    'This code has a typo or is incomplete: its checksum doesn’t match. Copy it again, all the way to the end, and paste it here.',
  damaged:
    'This code couldn’t be read, even though its checksum matched. Try exporting a fresh code.',
  newer:
    'This code comes from a newer version of Beyond the Glass. Update the app, then try again.',
  unreadable: 'This code’s progress couldn’t be read. Try exporting a fresh code.',
  noDecompression:
    'This browser can’t unpack compressed codes. Try importing the downloaded .json file instead.',
} as const

/**
 * Reads a progress code. Whitespace (line breaks from chat or email) is ignored. Older versions are
 * migrated. Every failure comes back as a message a learner can act on; nothing throws.
 */
export async function decodeProgress(
  code: string,
  now: string,
  opts: LoadOptions<Progress> = {},
): Promise<DecodeResult> {
  const text = code.replace(/\s+/g, '')
  if (!text.startsWith(CODE_PREFIX)) return { ok: false, error: CODE_ERRORS.notACode }
  const rest = text.slice(CODE_PREFIX.length)
  const lastDot = rest.lastIndexOf('.')
  const body = rest.slice(0, lastDot)
  const crc = rest.slice(lastDot + 1)
  const m = /^([zj])\.([A-Za-z0-9_-]*)$/.exec(body)
  if (lastDot < 0 || !m || !/^[0-9a-f]{8}$/.test(crc))
    return { ok: false, error: CODE_ERRORS.checksum }
  if (crc32(utf8.encode(body)).toString(16).padStart(8, '0') !== crc)
    return { ok: false, error: CODE_ERRORS.checksum }
  let json: string
  try {
    let bytes = fromBase64Url(m[2] ?? '')
    if (m[1] === 'z') {
      if (typeof DecompressionStream !== 'function')
        return { ok: false, error: CODE_ERRORS.noDecompression }
      bytes = await pipeBytes(bytes, new DecompressionStream('deflate-raw'))
    }
    json = fromUtf8.decode(bytes)
  } catch {
    return { ok: false, error: CODE_ERRORS.damaged }
  }
  return parseProgressJson(json, now, opts)
}

/** Validates (and migrates) progress JSON: a bare record or the stored envelope. */
export function parseProgressJson(
  json: string,
  now: string,
  opts: LoadOptions<Progress> = {},
): DecodeResult {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return { ok: false, error: CODE_ERRORS.unreadable }
  }
  const envelope =
    typeof data === 'object' && data !== null && 'state' in data
      ? data
      : { state: { progress: data }, version: CURRENT_VERSION }
  const r = loadProgress(JSON.stringify(envelope), now, opts)
  if (r.kind === 'ok') return { ok: true, progress: r.progress }
  if (r.kind === 'corrupt' && r.reason.includes('newer version'))
    return { ok: false, error: CODE_ERRORS.newer }
  return { ok: false, error: CODE_ERRORS.unreadable }
}

/** `beyond-the-glass-progress-YYYY-MM-DD.json` */
export function exportFileName(now: string): string {
  return `beyond-the-glass-progress-${now.slice(0, 10)}.json`
}

/** The downloadable file: the stored envelope, readable by people and by `importText`. */
export function exportFile(p: Progress): string {
  return `${JSON.stringify({ state: { progress: exportable(p) }, version: CURRENT_VERSION }, null, 2)}\n`
}

/** Imports pasted text or an uploaded file: a progress code, or the JSON from a download. */
export async function importText(text: string, now: string): Promise<DecodeResult> {
  const t = text.trim()
  if (t.startsWith('{')) return parseProgressJson(t, now)
  return decodeProgress(t, now)
}
