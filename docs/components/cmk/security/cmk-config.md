# CMK configuration reference

This page describes the configuration of the [CMK](/components/cmk/cmk-service) service:
how it is loaded, every section, the security-relevant settings in detail, and
how to diagnose problems. For the end-to-end setup with ExtAuthZ, Session
Manager and Envoy Gateway, see the [configuration guide](/components/cmk/security/configuration).

Settings marked as a *value reference* take `source: embedded | env | file`, and
settings marked as *credentials* take a `secretRef`. Both are described in
[Configuration conventions](/components/cmk/security/configuration#configuration-conventions).

## How CMK reads its configuration

CMK is one binary, `cmkd`, that runs one process per subcommand. All processes
read the same configuration format.

| Aspect | Behaviour |
| --- | --- |
| File | `config.yaml`, parsed as YAML. The first file found is used; files are not merged |
| Search order | `/etc/cmk`, `.`, `$HOME/.cmk`. The **tenant manager** reads `/etc/tenant-manager`, then `.` |
| Key names | Case-insensitive |
| Unknown keys | **Startup fails** with `has invalid keys: <key>` |
| Environment variables | Override settings that are already present in the file. Name: process prefix, then the key path in capitals with `_` instead of `.` |
| Defaults | Applied to every setting that is missing or zero |

Environment variable prefixes:

| Process | Prefix | Example |
| --- | --- | --- |
| `api-server` | `CMK_` | `CMK_DATABASE_PORT=5433` |
| `tenant-manager` | `TENANT_MANAGER_` | `TENANT_MANAGER_TENANTMANAGER_AMQP_URL=amqps://…` |
| `event-reconciler` | `EVENT_RECONCILER_` | |
| `task-scheduler` | `CMK_TASK_SCHEDULER_` | |
| `task-worker` | `CMK_TASK_WORKER_` | |
| `db-migrator` | `DB_MIGRATOR_` | |

An environment variable can only change a setting that exists in the file; it
cannot add a new one. The Helm chart writes every setting listed in its
`values.yaml`, so `extraEnvs` can override any of them, but `extraEnvs` apply to
all components and each process reads only its own prefix.

### Checks at startup

Every process validates:

| Check | Error |
| --- | --- |
| Scheduler task types are known and listed once | `task type is unknown`, `task type is specified more than once` |
| `certificates.validityDays` between 7 and 30 | `certificate validity must not be outside 7 to 30 days` |
| `cryptoLayer.certX509Trusts` is valid YAML, each `commonNamePrefix` at most 24 characters | `certificate common name prefix cannot exceed 24 characters` |
| `tenant.*Limit` at least 1 | `tenant limits systems|keys|key configs must be at least 1` |

In addition:

| Process | Requires |
| --- | --- |
| `api-server` | The `clientData.signingKeysPath` directory. A plugin that fails to load stops the process |
| `tenant-manager` | `tenantManager` with `secretRef.type` `mtls` or `insecure` and `amqp.url`, `amqp.source` and `amqp.target`; `services.registry` and `services.sessionManager` enabled |
| `task-worker` | A `NotificationService` plugin, a `SystemInformationService` plugin and `services.registry` enabled |

### When changes take effect

| What | After a change |
| --- | --- |
| Configuration file | Restart. The Helm chart restarts the pods of a component when its ConfigMap changes |
| Secrets that you mount yourself | Restart, for example `kubectl rollout restart deployment -l app.kubernetes.io/part-of=cmk` |
| Client data public keys | Picked up from the watched directory; restart the pods after updating a Kubernetes Secret to be sure |
| Client certificates for Registry and Session Manager | Watched; the connection is rebuilt |
| Feature flags file | Polled every `featureFlags.pollingInterval` |
| Group-to-role mappings | Read from the database, refreshed every 120 seconds |

## Helm chart

The chart is in the
[cmk repository](https://github.com/openkcm/cmk/tree/main/charts/cmk). Its
`values.yaml` documents every value, and its README shows a complete installation.
It deploys one Deployment per process, all from the same image
(`cmk/images/cmk-full-plugins` by default), and starts each with its subcommand:

| Component | Deployed when | Command | Configuration mounted at |
| --- | --- | --- | --- |
| API server | `apiServer.deploy` | `/cmkd api-server` | `/etc/cmk/config.yaml` |
| Tenant manager | `tenantManager.deploy` | `/cmkd tenant-manager` | `/etc/tenant-manager/config.yaml` |
| Event reconciler | `eventReconciler.deploy` | `/cmkd event-reconciler` | `/etc/cmk/config.yaml` |
| Task scheduler | `taskScheduler.deploy` | `/cmkd task-scheduler`. Always one replica | `/etc/cmk/config.yaml` |
| Task worker | `taskWorker.deploy` | `/cmkd task-worker` | `/etc/cmk/config.yaml` |
| cmkctl (off by default) | `cmkctl.deploy` | `/cmkctl sleep` | `/etc/cmk/config.yaml` |
| Database migrations | `dbMigrator.enabled`, as Helm hook Jobs | `/cmkd db-migrator --type=schema` before, `--type=data` after every install and upgrade | `/etc/cmk/config.yaml` |

- Each component has its own ConfigMap: `<release>-cmk-config` for the API
  server and `<release>-cmk-<component>-config` for the others (for a release
  named `cmk`: `cmk-config`, `cmk-tenant-manager-config`, …). It writes the
  sections of `config` that its process reads into `config.yaml`; the chart's
  `values.yaml` names the readers of each section. Only the file is mounted, so
  the image's migrations in `/etc/cmk/migrations` stay visible. A configuration
  change restarts the affected pods.
- Ports: `http` 8081 (API server only), `http-status` 8888. Startup, liveness and
  readiness probes on `/probe/liveness` and `/probe/readiness`.
- `extraVolumes`, `extraVolumeMounts`, `extraEnvs` and `extraEnvsFrom` apply to
  **all** components and the migration Jobs. Every pod gets every mounted
  Secret; keep the list to what the components need.
- The pods run as a non-root user with a read-only root filesystem and a writable
  `/tmp`, where plugins create their sockets.
- The image `cmk-full-plugins` contains the keystore plugins under
  `/etc/plugins/keystore` and the identity management plugins under
  `/etc/plugins/identity-management`.
- The release notes printed by `helm install` and `helm upgrade` list the
  settings that are missing or not production-ready.

Chart versions before 0.2.0 differ: they do not start the processes on their own
(set `<component>.image.command: /cmkd` and `image.args: [<subcommand>]`), deploy
the event reconciler with `apiServer.deploy`, write fewer sections for most
components (`workflow`, `tenant`, `keys` and `databaseReplicas` are missing
everywhere, so CMK's defaults apply), create immutable ConfigMaps by default, and
their `values-dev.yaml` is not usable as an example. When you upgrade a release
named `cmk` from them, delete the old immutable ConfigMaps first; the chart
README's section *Upgrading from 0.1.x* lists them.

## Minimal configuration

The security-relevant part of the API server configuration:

```yaml
config:
  logger:
    level: info
  status:
    enabled: true
    profiling: false
  http:
    port: 8081                  # written as http.address: ":8081"
    swaggerEnabled: false

  clientData:
    signingKeysPath: /etc/signing-keys
    authContextFields: [issuer, client_id]

  services:
    sessionManager:
      enabled: true
      address: session-manager.services.svc.cluster.local:9091
      secretRef: { type: insecure }     # only inside a service mesh with mutual TLS
    registry:
      enabled: true
      address: registry.services.svc.cluster.local:9092
      secretRef: { type: insecure }

  database:
    host: { value: postgresql.services.svc.cluster.local }
    port: "5432"
    name: cmk
    user:   { source: file, file: { path: /etc/credentials/database/username, format: binary } }
    secret: { source: file, file: { path: /etc/credentials/database/password, format: binary } }
    parameters:
      ssl:
        mode: verify-full
        rootCert: /etc/credentials/database/ca.crt

  audit:
    endpoint: https://otel-collector.example.com/v1/logs
```

## clientData

Used by the API server to verify the [signed client data](/components/cmk/security/client-data)
from ExtAuthZ.

| Setting | Default | Description |
| --- | --- | --- |
| `signingKeysPath` | - | Directory with ExtAuthZ's **public** keys, one `<key ID>.pem` per key. **Required**: startup fails with `path does not exist` |
| `authContextFields` | - | Entries of the client data `auth_context` that CMK keeps. **Must include `issuer`**: CMK lists the tenants of a user by the issuer of their identity provider. The kept entries are also passed to the identity management plugin |

- CMK loads every file directly in `signingKeysPath` whose name ends with `.pem`
  and uses the file name without `.pem` as the key ID. Other files, such as a
  `keyId` file, and subdirectories are ignored.
- The key IDs must match ExtAuthZ's: ExtAuthZ signs with the private key named in
  its `keyId` file and writes that key ID into the client data as `kid`. Name
  each public key exactly like its private key, for example `key1.pem`; a file
  named `key1.pub.pem` gets the key ID `key1.pub`.
- Key files are PEM: `BEGIN PUBLIC KEY`, `BEGIN RSA PUBLIC KEY` or a certificate.
  Only `RS256` is accepted. The directory must never hold private keys.
- Keep several public keys in the directory during a
  [key rotation](/components/cmk/security/client-data#key-rotation); the `kid` of
  each request selects one.
- The directory is read at startup and then watched. Restart the API server after
  you change the Secret, to be sure the change is used.
- Client data that is missing, signed with an unknown key ID, wrongly signed or
  expired is rejected with `500 NO_BUSINESS_DATA`. The log entry
  `Client data processing error` gives the reason.

```yaml
clientData:
  signingKeysPath: /etc/signing-keys
  authContextFields:
    - issuer        # required
    - client_id
```

The public keys come from a Secret of their own:

```yaml
extraVolumes:
  - name: client-data-public-keys
    secret:
      secretName: cmk-client-data-public-keys   # key1.pem, key2.pem: public keys only
extraVolumeMounts:
  - name: client-data-public-keys
    mountPath: /etc/signing-keys
    readOnly: true
```

[Signed client data](/components/cmk/security/client-data#cmk-verification)
lists CMK's checks in order, with the log entry for each failure.

## services

Connections to the [Registry](/components/cmk/registry) and to
[Session Manager](/components/cmk/session-manager).

| Setting | Default | Description |
| --- | --- | --- |
| `<service>.enabled` | `false` | Enable the connection |
| `<service>.address` | - | `host:port`. Startup fails with `grpc address is empty` if missing |
| `<service>.secretRef` | - | `type: insecure` or `type: mtls` with `mtls.cert`, `mtls.certKey`, `mtls.serverCa` (or `mtls.rootCAs`) and optionally `mtls.attributes.serverName`. TLS 1.2 or later |
| `<service>.attributes.keepaliveTime`, `keepaliveTimeout` | `80s`, `40s` | Client keepalive |

| Service | Used by |
| --- | --- |
| `sessionManager` | Tenant manager (required): writes, blocks and removes tenant trust records |
| `registry` | Tenant manager and task worker (required), API server and event reconciler |

```yaml
services:
  sessionManager:
    enabled: true
    address: session-manager.services.svc.cluster.local:9091
    secretRef:
      type: mtls
      mtls:
        cert:     { source: file, file: { path: /etc/credentials/sm/tls.crt, format: binary } }
        certKey:  { source: file, file: { path: /etc/credentials/sm/tls.key, format: binary } }
        serverCa: { source: file, file: { path: /etc/credentials/sm/ca.crt, format: binary } }
```

## database

PostgreSQL. CMK creates one schema per tenant.

| Setting | Default | Description |
| --- | --- | --- |
| `host`, `user`, `secret` | - | Value references. `secret` is the password |
| `name`, `port` | - | Database name and port |
| `parameters.ssl.mode` | `prefer` | PostgreSQL `sslmode`. Use `verify-full` |
| `parameters.ssl.rootCert` | - | CA certificate file |
| `parameters.ssl.cert`, `parameters.ssl.key` | - | Client certificate and key files |
| `migrator.shared.schema`, `migrator.shared.data`, `migrator.tenant.schema`, `migrator.tenant.data` | - | Migration directories. The chart points them at `/etc/cmk/migrations/...` in the image |
| `databaseReplicas` | - | Read replicas, same fields as `database`. Read queries go to a random replica, writes to `database`; a lagging replica returns outdated data |

- With `mode: prefer` or an empty mode, the connection falls back to plain text
  and does not verify the server. `verify-ca` checks the certificate but not the
  host name.
- The values are written into the connection string without quoting. Use a
  password without spaces, quotes or backslashes.
- The tenant manager creates schemas, so the database user needs the `CREATE`
  privilege on the database.
- If the migration directories are wrong, CMK logs
  `No migration files found, skipping` and creates empty tenant schemas.

## scheduler

Asynchronous tasks run through a Redis-compatible queue such as Valkey.

| Setting | Default | Description |
| --- | --- | --- |
| `taskQueue.host` | - | Value reference |
| `taskQueue.port` | - | Port |
| `taskQueue.acl.enabled` | `false` | Use the ACL user name and password |
| `taskQueue.acl.username`, `taskQueue.acl.password` | - | Value references |
| `taskQueue.secretRef` | - | `insecure` (no TLS) or `mtls` (TLS with client certificate). Other types fail with `unsupported secret type for task queue` |
| `tasks` | built-in schedule | Overrides per task type |

With `insecure`, the ACL user name and password are sent without encryption,
even if `acl.enabled` is `false`. Use `mtls`.

Task types and default schedules:

| `taskType` | Default schedule | Purpose |
| --- | --- | --- |
| `sys:refresh` | hourly | Refresh system information |
| `key:sync` | every 5 minutes | Check the state of HYOK keys in the customer keystores |
| `keystore:fill` | hourly | Keep the keystore pool filled |
| `cert:rotate` | daily at 00:00 | Rotate certificates close to expiry |
| `workflow:expire` | daily at 01:00 | Expire approval workflows |
| `workflow:cleanup` | daily at 02:00 | Delete old workflows |
| `tenant:refresh-name` | daily at 03:00 | Refresh tenant names |

Each entry in `tasks` takes `taskType`, `enabled`, `cronspec`, `retries`
(default 3) and `fanOutTask.{enabled,retries,timeOut}`. All task types run on
their default schedule unless an entry disables them.

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
tenant configuration, block, unblock and terminate. Its `amqp.source` and
`amqp.target` must equal the `target` and `source` of the Registry's
[target for this region](/components/cmk/security/registry-config#targets):
CMK does not check a tenant's region itself. See
[Connect a regional tenant](/components/cmk/tenant-integration).

| Setting | Default | Description |
| --- | --- | --- |
| `secretRef` | - | `mtls` (TLS and certificate authentication) or `insecure`. **Required** |
| `amqp.url` | - | Broker URL. **Use `amqps://`**: with `amqp://` no TLS is used, even with `secretRef.type: mtls` |
| `amqp.source` | - | Address CMK receives requests from, for example `/queues/cmk.tenants.requests` |
| `amqp.target` | - | Address CMK sends replies to, for example `/exchanges/cmk/mesh.tenants` |
| `terminationTimeout` | `48h` | Time allowed for terminating a tenant |

Do not put a user name and password into `amqp.url`; they replace the
certificate authentication.

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
    source: /queues/cmk.tenants.requests
    target: /exchanges/cmk/mesh.tenants
```

## eventProcessor

The event reconciler sends key and system tasks to the regional systems over
AMQP.

| Setting | Default | Description |
| --- | --- | --- |
| `secretRef` | - | `mtls` enables TLS and certificate authentication; other types connect without |
| `targets[].region` | - | Region of the systems served by this target |
| `targets[].amqp.url` | - | Broker URL, `amqps://` |
| `targets[].amqp.target` | - | Address for requests |
| `targets[].amqp.source` | - | Address for replies |
| `maxReconcileCount` | `18` | Retries per task, with increasing backoff (about one day in total) |

Systems in a region without a target fail with `target not configured for
region`.

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

Each entry starts or selects one [plugin](/components/cmk/plugins). Complete
examples for every available plugin are in
[CMK plugin configuration](/components/cmk/security/cmk-plugins).

| Field | Description |
| --- | --- |
| `name` | Plugin name. Used to select a built-in plugin and in feature flag names |
| `type` | Plugin type, see below |
| `path` | Path of an external plugin binary. Empty selects a built-in plugin |
| `args`, `env` | Arguments and extra environment variables for the plugin process |
| `checksum` | SHA-256 of the binary, hex-encoded. If set, CMK refuses a binary that does not match |
| `yamlConfiguration` | Plugin-specific configuration, as a YAML string |
| `logLevel` | Log level of the plugin |
| `tags` | `default_keystore` marks the keystore for BYOK keys; `hyok` marks a keystore for HYOK keys |
| `disabled` | Skip the plugin |

| Type | Allowed | Built-in |
| --- | --- | --- |
| `KeystoreInstanceKeyOperation` | any number | `noop` |
| `KeystoreProvider` | any number | `noop` |
| `IdentityManagementService` | at most one | `noop`, `scim` |
| `NotificationService` | at most one; required by the task worker | `noop` |
| `SystemInformationService` | at most one; required by the task worker | `noop` |
| `CertificateIssuerService` | at most one | `noop` |

- Plugin processes inherit **all** environment variables of the CMK pod. Do not
  put credentials into the pod's environment that plugins should not see; pass
  plugin credentials through files referenced in `yamlConfiguration`.
- Set `checksum` for external plugins.
- CMK checks every plugin every 30 seconds and shuts down after three failed
  checks in a row.

```yaml
plugins:
  - name: AWS
    type: KeystoreInstanceKeyOperation
    path: /etc/plugins/keystore/keystoreop-aws
    checksum: "<sha256 of the binary>"
    tags: [default_keystore, hyok]
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

API server only.

| Setting | Default | Description |
| --- | --- | --- |
| `address` | `:8080` | Listen address. The chart writes `":<config.http.port>"`, by default `:8081` |
| `shutdownTimeout` | `5s` | Grace period at shutdown. The chart does not set it |
| `swaggerEnabled` | `false` | Serve the API description at `/cmk/v1/swagger`. Keep disabled in production; it is served without authentication |

Fixed values: base path `/cmk/v1/{tenant}`, request body limit 1 MiB, read
timeout 10 seconds, write timeout 10 seconds, security headers and a restrictive
Content Security Policy. The server does not terminate TLS.

## featureGates and featureFlags

| Setting | Default | Description |
| --- | --- | --- |
| `featureGates.allow-byok` | `false` | Allow BYOK keys, when feature flags are disabled |
| `featureFlags.enabled` | `false` | Use the feature flags file |
| `featureFlags.filePath` | `/etc/featureflags/flags.yaml` | Feature flags file |
| `featureFlags.pollingInterval` | `60s` | How often the file is re-read |

Feature flag names, where `<provider>` is the keystore plugin name in lower case:

| Flag | Effect |
| --- | --- |
| `enable_byok_<provider>` | Allow BYOK keys in this keystore |
| `enable_hyok_<provider>` | Allow HYOK keys in this keystore |
| `detect_hyok_rotation_<provider>` | Detect new key versions of HYOK keys |

When feature flags are disabled, HYOK keys and rotation detection are allowed
for all keystores, and BYOK follows `featureGates.allow-byok`. Flags apply to
all tenants; per-tenant targeting is not evaluated.

```yaml
featureFlags:
  enabled: true
  filePath: /etc/featureflags/flags.yaml
```

```yaml
# /etc/featureflags/flags.yaml
enable_hyok_aws:
  variations: { "on": true, "off": false }
  defaultRule: { variation: "on" }
```

## certificates and cryptoLayer

| Setting | Default | Description |
| --- | --- | --- |
| `certificates.validityDays` | `30` | Validity of certificates CMK requests. 7 to 30 |
| `certificates.rotationThresholdDays` | - | `cert:rotate` renews certificates that expire within this many days |
| `certificates.rootCertURL` | - | Root certificate URL returned with HYOK client certificates |
| `certificates.defaultTenantCertPrefix` | - | Prefix of the certificate common name |
| `certificates.disableHYOKCertAuth` | `false` | Do not issue client certificates for HYOK keystores |
| `cryptoLayer.certX509Trusts` | - | Value reference to a YAML list of trusted certificates: `name`, `rootCA`, `subject` (`commonNamePrefix` at most 24 characters) |

## keystorePool, provisioning and landscape

| Setting | Default | Description |
| --- | --- | --- |
| `keystorePool.size` | `5` (chart: `2`) | Number of prepared keystores that the `keystore:fill` task keeps in the pool |
| `keystorePool.interval` | `1h` (chart: `10m`) | How often the API server records the pool fill level metric. Must be greater than zero, otherwise the metric is not recorded |
| `keystorePool.supportedRegions` | - | Regions (`name`, `technicalName`), passed to keystore provider plugins |
| `provisioning.initKeystoreConfig` | disabled | Initial keystore that the API server adds to the pool at startup: `enabled`, `provider`, `value.localityId`, `value.commonName`, `value.managementAccessData`, `value.supportedRegions` |
| `landscape.name` | - | Landscape name in notifications |
| `landscape.uiBaseUrl` | - | CMK UI URL in notifications, ending with `#` |
| `landscape.region` | - | Region of this CMK instance. Used in notifications, as the default locality of client certificates, and sent with key and system tasks |

## workflow, keys and tenant

The `workflow` values are the defaults for tenants without their own workflow
settings; `0` keeps CMK's default. Helm chart versions before 0.2.0 do not
render these sections; CMK's defaults apply there.

| Setting | Default | Description |
| --- | --- | --- |
| `workflow.defaultMinimumApprovals` | `2` | Approvals required, 2 to 5. Higher values are reduced to 5 |
| `workflow.defaultRetentionPeriodDays` | `30` | Days that finished workflows are kept, 7 to 30. Values outside are moved into the range |
| `workflow.defaultExpiryPeriodDays` | `7` | Days after which an open workflow expires |
| `workflow.defaultMaxExpiryPeriodDays` | `7` | Maximum expiry a tenant can set. Higher values are reduced to 7 |
| `keys.pendingRegistrationTimeout`, `keys.pendingCreationTimeout` | `15m` | Timeouts for keys in pending states |
| `tenant.systemLimit` | `50` | Systems linked to one key configuration. At least 1 |
| `tenant.keyLimit` | `10` | Keys of one key configuration, not counting deleted and detached keys. At least 1 |
| `tenant.keyConfigLimit` | `5` | Key configurations per tenant. At least 1 |

These are the defaults for every tenant of the region. The Registry's
`UpdateTenantConfig` overrides `systemLimit` and `keyLimit` for one tenant; see
[Change the tenant limits](/components/cmk/tenant-integration#step-5-optional-change-the-tenant-limits).

## audit, logger, status, telemetry

| Section | Notes |
| --- | --- |
| `audit` | `endpoint`, `httpClient` (`timeout`, default `10s`, and credentials), `additionalProperties` (YAML map added to every event). Used by the API server, tenant manager, event reconciler, task worker and cmkctl. A failed delivery is logged (`Failed to send audit log …`) and does not fail the request; with an empty `endpoint` no event is delivered. If the audit logger cannot be created, CMK logs `audit logger not available, skipping audit event`. See [Audit logging](/components/cmk/security/audit) |
| `logger` | `level` (default `info`), `format` (`json` or `text`), `source` (add the source file and line), `formatter` (timestamp format, field names, masking). **At `debug` level, CMK logs its complete configuration**, including values embedded in it. Use `info` in production |
| `status` | `enabled`, `address` (`:8888`), `timeout` (readiness checks, `10s`), `profiling`. The readiness probe checks the database. Keep `profiling` disabled |
| `telemetry` | Traces, metrics and logs export, as for [ExtAuthZ](/components/cmk/security/extauthz-config#telemetry). With `metrics.prometheus.enabled`, metrics are served on `/metrics` of the status port instead of being exported. `dynatraceOneAgent` adds the OneAgent metadata |

## Groups and roles

The mapping of identity provider groups to CMK roles is managed in CMK, not in
the configuration. See [CMK authorization](/components/cmk/security/cmk-authorization#groups-and-identity-provider-claims)
for the group names your identity provider must issue.

## Troubleshooting

| Symptom | Log message | Cause and fix |
| --- | --- | --- |
| Process does not start | `Config File "config" Not Found` | Wrong mount path. The tenant manager reads `/etc/tenant-manager` |
| Process does not start | `has invalid keys: <key>` | Unknown key, for example `workflows` instead of `workflow` |
| Process does not start | `failed to validate config` | One of the [checks at startup](#checks-at-startup) failed |
| Tenant manager does not start | `only insecure or mtls secrets are supported for tenant manager`, `AMQP URL must be specified` | `tenantManager` missing or incomplete |
| Tenant manager does not start | `Registry client is nil`, `session-manager client is nil` | `services.registry` or `services.sessionManager` not enabled |
| Process does not start | `grpc address is empty` | `services.<service>.address` missing |
| Process does not start | `error loading database password` | Database secret file not mounted |
| Task worker does not start | `failed to load notification plugin`, `system information plugin not configured` | Add the required plugins |
| API server does not start | `creating data loader: path does not exist` | `clientData.signingKeysPath` not mounted |
| API server stops | `Failed to load plugin` | Wrong plugin `type`, `name`, `path` or `checksum` |
| Process stops | `Plugin health check threshold reached` | A plugin process failed |
| Tasks do not run | `unsupported secret type for task queue`, `failed to load MTLS config` | `scheduler.taskQueue.secretRef` wrong |
| Systems not updated | `target not configured for region` | Add the region to `eventProcessor.targets` |
| Empty tenant schemas | `No migration files found, skipping` | Wrong `database.migrator` paths |
| API `500 NO_BUSINESS_DATA` | `public key not found or invalid` | No `<kid>.pem` in `clientData.signingKeysPath` for ExtAuthZ's key ID, or the file is not an RSA public key |
| API `500 NO_BUSINESS_DATA` | `crypto/rsa: verification error` | The public key does not belong to ExtAuthZ's private key with the same key ID |
| API `500 NO_BUSINESS_DATA` | `client data has expired` | Clocks of ExtAuthZ and CMK differ by more than a minute |
| API `500 NO_BUSINESS_DATA` | `no client data header found` | The request did not pass ExtAuthZ |
| API `403 ZERO_ROLES_NOT_ALLOWED` | - | None of the user's groups is mapped to a role |
| API `403 MULTIPLE_ROLES_NOT_ALLOWED` | - | The user's groups map to different roles |
| Listing tenants fails | - | `issuer` missing from `clientData.authContextFields` |
| Authentication not applied | `missing required issuer property` | The tenant's `ApplyAuth` request has no `issuer` |
