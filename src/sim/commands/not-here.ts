/**
 * Real programs an operator might reach for that this terminal doesn't have. Each gets an in-world
 * explanation and something to try instead, rather than a bare "command not found".
 */
export const NOT_HERE: Readonly<Record<string, string>> = {
  ssh: "There's no server to log in to here: in Kubernetes you ask the cluster instead. Try `kubectl get pods -A`.",
  sudo: "You don't need sudo on this watch: kubectl already has the access it needs.",
  systemctl:
    'Kubernetes looks after the processes now. Where you would have checked a service with systemctl, check its pods: `kubectl get pods -n <namespace>`.',
  service:
    'Kubernetes looks after the processes now. Where you would have checked a service, check its pods: `kubectl get pods -n <namespace>`.',
  journalctl: 'Container logs come from the cluster: `kubectl logs <pod>`.',
  ps: 'Processes run inside containers here. To see what’s running, list the pods: `kubectl get pods -A`.',
  top: 'For resource use, the cluster has `kubectl top pods`.',
  docker: 'The cluster runs the containers for you. List them as pods: `kubectl get pods -A`.',
  curl: 'This terminal can’t make network requests. To see whether a Service has pods behind it, try `kubectl get pods -o wide`.',
  wget: 'This terminal can’t make network requests. To see whether a Service has pods behind it, try `kubectl get pods -o wide`.',
  ping: 'This terminal can’t send network traffic. Pod IPs are listed by `kubectl get pods -o wide`.',
  traceroute:
    'This terminal can’t send network traffic. To follow a request between services, use the trace viewer.',
  vi: 'To change an object in the cluster, `kubectl edit <type> <name>` opens it in an editor here.',
  vim: 'To change an object in the cluster, `kubectl edit <type> <name>` opens it in an editor here.',
  nano: 'To change an object in the cluster, `kubectl edit <type> <name>` opens it in an editor here.',
  helm: 'Charts in this world are rendered from Git by Argo CD, so this terminal has no helm command.',
  echo: 'This terminal runs kubectl and a few helpers; type `help` to see them.',
}
