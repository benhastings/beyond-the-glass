import { useState } from 'react'
import ravenpost from '@/scenarios/ravenpost.yaml'
import { createShell } from '@/sim/commands'
import type { EditRequest } from '@/sim/commands/types'
import { loadSimulation } from '@/sim/controllers'
import { pipelines } from '@/sim/gitops/pipeline'
import { ciScenario, mrScenario } from '@/sim/gitops/testing'
import { PipelineView } from '../gitops/PipelineView'
import { ArgoConsole } from '../gitops/argo/ArgoConsole'
import { MergeRequestFlow } from '../gitops/MergeRequestFlow'
import { PromqlExplorer } from '../o11y/PromqlExplorer'
import { DashboardView } from '../o11y/dashboards/DashboardView'
import { TraceExplorer } from '../o11y/traces/TraceExplorer'
import { ObservabilityWorkspace } from '../o11y/ObservabilityWorkspace'
import { LessonOtelPipeline } from '../lesson/components/OtelPipelineLazy'
import { TraceView } from '../o11y/traces/TraceView'
import { sampleTrace } from '../o11y/traces/sample'
import { telemetryGitopsScenario, telemetryScenario } from '@/sim/telemetry/testing'
import { InlineEditor } from '../terminal/InlineEditor'
import { ScenarioTerminal } from '../terminal/ScenarioTerminal'
import { ChallengeTerminal } from '../terminal/ChallengeTerminal'
import { CHALLENGES } from '@/challenges'
import LessonSample from '../../../content/_samples/components.mdx'
import sampleChecks from '../../../content/_samples/components.checks.yaml?raw'
import { parse as parseYaml } from 'yaml'
import { checksFile } from '@/content/checks'
import { MdxContent } from '../lesson/MdxContent'
import { Page } from '../shell/Page'
import type { Mood } from '../display/display'
import {
  Badge,
  Button,
  Callout,
  Card,
  Checkbox,
  CodeBlock,
  Dialog,
  IconButton,
  Kbd,
  Progress,
  RadioGroup,
  StatusPill,
  Tabs,
  Tooltip,
  VisuallyHidden,
  ToastProvider,
  useToast,
} from '../ui'

const SAMPLE_CHECKS = checksFile.parse(parseYaml(sampleChecks)).checks

const MOODS: { id: Mood; label: string }[] = [
  { id: 'console', label: 'Console Room' },
  { id: 'reach', label: 'The Reach' },
  { id: 'stormwatch', label: 'Stormwatch' },
]

/**
 * `#/kitchen-sink`: every primitive in every state, for developers and for the axe check (E1-03).
 * It isn't linked from the app and loads as its own chunk, so learners never download it.
 */
/** Toasts need a provider; the app gets one when a page first needs toasts. */
export default function KitchenSink() {
  return (
    <ToastProvider>
      <Demo />
    </ToastProvider>
  )
}

function Demo() {
  const [mood, setMood] = useState<Mood>('reach')
  const [checked, setChecked] = useState(true)
  const toast = useToast()
  return (
    <Page title="Kitchen sink" mood={mood} region={mood === 'reach' ? 'chartroom' : undefined}>
      <p className="mt-2 max-w-prose text-ink-muted">
        Every component primitive, in the current mood. Developer page; not linked from the app.
      </p>
      <div className="mt-6 grid gap-8">
        <RadioGroup
          legend="Mood"
          value={mood}
          onValueChange={(v) => {
            setMood(v as Mood)
          }}
          options={MOODS.map((m) => ({ value: m.id, label: m.label }))}
        />

        <Card id="buttons" title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Step through the glass</Button>
            <Button>Change my starting point</Button>
            <Button variant="ghost">Skip</Button>
            <Button disabled>Unavailable</Button>
            <IconButton label="Copy the command" icon="⧉" />
            <Tooltip content="Opens on hover and on focus">
              <Button>Hover or focus me</Button>
            </Tooltip>
          </div>
        </Card>

        <Card id="overlays" title="Dialog and toast">
          <div className="flex flex-wrap gap-3">
            <Dialog
              title="Leave the scenario?"
              description="Your place in the scenario is saved, so you can come back to it."
              trigger={<Button>Open a dialog</Button>}
            >
              <p>Dialogs keep focus inside until they close, and Esc closes them.</p>
            </Dialog>
            <Button
              onClick={() => {
                toast('Progress saved', 'Saved in this browser.')
              }}
            >
              Show a toast
            </Button>
          </div>
        </Card>

        <Card id="tabs" title="Tabs">
          <Tabs
            label="Depth"
            items={[
              {
                id: 'eli5',
                label: 'ELI5',
                content: <p>A pod is a small box that holds one or more running programs.</p>,
              },
              {
                id: 'operator',
                label: 'Operator',
                content: <p>List them with kubectl get pods -n ravenpost.</p>,
              },
              {
                id: 'deep',
                label: 'Deep dive',
                content: <p>Containers in a pod share a network namespace.</p>,
              },
            ]}
          />
        </Card>

        <Card id="choices" title="Choices">
          <div className="grid gap-6">
            <RadioGroup
              legend="A pod shows CrashLoopBackOff. What do you look at first?"
              defaultValue="unsure"
              options={[
                {
                  value: 'logs',
                  label: 'Its logs from the last crash',
                  hint: 'kubectl logs --previous',
                },
                { value: 'node', label: 'The node it runs on' },
                { value: 'unsure', label: 'I’m not sure yet' },
              ]}
            />
            <Checkbox
              label="Remind me to export my progress"
              checked={checked}
              onCheckedChange={setChecked}
            />
            <Checkbox label="Unavailable option" disabled />
          </div>
        </Card>

        <Card id="status" title="Status and progress">
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              <StatusPill status="ok">Synced</StatusPill>
              <StatusPill status="warn">Degraded</StatusPill>
              <StatusPill status="alert">Alert firing</StatusPill>
              <StatusPill status="info">Progressing</StatusPill>
              <StatusPill status="neutral">Not started</StatusPill>
              <Badge>Navigator</Badge>
            </div>
            <Progress label="Lessons in Helm Keep" value={2} max={5} />
          </div>
        </Card>

        <Card id="text" title="Callouts, keys and code">
          <div className="grid gap-4">
            <Callout kind="info">Every new term links to the Field Guide.</Callout>
            <Callout kind="warn">This context is prod. Look before you touch.</Callout>
            <Callout kind="success">You found the failing pod.</Callout>
            <Callout kind="eli5">
              A Service is a stable name for a group of pods that come and go.
            </Callout>
            <p>
              Clear the terminal with <Kbd>Ctrl</Kbd>+<Kbd>L</Kbd>.
              <VisuallyHidden> (Control and L together.)</VisuallyHidden>
            </p>
            <CodeBlock
              language="shell"
              caption="List the pods"
              code={
                'kubectl get pods -n ravenpost\nkubectl logs ravenpost-notifier-79c79b9687-rd2j2 --previous --tail=20'
              }
            />
          </div>
        </Card>

        <EditorDemo />

        <Card id="terminal" title="Terminal">
          <ScenarioTerminal scenario={ravenpost} label="Ravenpost terminal" />
        </Card>

        <PipelineDemo />

        <ArgoDemo />

        <MergeRequestDemo />

        <PromqlDemo />

        <DashboardDemo />

        <TraceDemo />

        <WorkspaceDemo />

        <Card id="otel" title="OpenTelemetry pipeline">
          <LessonOtelPipeline />
        </Card>

        <Card id="lesson" title="Lesson components">
          <MdxContent Body={LessonSample} checks={SAMPLE_CHECKS} />
        </Card>

        <Card id="challenge" title="Challenge">
          {CHALLENGES['find-the-failing-pod'] && (
            <ChallengeTerminal
              challenge={CHALLENGES['find-the-failing-pod']}
              scenario={ravenpost}
            />
          )}
        </Card>
      </div>
    </Page>
  )
}

/** Four pipelines from one scenario timeline (E7-02): passed, failed tests, a bad tag, and one still running. */
function PipelineDemo() {
  const [sim] = useState(() => {
    const { sim: s } = ciScenario([
      { at: '+1m', type: 'pipeline', project: 'shop-web', message: 'Add parcel tracking' },
      {
        at: '+20m',
        type: 'pipeline',
        project: 'shop-web',
        message: 'Tidy routes',
        failure: 'test',
      },
      {
        at: '+40m',
        type: 'pipeline',
        project: 'shop-web',
        message: 'Speed up lookups',
        failure: 'bad-tag',
      },
      { at: '+59m', type: 'pipeline', project: 'shop-web', message: 'Retry carrier calls' },
    ])
    s.advance(60 * 60_000 + 30_000)
    return s
  })
  const runs = pipelines(sim)
  const [chosen, setChosen] = useState(runs[0]?.id)
  const p = runs.find((x) => x.id === chosen)
  return (
    <Card id="pipeline" title="Pipeline">
      <div className="grid gap-4">
        <label className="grid max-w-sm min-w-0 gap-1">
          Pipeline
          <select
            className="min-h-11 w-full min-w-0 rounded-md border border-line bg-surface px-2"
            value={chosen}
            onChange={(e) => {
              setChosen(Number(e.target.value))
            }}
          >
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                #{r.id} {r.title} ({r.status})
              </option>
            ))}
          </select>
        </label>
        {p && <PipelineView pipeline={p} now={sim.now} level={3} />}
      </div>
    </Card>
  )
}

/** The Argo CD console over a deploy that went wrong (E7-05): a pipeline wrote a tag nobody pushed. */
function ArgoDemo() {
  const [sim] = useState(() => {
    const { sim: s } = ciScenario([
      { at: '+1m', type: 'pipeline', project: 'shop-web', message: 'Add parcel tracking' },
      {
        at: '+20m',
        type: 'pipeline',
        project: 'shop-web',
        message: 'Speed up lookups',
        failure: 'bad-tag',
      },
    ])
    s.advance(40 * 60_000)
    return s
  })
  return (
    <Card id="argo" title="Argo CD console">
      <ArgoConsole sim={sim} level={3} />
    </Card>
  )
}

/** The merge request flow (E7-03) on a deploy repo whose pipeline requires pinned tags and memory limits. */
function MergeRequestDemo() {
  const [sim] = useState(() => {
    const { sim: s } = mrScenario()
    s.advance(180_000)
    return s
  })
  return (
    <Card id="merge-request" title="Merge request">
      <MergeRequestFlow
        sim={sim}
        repo="ravenpost-deploy"
        app="shop"
        level={3}
        task={<p>Move the web Deployment to registry.example/web:1.1, through a merge request.</p>}
      />
    </Card>
  )
}

/** The PromQL explorer (E8-03) over six services, an hour in, with ledger slowed down at 40 minutes. */
function PromqlDemo() {
  const [sim] = useState(() => {
    const { sim: s } = telemetryScenario([
      { at: '+40m', type: 'injectLatency', namespace: 'ravenpost', service: 'ledger', ms: 400 },
    ])
    s.advance(3_600_000)
    return s
  })
  return (
    <Card id="promql" title="PromQL explorer">
      <PromqlExplorer sim={sim} level={3} />
    </Card>
  )
}

/** Dashboards (E8-02): an hour of six services, a gate release at 30 minutes, ledger OOMing from 40. */
function DashboardDemo() {
  const [sim] = useState(() => {
    const { sim: s } = telemetryGitopsScenario([
      {
        at: '+40m',
        type: 'setMemoryLimit',
        namespace: 'ravenpost',
        deployment: 'ledger',
        container: 'ledger',
        limit: '128Mi',
      },
    ])
    s.advance(3_600_000)
    return s
  })
  return (
    <Card id="dashboards" title="Dashboards">
      <DashboardView sim={sim} />
    </Card>
  )
}

/** The trace explorer (E8-05): ledger fails half its requests from 10 minutes in; and a 200-span trace. */
function TraceDemo() {
  const [sim] = useState(() => {
    const { sim: s } = telemetryScenario([
      { at: '+10m', type: 'injectErrors', namespace: 'ravenpost', service: 'ledger', rate: 0.5 },
    ])
    s.advance(20 * 60_000)
    return s
  })
  const [big, setBig] = useState(false)
  return (
    <Card id="traces" title="Traces">
      <div className="grid gap-4">
        <TraceExplorer sim={sim} level={3} />
        <div>
          <Button
            onClick={() => {
              setBig((b) => !b)
            }}
          >
            {big ? 'Hide' : 'Show'} a 200-span trace
          </Button>
        </div>
        {big && <TraceView trace={sampleTrace(200)} epochMs={sim.clock.epochMs} />}
      </div>
    </Card>
  )
}

/** Dashboards, metrics, logs and traces together (E8-04): ledger fails half its requests from 10 minutes. */
function WorkspaceDemo() {
  const [sim] = useState(() => {
    const { sim: s } = telemetryScenario([
      { at: '+10m', type: 'injectErrors', namespace: 'ravenpost', service: 'ledger', rate: 0.5 },
    ])
    s.advance(20 * 60_000)
    return s
  })
  return (
    <Card id="workspace" title="Observability workspace">
      <ObservabilityWorkspace sim={sim} />
    </Card>
  )
}

/** `kubectl edit` against a live Ravenpost simulation, for the editor's keyboard and axe checks (E6-08). */
function EditorDemo() {
  const [shell] = useState(() => createShell(loadSimulation(ravenpost)))
  const [request, setRequest] = useState<EditRequest>()
  const [result, setResult] = useState('')
  return (
    <Card id="editor" title="Terminal editor">
      <div className="grid gap-3">
        {request ? (
          <InlineEditor
            request={request}
            onDone={(out) => {
              setRequest(undefined)
              setResult([out.stdout, out.stderr].filter(Boolean).join('\n'))
            }}
          />
        ) : (
          <Button
            onClick={() => {
              setResult('')
              setRequest(shell.run('kubectl edit configmap ravenpost-config -n ravenpost').edit)
            }}
          >
            Run kubectl edit configmap ravenpost-config
          </Button>
        )}
        <output aria-label="Command output" className="font-mono text-sm">
          {result}
        </output>
      </div>
    </Card>
  )
}
