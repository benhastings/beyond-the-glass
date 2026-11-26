# Facilitator guide

For team leads rolling Beyond the Glass out to operators moving into Kubernetes, GitOps and observability.

## Before you start

- **Where it runs.** The public site needs nothing installed. On a closed network, run the container image
  (see the README): it serves the same site and makes no outside requests.
- **What learners need.** A browser, about 6–9 hours over a few weeks for the full trail, and someone to
  ask. Nothing touches a real cluster: every terminal, pipeline, dashboard and trace is simulated.
- **What you'll see.** Only what learners choose to share, as progress codes. There's no server and no
  tracking.

## Rolling it out

1. **Kick off together (30 minutes).** Open the Console Room, read the opening, and have everyone take the
   Threshold, the placement quiz. Say out loud that it isn't a test: it suggests where to start, and every
   region stays open.
2. **Set a rhythm, not a deadline.** One region a week works for most teams. Nothing in the course is
   timed, and the lessons say so; keep it that way.
3. **Pair people.** Someone strong in Kubernetes paired with someone strong in alerting gets both further.
4. **Check in with progress codes.** Ask learners to export a code (Settings → Your Pack) before your
   one-to-ones, and paste them into the lead view.

## The lead view (`/#/lead`)

Paste one or more progress codes. You'll see, per learner: their starting trail from the Threshold, each
region's status, the modules they tested out of, and the challenges they finished with how many hints they
used. Codes are read in your browser and never stored; close the tab and they're gone.

Use it to start conversations ("the Chartroom's triage flow took a while: which failure was hardest?"), not to
rank people. The course gives no scores, deliberately.

## A tabletop with the capstone

"The Long Night" (`/#/stormwatch`) is a four-act incident built from the failures taught in the regions. It
makes a good 90-minute team tabletop:

1. **Roles (5 minutes).** One person drives the war room on a shared screen; one keeps the incident notes
   (the Notes pane); everyone else reads signals and calls out evidence.
2. **Play (60 minutes).** Work the acts in order. Pause at each act's end and ask: what told us, how sure
   were we, and what would we do differently on a real night?
3. **Debrief (25 minutes).** Read the debrief together: what went well, the evidence per act, and what's
   worth knowing next time. It's blameless by design; keep the conversation that way.

Repeat it later with a different driver. The acts don't change, but the path a team takes does.

## Questions learners ask

- *"Does it matter if I use the hints?"* No. Hints are counted only so you can see where people needed
  help.
- *"Can I skip ahead?"* Yes. Every region is open, and each module has a test-out.
- *"Is this how our clusters work?"* The habits are: check your context, look before you touch, change
  through Git, correlate signals. The fictional Ravenpost system is generic on purpose.
