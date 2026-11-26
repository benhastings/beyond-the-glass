import { inflateSync } from 'node:zlib'

/**
 * The mean relative luminance (WCAG 2.x, 0–1) of an 8-bit RGB or RGBA PNG, such as a Playwright
 * screenshot. A tiny decoder (IHDR, IDAT, the five scanline filters), so the flash test needs no image
 * library. `step` samples every nth pixel in each direction.
 */
export function meanLuminance(png: Buffer, step = 4): number {
  let width = 0
  let height = 0
  let channels = 0
  const idat: Buffer[] = []
  for (let at = 8; at < png.length;) {
    const len = png.readUInt32BE(at)
    const type = png.toString('ascii', at + 4, at + 8)
    const data = png.subarray(at + 8, at + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      const colour = data[9]
      if (data[8] !== 8 || (colour !== 2 && colour !== 6)) throw new Error('only 8-bit RGB(A) PNGs')
      channels = colour === 6 ? 4 : 3
    } else if (type === 'IDAT') idat.push(data)
    at += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const prev = new Uint8Array(stride)
  const line = new Uint8Array(stride)
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  let sum = 0
  let n = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? (line[x - channels] ?? 0) : 0
      const b = prev[x] ?? 0
      const c = x >= channels ? (prev[x - channels] ?? 0) : 0
      const v = row[x] ?? 0
      const p = a + b - c
      const pa = Math.abs(p - a)
      const pb = Math.abs(p - b)
      const pc = Math.abs(p - c)
      line[x] =
        (filter === 1
          ? v + a
          : filter === 2
            ? v + b
            : filter === 3
              ? v + ((a + b) >> 1)
              : filter === 4
                ? v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
                : v) & 0xff
    }
    if (y % step === 0)
      for (let x = 0; x < width; x += step) {
        const i = x * channels
        sum +=
          0.2126 * lin(line[i] ?? 0) +
          0.7152 * lin(line[i + 1] ?? 0) +
          0.0722 * lin(line[i + 2] ?? 0)
        n++
      }
    prev.set(line)
  }
  return n ? sum / n : 0
}

/**
 * WCAG 2.3.1's general flash threshold, over a series of whole-frame luminances sampled `dt` ms apart: a
 * flash is a pair of opposing changes of at least 0.1 where the darker side is below 0.8. Returns the most
 * flashes in any one second.
 */
export function flashesPerSecond(lum: readonly number[], dt: number): number {
  // Turning points: where the luminance stops rising and starts falling, or the other way round.
  const swings: { t: number; from: number; to: number }[] = []
  let start = 0
  for (let i = 1; i < lum.length; i++) {
    const dir = Math.sign((lum[i] ?? 0) - (lum[i - 1] ?? 0))
    const next = Math.sign((lum[i + 1] ?? lum[i] ?? 0) - (lum[i] ?? 0))
    if (i === lum.length - 1 || (dir !== 0 && next !== 0 && next !== dir)) {
      swings.push({ t: i * dt, from: lum[start] ?? 0, to: lum[i] ?? 0 })
      start = i
    }
  }
  const big = swings.filter((s) => Math.abs(s.to - s.from) >= 0.1 && Math.min(s.to, s.from) < 0.8)
  let most = 0
  for (const s of big) {
    const inWindow = big.filter((x) => x.t >= s.t && x.t < s.t + 1000).length
    most = Math.max(most, Math.floor(inWindow / 2))
  }
  return most
}
