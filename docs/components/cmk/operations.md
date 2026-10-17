# Operations

This page is for the team that runs CMK day to day. It describes the processes
and their health endpoints, the scheduled tasks, database migrations and
upgrades, monitoring, backups and the most common problems.

## Processes

All CMK processes run from the same image, as `cmkd <command>`.

| Command | What it does | Readiness checks |
| --- | --- | --- |
| `api-server` | Serves the CMK REST API on port 8081 | Database, HTTP port |
| `tenant-manager` | Receives tenant jobs from the Registry: create, block, unblock, terminate tenants, apply identity providers | Database |
| `event-reconciler` | Sends key and system tasks to the regions and processes their answers | Database |
| `task-scheduler` | Schedules the periodic tasks | Database |
| `task-worker` | Runs the scheduled and on-demand tasks | Database |
| `db-migrator` | Migrates the database; runs as Helm jobs | – |

Every process serves a status endpoint on port 8888:

| Path | Purpose |
| --- | --- |
| `/probe/liveness` | Liveness probe |
| `/probe/readiness` | Readiness probe; includes the database |
| `/version` | Build information |
| `/metrics` | Prometheus metrics, with `telemetry.metrics.enabled` and `telemetry.metrics.prometheus.enabled` |

Keep `status.profiling` switched off in production, and do not expose the status
port outside the cluster.

## Scheduled tasks

The task scheduler queues these tasks in Valkey or Redis, and the task workers
run them. You can change their schedules in `scheduler.tasks`; see the
[configuration reference](/components/cmk/security/cmk-config#scheduler).

| Task | Default schedule | Purpose |
| --- | --- | --- |
| `key:sync` | Every 5 minutes | Checks HYOK keys in the customers' keystores and propagates state changes and new versions |
| `sys:refresh` | Hourly | Refreshes system information |
| `keystore:fill` | Hourly | Keeps the keystore pool at its configured size |
| `cert:rotate` | Daily at 00:00 | Renews certificates that are about to expire |
| `workflow:expire` | Daily at 01:00 | Expires approval requests past their expiry date |
| `workflow:cleanup` | Daily at 02:00 | Deletes completed approval requests after their retention period |
| `tenant:refresh-name` | Daily at 03:00 | Copies tenant names from the Registry |

Run a task immediately with `cmkctl task invoke`; see [cmkctl](#cmkctl).

## Database migrations

CMK keeps shared tables in the `public` schema, the jobs and tasks of its
regional messaging in the `orbital` schema, and one schema per tenant.
`cmkd db-migrator` migrates them:

| Option | Values | Default |
| --- | --- | --- |
| `--type` | `schema` or `data` | `schema` |
| `--target` | `shared`, `tenant` or `all` | `all` |
| `--version` | Target version | Latest |
| `-r`, `--rollback` | Roll back one step, or to `--version` | – |

The Helm chart runs the migrations as hooks: schema migrations before an install
or upgrade, data migrations after it. With `--target all`, the shared schema is
migrated first, then every tenant schema. New tenants get the current schema
when they are created.

Migrating many tenants takes time. Allow for it in the Helm timeout of your
upgrades (`--timeout`) and, if you set it, in `dbMigrator.activeDeadlineSeconds`.
If you disable the jobs (`dbMigrator.enabled: false`), run `cmkd db-migrator`
yourself: schema migrations before, data migrations after every upgrade.

## Upgrades

1. Read the release notes of each service you upgrade; see [Releases](/releases/).
1. Back up the databases.
1. Upgrade one service at a time. Upgrade the Registry and Session Manager
   before CMK when a release requires it.
1. Watch the migration jobs. If the schema migration fails, the upgrade stops
   before the new version starts; fix the cause and run the upgrade again.
1. Read the *Upgrading* section of the chart README when you change the chart
   version. From CMK chart 0.1.x to 0.2.0, a release named `cmk` needs a
   one-time deletion of the old immutable ConfigMaps before the upgrade.

A Helm rollback does not roll back database migrations. To go back to an older
version, roll back the migrations with `cmkd db-migrator --rollback` first.

CMK reads its configuration only at startup. The Helm chart restarts the pods of
a component when its ConfigMap changes. After you change a Secret that you
mounted yourself, restart the processes:

```bash
kubectl -n services rollout restart deployment -l app.kubernetes.io/part-of=cmk
```

## Monitoring

| Signal | What to watch |
| --- | --- |
| Readiness | Processes that are not ready usually cannot reach the database |
| `keystore_pool_available` | The number of prepared keystores. When it reaches zero, new tenants wait for a keystore, and their first BYOK keys stay pending, until the pool is filled again |
| `pending_key_transitions_total` | Keys waiting for a state change |
| Systems in state `FAILED` | Regional services that did not complete a task; see [Connect a regional system](/components/cmk/system-integration) |
| Logs at level `error` | Failed tasks, plugin errors, broker connection problems |

Logs are JSON by default; set the level with `logger.level`. Traces and metrics
are exported over OTLP when `telemetry` is configured. Audit events go to the
OTLP endpoint in `audit.endpoint`; see [Audit logging](/components/cmk/security/audit).

## Backups

| Store | Contents | Back up |
| --- | --- | --- |
| CMK database | Tenants, keystore pool, every tenant's keys, key configurations, systems, approvals, groups; the jobs and tasks in flight | Yes, regularly |
| Registry database | Tenants, systems and their assignments | Yes |
| Session Manager database | Identity provider trust per tenant | Yes |
| Valkey or Redis | CMK's task queue and Session Manager's sessions | No; tasks are scheduled again, users sign in again |
| AMQP broker | Messages in flight | No; CMK resends unanswered tasks |

Key material is not in any of these stores: it stays in the keystores.

## cmkctl

`cmkctl` is the command-line tool for operators. Run it where it can reach the
CMK database and task queue. The Helm chart starts an idle pod for it with
`cmkctl.deploy: true`:

```bash
kubectl -n services exec deploy/cmk-cmkctl -- /cmkctl tenant list
```

The pod has the same credentials as the CMK processes. Set `cmkctl.deploy`
back to `false` when you are done.

| Command | Purpose |
| --- | --- |
| `cmkctl tenant list`, `cmkctl tenant get` | Show tenants |
| `cmkctl task invoke --task <task> [--tenants a,b]` | Run a scheduled task now, optionally for some tenants only |
| `cmkctl task queues`, `cmkctl task stats --queue <queue>` | Inspect the task queues |

Create, block and terminate tenants through the central Registry, not with
`cmkctl`: `cmkctl` writes only to the CMK database of its region, and the
Registry, Session Manager and the systems are not informed. See
[Connect a regional tenant](/components/cmk/tenant-integration).

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| A process does not start: `has invalid keys` | The configuration contains a key CMK does not know. Check spelling and nesting |
| A process does not start: certificate validity error | `certificates.validityDays` must be between 7 and 30 |
| The tenant manager does not start | Configure `tenantManager` (AMQP addresses and `secretRef` of type `mtls` or `insecure`) and enable both `services.registry` and `services.sessionManager` |
| The task scheduler or worker does not start: unsupported secret type | `scheduler.taskQueue.secretRef.type` must be `mtls` or `insecure` |
| The event reconciler exits: cannot create AMQP client | The broker of a region is unreachable or its URL is wrong |
| A process never becomes ready | The database is unreachable |
| Systems fail with `UNCONFIGURED_REGION` | Add an `eventProcessor.targets` entry for the region |
| Systems stay **Processing** and then fail | No regional service answers on that region's request address |
| A customer sees no systems | The systems are not registered for the tenant in the Registry, or their type is not `SYSTEM` or `SUBACCOUNT` |
| An upgrade hangs | The schema migration job is failing or still running. Check its logs |
| An upgrade fails with `field is immutable` on a ConfigMap | Immutable ConfigMaps from chart 0.1.x, or `config.isImmutable: true`. Delete the ConfigMaps and keep `config.isImmutable: false`; see the chart README |

The [CMK configuration reference](/components/cmk/security/cmk-config#troubleshooting)
lists further startup errors.

## See also

- [Deployment planning](/components/cmk/deployment)
- [Hardening checklist](/components/cmk/security/hardening)
- [CMK configuration reference](/components/cmk/security/cmk-config)
