import { render } from '@testing-library/react'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import { RegionVignette, VIGNETTE_IDS } from './vignettes'
import { MAP_SPOTS, WorldMap } from './WorldMap'

const REGIONS = readdirSync(join(import.meta.dirname, '../../../content/regions')).sort()
const kb = (markup: string) => gzipSync(markup).length / 1024

describe('E1-05 region art', () => {
  acTest('E1-05.AC1', 'each vignette is at most 60 KB gzipped, and the map at most 150 KB', () => {
    for (const id of VIGNETTE_IDS)
      expect(kb(renderToStaticMarkup(<RegionVignette id={id} />)), id).toBeLessThanOrEqual(60)
    expect(kb(renderToStaticMarkup(<WorldMap />))).toBeLessThanOrEqual(150)
  })

  acTest(
    'E1-05.AC2',
    'every content region is its own map group, with a stable ID that matches',
    () => {
      const { container } = render(<WorldMap />)
      const groups = [...container.querySelectorAll('g[id^="map-region-"]')]
      expect(groups.map((g) => g.id.replace('map-region-', '')).sort()).toEqual(REGIONS)
      for (const g of groups) {
        expect(g.getAttribute('data-region'), g.id).toBe(g.id.replace('map-region-', ''))
        expect(g.querySelectorAll('path, rect, circle, ellipse').length, g.id).toBeGreaterThan(0)
      }
      // And each has a place for its pin.
      expect(Object.keys(MAP_SPOTS).sort()).toEqual(REGIONS)
    },
  )

  it('highlights one region by dimming the others; with none, nothing is dimmed', () => {
    const { container, rerender } = render(<WorldMap />)
    expect(container.querySelectorAll('[data-region].opacity-45')).toHaveLength(0)
    rerender(<WorldMap highlight="harbor" />)
    const dimmed = [...container.querySelectorAll('[data-region].opacity-45')].map((g) =>
      g.getAttribute('data-region'),
    )
    expect(dimmed).toHaveLength(REGIONS.length - 1)
    expect(dimmed).not.toContain('harbor')
  })

  it('every region has a vignette; all art is decorative', () => {
    expect([...VIGNETTE_IDS].sort()).toEqual(REGIONS)
    for (const id of VIGNETTE_IDS) {
      const { container } = render(<RegionVignette id={id} />)
      expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    }
    expect(render(<RegionVignette id="nowhere" />).container.innerHTML).toBe('')
    expect(render(<WorldMap />).container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })
})
