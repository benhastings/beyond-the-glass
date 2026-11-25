import { useId, useState } from 'react'
import { useNavigate } from 'react-router'
import { encodeProgress, exportFile, exportFileName, importText, TEXT_SIZES } from '@/progress'
import { useProgress } from '../progress'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { RadioGroup } from '../ui/RadioGroup'

const PREFERENCE = [
  { value: 'system', label: 'Same as my device' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
]

/** Downloads text as a file, without any network request. */
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Settings and "Your Pack" (E2-06): display preferences that apply at once, exporting and importing
 * progress, starting over (only after typing RESET, with a last chance to download), and what happens to
 * the learner's data.
 */
export function SettingsPanel() {
  const settings = useProgress((s) => s.progress.settings)
  const progress = useProgress((s) => s.progress)
  const update = useProgress((s) => s.updateSettings)
  const importProgress = useProgress((s) => s.importProgress)
  const reset = useProgress((s) => s.reset)
  const retake = useProgress((s) => s.retakeThreshold)
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState('')
  const [incoming, setIncoming] = useState('')
  const [importMessage, setImportMessage] = useState('')
  const [confirm, setConfirm] = useState('')
  const [resetOpen, setResetOpen] = useState(false)
  const [resetDone, setResetDone] = useState('')
  const id = useId()
  const now = () => new Date().toISOString()

  const doImport = async (text: string) => {
    const r = await importText(text, now())
    if (!r.ok) {
      setImportMessage(`That couldn’t be imported: ${r.error}`)
      return
    }
    importProgress(r.progress)
    setIncoming('')
    setImportMessage('Imported. Your progress now includes everything from both.')
  }

  return (
    <div className="grid max-w-prose gap-10">
      <section aria-labelledby={`${id}-display`} className="grid gap-4">
        <h2 id={`${id}-display`} className="text-xl font-bold">
          Display
        </h2>
        <RadioGroup
          legend="Reduce motion"
          name="reduceMotion"
          options={PREFERENCE}
          value={settings.reduceMotion}
          onValueChange={(v) => {
            update({ reduceMotion: v as typeof settings.reduceMotion })
          }}
        />
        <RadioGroup
          legend="High contrast"
          name="highContrast"
          options={PREFERENCE}
          value={settings.highContrast}
          onValueChange={(v) => {
            update({ highContrast: v as typeof settings.highContrast })
          }}
        />
        <RadioGroup
          legend="Text size"
          name="textSize"
          options={TEXT_SIZES.map((t) => ({
            value: String(t),
            label: t === 100 ? 'Standard' : `${String(t)}%`,
          }))}
          value={String(settings.textSize)}
          onValueChange={(v) => {
            update({ textSize: Number(v) as typeof settings.textSize })
          }}
        />
      </section>

      <section aria-labelledby={`${id}-start`} className="grid gap-3">
        <h2 id={`${id}-start`} className="text-xl font-bold">
          Your starting trail
        </h2>
        <p>
          Retake the Threshold to choose your starting levels again. Your lessons, checks and
          challenges stay exactly as they are; only the recommendations change.
        </p>
        <div>
          <Button
            onClick={() => {
              retake()
              void navigate('/threshold')
            }}
          >
            Retake the Threshold
          </Button>
        </div>
      </section>

      <section aria-labelledby={`${id}-pack`} className="grid gap-4">
        <h2 id={`${id}-pack`} className="text-xl font-bold">
          Your Pack
        </h2>
        <p>
          Take your progress to another browser or keep a copy: as a code you can paste, or as a
          file.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => {
              void encodeProgress(progress).then(setCode)
            }}
          >
            Show my progress code
          </Button>
          <Button
            onClick={() => {
              download(exportFileName(now()), exportFile(progress))
            }}
          >
            Download my progress (.json)
          </Button>
        </div>
        {code && (
          <div className="grid gap-2">
            <label htmlFor={`${id}-code`} className="font-bold">
              Your progress code
            </label>
            <textarea
              id={`${id}-code`}
              readOnly
              value={code}
              rows={4}
              className="w-full rounded-md border border-line bg-raised p-2 font-mono text-sm break-all"
            />
            <div>
              <Button
                onClick={() => {
                  void navigator.clipboard.writeText(code).then(
                    () => {
                      setCopied('Copied.')
                    },
                    () => {
                      setCopied(
                        'Copying isn’t available here; select the code and copy it instead.',
                      )
                    },
                  )
                }}
              >
                Copy the code
              </Button>{' '}
              <span role="status">{copied}</span>
            </div>
          </div>
        )}
        <div className="grid gap-2">
          <label htmlFor={`${id}-import`} className="font-bold">
            Import progress
          </label>
          <p id={`${id}-import-help`} className="text-sm">
            Paste a progress code (or the contents of a downloaded file), or choose the file.
            Imported progress is combined with what’s here, so nothing is lost.
          </p>
          <textarea
            id={`${id}-import`}
            aria-describedby={`${id}-import-help`}
            value={incoming}
            onChange={(e) => {
              setIncoming(e.target.value)
            }}
            rows={3}
            className="w-full rounded-md border border-line bg-raised p-2 font-mono text-sm"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={!incoming.trim()} onClick={() => void doImport(incoming)}>
              Import
            </Button>
            <label className="text-sm">
              Or choose a file{' '}
              <input
                type="file"
                accept="application/json,.json,.txt"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void f.text().then(doImport)
                }}
              />
            </label>
          </div>
          <p role="status">{importMessage}</p>
        </div>
        <div className="grid gap-2">
          <h3 className="font-bold">Start over</h3>
          <p>Clears your progress in this browser. You can download a copy first.</p>
          <div>
            <Dialog
              title="Start over?"
              description="This clears all your progress in this browser. It can’t be undone, but you can download a copy first and import it later."
              open={resetOpen}
              onOpenChange={(o) => {
                setResetOpen(o)
                setConfirm('')
              }}
              closeLabel="Keep my progress"
              trigger={<Button>Start over…</Button>}
            >
              <div className="grid gap-3">
                <Button
                  onClick={() => {
                    download(exportFileName(now()), exportFile(progress))
                  }}
                >
                  Download my progress first
                </Button>
                <label htmlFor={`${id}-confirm`}>
                  Type <span className="font-mono font-bold">RESET</span> to confirm
                </label>
                <input
                  id={`${id}-confirm`}
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value)
                  }}
                  autoComplete="off"
                  className="min-h-11 rounded-md border border-line bg-raised px-2 font-mono"
                />
                <Button
                  variant="primary"
                  disabled={confirm !== 'RESET'}
                  onClick={() => {
                    reset()
                    setResetOpen(false)
                    setConfirm('')
                    setResetDone('Your progress has been cleared.')
                  }}
                >
                  Clear my progress
                </Button>
              </div>
            </Dialog>{' '}
            <span role="status">{resetDone}</span>
          </div>
        </div>
      </section>

      <section aria-labelledby={`${id}-data`} className="grid gap-2">
        <h2 id={`${id}-data`} className="text-xl font-bold">
          About your data
        </h2>
        <p>
          Everything you do here stays in this browser, in its local storage. Nothing is sent to a
          server: there’s no account, no tracking and no analytics.
        </p>
        <p>
          That also means clearing your browser’s data clears your progress. Download a copy now and
          then, or use your progress code to carry on in another browser.
        </p>
        <p>The only personal detail stored is a display name, and only if you choose one.</p>
      </section>
    </div>
  )
}
