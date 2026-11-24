import { fnv1a32, type Rng } from './rng.ts'

/** The alphabet Kubernetes uses for generated name suffixes (k8s.io/apimachinery/pkg/util/rand). */
export const SAFE_ALPHABET = 'bcdfghjklmnpqrstvwxz2456789'

/** Kubernetes' `rand.SafeEncodeString`: maps each character onto the safe alphabet. */
export function safeEncode(text: string): string {
  let out = ''
  for (const ch of text)
    out += SAFE_ALPHABET.charAt((ch.codePointAt(0) ?? 0) % SAFE_ALPHABET.length)
  return out
}

/**
 * JSON with object keys sorted at every level, so equal values always serialize identically.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>
      return Object.fromEntries(
        Object.keys(obj)
          .sort()
          .map((k) => [k, obj[k]]),
      )
    }
    return v
  })
}

/**
 * The `pod-template-hash` label: like the controller, a 32-bit FNV hash of the pod template, written in
 * decimal and safe-encoded. The same template always gets the same hash, so a changed image gets a new one.
 */
export function podTemplateHash(template: unknown, collisionCount = 0): string {
  return safeEncode(String(fnv1a32(stableStringify(template) + String(collisionCount))))
}

/** A generated-name suffix (`generateName`): five safe characters. */
export function nameSuffix(rng: Rng, length = 5): string {
  let out = ''
  for (let i = 0; i < length; i++) out += SAFE_ALPHABET.charAt(rng.int(SAFE_ALPHABET.length))
  return out
}

/** A random (version 4 layout) UID. */
export function uid(rng: Rng): string {
  const h = rng.hex(32)
  const variant = ((parseInt(h[16] ?? '0', 16) & 0x3) | 0x8).toString(16)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`
}

/** 64 hex characters derived from `seed`: stable fake digests and container IDs. */
export function digestOf(seed: string): string {
  let out = ''
  let h = fnv1a32(seed)
  while (out.length < 64) {
    h = fnv1a32(`${seed}:${String(h)}`)
    out += h.toString(16).padStart(8, '0')
  }
  return out
}

/** The `imageID` the kubelet reports for an image: its repository plus a digest. */
export function imageId(image: string): string {
  const at = image.indexOf('@')
  if (at >= 0) return image
  const lastSlash = image.lastIndexOf('/')
  const colon = image.lastIndexOf(':')
  const repo = colon > lastSlash ? image.slice(0, colon) : image
  const qualified = repo.includes('/') ? repo : `docker.io/library/${repo}`
  return `${qualified}@sha256:${digestOf(image)}`
}
