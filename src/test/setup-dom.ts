import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})

// jsdom lacks a few browser APIs that Radix primitives use for positioning and pointer handling.
// Minimal stand-ins, installed only where missing: tests exercise keyboard and ARIA behaviour, not layout.
const shim = (target: object, name: string, value: unknown) => {
  if (!(name in target))
    Object.defineProperty(target, name, { value, configurable: true, writable: true })
}
shim(
  globalThis,
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)
shim(Element.prototype, 'hasPointerCapture', () => false)
shim(Element.prototype, 'setPointerCapture', () => undefined)
shim(Element.prototype, 'releasePointerCapture', () => undefined)
shim(Element.prototype, 'scrollIntoView', () => undefined)
