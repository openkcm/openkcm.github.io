# Registry configuration reference

This page describes every configuration setting of the
[Registry](/components/cmk/registry), how the Registry applies it, and what
happens when it is wrong. The Registry runs once, in the central deployment.
It keeps the tenants and systems of all regions and sends tenant jobs to the
CMK of each region; see [Connect a regional tenant](/components/cmk/tenant-integration).

Settings marked as a *value reference* take `source: embedded | env | file`;
see [Configuration conventions](/components/cmk/security/configuration#configuration-conventions).

## How the Registry reads its configuration

| Aspect | Behaviour |
| --- | --- |
| File | `config.yaml`, parsed as YAML |
| Search order | `/etc/registry/`, then the working directory |
| Helm chart | Renders the whole `config` value into a ConfigMap named after the release (`registry-config` for a release named `registry`; with `configMap.immutable`, the name ends with a hash of the content) and mounts it at `/etc/registry` |
| Key names | Case-insensitive |
| Unknown keys | **Startup fails** with `has invalid keys: <key>` |
| Environment variables | Override settings that are present in the file. The name is the key path in upper case, with `_` for each dot and no prefix, for example `DATABASE_HOST` for `database.host` |
| Checks at startup | The `orbital` section is validated, and every `validations` entry must name a known field |

Configuration is read only at startup. The Helm chart 1.4.0 and later restarts
the pods when a value under `config` changes. After you change a Secret that
you mounted yourself, or with older charts, restart the Registry, for example
with `kubectl rollout restart`.

::: warning Environment variables without prefix
Because overrides have no prefix, any environment variable that matches a key
path overrides it. Kubernetes injects service-link variables such as
`DATABASE_PORT` for a Service named `database` in the same namespace. The Helm
chart 1.4.0 and later disables these variables (`pod.enableServiceLinks: false`);
with older charts, avoid such Service names in the Registry's namespace.
:::

### Helm chart

The chart is in the
[registry repository](https://github.com/openkcm/registry/tree/main/charts/registry);
its `values.yaml` documents every value. From chart version 1.4.0:

- Everything under `config` is written to `config.yaml`; chart settings such as
  `configMap.immutable` are kept outside `config`, because unknown keys stop the
  Registry at startup.
- A `checksum/config` annotation restarts the pods when the configuration
  changes.
- Startup, liveness and readiness probes, resource requests and a restrictive
  security context (non-root, read-only root filesystem) are set by default.
- `networkPolicy.enabled` creates a NetworkPolicy that admits only the listed
  callers of the gRPC API and the status port.
- The release notes warn about settings that are not production-ready.

The Service exposes the gRPC port (9092) and the status port (8888). Older chart
versions set no probes; set them as shown in
[status](#application-logger-status-and-telemetry).

## Example

A production configuration for two CMK regions:

```yaml
application:
  name: registry
  environment: production

database:
  host: postgresql.services.svc.cluster.local
  port: "5432"
  name: registry
  user:
    source: file
    file: { path: /etc/credentials/database/username, format: binary }
  password:
    source: file
    file: { path: /etc/credentials/database/password, format: binary }

grpcServer:
  address: :9092
  flags:
    health: true          # required for the readiness probe
    reflection: false

orbital:
  confirmJobAfter: 2s
  taskLimitNum: 10
  maxPendingReconciles: 10
  backoffBaseIntervalSec: 2
  backoffMaxIntervalSec: 240
  targets:
    - region: emea
      connection:
        type: amqp
        amqp:
          url: amqps://rabbitmq.services.svc.cluster.local:5671
          target: /queues/cmk.emea.tenants       # CMK tenant manager reads here
          source: /queues/cmk.global.tenants     # CMK tenant manager answers here
        auth:
          type: mtls
          mtls:
            certFile: /etc/credentials/rabbitmq/tls.crt
            keyFile: /etc/credentials/rabbitmq/tls.key
            caFile: /etc/credentials/rabbitmq-ca/ca.crt
    - region: us
      connection:
        type: amqp
        amqp:
          url: amqps://rabbitmq.services.svc.cluster.local:5671
          target: /queues/cmk.us.tenants
          source: /queues/cmk.global.tenants
        auth:
          type: mtls
          mtls:
            certFile: /etc/credentials/rabbitmq/tls.crt
            keyFile: /etc/credentials/rabbitmq/tls.key
            caFile: /etc/credentials/rabbitmq-ca/ca.crt

validations:
  - id: Tenant.Region
    constraints:
      - type: list
        spec: { allowList: ["emea", "us"] }
  - id: Auth.Type
    constraints:
      - type: list
        spec: { allowList: ["oidc"] }
  - id: System.Type
    constraints:
      - type: list
        spec: { allowList: ["system", "subaccount"] }

status:
  enabled: true
  address: :8888
  profiling: false

logger:
  level: info
  format: json
```

Set the database's TLS mode in the environment; see
[database](#database).

## database

| Setting | Default | Description |
| --- | --- | --- |
| `host` | - | PostgreSQL host |
| `port` | - | PostgreSQL port, as a string or number |
| `name` | - | Database name. Use a database of its own for the Registry |
| `user` | - | User name; value reference |
| `password` | - | Password; value reference |
| `logLevel` | `1` | SQL logging: `1` silent, `2` errors, `3` warnings, `4` all statements |

- The Registry creates and updates its tables itself when it starts, so its
  database user needs the right to change the schema.
- The configuration has no TLS settings. Set them through the standard
  PostgreSQL environment variables, which the database driver reads, for
  example in `extraEnvs` of the chart:

```yaml
extraEnvs:
  - name: PGSSLMODE
    value: verify-full
  - name: PGSSLROOTCERT
    value: /etc/credentials/database/ca.crt
```

## grpcServer

| Setting | Default | Description |
| --- | --- | --- |
| `address` | `:9092` | Listen address of the gRPC API |
| `flags.health` | `false` | Serve the gRPC health service. **Set to `true`**: the readiness probe uses it |
| `flags.reflection` | `false` | Serve gRPC reflection. Leave it off in production |
| `maxRecvMsgSize` | `125829120` (120 MiB) | Largest accepted request, in bytes. The Registry's requests are small; `4194304` (4 MiB) is plenty |
| `maxSendMsgSize` | `2147483647` | Largest response, in bytes |
| `attributes.maxConnectionIdle` | `1800s` | Close a connection that has been idle this long |
| `attributes.maxConnectionAge`, `attributes.maxConnectionAgeGrace` | `1800s`, `300s` | Close connections after this age, with a grace period for running calls |
| `attributes.time`, `attributes.timeout` | `120m`, `20s` | Server keepalive pings, and how long to wait for their answer |
| `efPolMinTime`, `efPolPermitWithoutStream` | `180s`, `false` | Minimum interval of client keepalive pings, and whether pings without active calls are allowed |
| `client.attributes.keepaliveTime`, `keepaliveTimeout` | - | Keepalive of the internal client that the readiness check uses |

The gRPC API has no authentication of its own. Make it reachable only by its
callers; see [Network access](#network-access).

## orbital

Orbital sends tenant jobs, such as provisioning, blocking or terminating a
tenant and applying its identity provider, to the CMK of the tenant's region,
and tracks the answers.

| Setting | Default | Description |
| --- | --- | --- |
| `confirmJobAfter` | `0` | Delay before a new job is confirmed and sent. A short delay, such as `2s`, gives the request that created the job time to finish |
| `taskLimitNum` | - | **Required**, greater than 0. Tasks processed per run |
| `maxPendingReconciles` | - | **Required**, greater than 0. Unanswered sends after which a task fails |
| `backoffBaseIntervalSec` | - | **Required**, greater than 0. First retry interval in seconds |
| `backoffMaxIntervalSec` | - | **Required**, greater than 0. Longest retry interval in seconds |
| `targets` | - | One entry per CMK region; see below |
| `workers` | Orbital defaults | Tuning of the background workers; see below |

### targets

Configure one target for each region that has a CMK. A tenant's jobs go to the
target whose `region` equals the tenant's region; without a matching target,
the tenant's jobs cannot be delivered.

| Setting | Description |
| --- | --- |
| `region` | Region name, as used in `RegisterTenant` |
| `connection.type` | `amqp`, the only supported type |
| `connection.amqp.url` | Broker URL. Use `amqps://` |
| `connection.amqp.target` | Address the Registry sends jobs to. Must equal the `source` of that region's CMK [`tenantManager.amqp`](/components/cmk/security/cmk-config#tenantmanager) |
| `connection.amqp.source` | Address the Registry reads answers from. Must equal the `target` of CMK's `tenantManager.amqp` |
| `connection.auth.type` | `mtls` or `none`. Use `mtls` in production |
| `connection.auth.mtls.certFile`, `keyFile`, `caFile` | Client certificate, key and CA for the broker. All three are required with `mtls` |

### workers

Each entry tunes one of Orbital's background workers. Workers that are not
listed keep Orbital's defaults.

| Setting | Description |
| --- | --- |
| `name` | `confirm-job`, `create-task`, `reconcile` or `notify-event` |
| `noOfWorkers` | Number of parallel workers, greater than 0 |
| `execInterval` | How often the worker runs, greater than 0 |
| `timeout` | Time limit of one run, greater than 0 |

```yaml
orbital:
  workers:
    - { name: confirm-job,  noOfWorkers: 1, execInterval: 1s, timeout: 5s }
    - { name: create-task,  noOfWorkers: 1, execInterval: 1s, timeout: 5s }
    - { name: reconcile,    noOfWorkers: 1, execInterval: 1s, timeout: 5s }
    - { name: notify-event, noOfWorkers: 1, execInterval: 1s, timeout: 5s }
```

## validations

Validations restrict the values that callers may register, in addition to the
built-in checks of the API. Each entry names a field and one or more
constraints; a request with a value that breaks a constraint is rejected.

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
| `list` | `allowList` | The value, or each value of a list, is one of the allowed values |
| `regex` | `pattern` | The value, or each value of a list, matches the regular expression (RE2 syntax) |
| `non-empty` | – | The value is not empty |
| `non-empty-keys` | – | No key of a map is empty |
| `non-empty-vals` | – | No value of a map is empty |
| `map-keys` | `keys`: list of `name`, `required`, `constraints` | Checks named keys of a map, for example `Auth.Properties` |

Fields that can be validated:

| Object | Field IDs |
| --- | --- |
| Tenant | `Tenant.ID`, `Tenant.Name`, `Tenant.Region`, `Tenant.OwnerID`, `Tenant.OwnerType`, `Tenant.Role`, `Tenant.Labels`, `Tenant.UserGroups` |
| System | `System.ExternalID`, `System.Type` |
| Regional system | `RegionalSystem.Region`, `RegionalSystem.Status`, `RegionalSystem.L2KeyID`, `RegionalSystem.Labels` |
| Authentication | `Auth.ExternalID`, `Auth.TenantID`, `Auth.Type`, `Auth.Properties`, `Auth.Status` |
| Tenant configuration | `TenantConfig.TenantID` |

- An `id` that names no known field stops the Registry at startup with
  `id must exist`, unless the entry sets `skipIfNotExists: true`.
- Several entries for the same `id` add up: all constraints apply.

Recommended rules for a deployment with CMK:

| Field | Recommended rule | Why |
| --- | --- | --- |
| `Tenant.ID` | `regex` `^[a-z0-9][a-z0-9-]{2,39}$` | Simple, predictable tenant IDs |
| `Tenant.Region`, `RegionalSystem.Region` | `list` of your regions | Rejects regions that no CMK serves |
| `System.Type` | `list` `["system", "subaccount"]` | CMK accepts only these system types |
| `Auth.Type` | `list` `["oidc"]` | CMK applies OpenID Connect settings |
| `Auth.Properties` | `map-keys` with `issuer` required and non-empty | Every identity provider needs an issuer |
| `Tenant.UserGroups` | `regex` `^KMS_(TenantAdministrator|TenantAuditor)_[A-Za-z0-9-]+$` | Matches the groups that CMK creates |

## application, logger, status and telemetry

These sections are shared by all OpenKCM services and described in the
[CMK configuration reference](/components/cmk/security/cmk-config#audit-logger-status-telemetry).
For the Registry:

| Setting | Recommended | Notes |
| --- | --- | --- |
| `application.name`, `application.environment` | `registry`, your environment | Attached to logs, traces and metrics |
| `status.address` | `:8888` | Serves `/probe/liveness`, `/probe/readiness` and, if enabled, `/metrics` |
| `status.profiling` | `false` | Keep profiling off in production |
| `logger.level` | `info` | `debug` logs request details |
| `logger.format` | `json` | |
| `telemetry.metrics.prometheus.enabled` | `true` if you scrape metrics | Exposes `grpc.request_count` and tenant metrics on `/metrics` |

Readiness reports ready when both the gRPC health service and the database
respond. The chart 1.4.0 and later sets these probes by default; with older
charts, set them yourself:

```yaml
livenessProbe:
  httpGet: { path: /probe/liveness, port: 8888 }
readinessProbe:
  httpGet: { path: /probe/readiness, port: 8888 }
```

## Network access

The Registry's gRPC API can create, block and terminate tenants and change
their identity providers. It has no authentication of its own, so restrict it:

- Make port 9092 reachable only by CMK, the CMK-2-Krypton Bridge and your tenant
  onboarding tooling, with a Kubernetes NetworkPolicy.
- Run the Registry in a service mesh with mutual TLS.
- Never expose the gRPC port outside the cluster, and keep reflection off.
- Use `mtls` for every broker connection.

See [Deployment planning](/components/cmk/deployment#network-layout) for all
services.

## Troubleshooting

| Startup error | Fix |
| --- | --- |
| `has invalid keys: <key>` | Remove or correct the key. With the chart, check for keys under `config` that are not Registry settings |
| `task limit number must be greater than zero`, `max pending reconcile count must be greater than zero`, `backoff … must be greater than zero` | Set the required `orbital` settings |
| `region must not be empty`, `connection configuration is missing` | Complete each entry in `orbital.targets` |
| `URL must not be empty`, `source must not be empty`, `target must not be empty` | Complete `connection.amqp` |
| `authentication type is not supported`, `CA file must not be empty` | Use `auth.type: mtls` with all three files, or `none` |
| `worker name is not supported` | Use `confirm-job`, `create-task`, `reconcile` or `notify-event` |
| `id must exist: <id>` | A `validations` entry names an unknown field; check the field ID |
| `unknown constraint type` | Use one of the constraint types listed above |
| `starting database` | The database is unreachable, or the credentials or TLS settings are wrong |

| Runtime symptom | Cause |
| --- | --- |
| Pod never ready | `grpcServer.flags.health` is `false`, or the database is unreachable |
| Tenant stays in a provisioning, blocking or terminating state | No `orbital.targets` entry for the tenant's region, or no CMK tenant manager answers on that target |
| `RegisterTenant` or `RegisterSystem` is rejected with a validation error | The value breaks a rule in `validations` |

## See also

- [Registry](/components/cmk/registry)
- [Connect a regional system](/components/cmk/system-integration)
- [CMK configuration reference](/components/cmk/security/cmk-config)
- [Deployment planning](/components/cmk/deployment)
