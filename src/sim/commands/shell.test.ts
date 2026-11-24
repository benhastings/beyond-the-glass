import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ravenpost from '@/scenarios/ravenpost.yaml'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import { Simulator } from '../core/simulator'
import { miniScenario } from '../core/testing'
import { COMMANDS, createShell, defineCommand, ok, Shell } from './index'
import { PLANNED_KUBECTL, UNSUPPORTED_KUBECTL } from './kubectl/unsupported'

const sim = () => Simulator.load(ravenpost)
const run = (line: string, shell = createShell(sim())) => shell.run(line)

describe('Shell: kubectl get pods', () => {
  it('lists pods in a namespace as a kubectl table', () => {
    const out = run('kubectl get pods -n ravenpost')
    expect(out.exitCode).toBe(0)
    expect(out.stderr).toBe('')
    const lines = out.stdout.split('\n')
    expect(lines[0]).toMatch(/^NAME {3,}READY {3,}STATUS {3,}RESTARTS {3,}AGE$/)
    expect(lines).toHaveLength(9)
    expect(lines.filter((l) => l.includes('CrashLoopBackOff'))).toEqual([
      expect.stringMatching(
        /^ravenpost-notifier-\w+-\w{5} +0\/1 +CrashLoopBackOff +9 \(110s ago\) +25m$/,
      ),
    ])
    // Columns line up: every row's READY starts where the header's does.
    const col = (lines[0] ?? '').indexOf('READY')
    for (const l of lines.slice(1)) expect(l.slice(col, col + 3)).toMatch(/^\d\/\d$/)
  })

  it('-A adds a NAMESPACE column and lists every namespace', () => {
    const out = run('kubectl get pods -A')
    expect(out.stdout.split('\n')[0]).toMatch(/^NAMESPACE {3,}NAME /)
    expect(out.stdout).toContain('kube-system ')
    expect(out.stdout).toContain('local-path-storage ')
    expect(run('kubectl get pods --all-namespaces').stdout).toBe(out.stdout)
  })

  it('uses the context namespace by default and says when there is nothing there', () => {
    expect(run('kubectl get pods')).toEqual({
      stdout: '',
      stderr: 'No resources found in default namespace.',
      exitCode: 0,
    })
    expect(run('kubectl get pods -n nowhere').stderr).toBe(
      'No resources found in nowhere namespace.',
    )
    const mini = createShell(Simulator.load(miniScenario()))
    expect(mini.run('kubectl get pods').stdout).toMatch(/^NAME/)
  })

  it('accepts names, short names, type/name, selectors, -o name, -o wide and --show-labels', () => {
    const shell = createShell(sim())
    const first = shell.run('kubectl get pods -n ravenpost -o name').stdout.split('\n')[0] ?? ''
    expect(first).toMatch(/^pod\/ravenpost-api-/)
    const name = first.replace('pod/', '')
    expect(shell.run(`kubectl get po ${name} -n ravenpost`).stdout.split('\n')).toHaveLength(2)
    expect(shell.run(`kubectl get ${first} -n ravenpost`).stdout).toContain(name)
    expect(
      shell.run('kubectl -n ravenpost get pods -l app=ravenpost-web').stdout.split('\n'),
    ).toHaveLength(3)
    expect(
      shell
        .run('kubectl get pods -n ravenpost -l "app in (ravenpost-web, ravenpost-api)"')
        .stdout.split('\n'),
    ).toHaveLength(6)
    expect(shell.run('kubectl get pods -n ravenpost -o wide').stdout.split('\n')[0]).toMatch(
      /AGE +IP +NODE +NOMINATED NODE +READINESS GATES$/,
    )
    expect(shell.run('kubectl get pods -n ravenpost --show-labels').stdout).toContain(
      'app=ravenpost-api,',
    )
    expect(shell.run('kubectl get pods -n ravenpost -o name | wc -l').stdout).toBe('8')
  })

  it('reports errors the way kubectl does', () => {
    expect(run('kubectl get pods nope -n ravenpost')).toEqual({
      stdout: '',
      stderr: 'Error from server (NotFound): pods "nope" not found',
      exitCode: 1,
    })
    expect(run('kubectl get pods x -A').stderr).toBe(
      'error: a resource cannot be retrieved by name across all namespaces',
    )
    expect(run('kubectl get').stderr).toMatch(/^You must specify the type of resource to get/)
    expect(run('kubectl get pods --context prod').stderr).toBe(
      'error: context "prod" does not exist',
    )
    expect(run('kubectl get pods -o tsv').stderr).toMatch(
      /^error: unable to match a printer suitable for the output format "tsv"/,
    )
    expect(run('kubectl get pods -l "a b"').stderr).toBe(
      'error: unable to parse requirement: invalid selector "a b"',
    )
    expect(run('kubectl get pods --nmespace x').stderr).toBe(
      "error: unknown flag: --nmespace\nSee 'kubectl get --help' for usage.",
    )
  })

  it('explains the parts of get that arrive later', () => {
    for (const line of [
      'kubectl get deployments',
      'kubectl get pods -o yaml',
      'kubectl get pods -w',
    ]) {
      const out = run(line)
      expect(out.exitCode).toBe(1)
      expect(out.stderr).toMatch(/works on a real cluster/)
    }
  })
})

describe('Shell: errors and suggestions', () => {
  acTest('E6-04.AC2', '"Did you mean" for resource types within edit distance 2', () => {
    expect(run('kubectl get pdos')).toEqual({
      stdout: '',
      stderr: 'error: the server doesn\'t have a resource type "pdos"\n\nDid you mean `pods`?',
      exitCode: 1,
    })
    expect(run('kubectl get deploymnets').stderr).toMatch(/Did you mean `deployments`\?$/)
    expect(run('kubectl get srvices').stderr).toMatch(/Did you mean `services`\?$/)
    expect(run('kubectl get zzzzzzz').stderr).toBe(
      'error: the server doesn\'t have a resource type "zzzzzzz"',
    )
  })

  acTest(
    'E6-04.AC2',
    '"Did you mean" for kubectl verbs and commands within edit distance 2',
    () => {
      expect(run('kubectl gte pods').stderr).toBe(
        'error: unknown command "gte" for "kubectl"\n\nDid you mean this?\n\tget\n\tset\n\nRun \'kubectl --help\' for usage.',
      )
      expect(run('kubectl dscribe pod x').stderr).toMatch(/Did you mean this\?\n\tdescribe\n/)
      expect(run('kubectl frobnicate').stderr).toBe(
        'error: unknown command "frobnicate" for "kubectl"\n\nRun \'kubectl --help\' for usage.',
      )
      expect(run('kubeclt get pods')).toEqual({
        stdout: '',
        stderr: 'bash: kubeclt: command not found\n\nDid you mean `kubectl`?',
        exitCode: 127,
      })
      expect(run('histroy').stderr).toMatch(/Did you mean `history`\?$/)
      expect(run('qqqqqq').stderr).toBe('bash: qqqqqq: command not found')
    },
  )

  acTest(
    'E6-04.AC3',
    'unsupported but real kubectl commands explain what they would do and suggest an alternative',
    () => {
      for (const verb of Object.keys(UNSUPPORTED_KUBECTL)) {
        const out = run(`kubectl ${verb} something`)
        expect(out.exitCode, verb).toBe(1)
        expect(out.stderr, verb).toMatch(
          new RegExp(
            `^On a real cluster, \`kubectl ${verb}\` .+\\. This simulator doesn't run it\\. .+`,
          ),
        )
        // Every explanation points somewhere: a command to try, a key, or a place in the app.
        expect(out.stderr, verb).toMatch(/`[^`]+`|Field Guide|trace viewer|Git/)
      }
      expect(run('kubectl port-forward svc/ravenpost-web 8080:80').stderr).toMatch(
        /tunnel from a port on your own machine/,
      )
    },
  )

  acTest(
    'E6-04.AC3',
    'real commands the simulator adds later, and real shell programs, also answer kindly',
    () => {
      for (const verb of PLANNED_KUBECTL) {
        const out = run(`kubectl ${verb}`)
        expect(out.stderr, verb).toMatch(
          /works on a real cluster, but this simulator doesn't run it yet\. Try `kubectl get pods`/,
        )
      }
      for (const prog of ['ssh', 'docker', 'systemctl', 'curl', 'ls', 'vim']) {
        const out = run(`${prog} anything`)
        expect(out.exitCode).toBe(127)
        expect(out.stderr).not.toMatch(/command not found/)
      }
      expect(run('grep x').stderr).toMatch(
        /Use it after a pipe, for example: kubectl get pods -A \| grep Running/,
      )
      expect(run('wc -l').stderr).toMatch(/\| wc -l$/)
      expect(run('head').stderr).toMatch(/\| head -n 5$/)
    },
  )

  acTest('E6-04.AC1', 'the parser never throws on 10,000 random inputs', () => {
    const shell = createShell(sim())
    const words = [
      'kubectl',
      'get',
      'pods',
      'po',
      'pod',
      '-n',
      '-A',
      '--namespace',
      '--context',
      '-o',
      'wide',
      'name',
      'yaml',
      '-l',
      'app=web',
      'ravenpost',
      '|',
      'grep',
      'head',
      'tail',
      'wc',
      '-l',
      '-v',
      '-i',
      '"',
      "'",
      '\\',
      '--',
      '-',
      '=',
      ';',
      '&&',
      '$(',
      '`',
      '>',
      'help',
      'history',
      'hint',
      'clear',
      'exit',
      'whoami',
      'describe',
      'logs',
      'port-forward',
      '-it',
      '--show-labels',
      '-w',
      'in',
      '(',
      ')',
      ',',
      '!',
      'ünïcødé',
      '🌩',
      '\t',
      '\n',
    ]
    const line = fc.oneof(
      fc.string({ maxLength: 80 }),
      fc.array(fc.constantFrom(...words), { maxLength: 12 }).map((ws) => ws.join(' ')),
      fc.array(fc.constantFrom(...words), { maxLength: 12 }).map((ws) => ws.join('')),
    )
    fc.assert(
      fc.property(line, (l) => {
        const out = shell.run(l)
        expect(typeof out.stdout).toBe('string')
        expect(typeof out.stderr).toBe('string')
        expect(Number.isInteger(out.exitCode)).toBe(true)
        expect(() => shell.complete(l)).not.toThrow()
      }),
      { numRuns: 10_000, seed: 1998 },
    )
  })

  it('turns a crash inside a command into a message instead of throwing', () => {
    const boom = defineCommand({
      path: ['boom'],
      summary: 'x',
      usage: 'boom',
      flags: [],
      help: () => '',
      run: () => {
        throw new Error('kaput')
      },
    })
    const out = new Shell(sim(), { commands: [...COMMANDS, boom] }).run('boom')
    expect(out).toEqual({
      stdout: '',
      stderr:
        'Something went wrong inside the simulator while running that command, so nothing happened. (kaput)',
      exitCode: 1,
    })
  })
})

describe('Shell: built-ins', () => {
  it('help lists every registered command; --help and help <cmd> show one', () => {
    const help = run('help').stdout
    for (const c of COMMANDS) expect(help).toContain(c.usage)
    expect(run('kubectl get --help').stdout).toMatch(/^Display one or many resources/)
    expect(run('kubectl get pods -h').stdout).toMatch(/^Display one or many resources/)
    expect(run('help kubectl get').stdout).toMatch(/^Display one or many resources/)
    expect(run('help history').stdout).toMatch(/^history/)
    expect(run('help nope').exitCode).toBe(1)
    expect(run('kubectl').stdout).toMatch(
      /Commands available in this simulator:\n {2}get +List resources/,
    )
    expect(run('kubectl help').stdout).toBe(run('kubectl --help').stdout)
    expect(run('kubectl -n x').stdout).toBe(run('kubectl').stdout)
  })

  it('history, clear, exit, whoami and hint', () => {
    const shell = createShell(sim())
    shell.run('kubectl get pods')
    shell.run('   ')
    expect(shell.run('history').stdout).toBe('    1  kubectl get pods\n    2  history')
    expect(shell.run('clear')).toMatchObject({ effect: 'clear', exitCode: 0 })
    expect(shell.run('exit')).toMatchObject({ effect: 'exit', exitCode: 0 })
    expect(shell.run('whoami').stdout).toMatch(/^operator\n\n.*kind-ravenpost/)
    expect(shell.run('hint').stdout).toMatch(/There's no challenge running/)
    const withHint = createShell(sim(), { history: [], hint: () => 'Look at the STATUS column.' })
    expect(withHint.run('hint').stdout).toBe('Look at the STATUS column.')
    expect(shell.run('history --oops').stderr).toBe('error: unknown flag: --oops')
  })

  it('pipes combine, and stderr passes through', () => {
    const shell = createShell(sim())
    expect(shell.run("kubectl get pods -A | grep -c '^ravenpost '").stdout).toBe('8')
    expect(shell.run('kubectl get pods -A | grep -v Running | tail -n 1').stdout).toMatch(
      /CrashLoopBackOff/,
    )
    expect(shell.run('kubectl get pods | wc -l')).toEqual({
      stdout: '0',
      stderr: 'No resources found in default namespace.',
      exitCode: 0,
    })
    expect(shell.run('kubectl get pods "unclosed')).toMatchObject({ exitCode: 2 })
  })
})

describe('Shell: tab completion', () => {
  it('completes commands, verbs, resource types, names and flag values', () => {
    const shell = createShell(sim())
    expect(shell.complete('ku').candidates).toEqual(['kubectl'])
    expect(shell.complete('h').candidates).toEqual(['help', 'hint', 'history'])
    expect(shell.complete('kubectl g').candidates).toEqual(['get'])
    expect(shell.complete('kubectl get p').candidates).toEqual(['persistentvolumeclaims', 'pods'])
    expect(shell.complete('kubectl get pods -n rav')).toEqual({
      partial: 'rav',
      candidates: ['ravenpost'],
    })
    expect(shell.complete('kubectl get pods -n ravenpost ravenpost-n').candidates).toEqual([
      expect.stringMatching(/^ravenpost-notifier-/),
    ])
    expect(shell.complete('kubectl --context ').candidates).toEqual(['kind-ravenpost'])
    expect(shell.complete('kubectl get pods -o w').candidates).toEqual(['wide'])
    expect(shell.complete('kubectl get pods --sh').candidates).toEqual(['--show-labels'])
    expect(shell.complete('kubectl get pods | g').candidates).toEqual(['grep'])
    expect(shell.complete('kubectl get deployments x').candidates).toEqual([])
    expect(shell.complete('history x').candidates).toEqual([])
    expect(shell.complete('kubectl logs x').candidates).toEqual([])
  })
})

describe('command registry', () => {
  acTest('E6-04.AC4', 'a new command needs only its own file and one registry line', () => {
    // The new "file": a command defined entirely on its own.
    const uptime = defineCommand({
      path: ['kubectl', 'uptime'],
      summary: 'How long the watch has run',
      usage: 'kubectl uptime',
      flags: [{ name: 'seconds', type: 'bool', description: 'In seconds' }],
      help: () => 'kubectl uptime',
      run: (ctx, inv) =>
        ok(inv.flags.seconds === true ? String(ctx.sim.now / 1000) : `${String(ctx.sim.now)}ms`),
      complete: () => ['forever'],
    })
    // The one registry line.
    const shell = new Shell(sim(), { commands: [...COMMANDS, uptime] })
    expect(shell.run('kubectl uptime --seconds')).toEqual({ stdout: '0', stderr: '', exitCode: 0 })
    expect(shell.run('kubectl -n x uptime').stdout).toBe('0ms')
    expect(shell.run('kubectl uptime --help').stdout).toBe('kubectl uptime')
    expect(shell.run('kubectl').stdout).toMatch(/uptime +How long the watch has run/)
    expect(shell.complete('kubectl upt').candidates).toEqual(['uptime'])
    expect(shell.complete('kubectl uptime f').candidates).toEqual(['forever'])
    expect(shell.run('kubectl uptme').stderr).toMatch(/Did you mean this\?\n\tuptime/)
  })

  acTest(
    'E6-04.AC4',
    'every command file is registered exactly once, with one import line each',
    () => {
      const dir = join(process.cwd(), 'src/sim/commands')
      const registry = readFileSync(join(dir, 'registry.ts'), 'utf8')
      const files = ['builtins', 'kubectl'].flatMap((sub) =>
        readdirSync(join(dir, sub))
          .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
          .filter((f) =>
            /defineCommand\(|helpCommandFor/.test(readFileSync(join(dir, sub, f), 'utf8')),
          )
          .map((f) => `./${sub}/${f}`),
      )
      expect(files.length).toBe(COMMANDS.length)
      for (const f of files) expect(registry.split(`from '${f}'`).length - 1, f).toBe(1)
      const paths = COMMANDS.map((c) => c.path.join(' '))
      expect(new Set(paths).size).toBe(paths.length)
    },
  )
})
