/**
 * Real kubectl commands this simulator doesn't run. Each explains, in the world's voice, what it would
 * do on a real cluster and what to try here instead (AGENTS.md §6: fail kindly, never throw).
 */
export interface Unsupported {
  does: string
  instead: string
}

export const UNSUPPORTED_KUBECTL: Readonly<Record<string, Unsupported>> = {
  'port-forward': {
    does: 'opens a tunnel from a port on your own machine to a pod or Service, so you could reach it from a browser or curl',
    instead:
      'Check what the Service would send traffic to with `kubectl get pods -o wide`, and read the pod’s logs with `kubectl logs <pod>`.',
  },
  exec: {
    does: 'runs a command inside a running container, like opening a shell on a server',
    instead:
      'Most answers are outside the container: `kubectl describe pod <pod>` and `kubectl logs <pod>`.',
  },
  cp: {
    does: 'copies files between your machine and a container',
    instead: 'Read the container’s output with `kubectl logs <pod>` instead.',
  },
  attach: {
    does: 'connects your terminal to a container’s running process',
    instead: 'Follow its output with `kubectl logs -f <pod>`.',
  },
  proxy: {
    does: 'serves the Kubernetes API on a local port',
    instead: 'Ask the API through kubectl itself, for example `kubectl get pods`.',
  },
  debug: {
    does: 'starts a temporary debugging container next to a pod or on a node',
    instead: 'Start with the evidence the pod already has: `kubectl describe pod <pod>`.',
  },
  auth: {
    does: 'checks who you are and what you’re allowed to do (`auth can-i`, `auth whoami`)',
    instead:
      'Here you have full access to the training cluster. `whoami` tells you who you are on this watch.',
  },
  drain: {
    does: 'moves every pod off a node so it can be maintained',
    instead: 'Look at where pods run with `kubectl get pods -o wide`.',
  },
  cordon: {
    does: 'marks a node so no new pods are scheduled on it',
    instead: 'Look at where pods run with `kubectl get pods -o wide`.',
  },
  uncordon: {
    does: 'lets new pods be scheduled on a node again',
    instead: 'Look at where pods run with `kubectl get pods -o wide`.',
  },
  taint: {
    does: 'adds a taint to a node so only pods that tolerate it can run there',
    instead: 'Look at where pods run with `kubectl get pods -o wide`.',
  },
  run: {
    does: 'starts a new pod from an image',
    instead:
      'Changes in this world go through Git and Argo CD. To look around, start with `kubectl get pods`.',
  },
  create: {
    does: 'creates a new object from the command line or a file',
    instead:
      'Changes in this world go through Git and Argo CD. To look around, start with `kubectl get pods`.',
  },
  patch: {
    does: 'changes fields of a live object in place',
    instead:
      'Change the manifest in Git and let Argo CD sync it. To inspect the object, use `kubectl describe`.',
  },
  replace: {
    does: 'replaces a live object with the one in a file',
    instead: 'Change the manifest in Git and let Argo CD sync it.',
  },
  expose: {
    does: 'creates a Service in front of pods',
    instead: 'Services here are already defined in Git. List pods with `kubectl get pods`.',
  },
  autoscale: {
    does: 'creates a HorizontalPodAutoscaler for a workload',
    instead: 'List what’s running with `kubectl get pods`.',
  },
  explain: {
    does: 'prints the documentation for a resource type and its fields',
    instead:
      'Look terms up in the Field Guide, or see the real fields with `kubectl get pod <pod> -o yaml`.',
  },
  'api-resources': {
    does: 'lists every resource type the cluster serves',
    instead: 'This simulator serves a subset; type `help` to see what it supports.',
  },
  'cluster-info': {
    does: 'prints the addresses of the control plane and cluster services',
    instead: 'Check which cluster you’re talking to with `kubectl config current-context`.',
  },
  wait: {
    does: 'blocks until objects reach a condition',
    instead: 'Watch a rollout with `kubectl rollout status deployment/<name>`.',
  },
  certificate: {
    does: 'approves or denies certificate signing requests',
    instead: 'Certificates are managed for you on this cluster.',
  },
  plugin: {
    does: 'manages kubectl plugins',
    instead: 'Type `help` to see what this terminal supports.',
  },
  completion: {
    does: 'prints a shell completion script',
    instead: 'Tab completion already works here: press Tab.',
  },
  kustomize: {
    does: 'renders a kustomization directory into manifests',
    instead: 'Manifests in this world live in Git; Argo CD renders and applies them.',
  },
  version: {
    does: 'prints the kubectl and cluster versions',
    instead: 'Node versions appear in `kubectl get nodes`.',
  },
}

/** Real kubectl commands the simulator is adding (support matrix). Until they land, they say so kindly. */
export const PLANNED_KUBECTL = ['apply', 'diff', 'edit'] as const

export function unsupportedMessage(verb: string): string {
  const u = UNSUPPORTED_KUBECTL[verb]
  if (!u)
    return `\`kubectl ${verb}\` works on a real cluster, but this simulator doesn't run it yet. Try \`kubectl get pods\`, or type \`help\` to see what's supported.`
  return `On a real cluster, \`kubectl ${verb}\` ${u.does}. This simulator doesn't run it. ${u.instead}`
}
