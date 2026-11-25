import { useState } from 'react'
import ravenpost from '@/scenarios/ravenpost.yaml'
import { createShell } from '@/sim/commands'
import type { EditRequest } from '@/sim/commands/types'
import { loadSimulation } from '@/sim/controllers'
import { InlineEditor } from '../terminal/InlineEditor'
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
      </div>
    </Page>
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
