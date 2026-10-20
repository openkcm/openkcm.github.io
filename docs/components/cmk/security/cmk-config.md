# CMK configuration reference

This page describes how [CMK](/components/cmk/cmk-service) reads its configuration,
which settings need a decision, how CMK connects to the other OpenKCM services,
and how to diagnose configuration problems.

The Helm chart's [values.yaml](https://github.com/openkcm/cmk/blob/main/charts/cmk/values.yaml)
documents every key under `config`: its default, the allowed values, an example
and the processes that read it. This page refers to it by section, for example
`config.database`. For the end-to-end setup with ExtAuthZ, Session Manager and
Envoy Gateway, see the [regional installation guide](/components/cmk/security/configuration).

Settings marked as a *value reference* take `source: embedded | env | file`, and
settings marked as *credentials* take a `secretRef`. Both are described in
[Configuration conventions](/components/cmk/security/configuration#configuration-conventions);
the CMK specifics are below.

## How CMK reads its configuration

CMK is one binary, `cmkd`, that runs one process per subcommand. All processes
read the same configuration format.

| Aspect | Behaviour |
| --- | --- |
| File | `config.yaml`, parsed as YAML. The first file found is used; files are not merged |
| Search order | `/etc/cmk`, `.`, `$HOME/.cmk`. The **tenant manager** reads `/etc/tenant-manager`, then `.` |
| Key names | Case-insensitive |
| Map keys | Converted to lower case: `labels`, `featureGates`, `logger.formatter.fields.masking.other`, `plugins[].env` |
| Unknown keys | **Startup fails** with `has invalid keys: <key>` |
| Environment variables | Override keys that are present in the file. Name: process prefix, then the key path in capitals with `_` instead of `.` |
| Defaults | Applied to every key that is missing, empty or 0 |

Environment variable prefixes:

| Process | Prefix | Example |
| --- | --- | --- |
| `api-server` | `CMK_` | `CMK_DATABASE_PORT=5433` |
| `tenant-manager` | `TENANT_MANAGER_` | `TENANT_MANAGER_TENANTMANAGER_AMQP_URL=amqps://…` |
| `event-reconciler` | `EVENT_RECONCILER_` | |
| `task-scheduler` | `CMK_TASK_SCHEDULER_` | |
| `task-worker` | `CMK_TASK_WORKER_` | |
| `db-migrator` | `DB_MIGRATOR_` | |
| `cmkctl tenant`, in the cmkctl pod | `TENANT_MANAGER_CLI_` | |
| `cmkctl task`, in the cmkctl pod | `CMK_TASK_CLI_` | |

- An environment variable can only change a key that exists in the process's
  `config.yaml`; it cannot add one. The Helm chart writes every key that is set
  in `values.yaml` for the sections that a component reads.
- `extraEnvs` and `extraEnvsFrom` go to all components, and each process reads
  only its own prefix.
- `cmkctl sleep`, the command of the cmkctl pod, reads no environment overrides.
- The data migration 00006 reads `cryptoLayer` from the db-migrator ConfigMap,
  without environment overrides.
- Keep `enableServiceLinks: false` (the chart default). Otherwise Kubernetes adds
  variables for the Services of the namespace, and a Service named `cmk` adds
  variables with the `CMK_` prefix.

### Value references

- Use `source: file` for every password, key and token. `embedded` values are
  written into the ConfigMap.
- `format: binary` reads the whole file. A trailing newline is part of the value,
  so create password and token files without one, for example with
  `kubectl create secret generic cmk-valkey --from-literal=password='<password>'`.
  PEM files may end with a newline.
- `format: json` with `jsonPath` selects one string value of the JSON document.
  Write the path in dot notation from `$`, for example `$.password` or
  `$.auth.cert`; bracket notation is not supported. `jsonPath` works only with
  `format: json`; without it, and with `format: yaml`, the whole file is the value.
- `source: env` reads an environment variable of the container, which must not be
  empty.

### Connection security

Each connection accepts only some `secretRef` types:

| Connection | `secretRef.type` |
| --- | --- |
| `services.registry`, `services.sessionManager` | `insecure`, `mtls` |
| `scheduler.taskQueue` | `insecure`, `mtls` |
| `tenantManager`, `eventProcessor` | `insecure`, `mtls` |
| `telemetry` over gRPC | `insecure`, `mtls`, `api-token`, `basic` |
| `telemetry` over HTTP | `insecure`, `mtls`, `api-token` |

`audit.httpClient` takes its credentials directly; see
[audit, logger, status, telemetry](#audit-logger-status-telemetry).

Use `mtls` where the server terminates TLS. Use `insecure` only inside a service
mesh that provides mutual TLS between the pods. The PEM formats of the `mtls`
files are described under "secretRef" at the top of `config` in `values.yaml`.

### Checks at startup

Every process validates:

| Check | Error |
| --- | --- |
| Scheduler task types are known and listed once | `task type is unknown`, `task type is specified more than once` |
| `certificates.validityDays` between 7 and 30 | `certificate validity must not be outside 7 to 30 days` |
| `cryptoLayer.certX509Trusts` can be read and is a YAML list; each `commonNamePrefix` has at most 24 characters | `certificate common name prefix cannot exceed 24 characters` |
| `tenant.*Limit` at least 1 | `tenant limits systems must be at least 1`, likewise for `keys` and `key configs` |
| `configurableContext` is valid YAML | `failed to load configurable-context models` |

In addition:

| Process | Requires |
| --- | --- |
| `api-server` | The `clientData.signingKeysPath` directory |
| `tenant-manager` | `tenantManager` with `secretRef.type` `mtls` or `insecure` and `amqp.url`, `amqp.source` and `amqp.target`; `services.registry` and `services.sessionManager` enabled; every plugin loads |
| `task-scheduler` | `scheduler.taskQueue` with `secretRef.type` `mtls` or `insecure` |
| `task-worker` | `scheduler.taskQueue` as above; a `NotificationService` and a `SystemInformationService` plugin; `services.registry` enabled; every plugin loads |
| `api-server`, `tenant-manager`, `event-reconciler`, `task-worker` | With `featureFlags.enabled`, the feature flags file, as valid YAML |

Every configured plugin must load. The API server and the event reconciler log
`Failed to load plugin` when one does not: check the logs after every change to
`plugins`.

### When changes take effect

| What | After a change |
| --- | --- |
| Configuration file | Restart. The Helm chart restarts the pods of a component when its ConfigMap changes |
| Secrets and ConfigMaps that you mount yourself | Restart, for example `kubectl rollout restart deployment -l app.kubernetes.io/part-of=cmk` |
| Client data public keys | Picked up from the watched directory; restart the API server after you update the Secret, to be sure |
| `mtls` files of `services.registry` and `services.sessionManager` | Watched; CMK reconnects with the new files |
| Feature flags file | Read again every `featureFlags.pollingInterval`. The kubelet updates the mounted file after its sync delay; the pods are not restarted |
| Group-to-role mappings | Read from the database, refreshed every 120 seconds |

## Helm chart

The chart is in the
[cmk repository](https://github.com/openkcm/cmk/tree/main/charts/cmk). Its
[values.yaml](https://github.com/openkcm/cmk/blob/main/charts/cmk/values.yaml)
documents every value, and its
[README](https://github.com/openkcm/cmk/blob/main/charts/cmk/README.md) shows a
complete installation. The chart deploys one Deployment per process, all from
the same image (`ghcr.io/openkcm/cmk/images/cmk-full-plugins` by default), and
starts each with its subcommand:

| Component | Deployed when | Command | `config.yaml` mounted at |
| --- | --- | --- | --- |
| API server | `apiServer.deploy` | `/cmkd api-server` | `/etc/cmk/config.yaml` |
| Tenant manager | `tenantManager.deploy` | `/cmkd tenant-manager` | `/etc/tenant-manager/config.yaml` |
| Event reconciler | `eventReconciler.deploy` | `/cmkd event-reconciler` | `/etc/cmk/config.yaml` |
| Task scheduler | `taskScheduler.deploy` | `/cmkd task-scheduler` | `/etc/cmk/config.yaml` |
| Task worker | `taskWorker.deploy` | `/cmkd task-worker` | `/etc/cmk/config.yaml` |
| cmkctl (off by default) | `cmkctl.deploy` | `/cmkctl sleep` | `/etc/cmk/config.yaml` |
| Database migrations | `dbMigrator.enabled`, as Helm hook Jobs | `/cmkd db-migrator --target=all --type=schema` before, `--type=data` after every install and upgrade | `/etc/cmk/config.yaml` |

- Each component has its own ConfigMap with the sections of `config` that its
  process reads: `<fullname>-config` for the API server and
  `<fullname>-<component>-config` for the others. `<fullname>` is
  `<release>-cmk`, or the release name if it already contains `cmk`: a release
  named `cmk` gets `cmk-config`, `cmk-tenant-manager-config`, and so on. In
  `values.yaml`, the "Read by" line of each section names its processes.
- `config.yaml` is mounted as a single file (`subPath`), so the image's
  migrations in `/etc/cmk/migrations` stay visible. A configuration change
  restarts the affected pods.
- Replicas: `apiServer.replicaCount` or `apiServer.autoscaling` (use two or more
  in production), `tenantManager.replicaCount` or `tenantManager.autoscaling`,
  and `replicaCount` of the event reconciler and the task worker. The task
  scheduler always runs one replica.
- Ports: `http` 8081 (API server only), `http-status` 8888. Startup, liveness and
  readiness probes on `/probe/liveness` and `/probe/readiness`.
- `extraVolumes`, `extraVolumeMounts`, `extraEnvs` and `extraEnvsFrom` apply to
  **all** components and the migration Jobs. Every pod gets every mounted
  Secret; keep the list to what the components need.
- Mount Secrets read-only with `defaultMode: 0440`. All pods run as user and
  group 65532 with `fsGroup: 65532`, so the mounted files stay readable.
- The pods run with a read-only root filesystem and a writable `/tmp`, where
  plugins create their sockets.
- The image `cmk-full-plugins` contains the keystore plugins under
  `/etc/plugins/keystore` and the identity management plugins under
  `/etc/plugins/identity-management`.
- With `config.featureFlags.enabled`, set `featureFlagsConfigMap`; the chart
  fails to render without it. See [featureGates and featureFlags](#featuregates-and-featureflags).
- Deploy the cmkctl pod only while you need it: it holds all CMK credentials.
- The release notes printed by `helm install` and `helm upgrade` list the
  settings that are missing or not production-ready.

Chart versions before 0.2.0 differ: they do not start the processes on their
own, write fewer sections for most components, set the API server replicas with
the top-level `replicaCount` and `autoscaling`, and create immutable ConfigMaps.
Before you upgrade, read *Upgrading from 0.1.x* in the chart README. For a
release named `cmk`, delete the old immutable ConfigMaps first; the README lists
them.

## Minimal configuration

The values that every installation needs, with all components deployed. The
gRPC connections assume the Registry and Session Manager in the same cluster,
inside a service mesh with mutual TLS:

```yaml
config:
  clientData:
    signingKeysPath: /etc/signing-keys
    authContextFields: [issuer, client_id]

  services:
    registry:
      enabled: true
      address: registry.services.svc.cluster.local:9092
      secretRef: { type: insecure }     # inside a service mesh with mutual TLS
    sessionManager:
      enabled: true
      address: session-manager.services.svc.cluster.local:9091
      secretRef: { type: insecure }     # inside a service mesh with mutual TLS

  database:
    host: { value: postgresql.services.svc.cluster.local }
    user: { value: cmk }
    secret: { source: file, file: { path: /etc/credentials/database/password, format: binary } }
    parameters:
      ssl:
        mode: verify-full
        rootCert: /etc/credentials/database/ca.crt

  scheduler:
    taskQueue:
      host: { value: valkey-primary.storage.svc.cluster.local }   # host only
      port: "6379"
      secretRef:
        type: mtls
        mtls:
          cert:     { source: file, file: { path: /etc/credentials/mtls/tls.crt, format: binary } }
          certKey:  { source: file, file: { path: /etc/credentials/mtls/tls.key, format: binary } }
          serverCa: { source: file, file: { path: /etc/credentials/mtls/ca.crt, format: binary } }

  tenantManager:
    secretRef:
      type: mtls
      mtls:
        cert:     { source: file, file: { path: /etc/credentials/mtls/tls.crt, format: binary } }
        certKey:  { source: file, file: { path: /etc/credentials/mtls/tls.key, format: binary } }
        serverCa: { source: file, file: { path: /etc/credentials/mtls/ca.crt, format: binary } }
    amqp:
      url: amqps://rabbitmq.services.svc.cluster.local:5671
      source: /queues/cmk.emea.tenants
      target: /queues/cmk.emea.tenants.replies

  eventProcessor:
    secretRef:
      type: mtls
      mtls:
        cert:     { source: file, file: { path: /etc/credentials/mtls/tls.crt, format: binary } }
        certKey:  { source: file, file: { path: /etc/credentials/mtls/tls.key, format: binary } }
        serverCa: { source: file, file: { path: /etc/credentials/mtls/ca.crt, format: binary } }
    targets:
      - region: eu10
        amqp:
          url: amqps://rabbitmq.services.svc.cluster.local:5671
          target: /exchanges/cmk/eu10.requests
          source: /queues/cmk.eu10.replies

  plugins:
    - name: AWS
      type: KeystoreInstanceKeyOperation
      path: /etc/plugins/keystore/keystoreop-aws
      checksum: "<sha256 of the binary>"
      tags: [default_keystore, hyok]
      yamlConfiguration: |
        auth:
          method: perRequest
    - { name: noop, type: NotificationService }
    - { name: noop, type: SystemInformationService }

extraVolumes:
  - name: client-data-public-keys     # key1.pem, …
    secret: { secretName: cmk-client-data-public-keys, defaultMode: 0440 }
  - name: database                    # password, ca.crt
    secret: { secretName: cmk-database, defaultMode: 0440 }
  - name: mtls                        # tls.crt, tls.key, ca.crt
    secret: { secretName: cmk-mtls, defaultMode: 0440 }
extraVolumeMounts:
  - { name: client-data-public-keys, mountPath: /etc/signing-keys, readOnly: true }
  - { name: database, mountPath: /etc/credentials/database, readOnly: true }
  - { name: mtls, mountPath: /etc/credentials/mtls, readOnly: true }
```

| Section | Needed by | Details |
| --- | --- | --- |
| `clientData` | API server | [clientData](#clientdata) |
| `services` | Tenant manager (both), task worker (`registry`) | [services](#services) |
| `database` | All processes | [database](#database) |
| `scheduler.taskQueue` | Task scheduler and task worker; the API server and cmkctl add tasks | [scheduler](#scheduler) |
| `tenantManager` | Tenant manager | [tenantManager](#tenantmanager) |
| `eventProcessor` | Event reconciler | [eventProcessor](#eventprocessor) |
| `plugins` | API server, tenant manager, event reconciler, task worker, cmkctl | [plugins](#plugins) |

If you set `<component>.deploy: false`, the sections that only this component
reads are not needed. Decide in addition:

- The [landscape](#keystorepool-provisioning-and-landscape) name, region and UI
  URL, and the size of the keystore pool.
- The regional crypto layers in [cryptoLayer](#certificates-and-cryptolayer).
- Which key types tenants may use, in [featureGates and featureFlags](#featuregates-and-featureflags).
- The [tenant limits](#workflow-keys-and-tenant).
- An identity management plugin; see [CMK plugin configuration](/components/cmk/security/cmk-plugins).
- A `KeystoreProvider` plugin with the same `name` as the `default_keystore`
  plugin, for the keystore pool; see [plugins](#plugins).
- Where audit events, traces and metrics go, in
  [audit, logger, status, telemetry](#audit-logger-status-telemetry).

## clientData

Used by the API server to verify the [signed client data](/components/cmk/security/client-data)
from ExtAuthZ. See `config.clientData` in `values.yaml`.

- `signingKeysPath` is **required**: the directory with ExtAuthZ's **public**
  keys, one `<key ID>.pem` per key. Startup fails with `path does not exist` if
  it is missing.
- `authContextFields` lists the entries of the client data `auth_context` that
  CMK keeps and passes to the identity management plugin. **It must include
  `issuer`**: CMK lists the tenants of a user by the issuer of their identity
  provider. Also add every field that the `scim` plugin's `authContext` refers to
  (`hostField`, `headerFields`); see
  [per-tenant directories](/components/cmk/security/cmk-plugins#per-tenant-directories).

Key files and key IDs:

- CMK loads every file directly in `signingKeysPath` whose name ends with `.pem`
  and uses the file name without `.pem` as the key ID. Other files, such as a
  `keyId` file, and subdirectories are ignored.
- The key IDs must match ExtAuthZ's: ExtAuthZ signs with the private key named in
  its `keyId` file and writes that key ID into the client data as `kid`. Name
  each public key exactly like its private key, for example `key1.pem`; a file
  named `key1.pub.pem` gets the key ID `key1.pub`.
- Key files are PEM: `BEGIN PUBLIC KEY`, `BEGIN RSA PUBLIC KEY` or a certificate.
  Only `RS256` is accepted. Keep only public keys in the directory.
- Keep several public keys in the directory during a
  [key rotation](/components/cmk/security/client-data#key-rotation); the `kid` of
  each request selects one.
- The directory is read at startup and then watched. Restart the API server after
  you change the Secret, to be sure the change is used.
- Client data that is missing, signed with an unknown key ID, wrongly signed or
  expired is rejected with `500 NO_BUSINESS_DATA`. The log entry
  `Client data processing error` gives the reason.

Create the Secret from ExtAuthZ's private key `key1.pem`, under the same file
name:

```bash
openssl pkey -in key1.pem -pubout -out key1.pub.pem
kubectl -n services create secret generic cmk-client-data-public-keys \
  --from-file=key1.pem=key1.pub.pem
```

Mount it at `signingKeysPath`:

```yaml
extraVolumes:
  - name: client-data-public-keys
    secret:
      secretName: cmk-client-data-public-keys   # key1.pem, key2.pem: public keys only
      defaultMode: 0440
extraVolumeMounts:
  - name: client-data-public-keys
    mountPath: /etc/signing-keys
    readOnly: true
```

[Signed client data](/components/cmk/security/client-data#cmk-verification)
lists CMK's checks in order, with the log entry for each failure.

## services

Connections to the central [Registry](/components/cmk/registry), which all CMK
regions share, and to [Session Manager](/components/cmk/session-manager). See
`config.services` in `values.yaml`.

| Service | Used by |
| --- | --- |
| `sessionManager` | Tenant manager (required): writes, blocks and removes tenant trust records |
| `registry` | Tenant manager and task worker (required), API server and event reconciler |

- Each connection takes `enabled`, `address` (`host:port`), `secretRef` and
  `attributes` (gRPC keepalive). An enabled connection without `address` fails
  with `grpc address is empty`.
- `secretRef.type` is `insecure` or `mtls`; other types fail with
  `unsupported secret type`.
- The Registry and Session Manager rely on the service mesh for transport
  security. Run them and CMK in a service mesh with mutual TLS, and use
  `secretRef: { type: insecure }` for these connections.
- The examples on this page assume the Registry in the same cluster
  (`registry.services.svc.cluster.local:9092`). If it runs in another cluster,
  use the external address of a gateway that terminates TLS in front of it, with
  `secretRef.type: mtls`.
- With `mtls`, CMK watches the certificate files and reconnects when they
  change.

```yaml
services:
  registry:
    enabled: true
    address: registry.services.svc.cluster.local:9092
    secretRef: { type: insecure }       # inside a service mesh with mutual TLS
  sessionManager:
    enabled: true
    address: session-manager.services.svc.cluster.local:9091
    secretRef: { type: insecure }       # inside a service mesh with mutual TLS
```

Registry in another cluster, behind a gateway that terminates TLS:

```yaml
services:
  registry:
    enabled: true
    address: registry.central.example.com:443
    secretRef:
      type: mtls
      mtls:
        cert:     { source: file, file: { path: /etc/credentials/registry/tls.crt, format: binary } }
        certKey:  { source: file, file: { path: /etc/credentials/registry/tls.key, format: binary } }
        serverCa: { source: file, file: { path: /etc/credentials/registry/ca.crt, format: binary } }
```

## database

PostgreSQL, shared by all CMK processes. CMK keeps shared data in one schema and
creates one schema per tenant. See `config.database` and
`config.databaseReplicas` in `values.yaml`.

- `host`, `user` and `secret` (the password) are required value references.
  `port` and `name` default to `"5432"` and `cmk`.
- Keep `parameters.ssl.mode: verify-full` (the chart default) and set
  `parameters.ssl.rootCert` to the CA of the database server. `verify-full`
  checks the server certificate and the host name. When you write `config.yaml`
  without the chart, set `ssl.mode` explicitly.
- For client certificate authentication, set `parameters.ssl.cert` and
  `parameters.ssl.key`.
- The password must not contain spaces, quotes or backslashes.
- The tenant manager creates schemas, so the database user needs the `CREATE`
  privilege on the database.
- Keep the `migrator` directories at their defaults with the `cmk-full-*`
  images. With wrong paths, CMK logs `No migration files found, skipping` and
  creates empty tenant schemas.
- `databaseReplicas` lists read replicas, each with the fields of `database`
  except `migrator`. Read queries go to a random replica, writes to `database`;
  a lagging replica returns outdated data. All processes except the task
  scheduler read it.

## scheduler

Asynchronous and periodic tasks run through a Redis-compatible queue such as
Valkey: the task scheduler adds the periodic tasks, the task worker runs them,
and the API server and cmkctl add tasks on demand. See `config.scheduler` in
`values.yaml`.

- `taskQueue.host` is required and holds the host name only; the port is the
  separate key `taskQueue.port` (default `"6379"`). Session Manager's
  [`valkey.host`](/components/cmk/security/session-manager-config#valkey), in
  contrast, takes `host:port`.
- `taskQueue.secretRef.type` is `mtls` or `insecure`; other types fail with
  `unsupported secret type for task queue`. Use `mtls` unless a service mesh with
  mutual TLS carries the traffic.
- With `mtls`, CMK sends `acl.username` and `acl.password` only when
  `acl.enabled` is `true`. With `insecure`, it sends them whenever they are set.
- `tasks` changes the built-in schedule. Each entry names one `taskType` and
  changes only the keys it sets: `enabled`, `cronspec` (in UTC), `retries` and
  `fanOutTask`. Startup fails for an unknown task type or a second entry of the
  same type.

The task types are `sys:refresh`, `key:sync`, `keystore:fill`, `cert:rotate`,
`workflow:expire`, `workflow:cleanup` and `tenant:refresh-name`. Their default
schedules are listed in [Operations](/components/cmk/operations#scheduled-tasks).

```yaml
scheduler:
  taskQueue:
    host: { value: valkey-primary.storage.svc.cluster.local }
    port: "6379"
    acl:
      enabled: true
      username: { value: default }
      password: { source: file, file: { path: /etc/credentials/valkey/password, format: binary } }
    secretRef:
      type: mtls
      mtls:
        cert:     { source: file, file: { path: /etc/credentials/valkey/tls.crt, format: binary } }
        certKey:  { source: file, file: { path: /etc/credentials/valkey/tls.key, format: binary } }
        serverCa: { source: file, file: { path: /etc/credentials/valkey/ca.crt, format: binary } }
  tasks:
    - { taskType: key:sync, cronspec: "*/15 * * * *" }
    - { taskType: tenant:refresh-name, enabled: false }
```

## tenantManager

The tenant manager receives the jobs of this region's tenants from the central
Registry over AMQP: provision, apply and remove authentication, update the
tenant configuration, block, unblock and terminate. It is required when
`tenantManager.deploy` is `true`, the chart default. See `config.tenantManager`
in `values.yaml` and [Connect a regional tenant](/components/cmk/tenant-integration).

The queues connect CMK to the Registry's
[target for this region](/components/cmk/security/registry-config#targets):

| CMK `tenantManager` | Registry `orbital.targets[].connection.amqp` | Example for region `emea` |
| --- | --- | --- |
| `amqp.source`: CMK receives requests | `target` | `/queues/cmk.emea.tenants` |
| `amqp.target`: CMK sends replies | `source` | `/queues/cmk.emea.tenants.replies` |

- Every CMK region needs its own pair of queues. Do not share one request queue
  between regions: CMK does not check a tenant's region itself.
- Create the queues on the broker before CMK starts.
- `secretRef.type` is **required**: `mtls` (TLS with a client certificate and
  SASL EXTERNAL) or `insecure` (no client certificate).
- Use `amqps://` in `amqp.url` together with `secretRef.type: mtls`, and keep the
  URL free of a user name and password: CMK authenticates with the client
  certificate.
- `terminationTimeout` (default `48h`) is the time allowed for terminating a
  tenant. A termination that takes longer fails with `tenant termination timed out`.

```yaml
tenantManager:
  secretRef:
    type: mtls
    mtls:
      cert:     { source: file, file: { path: /etc/credentials/rabbitmq/tls.crt, format: binary } }
      certKey:  { source: file, file: { path: /etc/credentials/rabbitmq/tls.key, format: binary } }
      serverCa: { source: file, file: { path: /etc/credentials/rabbitmq-ca/ca.crt, format: binary } }
  amqp:
    url: amqps://rabbitmq.services.svc.cluster.local:5671
    source: /queues/cmk.emea.tenants           # = Registry target for region emea
    target: /queues/cmk.emea.tenants.replies   # = Registry source for region emea
```

## eventProcessor

The event reconciler sends key and system tasks over AMQP to the region of each
affected system, and retries them until the region answers. It is required when
`eventReconciler.deploy` is `true`, the chart default. See
`config.eventProcessor` in `values.yaml`.

- Add one entry to `targets` per system region, with all four keys: `region`,
  `amqp.url`, `amqp.target` (requests) and `amqp.source` (replies). `region` is
  the region of the systems in the Registry; see
  [Deployment](/components/cmk/deployment).
- Tasks for systems in a region without a target fail with
  `target not configured for region`.
- `secretRef` applies to all targets: `mtls` (TLS with a client certificate and
  SASL EXTERNAL) or `insecure`. Use `amqps://` URLs with `mtls`.
- `maxReconcileCount` (default 18) is the number of retries per task, with
  increasing backoff; 18 retries span about one day.

```yaml
eventProcessor:
  secretRef:
    type: mtls
    mtls:
      cert:     { source: file, file: { path: /etc/credentials/rabbitmq/tls.crt, format: binary } }
      certKey:  { source: file, file: { path: /etc/credentials/rabbitmq/tls.key, format: binary } }
      serverCa: { source: file, file: { path: /etc/credentials/rabbitmq-ca/ca.crt, format: binary } }
  targets:
    - region: eu10
      amqp:
        url: amqps://rabbitmq.services.svc.cluster.local:5671
        target: /exchanges/cmk/eu10.requests
        source: /queues/cmk.eu10.replies
```

## plugins

Each entry starts or selects one [plugin](/components/cmk/plugins). `plugins` is
required. Complete examples for every available plugin are in
[CMK plugin configuration](/components/cmk/security/cmk-plugins); see also
`config.plugins` in `values.yaml`.

| Field | Description |
| --- | --- |
| `name` | Plugin name. Selects a built-in plugin. Keys and keystores refer to their keystore plugin by name, and feature flag names contain it: keep it once in use |
| `type` | Plugin type, see below |
| `path` | Path of an external plugin binary. Empty selects the built-in plugin with this `name` and `type` |
| `checksum` | SHA-256 of the binary, hex-encoded. CMK checks it before it starts the binary |
| `yamlConfiguration` | Plugin-specific configuration, as a YAML string |
| `logLevel` | `trace`, `debug`, `info`, `warn`, `error` or `off` |
| `tags` | For `KeystoreInstanceKeyOperation` plugins: `default_keystore` marks the keystore for BYOK keys and the keystore pool; `hyok` offers the keystore for HYOK keys |
| `args`, `env` | Arguments and extra environment variables of an external plugin |
| `disabled` | `true`: do not load the plugin |
| `version` | Plugin API version. Only `1` (the default) is supported |

| Type | Allowed | Built-in |
| --- | --- | --- |
| `KeystoreInstanceKeyOperation` | any number | `noop` |
| `KeystoreProvider` | any number | `noop` |
| `IdentityManagementService` | at most one | `noop`, `scim` |
| `NotificationService` | at most one; required by the task worker | `noop` |
| `SystemInformationService` | at most one; required by the task worker | `noop` |
| `CertificateIssuerService` | at most one | `noop` |

- Tag exactly one `KeystoreInstanceKeyOperation` plugin with `default_keystore`.
- The `keystore:fill` task and a tenant's access to its default keystore use the
  `KeystoreProvider` plugin with the same `name` as the `default_keystore`
  plugin.
- Set `checksum` for every external plugin.
- Give plugins their credentials through files referenced in
  `yamlConfiguration`. Keep `extraEnvs` and `extraEnvsFrom` free of credentials
  that plugins should not see: plugin processes receive the pod's environment.
- Every configured plugin must load; check the logs for `Failed to load plugin`.
  The tenant manager and the task worker start only when every plugin loads and
  accepts its configuration.
- The API server and the tenant manager check each external plugin every 30
  seconds. After three failed checks in a row, they shut down with
  `Plugin health check threshold reached`, and Kubernetes restarts the pod.

```yaml
plugins:
  - name: AWS
    type: KeystoreInstanceKeyOperation
    path: /etc/plugins/keystore/keystoreop-aws
    checksum: "<sha256 of the binary>"
    tags: [default_keystore, hyok]
    logLevel: info
    yamlConfiguration: |
      # plugin-specific settings
  - name: scim
    type: IdentityManagementService
    yamlConfiguration: |
      # SCIM directory settings
  - { name: noop, type: NotificationService }
  - { name: noop, type: SystemInformationService }
```

## http

The CMK REST API, served by the API server only. See `config.http` in
`values.yaml`.

- `port` (default 8081) must match the `http` container port. The chart writes it
  as `http.address: ":<port>"`.
- Keep `swaggerEnabled: false` in production.

Fixed values: base path `/cmk/v1/{tenant}`, request body limit 1 MiB, read
timeout 10 seconds, write timeout 10 seconds, shutdown grace period 5 seconds,
security headers and a restrictive Content Security Policy. Envoy Gateway
terminates TLS in front of the API server.

## featureGates and featureFlags

Decide which kinds of keys tenants may use: BYOK keys in the default keystore,
and HYOK keys in a keystore of the customer. See `config.featureGates`,
`config.featureFlags` and `featureFlagsConfigMap` in `values.yaml`.

- **Feature gate**, fixed for the installation: `featureGates.allow-byok`
  (default `false`) allows BYOK keys. HYOK keys and rotation detection are
  allowed for every keystore.
- **Feature flags**, per keystore plugin, can change while CMK runs: set
  `featureFlags.enabled: true` and provide the flags file. The feature gate is
  then not used.

Feature flag names, where `<plugin>` is the `name` of a
`KeystoreInstanceKeyOperation` plugin in lower case (plugin `AWS`:
`enable_hyok_aws`):

| Flag | Effect |
| --- | --- |
| `enable_byok_<plugin>` | Allow BYOK keys; read for the `default_keystore` plugin |
| `enable_hyok_<plugin>` | Allow HYOK keys in this keystore; read for the `hyok` plugins |
| `detect_hyok_rotation_<plugin>` | Detect new key versions of HYOK keys in this keystore |

- A flag that is missing, invalid or disabled is off.
- Flags apply to all tenants; targeting rules and percentage rollouts are not
  evaluated.
- `featureFlagsConfigMap` names the ConfigMap with the file. It is required when
  `featureFlags.enabled` is `true`; the chart fails to render without it. The
  chart mounts it at the directory of `featureFlags.filePath`, so its key must be
  the file name (`flags.yaml` by default).
- A process does not start if the file is missing or is not valid YAML. A later
  change that cannot be read is logged, and the flags read before stay in use.
- cmkctl does not read the file; its commands see every flag as off.

```bash
kubectl -n services create configmap cmk-feature-flags --from-file=flags.yaml
```

```yaml
featureFlagsConfigMap: cmk-feature-flags
config:
  featureFlags:
    enabled: true
    filePath: /etc/featureflags/flags.yaml
```

```yaml
# flags.yaml
enable_byok_aws:
  variations: { enabled: true, disabled: false }
  defaultRule: { variation: disabled }
enable_hyok_aws:
  variations: { enabled: true, disabled: false }
  defaultRule: { variation: enabled }
```

## certificates and cryptoLayer

CMK requests a client certificate for each tenant from the
`CertificateIssuerService` plugin; the `cert:rotate` task renews them. See
`config.certificates` and `config.cryptoLayer` in `values.yaml`.

- `certificates.validityDays`: 7 to 30 days (default 30); startup fails outside
  this range. `rotationThresholdDays` sets how many days before expiry
  `cert:rotate` renews a certificate.
- `certificates.defaultTenantCertPrefix`: prefix of the common names
  `<prefix><tenant ID>` and `<prefix>byok-<tenant ID>`.
- `certificates.rootCertURL`: URL of the root CA certificate, returned with the
  tenants' HYOK client certificates.
- `certificates.disableHYOKCertAuth: true`: no client certificates for HYOK
  keystores; the keystore plugin authenticates with its own settings.

`cryptoLayer.certX509Trusts` is a value reference to a YAML list with one entry
per regional crypto layer: `name` (region), `rootCA` (URL) and `subject` with
`locality`, `country`, `organization`, `organizationUnit` and
`commonNamePrefix` (at most 24 characters). CMK grants each subject access to a
tenant's default keystore.

- Every process that reads `cryptoLayer` needs the file, the migration Jobs
  included. Without a readable file that holds a YAML list, the process does not
  start.
- The data migration 00006 reads `cryptoLayer` from the db-migrator ConfigMap,
  without environment overrides.

```yaml
config:
  cryptoLayer:
    certX509Trusts:
      source: file
      file: { path: /etc/cmk-crypto-layer/certX509Trusts.yaml, format: yaml }
extraVolumes:
  - { name: cmk-crypto-layer, configMap: { name: cmk-crypto-layer } }
extraVolumeMounts:
  - { name: cmk-crypto-layer, mountPath: /etc/cmk-crypto-layer, readOnly: true }
```

## keystorePool, provisioning and landscape

See `config.keystorePool`, `config.provisioning` and `config.landscape` in
`values.yaml`.

- `keystorePool.size`: number of prepared keystores that the `keystore:fill` task
  keeps in the pool (chart default 2). Tenants take their keystores from the
  pool.
- `keystorePool.supportedRegions`: regions of the keystores (`name`,
  `technicalName`), passed to the `KeystoreProvider` plugins.
- `provisioning.initKeystoreConfig` adds one keystore that was created outside
  CMK to the pool when an API server pod starts. `provider` is the `name` of the
  keystore plugins for it, and every field under `value` is required:
  `localityId`, `commonName`, `managementAccessData` (a YAML string) and
  `supportedRegions`.
- `landscape.name`: landscape name in notifications.
- `landscape.region`: region of this CMK installation. Shown in notifications,
  sent with key and system tasks, and the locality of new HYOK client
  certificates.
- `landscape.uiBaseUrl`: URL of the CMK UI for the links in workflow
  notifications, including its `#` and without a trailing slash, for example
  `https://ui.cmk.example.com/#`. CMK appends `/<tenant ID>/tasks/<workflow ID>`.
  Empty: notifications have no link.

::: warning Enable provisioning for the first start only
The API server adds the configured keystore to the pool each time a pod starts.

1. Install with `provisioning.initKeystoreConfig.enabled: true` and one API
   server replica (`apiServer.replicaCount: 1`, autoscaling disabled).
1. Wait until the API server has started.
1. Upgrade the release with `enabled: false`.
:::

## workflow, keys and tenant

Defaults for every tenant of this region. See `config.workflow`, `config.keys`
and `config.tenant` in `values.yaml`.

| Setting | Default | Description |
| --- | --- | --- |
| `tenant.systemLimit` | `50` | Systems linked to one key configuration. At least 1 |
| `tenant.keyLimit` | `10` | Keys of one key configuration, not counting deleted and detached keys. At least 1 |
| `tenant.keyConfigLimit` | `5` | Key configurations per tenant. At least 1 |

The Registry's `UpdateTenantConfig` overrides `systemLimit`, `keyLimit` and
`keyConfigLimit` for one tenant; see
[Change the tenant limits](/components/cmk/tenant-integration#step-5-optional-change-the-tenant-limits).

- `workflow` sets the approval workflow defaults for tenants without their own
  settings: `defaultMinimumApprovals` (2 to 5), `defaultRetentionPeriodDays`
  (7 to 30), `defaultExpiryPeriodDays`, and `defaultMaxExpiryPeriodDays`, the
  longest expiry a tenant can set (at most 7). `0` keeps CMK's default.
- `keys.pendingRegistrationTimeout` and `keys.pendingCreationTimeout` (default
  `15m`) move keys that stay pending to a final state.
- Chart versions before 0.2.0 do not write these sections; CMK's defaults apply
  there.

## configurableContext

Defines the system properties that CMK stores and shows in the CMK UI. Read by
the API server, the tenant manager, the task worker and cmkctl. See
`config.configurableContext` in `values.yaml`; its default is a complete
example.

- The value is YAML with a `system` map. `identifier`, `region` and `type` are
  built in; every other entry is an additional property, filled with the values
  that the `SystemInformationService` plugin returns for it.
- Each property takes `displayName`, `internal`, `optional` and `default`. The
  additional property whose `displayName` is `Name` is the system's name in the
  API and in workflows.
- List the properties that your `SystemInformationService` plugin returns.
- With a value that is not valid YAML, the process does not start. If CMK
  cannot load the value, it logs `No configurable context set` and stores no
  additional properties.

```yaml
config:
  configurableContext:
    source: file
    file: { path: /etc/cmk-context/system.yaml, format: yaml }
extraVolumes:
  - { name: cmk-context, configMap: { name: cmk-context } }
extraVolumeMounts:
  - { name: cmk-context, mountPath: /etc/cmk-context, readOnly: true }
```

## audit, logger, status, telemetry

All processes read `environment`, `labels`, `logger`, `status` and `telemetry`.
`audit` is read by the API server, the tenant manager, the event reconciler, the
task worker and cmkctl. See the sections of the same names in `values.yaml`.

| Section | What to set |
| --- | --- |
| `environment`, `labels` | Written as `application.environment` and `application.labels`, and attached to logs, traces and metrics. Set them so that several installations and regions can be told apart in a shared backend. The chart sets `application.name` per component |
| `audit` | `endpoint`: OTLP/HTTP logs endpoint, for example `https://otel-collector.observability.svc.cluster.local:4318/v1/logs`. Set it to deliver audit events. `httpClient`: `timeout` (default `10s`), `mtls`, and at most one of `apiToken`, `basicAuth` and `oauth2Auth`. `additionalProperties`: YAML map added to every event. See [Audit logging](/components/cmk/security/audit) |
| `logger` | Keep `level` at `info` in production; `debug` and `trace` log the configuration. `format`: `json` or `text`. `formatter.fields.masking.pii` and `.other` mask fields such as `email` |
| `status` | Keep `enabled: true`: the probes use the status server. `address` (`:8888`) must match the `http-status` port. Keep `profiling: false`, and enable it only for troubleshooting. The readiness probe checks the database |

`telemetry` exports traces, metrics and logs over OTLP. Each of `traces`,
`metrics` and `logs` takes:

- `enabled`, and `protocol`: `grpc` or `http`.
- `host`: the collector's `host:port`, without a scheme; a value reference.
- `url`: the URL path, for `protocol: http`. Empty sends traces to `/v1/traces`
  and metrics to `/v1/metrics`; set `/v1/logs` for logs.
- `secretRef`: `insecure`, `mtls` or `api-token`, and with `protocol: grpc` also
  `basic`. `api-token` sends `Authorization: Api-Token <token>`. Every type
  except `insecure` uses TLS.

With `metrics.prometheus.enabled`, metrics are served on `/metrics` of the status
port instead of being exported. `dynatraceOneAgent: true` adds the metadata of a
Dynatrace OneAgent on the node. Examples for a collector in the cluster and an
external collector are at `config.telemetry` in `values.yaml`.

## Groups and roles

The mapping of identity provider groups to CMK roles is managed in CMK, not in
the configuration. See
[CMK authorization](/components/cmk/security/cmk-authorization#groups-and-identity-provider-claims)
for the group names your identity provider must issue.

## Troubleshooting

| Symptom | Log message | Cause and fix |
| --- | --- | --- |
| Process does not start | `Config File "config" Not Found` | Wrong mount path. The tenant manager reads `/etc/tenant-manager` |
| Process does not start | `has invalid keys: <key>` | Unknown key, for example `workflows` instead of `workflow` |
| Process does not start | `failed to validate config` | One of the [checks at startup](#checks-at-startup) failed |
| Process does not start | `failed to load configurable-context models` | `configurableContext` is not valid YAML |
| Process does not start | `failed to create feature flag provider`, `failed to initialise feature flag provider` | The feature flags file is missing or not valid YAML. Check `featureFlagsConfigMap` and its key |
| Process does not start | `error loading database password` | Database secret file not mounted |
| Tenant manager does not start | `only insecure or mtls secrets are supported for tenant manager`, `AMQP URL must be specified` | `tenantManager` missing or incomplete |
| Tenant manager does not start | `Registry client is nil`, `session-manager client is nil` | `services.registry` or `services.sessionManager` not enabled |
| Tenant manager or task worker does not start | `grpc address is empty`, `unsupported secret type` | `services.<service>.address` missing, or `secretRef.type` is not `insecure` or `mtls` |
| Task worker does not start | `failed to load notification plugin`, `system information plugin not configured` | Add the required plugins |
| Task worker does not start | `failed to create registry client` | Enable `services.registry` |
| API server does not start | `creating data loader: path does not exist` | `clientData.signingKeysPath` not mounted |
| A plugin is not available | `Failed to load plugin` | Wrong plugin `type`, `name`, `path` or `checksum`; see [CMK plugin configuration](/components/cmk/security/cmk-plugins#troubleshooting) |
| Pod restarts | `Plugin health check threshold reached` | An external plugin stopped answering. Check the plugin's log entries |
| Tasks do not run | `unsupported secret type for task queue`, `failed to load MTLS config` | `scheduler.taskQueue.secretRef` wrong, or its files not mounted |
| Tenant jobs from the Registry are not processed | - | `tenantManager.amqp.source` is not the `target` of the Registry's entry for this region, or the queue does not exist |
| Systems not updated | `target not configured for region` | Add the region to `eventProcessor.targets` |
| Empty tenant schemas | `No migration files found, skipping` | Wrong `database.migrator` paths |
| No audit events | `failed to create audit logger`, `Failed to send audit log …` | Check `audit.endpoint` and the files of `audit.httpClient` |
| API `500 NO_BUSINESS_DATA` | `public key not found or invalid` | No `<kid>.pem` in `clientData.signingKeysPath` for ExtAuthZ's key ID, or the file is not an RSA public key |
| API `500 NO_BUSINESS_DATA` | `crypto/rsa: verification error` | The public key does not belong to ExtAuthZ's private key with the same key ID |
| API `500 NO_BUSINESS_DATA` | `client data has expired` | Clocks of ExtAuthZ and CMK differ by more than a minute |
| API `500 NO_BUSINESS_DATA` | `no client data header found` | The request did not pass ExtAuthZ. Route all API requests through Envoy Gateway |
| API `403 ZERO_ROLES_NOT_ALLOWED` | - | None of the user's groups is mapped to a role |
| API `403 MULTIPLE_ROLES_NOT_ALLOWED` | - | The user's groups map to different roles |
| Listing tenants fails | - | `issuer` missing from `clientData.authContextFields` |
| Authentication not applied | `missing required issuer property` | The tenant's `ApplyAuth` request has no `issuer` |

The chart README lists further installation problems, for example failed
upgrades of immutable ConfigMaps.

## See also

- [CMK Helm chart values.yaml](https://github.com/openkcm/cmk/blob/main/charts/cmk/values.yaml)
- [CMK Helm chart README](https://github.com/openkcm/cmk/blob/main/charts/cmk/README.md)
- [Install a regional deployment](/components/cmk/security/configuration)
- [CMK plugin configuration](/components/cmk/security/cmk-plugins)
- [Registry configuration reference](/components/cmk/security/registry-config)
- [CMK operations](/components/cmk/operations)
