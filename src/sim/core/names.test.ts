import { describe, expect, it } from 'vitest'
import {
  digestOf,
  imageId,
  nameSuffix,
  podTemplateHash,
  SAFE_ALPHABET,
  safeEncode,
  stableStringify,
  uid,
} from './names'
import { Rng } from './rng'

describe('generated names', () => {
  it('encodes like rand.SafeEncodeString', () => {
    // '0' is code 48; 48 % 27 = 21 → SAFE_ALPHABET[21]
    expect(safeEncode('0')).toBe(SAFE_ALPHABET[21])
    expect(safeEncode('1234567890')).toMatch(/^[bcdfghjklmnpqrstvwxz2456789]{10}$/)
  })

  it('derives the pod-template-hash from the template only', () => {
    const t = {
      metadata: { labels: { app: 'a' } },
      spec: { containers: [{ name: 'a', image: 'x:1' }] },
    }
    const reordered = {
      spec: { containers: [{ image: 'x:1', name: 'a' }] },
      metadata: { labels: { app: 'a' } },
    }
    const changed = { ...t, spec: { containers: [{ name: 'a', image: 'x:2' }] } }
    expect(podTemplateHash(t)).toBe(podTemplateHash(reordered))
    expect(podTemplateHash(t)).not.toBe(podTemplateHash(changed))
    expect(podTemplateHash(t)).not.toBe(podTemplateHash(t, 1))
    expect(podTemplateHash(t)).toMatch(/^[bcdfghjklmnpqrstvwxz2456789]{1,10}$/)
  })

  it('makes kubernetes-shaped suffixes and UIDs from the RNG', () => {
    const r = new Rng(3)
    expect(nameSuffix(r)).toMatch(/^[bcdfghjklmnpqrstvwxz2456789]{5}$/)
    expect(uid(r)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(nameSuffix(new Rng(3))).toBe(nameSuffix(new Rng(3)))
  })

  it('serializes with sorted keys', () => {
    expect(stableStringify({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: 3 } })).toBe(
      '{"a":{"c":3,"d":[2,{"y":2,"z":1}]},"b":1}',
    )
  })

  it('reports image IDs the way the kubelet does', () => {
    expect(digestOf('x')).toMatch(/^[0-9a-f]{64}$/)
    expect(digestOf('x')).toBe(digestOf('x'))
    expect(imageId('registry.example/ravenpost/api:1.0')).toBe(
      `registry.example/ravenpost/api@sha256:${digestOf('registry.example/ravenpost/api:1.0')}`,
    )
    expect(imageId('nginx:1.27')).toMatch(/^docker\.io\/library\/nginx@sha256:/)
    expect(imageId('registry.example:5000/app')).toMatch(/^registry\.example:5000\/app@sha256:/)
    expect(imageId('app@sha256:abc')).toBe('app@sha256:abc')
  })
})
