import { describe, expect, it } from 'vitest'
import { runPipe } from './pipes'

const input = 'NAME   STATUS\napi-1  Running\napi-2  CrashLoopBackOff\nweb-1  Running\n'

describe('pipe commands', () => {
  it('grep filters lines, with -i, -v, -c and regular expressions', () => {
    expect(runPipe(['grep', 'Running'], input)).toEqual({
      stdout: 'api-1  Running\nweb-1  Running',
      stderr: '',
      exitCode: 0,
    })
    expect(runPipe(['grep', '-v', 'Running'], input).stdout).toBe(
      'NAME   STATUS\napi-2  CrashLoopBackOff',
    )
    expect(runPipe(['grep', '-i', 'crash'], input).stdout).toBe('api-2  CrashLoopBackOff')
    expect(runPipe(['grep', '-E', '^api-[0-9]'], input).stdout).toBe(
      'api-1  Running\napi-2  CrashLoopBackOff',
    )
    expect(runPipe(['grep', '-c', 'api'], input).stdout).toBe('2')
    expect(runPipe(['grep', 'nothing'], input)).toEqual({ stdout: '', stderr: '', exitCode: 1 })
    // An invalid regular expression is matched literally instead of failing.
    expect(runPipe(['grep', '(unclosed'], 'a (unclosed b').stdout).toBe('a (unclosed b')
    expect(runPipe(['grep'], input)).toEqual({
      stdout: '',
      stderr: 'Usage: grep [OPTION]... PATTERNS',
      exitCode: 2,
    })
    expect(runPipe(['grep', '-z', 'x'], input).stderr).toBe(
      "grep: unknown shorthand flag: 'z' in -z",
    )
  })

  it('head and tail take -n N or -N', () => {
    expect(runPipe(['head', '-n', '2'], input).stdout).toBe('NAME   STATUS\napi-1  Running')
    expect(runPipe(['head', '-1'], input).stdout).toBe('NAME   STATUS')
    expect(runPipe(['tail', '-n', '1'], input).stdout).toBe('web-1  Running')
    expect(runPipe(['tail', '-2'], input).stdout).toBe('api-2  CrashLoopBackOff\nweb-1  Running')
    expect(runPipe(['head'], input).stdout.split('\n')).toHaveLength(4)
    expect(runPipe(['head', '-n', 'x'], input)).toEqual({
      stdout: '',
      stderr: "head: invalid number of lines: 'x'",
      exitCode: 1,
    })
    expect(runPipe(['tail', '--bytes=1'], input).stderr).toBe('tail: unknown flag: --bytes')
    expect(runPipe(['head', '-n', '0'], '').stdout).toBe('')
  })

  it('wc -l counts lines', () => {
    expect(runPipe(['wc', '-l'], input)).toEqual({ stdout: '4', stderr: '', exitCode: 0 })
    expect(runPipe(['wc', '-l'], '').stdout).toBe('0')
    expect(runPipe(['wc', '-c'], input).exitCode).toBe(1)
  })

  it('anything else explains what is available', () => {
    const awk = runPipe(['awk', '{print $1}'], input)
    expect(awk.exitCode).toBe(127)
    expect(awk.stderr).toMatch(/grep, head, tail and wc -l/)
    expect(runPipe([], input).exitCode).toBe(127)
  })
})
