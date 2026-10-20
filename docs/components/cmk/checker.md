# Checker

Checker reports the health of a CMK deployment over HTTP, so that an uptime
monitor, a load balancer or an operator can see at a glance whether everything
CMK depends on works. It checks the services of the cluster, the Kubernetes API
server and the Linkerd service mesh in the background, and collects the build
versions of the OpenKCM services for one overview.

Repository: [openkcm/checker](https://github.com/openkcm/checker)

## What it checks

Each health check endpoint has up to three groups of checks. They run every few
seconds (`refreshDuration`, 5 seconds by default), not on every request: the
endpoint answers immediately with the result of the last run.

| Group | What it does | Typical use |
| --- | --- | --- |
| `cluster` | An HTTP `GET` to each configured URL, with checks on the status and the body of the answer | The readiness endpoints of CMK, the Registry and ExtAuthZ, and of Envoy Gateway |
| `kubernetes` | A `GET` to health endpoints of the Kubernetes API server, such as `/livez?verbose` and `/readyz?verbose` | Whether the cluster's control plane is healthy |
| `linkerd` | The categories of `linkerd check` that you select | Whether the service mesh, its certificates and its proxies are healthy |

A check passes when every condition on the answer holds, for example the
status `200 OK` or a text in the body. A check can tolerate a number of failed
runs in a row (`retry.maxRetries`) before the endpoint reports it.

## Endpoints

| Port | Path | Answer |
| --- | --- | --- |
| `http` (8080) | `/healthz` | `200` when all checks pass, `503` otherwise. JSON with one entry per group |
| `http` (8080) | One path per additional endpoint (`healthchecks`) | The same, for its own checks |
| `http` (8080) | `/versions`, if enabled | JSON with the build information of each configured service and of Checker itself |
| `http-status` (8888) | `/probe/liveness`, `/probe/readiness`, `/version`, `/metrics` | Probes, Checker's own version and its metrics |

An answer of `/healthz` looks like this:

```json
{
  "cluster": [
    { "name": "cmk", "url": "http://cmk.services.svc.cluster.local:8888/probe/readiness", "status": "OK" }
  ],
  "kubernetes": [
    { "name": "readiness", "url": "/readyz?verbose", "status": "OK" }
  ],
  "linkerd": { "status": "OK" }
}
```

The answers show the addresses of the checked services and the error messages
of failed checks. Allow only your monitoring to call the endpoints, with the
chart's network policy or your gateway. When you publish `/healthz` outside the
cluster, for example for an external uptime monitor, also set `maskURLs: true`
to hide the addresses and messages.

## Install

Checker is installed with its Helm chart, once per cluster:

```bash
helm upgrade --install checker oci://ghcr.io/openkcm/charts/checker \
  --version 0.2.0 --namespace services -f checker-values.yaml
```

An example that checks the readiness of the CMK services of a region and serves
their versions:

```yaml
config:
  healthcheck:
    maskURLs: true
    cluster:
      enabled: true
      resources:
        - name: cmk
          url: http://cmk.services.svc.cluster.local:8888/probe/readiness
          checks:
            - { type: Equal, source: ResponseStatus, value: "200 OK" }
        - name: extauthz
          url: http://extauthz.envoy-gateway-system.svc.cluster.local:8080/probe/readiness
          checks:
            - { type: Equal, source: ResponseStatus, value: "200 OK" }
    # Without Linkerd in the cluster:
    linkerd:
      enabled: false
  versions:
    enabled: true
    resources:
      - name: cmk
        url: http://cmk.services.svc.cluster.local:8888/version
      - name: session-manager
        url: http://session-manager.services.svc.cluster.local:8888/version
```

Adjust the Service names and namespaces to your releases. The chart's
[README][readme] explains every resource it creates, and its
[values.yaml][values] documents every setting with examples: the types of
checks, the retries, additional endpoints and the Linkerd categories.

## Kubernetes API access

The `kubernetes` and `linkerd` checks call the Kubernetes API with Checker's
ServiceAccount token, which the chart mounts. The `kubernetes` checks need no
further permissions. For the `linkerd` checks, the chart creates a read-only
ClusterRole: it may list nodes, pods and services and read the configuration
of the Linkerd control plane; it reads Secrets and ConfigMaps only by their
Linkerd names. Disable `rbac.create` and `serviceAccount.automount` when you
use neither group.

## See also

- [Operations: monitoring](/components/cmk/operations#monitoring)
- [Deployment planning](/components/cmk/deployment)
- [Releases](/releases/)

[readme]: https://github.com/openkcm/checker/blob/main/charts/checker/README.md
[values]: https://github.com/openkcm/checker/blob/main/charts/checker/values.yaml
