#!/usr/bin/env node
/**
 * Content-safety and IP guard (E0-06). Scans every tracked text file and fails on:
 *   private-denylist  regexes from the CONTENT_DENYLIST environment variable (an Actions secret);
 *                     never printed. Absent (a fork, a laptop), the check only warns.
 *   franchise-ip      terms from scripts/ip-denylist.txt
 *   ipv4              IPv4 addresses outside documentation ranges, the simulator's CIDRs and loopback
 *   hostname          hostnames under .mil or .gov, or ending .internal or .corp
 * Exceptions: scripts/content-guard-allow.txt (<path glob> <category>), never for the private list.
 *
 * Usage: node scripts/content-guard.mjs [--root <dir>]
 * Exit 0 clean, 1 findings, 2 misconfiguration.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, matchesGlob } from 'node:path'
import { pathToFileURL } from 'node:url'

/** CIDRs an address may fall in without being flagged. */
export const ALLOWED_CIDRS = [
  ['192.0.2.0/24', 'RFC 5737 TEST-NET-1'],
  ['198.51.100.0/24', 'RFC 5737 TEST-NET-2'],
  ['203.0.113.0/24', 'RFC 5737 TEST-NET-3'],
  ['10.244.0.0/16', 'simulator pod CIDR'],
  ['10.96.0.0/12', 'simulator service CIDR'],
  ['127.0.0.0/8', 'loopback (local dev servers and tests)'],
  ['0.0.0.0/32', 'unspecified (bind all interfaces)'],
]

const IPV4 = /(?<![\d.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?!\.?\d)/g
const HOSTNAME = /\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.(?:mil|gov|internal|corp)(?:\.[a-z]{2})?(?![\w-])/gi

const toInt = (parts) => parts.reduce((n, p) => n * 256 + p, 0)

export function inCidr(octets, cidr) {
  const [base, bits] = cidr.split('/')
  const block = 2 ** (32 - Number(bits))
  return Math.floor(toInt(octets) / block) === Math.floor(toInt(base.split('.').map(Number)) / block)
}

/** Non-allowed IPv4 addresses in a line. Strings with an octet over 255 (versions) aren't addresses. */
export function findIpv4(line) {
  const hits = []
  for (const m of line.matchAll(IPV4)) {
    const octets = m.slice(1, 5).map(Number)
    if (octets.some((o) => o > 255)) continue
    if (ALLOWED_CIDRS.some(([cidr]) => inCidr(octets, cidr))) continue
    hits.push(m[0])
  }
  return hits
}

export function findHostnames(line) {
  return [...line.matchAll(HOSTNAME)].map((m) => m[0])
}

/** Parses a denylist: one regex per line, `#` comments, blank lines ignored. */
export function parseDenylist(text, source) {
  return text
    .split('\n')
    .map((l) => l.replace(/(^|\s)#.*$/, '').trim())
    .filter(Boolean)
    .map((p, i) => {
      try {
        return new RegExp(p.startsWith('\\b') ? p : `\\b(?:${p})`, 'i')
      } catch {
        throw new Error(`${source}: entry ${String(i + 1)} is not a valid regular expression`)
      }
    })
}

export function parseAllow(text) {
  return text
    .split('\n')
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean)
    .map((l) => {
      const [glob, category] = l.split(/\s+/)
      if (!['franchise-ip', 'ipv4', 'hostname'].includes(category)) {
        throw new Error(`content-guard-allow.txt: "${l}" has no valid category`)
      }
      return { glob, category }
    })
}

/**
 * Scans one file's text. Returns findings as { line, category, detail }; detail is empty for the
 * private denylist so the pattern and the matched text never reach a log.
 */
export function scanText(path, text, { privatePatterns, franchise, allow }) {
  const allowed = (category) => allow.some((a) => a.category === category && matchesGlob(path, a.glob))
  const findings = []
  text.split('\n').forEach((line, i) => {
    const at = i + 1
    if (privatePatterns.some((re) => re.test(line))) findings.push({ line: at, category: 'private-denylist', detail: '' })
    if (!allowed('franchise-ip')) {
      for (const re of franchise) {
        const m = re.exec(line)
        if (m) findings.push({ line: at, category: 'franchise-ip', detail: m[0] })
      }
    }
    if (!allowed('ipv4')) for (const ip of findIpv4(line)) findings.push({ line: at, category: 'ipv4', detail: ip })
    if (!allowed('hostname')) for (const h of findHostnames(line)) findings.push({ line: at, category: 'hostname', detail: h })
  })
  return findings.map((f) => ({ path, ...f }))
}

export function trackedFiles(root) {
  return execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
}

export function run(root, env = process.env) {
  const out = []
  const franchise = parseDenylist(readFileSync(join(root, 'scripts/ip-denylist.txt'), 'utf8'), 'ip-denylist.txt')
  const allowFile = join(root, 'scripts/content-guard-allow.txt')
  const allow = existsSync(allowFile) ? parseAllow(readFileSync(allowFile, 'utf8')) : []
  const secret = env.CONTENT_DENYLIST ?? ''
  const privatePatterns = secret.trim() ? parseDenylist(secret, 'CONTENT_DENYLIST') : []
  let warned = false
  if (!privatePatterns.length) {
    out.push('::warning::CONTENT_DENYLIST is not set: the private denylist was not checked (see CONTRIBUTING.md#content-guard).')
    warned = true
  }
  const findings = []
  let scanned = 0
  for (const path of trackedFiles(root)) {
    const full = join(root, path)
    if (!existsSync(full)) continue
    const buf = readFileSync(full)
    if (buf.includes(0)) continue // binary
    scanned += 1
    findings.push(...scanText(path, buf.toString('utf8'), { privatePatterns, franchise, allow }))
  }
  for (const f of findings) out.push(`${f.path}:${String(f.line)}  ${f.category}${f.detail ? `  ${f.detail}` : ''}`)
  out.push(`content-guard: ${String(scanned)} files, ${String(findings.length)} finding(s)${warned ? ', private denylist skipped' : ''}`)
  return { code: findings.length ? 1 : 0, out, findings }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const i = process.argv.indexOf('--root')
  const root = i > 0 ? process.argv[i + 1] : process.cwd()
  try {
    const { code, out } = run(root)
    console.log(out.join('\n'))
    process.exit(code)
  } catch (e) {
    console.error(`content-guard: ${e instanceof Error ? e.message : String(e)}`)
    process.exit(2)
  }
}
