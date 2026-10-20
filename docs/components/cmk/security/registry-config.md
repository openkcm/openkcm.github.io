# Registry configuration reference

The [Registry](/components/cmk/registry) runs once, in the central deployment. It keeps
the tenants and systems of all regions in PostgreSQL, serves them over a gRPC API, and
sends the jobs of each tenant to the CMK of the tenant's region; see
[Connect a regional tenant](/components/cmk/tenant-integration). This page explains how
the parts of its configuration fit together and what to decide for each of them. To
install the Registry, follow [Install the Registry](/components/cmk/install-registry).

The Registry Helm chart's [values.yaml][values] documents every setting under `config`
with its default, its allowed values and examples. Each section below names the part of
`values.yaml` that it refers to.

Settings marked as a *value reference* take `source: embedded | env | file`; see
[Configuration conventions](/components/cmk/security/configuration#configuration-conventions).

## How the Registry reads its configuration

- The chart writes everything under `config` into a ConfigMap and mounts its
  `config.yaml` at `/etc/registry/config.yaml` with `subPath`. Settings that only control
  the chart, such as `configMap.immutable`, are outside `config`.
- The Registry reads `config.yaml` from `/etc/registry/`, then from its working
  directory. Key names are case-insensitive.
- An unknown key stops the Registry at startup with `has invalid keys: <key>`.
- Environment variables without prefix override the settings that are present in the
  file. The name is the key path in upper case, with `_` between the levels, for example
  `DATABASE_HOST` for `database.host`.
- The Registry reads its configuration, and the files that it names, only at startup.
  The chart restarts the pods when a value under `config` changes. After you change a
  Secret or another mounted file, restart the Registry, for example with
  `kubectl rollout restart`.

The pod must meet these requirements:

- Keep `pod.enableServiceLinks: false`, the chart's default. Otherwise Kubernetes injects
  variables such as `DATABASE_PORT` for a Service named `database`, and they override
  settings.
- Do not mount anything at `/etc/registry/config.yaml` or over `/etc/registry`. Mount
  credentials elsewhere, for example under `/etc/credentials`.
- Mount Secrets read-only, with `defaultMode: 0440`. The pods run with group 65532
  (`pod.securityContext.fsGroup`), so the Registry can read files with this mode.

The chart's release notes warn about settings that are not production-ready.

## Example

These values connect the Registry to two CMK regions, `emea` and `us`. Combine them with
the database settings, Secrets and volumes from
[Install the Registry](/components/cmk/install-registry):

```yaml
config:
  orbital:
    targets:
      - region: emea
        connection:
          type: amqp
          amqp:
            url: amqps://rabbitmq.services.svc.cluster.local:5671
            target: /queues/cmk.emea.tenants          # CMK tenantManager.amqp.source
            source: /queues/cmk.emea.tenants.replies  # CMK tenantManager.amqp.target
          auth:
            type: mtls
            mtls:
              certFile: /etc/credentials/broker/tls.crt
              keyFile: /etc/credentials/broker/tls.key
              caFile: /etc/credentials/broker/ca.crt
      - region: us
        connection:
          type: amqp
          amqp:
            url: amqps://rabbitmq.services.svc.cluster.local:5671
            target: /queues/cmk.us.tenants
            source: /queues/cmk.us.tenants.replies
          auth:
            type: mtls
            mtls:
              certFile: /etc/credentials/broker/tls.crt
              keyFile: /etc/credentials/broker/tls.key
              caFile: /etc/credentials/broker/ca.crt
  # This list replaces the chart's default rules, so it repeats them first.
  validations:
    - id: Auth.Type
      constraints: [{ type: list, spec: { allowList: ["oidc"] } }]
    - id: Auth.Properties
      constraints:
        - type: map-keys
          spec:
            keys: [{ name: issuer, required: true, constraints: [{ type: non-empty }] }]
    - id: Tenant.UserGroups
      constraints:
        - type: regex
          spec: { pattern: "^KMS_(TenantAdministrator|TenantAuditor)_[A-Za-z0-9-]+$" }
    - id: System.Type
      constraints: [{ type: list, spec: { allowList: ["system", "subaccount"] } }]
    # Rules for this deployment.
    - id: Tenant.Region
      constraints: [{ type: list, spec: { allowList: ["emea", "us"] } }]
    - id: Tenant.ID
      constraints: [{ type: regex, spec: { pattern: "^[a-z0-9][a-z0-9-]{2,39}$" } }]
```

## Database

Section `config.database` of [values.yaml][values]. The Registry keeps all of its state
in PostgreSQL and does not start without it.

- `host` is a plain string, not a value reference: the host name or IP address of the
  PostgreSQL server. It is required.
- `name` is the database name. Use a database of its own for the Registry. The Registry
  creates and updates its tables at startup, so its user needs the right to change the
  schema.
- `user` and `password` are value references. Load them from a mounted Secret or an
  environment variable; do not embed the password in the values.
- The Registry puts `user` and `password` unquoted into the PostgreSQL connection
  string, so they must not contain spaces, quotes or backslashes. A trailing newline in a
  credential file is ignored for the database.
- `logLevel` sets the SQL logging: `1` silent (default), `2` errors, `3` warnings and
  errors, `4` every statement. Use `4` only for troubleshooting.

### TLS to PostgreSQL

The configuration has no TLS settings. The database driver reads the standard PostgreSQL
environment variables; set them in `extraEnvs`:

| Variable | Value |
| --- | --- |
| `PGSSLMODE` | `verify-full` in production. The server certificate must then be issued by a CA in `PGSSLROOTCERT` and be valid for `database.host` |
| `PGSSLROOTCERT` | File with the CA certificates (PEM) that issued the server certificate, or `system` to trust the CA certificates of the container image. With `system`, the Registry always verifies like `verify-full` |
| `PGSSLCERT`, `PGSSLKEY` | Client certificate and its unencrypted key (PEM), if the server requires a client certificate |

Host, port, database name, user and password always come from `config.database`.

```yaml
extraEnvs:
  - { name: PGSSLMODE, value: verify-full }
  - { name: PGSSLROOTCERT, value: /etc/credentials/database/ca.crt }
  - { name: PGSSLCERT, value: /etc/credentials/database/tls.crt }
  - { name: PGSSLKEY, value: /etc/credentials/database/tls.key }
```

## gRPC API

Section `config.grpcServer` of [values.yaml][values]. CMK, the CMK-2-Krypton Bridge and
your onboarding tooling call this API to register and change tenants, systems,
authentication settings and tenant configurations. The chart's values fit most
deployments:

- `address` is `:9092` and must match the container port `grpc`.
- `flags.health` must stay `true`: the readiness probe calls the gRPC health service.
- `flags.reflection` must stay `false` in production.
- `maxRecvMsgSize` limits requests to 4 MiB; the Registry's requests are small.
- `attributes`, `efPolMinTime` and `efPolPermitWithoutStream` control how long
  connections live and how keepalive pings are handled. The chart closes connections
  after about 30 minutes, so that clients spread over new replicas.
- `client` configures the internal client of the readiness check.

Make the API reachable only by its callers; see [Network access](#network-access).

## Orbital

Section `config.orbital` of [values.yaml][values]. Orbital delivers the jobs of a tenant
to the CMK of the tenant's region over AMQP 1.0: provisioning, blocking, unblocking and
terminating the tenant, applying and removing its authentication, and updating its
configuration.

1. A call such as `RegisterTenant` creates a job.
1. After `confirmJobAfter`, Orbital confirms the job and creates a task for the target
   whose `region` equals the tenant's region.
1. Orbital sends the task to the target's `target` address and reads the answer of CMK
   from its `source` address. Without an answer, it sends the task again.
1. When CMK reports the job as done, the tenant gets its new status, for example
   `STATUS_ACTIVE`. When CMK reports the job as failed, or Orbital gives up, the tenant
   gets an error status, for example `STATUS_PROVISIONING_ERROR`; see
   [Tenant statuses](/components/cmk/tenant-integration#tenant-statuses).

`taskLimitNum`, `maxPendingReconciles`, `backoffBaseIntervalSec` and
`backoffMaxIntervalSec` are required and must be greater than 0; the chart sets them.
They control how often a task is sent again:

- After the n-th send without an answer, the next send waits
  `backoffBaseIntervalSec` × 2^n seconds, at most `backoffMaxIntervalSec`. With the
  chart's values, `2` and `240`, the waits are 4 s, 8 s, 16 s and so on, up to 240 s.
- Every answer from CMK resets the count.
- After `maxPendingReconciles` sends without an answer, the task fails and the tenant
  gets an error status. With the chart's values this takes about 20 minutes.

### Targets

Configure one target in `orbital.targets` for each region that has a CMK:

- `region` is the region name, as used in `RegisterTenant`. A tenant's jobs go to the
  target whose `region` equals the tenant's region. Without a matching target, the job
  is canceled, the tenant gets an error status such as `STATUS_PROVISIONING_ERROR`, and
  the log shows `no matching orbital target manager found`.
- `connection.type` is `amqp`, the only type.
- `connection.amqp.url` is the broker URL. Use `amqps://host:port` (TLS, default port
  5671).
- `connection.amqp.target` is the address the Registry sends jobs to. It must equal the
  `source` of the region's CMK
  [`tenantManager.amqp`](/components/cmk/security/cmk-config#tenantmanager).
- `connection.amqp.source` is the address the Registry reads the answers from. It must
  equal the `target` of the region's CMK `tenantManager.amqp`.

Each region needs its own pair of addresses, for example `/queues/cmk.emea.tenants` for
the jobs and `/queues/cmk.emea.tenants.replies` for the answers of region `emea`.
Orbital does not declare queues: create them on the broker before the Registry starts.
The Registry connects to every target at startup and does not start if one cannot be
reached.

`connection.auth` sets how the Registry authenticates at the broker:

- `type: mtls` is required in production. The Registry presents the client certificate
  `certFile` (the certificate, then its intermediate CAs) with its unencrypted key
  `keyFile`, and authenticates with SASL EXTERNAL: the broker must accept
  certificate-based users and identify the Registry by this certificate. Use an
  `amqps://` URL; the broker must support TLS 1.2 or later.
- The Registry trusts only the CA certificates in `caFile` for the broker, not those of
  the container image. The broker certificate must be valid for the host name in `url`.
- The Registry reads the three files at startup. Restart it after you renew the
  certificate.
- `type: none` connects without credentials (SASL ANONYMOUS). Use it only for
  development brokers.

The chart's [values.yaml][values] documents the PEM formats of the files and how to
mount them from a Secret.

### Workers

`orbital.workers` tunes Orbital's background workers in each pod: `confirm-job`,
`create-task`, `reconcile` and `notify-event`. A listed worker needs `noOfWorkers`,
`execInterval` and `timeout`, each greater than 0. Workers that are not listed keep
Orbital's defaults: 5 workers, an `execInterval` of 10 s (`reconcile`: 5 s) and a
`timeout` of 5 s. The chart lists all four workers with 1 worker, an `execInterval` of
1 s and a `timeout` of 5 s, so that jobs start quickly.

## Validations

Section `config.validations` of [values.yaml][values]. Validations restrict the values
that callers may register, in addition to the Registry's built-in checks. Use them to
reject wrong registrations at once, for example a region that has no CMK, instead of
letting them fail later in a region.

Each entry names a field in `id` and lists one or more `constraints`; a value must pass
all of them:

```yaml
validations:
  - id: Tenant.OwnerType
    constraints:
      - type: list
        spec:
          allowList: ["customer", "partner"]
```

| Constraint `type` | `spec` | Checks |
| --- | --- | --- |
| `list` | `allowList` | The text value is one of the allowed values |
| `regex` | `pattern` | The text value matches the regular expression (Go RE2 syntax). For a list field, every element matches. Use `^…$` to match the whole value |
| `non-empty` | - | The text value is not empty |
| `non-empty-keys` | - | The map has no empty key |
| `non-empty-vals` | - | The map has no empty value |
| `map-keys` | `keys`: list of `name`, `required`, `constraints` | Rules per map key: `required: true` rejects a map without the key; `constraints` (`list`, `regex`, `non-empty`) check the key's value |

Each field takes only the constraint types that fit its kind of value:

| Kind | Constraint types | Field IDs |
| --- | --- | --- |
| Text | `list`, `regex`, `non-empty` | `Tenant.ID`, `Tenant.Name`, `Tenant.Region`, `Tenant.OwnerID`, `Tenant.OwnerType`, `Tenant.Role`, `System.ExternalID`, `System.Type`, `RegionalSystem.Region`, `RegionalSystem.Status`, `RegionalSystem.L2KeyID`, `Auth.ExternalID`, `Auth.TenantID`, `Auth.Type`, `Auth.Status`, `TenantConfig.TenantID` |
| List of text | `regex` | `Tenant.UserGroups` |
| Map of text | `non-empty-keys`, `non-empty-vals`, `map-keys` | `Tenant.Labels`, `RegionalSystem.Labels`, `Auth.Properties` |

- Any other combination rejects every value of the field with `value has wrong type`.
  For example, a `list` constraint on `Tenant.UserGroups` rejects every value.
- An `id` that names no known field stops the Registry at startup with `id must exist`,
  unless the entry sets `skipIfNotExists: true`.
- Several entries for the same `id` add up: all constraints apply.
- Rules for `Tenant` fields other than `Tenant.ID` apply to every later change of a
  tenant, including the status change after a tenant job. Before you tighten such a
  rule, make sure that the tenants registered earlier meet it; otherwise their changes
  are rejected.
- A `validations` list in your values replaces the chart's default rules, because Helm
  replaces lists. Repeat the default rules that you keep, as in the
  [example](#example).

Rules for a deployment with CMK. The chart sets the first four by default:

| Field | Rule | Why |
| --- | --- | --- |
| `Auth.Type` | `list` `["oidc"]` | CMK applies OpenID Connect settings only |
| `Auth.Properties` | `map-keys` with `issuer` required and `non-empty` | Every identity provider needs an issuer |
| `Tenant.UserGroups` | `regex` `^KMS_(TenantAdministrator\|TenantAuditor)_[A-Za-z0-9-]+$` | Matches the groups that CMK creates |
| `System.Type` | `list` `["system", "subaccount"]` | CMK accepts only these system types |
| `Tenant.Region` | `list` of your CMK regions | Rejects regions without an `orbital.targets` entry |
| `RegionalSystem.Region` | `list` of your system regions | Rejects system regions that no CMK serves; see [Connect a regional system](/components/cmk/system-integration) |
| `Tenant.ID` | `regex` `^[a-z0-9][a-z0-9-]{2,39}$` | Simple, predictable tenant IDs |

## Status, logs and telemetry

These sections are shared by all OpenKCM services and described in the
[CMK configuration reference](/components/cmk/security/cmk-config#audit-logger-status-telemetry).
The matching sections of the Registry's [values.yaml][values] are `config.status`,
`config.logger` and `config.telemetry`; the chart writes `config.environment` and
`config.labels` into the `application` block. For the Registry:

- `status.enabled` must stay `true`, with `status.address` `:8888`: the startup,
  liveness and readiness probes call `/probe/liveness` and `/probe/readiness` there.
  The Registry is ready when its gRPC health service and the database respond.
- `status.profiling` must stay `false` in production.
- `logger.level` is `info`; `debug` and `trace` log request details, so use them only
  for troubleshooting.
- `telemetry.metrics.prometheus.enabled: true`, together with `telemetry.metrics.enabled`,
  serves gRPC request and tenant metrics on `/metrics` of the status port.

## Network access

The Registry's gRPC API can create, block and terminate tenants and change their
identity providers. Configure the deployment so that only its callers reach it:

- Restrict the gRPC API (port 9092) to its callers with a NetworkPolicy
  (`networkPolicy.enabled: true`). Its callers are the CMK and the CMK-2-Krypton Bridge
  of every region, your tenant onboarding tooling, and your cloud services that register
  systems.
- Provide transport security for the gRPC API in the infrastructure: the Registry serves
  plain gRPC and its configuration has no TLS settings.
  - Callers in the same cluster connect through a service mesh that provides mutual TLS
    between the pods, and set `secretRef: { type: insecure }` in their own
    configuration, for example CMK in
    [`services.registry`](/components/cmk/security/cmk-config#services).
  - Callers in other clusters reach the Registry through a gateway or service mesh that
    terminates TLS and checks their client certificates.
- Keep the Service type `ClusterIP`, so that the gRPC port is not exposed outside the
  cluster, and keep gRPC reflection off.
- Allow the status port (8888) only for your metrics collector, with
  `networkPolicy.status.from`.
- Use `auth.type: mtls` for every broker connection in `orbital.targets`.

When CMK runs in the same cluster as the Registry, as in the installation examples,
select its pods by namespace and the label `app.kubernetes.io/part-of: cmk`, which every
CMK pod carries. Add selectors for your other callers:

```yaml
networkPolicy:
  enabled: true
  grpc:
    from:
      - namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: services } }
        podSelector: { matchLabels: { app.kubernetes.io/part-of: cmk } }
  status:
    from:
      - namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: monitoring } }
```

A NetworkPolicy cannot select pods in other clusters. Allow callers in other clusters,
for example the CMK of another region, with authorization policies of your service mesh
or with `ipBlock` rules.

See [Deployment planning](/components/cmk/deployment#network-layout) for the network
layout of all services.

## Troubleshooting

At startup, the Registry logs the cause and exits:

| Log message | Fix |
| --- | --- |
| `has invalid keys: <key>` | Remove or correct the key. With the chart, check for keys under `config` that are not Registry settings |
| `task limit number must be greater than zero`, `max pending reconcile count must be greater than zero`, `backoff base interval must be greater than zero`, `backoff max interval must be greater than zero` | Set the required `orbital` values |
| `region must not be empty`, `connection configuration is missing` | Complete each entry in `orbital.targets` |
| `connection type is not supported` | Set `connection.type: amqp` |
| `AMQP configuration is missing` | Add `connection.amqp` with `url`, `target` and `source` |
| `URL must not be empty`, `source must not be empty`, `target must not be empty` | Complete `connection.amqp` |
| `authentication type is not supported` | Set `connection.auth.type` to `mtls` |
| `authentication configuration is missing` | With `auth.type: mtls`, add `auth.mtls` |
| `CA file must not be empty`, `certificate file must not be empty`, `key file must not be empty` | Set `caFile`, `certFile` and `keyFile` in `auth.mtls` |
| `worker name is not supported`, `number of workers must be greater than zero`, `worker exec interval must be greater than zero`, `timeout must be greater than zero` | Use `confirm-job`, `create-task`, `reconcile` or `notify-event`, each with all three values |
| `failed to create AMQP client for <region>` | The broker of that target cannot be reached, a queue does not exist, or the broker rejects the client certificate. Check the URL, the queues, the certificate files and the broker's user for the certificate |
| `starting database` | The database cannot be reached, or the credentials or TLS settings are wrong |
| `id must exist: <id>` | A `validations` entry names an unknown field; check the field ID |
| `unknown constraint type` | Use one of the constraint types listed under [Validations](#validations) |

While the Registry runs:

| Symptom | Cause |
| --- | --- |
| The pod runs but never becomes ready | `grpcServer.flags.health` is `false`, or the database does not respond |
| A tenant gets an error status such as `STATUS_PROVISIONING_ERROR` soon after the call, and the log shows `no matching orbital target manager found` | No `orbital.targets` entry for the tenant's region. Add it, then repeat the call |
| A tenant stays in a status such as `STATUS_PROVISIONING` and later gets an error status | No CMK answers on the target of the tenant's region. Check that the region's CMK tenant manager reads the target's `target` address and answers on its `source` address |
| A call is rejected with a validation error, for example `validation failed for Tenant.Region` | The value breaks a rule in `validations`. `value has wrong type` means that the constraint type does not fit the field |

## See also

- [Install the Registry](/components/cmk/install-registry)
- [Registry](/components/cmk/registry)
- [Connect a regional tenant](/components/cmk/tenant-integration)
- [Connect a regional system](/components/cmk/system-integration)
- [CMK configuration reference](/components/cmk/security/cmk-config)
- [Deployment planning](/components/cmk/deployment)
- The Registry chart's [values.yaml][values] and [README][readme]

[values]: https://github.com/openkcm/registry/blob/main/charts/registry/values.yaml
[readme]: https://github.com/openkcm/registry/blob/main/charts/registry/README.md
