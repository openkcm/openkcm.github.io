# Session Manager configuration reference

This page describes how [Session Manager](/components/cmk/session-manager) reads its
configuration, the settings that every installation must decide, the requirements on identity
providers and tenant trust records, and how to diagnose problems. For the end-to-end setup, see
the [regional installation guide](/components/cmk/security/configuration). For the HTTP exchanges in
detail, see the [request walkthrough](/components/cmk/security/walkthrough).

The Helm chart's [values.yaml][values] documents every key under `config`, with its default and
an example of each alternative. The chart's [README][readme] shows a complete installation.
This page names settings by their path under `config`, for example `valkey.host` for
`config.valkey.host` in `values.yaml`.

Settings marked as a *value reference* take `source: embedded | env | file`, and settings
marked as *credentials* take a `secretRef`. Both are described in
[Configuration conventions](/components/cmk/security/configuration#configuration-conventions).

## How Session Manager reads its configuration

| Aspect | Behaviour |
| --- | --- |
| File | `config.yaml`, parsed as YAML |
| Locations | `/etc/session-manager/config.yaml`, then `config.yaml` in the working directory. If both exist, values from the second override the first |
| Unknown keys | Ignored without a warning. Write every key exactly as in `values.yaml`, with the same spelling, case and nesting |
| Duplicate keys | Startup fails with `mapping key "<key>" already defined` |
| Defaults | Applied to every setting that is missing or zero |
| Environment variables | Cannot override settings. Use a value reference with `source: env`. The PostgreSQL client reads the standard `PG*` variables, see [database](#database) |
| Referenced files | Read at startup only, like the configuration itself |

### Processes

The same image and configuration run three processes:

| Process | Command | Reads | Stops at startup if |
| --- | --- | --- | --- |
| API server | `session-manager api-server` | Every section except `housekeeper` | A value reference cannot be read, Valkey is not reachable, the database schema is not current, the CSRF secret is shorter than 32 bytes, or a listener cannot be opened |
| Housekeeper | `session-manager housekeeper` | Every section except `http`, `grpc`, `migrate`, `apps` and `appsOrder` | A value reference cannot be read, or Valkey is not reachable |
| Migration | `session-manager migrate` | `logger`, `database`, `migrate` and `sessionManager.clientAuth.clientID` | The database is not reachable, or a migration fails |

### When changes take effect

| What | After a change |
| --- | --- |
| `config` | The chart restarts the API server and housekeeper pods during `helm upgrade`. Chart versions before 0.11.0 restart only the API server: **restart the housekeeper yourself** |
| Secrets, such as the CSRF secret and the client credentials | Restart the API server and the housekeeper, for example with `kubectl rollout restart` |
| Tenant trust records | Immediately; they are read from the database on every login and session check |
| Identity provider discovery documents | Cached for 30 minutes per issuer |
| Token introspection results | Cached for 30 seconds per access token |

## Helm chart

The chart is in the `charts/session-manager` directory of the
[session-manager repository](https://github.com/openkcm/session-manager). Chart 0.11.0 and
later render every key under `config` into `config.yaml`, run as a non-root user with a
read-only root filesystem, and ship no example credentials.

| Resource | Details |
| --- | --- |
| API server Deployment | Ports `http` 8080, `grpc` 9091 and `http-status` 8888. Liveness probe on `/probe/liveness`. The readiness probe is a TCP check of the `grpc` port, which opens after the API server has connected to Valkey and checked the database schema |
| Housekeeper Deployment | One replica, updated with `RollingUpdate`, `maxSurge: 0` and `maxUnavailable: 1`: the old pod stops before the new one starts. Probes on `/probe/liveness` and `/probe/readiness` of the status port |
| Migration Job | Runs as a Helm `pre-install` and `pre-upgrade` hook, with its own hook copy of the configuration |
| ConfigMap | Rendered from the `config` value and mounted with `subPath` as `/etc/session-manager/config.yaml` in all three workloads |
| Service | Exposes 8080, 8888 and 9091 |
| NetworkPolicy | Optional (`networkPolicy.enabled`): admits only the peers you list for the sign-in endpoints, the gRPC API and the status port |

All three workloads mount the same `extraVolumes` at the same `extraVolumeMounts` and receive
the same `extraEnvs`, so value references with `source: file` and `source: env` work in every
process. Chart versions before 0.11.0 pass no environment variables to the housekeeper and the
migration job; with them, use `source: file` for all value references.

Session Manager stops at once on `SIGTERM`, which Kubernetes sends to stop a pod. The
`shutdownTimeout` settings apply only to `SIGINT`. Give the API server a short `preStop` pause
so that load balancers remove the pod before it stops (Kubernetes 1.30 or later):

```yaml
lifecycle:
  preStop:
    sleep:
      seconds: 5
```

### Secrets and files

Put every credential into a Secret and refer to the mounted file with `source: file`:

- Create the Secrets before `helm install`. The migration job runs first and does not start
  without them.
- Mount them read-only with `extraVolumes` and `extraVolumeMounts`. The pods run as user and
  group 65532 with `fsGroup: 65532`, so the files are readable with `defaultMode: 0440`.
- Write plain-text files without a trailing newline: with `format: binary`, a newline is part
  of the value. `kubectl create secret generic --from-literal` adds none.
- Restart the pods after a Secret changes.

The examples on this page use this layout below `/etc/credentials`. The `extraVolumes` section
of [values.yaml][values] shows how to create the Secrets and documents the format of each
file.

```yaml
extraVolumes:
  - name: credentials
    projected:
      defaultMode: 0440
      sources:
        - secret:
            name: session-manager-database
            items:
              - { key: password, path: database/password }
              - { key: ca.crt, path: database/ca.crt }
        - secret:
            name: session-manager-valkey
            items:
              - { key: password, path: valkey/password }
              - { key: tls.crt, path: valkey/tls.crt }
              - { key: tls.key, path: valkey/tls.key }
              - { key: ca.crt, path: valkey/ca.crt }
        - secret:
            name: session-manager-oidc-client
            items:
              - { key: client-secret, path: client-auth/client-secret }
        - secret:
            name: csrf-secret                  # the same Secret as ExtAuthZ's
            items:
              - { key: csrf_secret, path: csrf-secret/csrf_secret }
extraVolumeMounts:
  - name: credentials
    mountPath: /etc/credentials
    readOnly: true
```

### Settings for every installation

| Setting | Requirement |
| --- | --- |
| `database.host`, `database.user`, `database.password` | **Required.** Use `source: file` for the password |
| `valkey.host` | **Required.** `host:port` |
| `valkey.user`, `valkey.password` | Set them if Valkey requires authentication. Use `source: file` for the password |
| `valkey.secretRef` | Use `type: mtls` in production, unless a service mesh encrypts the traffic |
| `sessionManager.callbackURL` | **Required.** The public HTTPS URL of `/sm/callback` |
| `sessionManager.allowedRedirectBaseURLs` | **Required.** The URL of the CMK UI, ending with `/` |
| `sessionManager.csrfSecret` | **Required.** At least 32 bytes, **the same as ExtAuthZ's `csrfSecret`** |
| `sessionManager.clientAuth` | The client credentials, and `clientID` for a new installation |
| `sessionManager.csrfCookieTemplate.domain` | The parent domain of the UI and API hosts |
| `audit.endpoint` | The collector that receives the audit events of sign-ins |
| `PGSSLMODE`, `PGSSLROOTCERT` in `extraEnvs` | `verify-full` and the CA certificate of PostgreSQL |
| `networkPolicy` (chart value) | Enabled, with Envoy Gateway as the only peer on `http`, and ExtAuthZ and CMK on `grpc` |

The release notes printed by `helm install` and `helm upgrade` list the settings that are
missing or not production-ready.

Chart versions before 0.11.0 render only fixed sections of `config` and drop other keys, such
as `appsOrder`. They mount the configuration in `/etc/<chart name>`, so do not set
`nameOverride` with them. They also contain example values for the CSRF secret, the client
credentials and the URLs, and enable gRPC reflection: replace all of them.

## Minimal configuration

A values file for the chart, with the files of [Secrets and files](#secrets-and-files). All
other settings keep the chart's defaults, including the listen addresses, the cookie templates
and the gRPC services in `apps`:

```yaml
replicaCount: 2

networkPolicy:
  enabled: true
  http:
    from:
      - namespaceSelector:
          matchLabels: { kubernetes.io/metadata.name: envoy-gateway-system }
  grpc:
    from:
      - namespaceSelector:
          matchLabels: { kubernetes.io/metadata.name: envoy-gateway-system }
        podSelector:
          matchLabels: { app.kubernetes.io/name: extauthz }
      - podSelector:
          matchLabels: { app.kubernetes.io/part-of: cmk }

extraEnvs:
  - { name: PGSSLMODE, value: verify-full }
  - { name: PGSSLROOTCERT, value: /etc/credentials/database/ca.crt }

config:
  database:
    host: { value: postgresql.services.svc.cluster.local }
    user: { value: session_manager }
    password:
      source: file
      file: { path: /etc/credentials/database/password, format: binary }

  valkey:
    host: { value: valkey-primary.storage.svc.cluster.local:6379 }
    password:
      source: file
      file: { path: /etc/credentials/valkey/password, format: binary }
    secretRef:
      type: mtls
      mtls:
        cert:     { source: file, file: { path: /etc/credentials/valkey/tls.crt, format: binary } }
        certKey:  { source: file, file: { path: /etc/credentials/valkey/tls.key, format: binary } }
        serverCa: { source: file, file: { path: /etc/credentials/valkey/ca.crt, format: binary } }

  sessionManager:
    callbackURL: https://api.example.com/sm/callback
    allowedRedirectBaseURLs:
      - https://ui.example.com/
    csrfSecret:                 # the same secret as ExtAuthZ's csrfSecret
      source: file
      file: { path: /etc/credentials/csrf-secret/csrf_secret, format: binary }
    clientAuth:
      type: client_secret
      clientID: cmk-session-manager
      clientSecret:
        source: file
        file: { path: /etc/credentials/client-auth/client-secret, format: binary }
    csrfCookieTemplate:
      domain: example.com

  audit:
    endpoint: https://otel-collector.observability.svc:4318/v1/logs
```

To run Session Manager without the chart, render the complete `config.yaml` from these values
with `helm template` and use it as a starting point.

## http

The HTTP server of the `/sm/*` sign-in endpoints. See `config.http` in [values.yaml][values].

- `address` must match the `http` container port. An address of the form `unix:///<path>`
  listens on a Unix socket.
- Publish the endpoints through Envoy Gateway, which terminates TLS.
- `shutdownTimeout` is how long open requests may finish when Session Manager stops on
  `SIGINT`. For pods, use a `preStop` hook instead, see [Helm chart](#helm-chart).

## grpc

The gRPC server that ExtAuthZ and CMK call. It runs only if `apps` contains an entry with
`module: app.module.grpcserver`, see [apps](#apps). See `config.grpc` in [values.yaml][values]
for the message size and keepalive settings.

- `address` must match the `grpc` container port (`:9091` in the chart) and the address that
  ExtAuthZ and CMK use. Without the chart, the default is `:9092`.
- Set `flags.health: true` and, in production, `flags.reflection: false`.
- `shutdownTimeout` applies only on `SIGINT`, like `http.shutdownTimeout`.
- `enabled` and `maxSendMsgSize` have no effect.

The gRPC API has no TLS settings of its own: ExtAuthZ and CMK connect to it inside the cluster
with `secretRef: { type: insecure }`. It also changes tenant trust records. Therefore:

- Run Session Manager, ExtAuthZ and CMK in a service mesh with mutual TLS.
- Admit only ExtAuthZ and CMK to the `grpc` port, with the chart's `networkPolicy.grpc.from`
  or with the authorization policies of the service mesh. Select all CMK pods with
  `app.kubernetes.io/part-of: cmk`: the CMK component that calls Session Manager, the tenant
  manager, has the label `app.kubernetes.io/name: cmk-tenant-manager`.

## database

PostgreSQL holds the tenant trust records. See `config.database` in [values.yaml][values].

- `host`, `user` and `password` are value references; `port` is a string such as `"5432"`.
- Session Manager writes `host`, `port`, `name`, `user` and `password` into a PostgreSQL
  connection string without quoting. None of them may contain spaces, backslashes or single
  quotes.

The configuration has no TLS settings. The PostgreSQL client reads them from environment
variables, which you set in `extraEnvs`:

| Variable | Value |
| --- | --- |
| `PGSSLMODE` | `verify-full` in production: TLS is required, and the server certificate must be issued for `host` by a trusted CA |
| `PGSSLROOTCERT` | Path of the CA certificates (PEM) that may sign the server certificate, or `system` for the CA certificates of the image |
| `PGSSLCERT`, `PGSSLKEY` | Client certificate and its unencrypted private key (PEM), if PostgreSQL requires one |

```yaml
extraEnvs:
  - { name: PGSSLMODE, value: verify-full }
  - { name: PGSSLROOTCERT, value: /etc/credentials/database/ca.crt }
  - { name: PGSSLCERT, value: /etc/credentials/database/tls.crt }
  - { name: PGSSLKEY, value: /etc/credentials/database/tls.key }
```

The migration job must have run before the API server starts. The API server checks the
schema version and stops with `DB schema version mismatch` otherwise.

## valkey

Valkey holds the pending sign-ins and the sessions, including the users' access and refresh
tokens. See `config.valkey` in [values.yaml][values].

- `host` is a value reference with `host:port`; the port is required. One address is a
  standalone Valkey or a node of a Valkey cluster. Several addresses, separated by commas, are
  nodes of a Valkey cluster or the Sentinels.
- `user` and `password` are value references. An empty `user` is the default user.
- `prefix` is the prefix of all keys; a trailing `:` is removed. Give every installation that
  shares a Valkey its own prefix.
- `secretRef`: use `type: mtls` with an `mtls` block in production, unless a service mesh
  encrypts the traffic between the pods.
- `masterSet` selects Valkey Sentinel: `host` then lists the Sentinels, and `user`, `password`
  and `secretRef` apply to the Sentinels as well. `topologyRefreshInterval` also asks the
  Sentinels for the current master at this interval.

Session Manager connects to Valkey at startup and stops with `creating valkey client` if it
cannot.

### Keys in Valkey

| Key | Content | Lifetime |
| --- | --- | --- |
| `<prefix>:state:<state>` | Pending login: tenant, PKCE verifier, return URLs | `sessionDuration` |
| `<prefix>:session:<session ID>` | Session: user, groups, tokens, CSRF token | Until the session expires, `sessionDuration` after login |
| `<prefix>:active:<session ID>` | Marker that the session is in use | `idleSessionTimeout`, renewed on every session check |
| `<prefix>:accessToken:accessToken_<session ID>` | Access token | Until the session expires |
| `<prefix>:refreshToken:refreshToken_<session ID>` | Refresh token | Until the session expires |
| `<prefix>:providerSession:providerSession_<sid>` | Maps the identity provider's session ID to the session | Until the session expires |

## sessionManager

### Sessions and redirects

See `config.sessionManager` in [values.yaml][values] for the defaults.

| Setting | Description |
| --- | --- |
| `callbackURL` | **Required.** Absolute public URL of the callback endpoint, for example `https://api.example.com/sm/callback`. Sent to the identity providers as `redirect_uri`; register it at each of them. The endpoint itself is always served at `/sm/callback` |
| `allowedRedirectBaseURLs` | **Required.** Allowed beginnings of `request_uri`, `error_uri` and `post_logout_redirect_uri`, see below. Without an entry for the CMK UI, its logins and logouts fail with `400` |
| `sessionDuration` | Maximum session lifetime. Also the lifetime of a pending login |
| `idleSessionTimeout` | A session ends after this time without API requests |
| `allowHttpScheme` | Accept identity providers served over `http`. Keep `false`; for local development only |
| `csrfSecret` | **Required.** Value reference. **At least 32 bytes**, or the API server does not start. **Must be the same secret as ExtAuthZ's `csrfSecret`**, see below |

::: danger csrfSecret is shared with ExtAuthZ
Session Manager and ExtAuthZ **must use the same CSRF secret**: Session Manager's
`sessionManager.csrfSecret` and ExtAuthZ's `csrfSecret` must contain exactly the same bytes.
Session Manager creates the CSRF token with this secret when the user signs in, and ExtAuthZ
checks the token with its own copy on every API call. If the secrets differ, users can sign in
but every API call from the CMK UI fails with `401` and `CSRF token is not valid`. See
[Shared CSRF secret](/components/cmk/security/configuration#shared-csrf-secret).
:::

Session Manager compares each entry of `allowedRedirectBaseURLs` with the beginning of the
requested URL, character by character and case-sensitively:

- Always end entries with `/`, for example `https://ui.example.com/`.
- Write the scheme and host of the CMK UI exactly as the browser shows them, in lowercase.
- Never add `/` or other short prefixes on their own.

| Entry | Requested URL | Result |
| --- | --- | --- |
| `https://ui.example.com/` | `https://ui.example.com/#/acme/keys` | Allowed |
| `https://ui.example.com/` | `https://UI.example.com/` | Rejected (case) |

### Cookie templates

The three cookies are configured with templates that share these fields:

| Field | Description |
| --- | --- |
| `name` | Cookie name. Session and CSRF cookie names get `-<tenant ID>` appended |
| `path` | Cookie path |
| `domain` | Cookie domain. Must be empty for names that start with `__Host-` |
| `maxAge` | Lifetime in seconds. `0` makes it a browser-session cookie |
| `secure` | Send only over HTTPS |
| `httpOnly` | Hide from JavaScript |
| `sameSite` | Exactly `Lax`, `Strict` or `None`, with this capitalization. Session Manager sets the attribute only for these values |

Recommended values:

| Template | `name` | `path` | `domain` | `secure` | `httpOnly` | `sameSite` |
| --- | --- | --- | --- | --- | --- | --- |
| `sessionCookieTemplate` | `__Host-Http-SESSION` (required by ExtAuthZ) | `/` | empty | `true` | `true` | `None`, or `Lax` if UI and API share a registrable domain |
| `csrfCookieTemplate` | `CSRF` (required by the CMK UI) | `/` | parent domain of UI and API | `true` | `false` | `Strict` |
| `loginCSRFCookieTemplate` | empty (defaults to `__Host-LoginCSRF`) | `/` | empty | `true` | `true` | `Lax` |

The chart's defaults are these values, except `csrfCookieTemplate.domain`, which you set. The
login CSRF cookie must be `Lax`: it has to be sent when the identity provider redirects the
browser back to `/sm/callback`.

Session Manager logs a warning, but does not fail, if the session cookie name does not start
with `__Host-Http-`, or a cookie is not `Secure` or `HttpOnly` as expected. With the
recommended login CSRF cookie, it logs `CSRF cookie is marked as HttpOnly` and
`not marked as SameSite=Strict` on every login; these two warnings are expected.

### clientAuth

How Session Manager authenticates to the identity providers when it exchanges the
authorization code, refreshes tokens and introspects access tokens. The same credentials are
used for all tenants; the client ID comes from each tenant's trust record. See
`config.sessionManager.clientAuth` in [values.yaml][values] for an example of each type.

| Setting | Description |
| --- | --- |
| `type` | `client_secret` (the chart's default) or `client_secret_post`, with `clientSecret`; `mtls`, with `mTLS`; `insecure`, for local development only (logs a warning). Without the chart, the default is `mtls` |
| `clientSecret` | Value reference, for `client_secret` and `client_secret_post` |
| `mTLS` | Client certificate for `type: mtls`: `cert`, `certKey`, optionally `serverCa` and `rootCAs` to verify the identity provider. Written `mTLS` here, `mtls` in other sections. Startup fails with `missing mTLS configuration` if `type` is `mtls` and this block is missing |
| `mTLS.attributes` | Optional: `serverName` (expected server name), `sessionTicketsDisabled` (do not resume TLS sessions), `allowTLSRenegotiationOnce` (accept one TLS renegotiation by the server) |
| `allowTLSRenegotiationOnce` | Deprecated. Use `mTLS.attributes.allowTLSRenegotiationOnce` |
| `clientID` | Deprecated. Read only by database migration 5, which copies it into existing trust records and fails if it is empty. That migration runs once: on a new installation, or on the first upgrade to a release that contains it. Set the client ID registered at your identity provider |

- `client_secret` and `client_secret_post` behave the same: the code exchange first sends the
  credentials with HTTP basic authentication and falls back to the request body; the token
  refresh and the introspection send them in the body.
- With `mtls`, the client certificate is used on every connection to the identity providers,
  and the client ID is sent without a secret.

Example of `mtls`, with the files mounted below `/etc/credentials/client-auth` like the Valkey
files:

```yaml
config:
  sessionManager:
    clientAuth:
      type: mtls
      clientID: cmk-session-manager
      mTLS:                     # mTLS here, mtls in other sections
        cert:
          source: file
          file: { path: /etc/credentials/client-auth/tls.crt, format: binary }
        certKey:
          source: file
          file: { path: /etc/credentials/client-auth/tls.key, format: binary }
        serverCa:
          source: file
          file: { path: /etc/credentials/client-auth/ca.crt, format: binary }
        attributes:
          allowTLSRenegotiationOnce: true
```

## housekeeper

The housekeeper deletes sessions whose `active` marker has expired and refreshes access tokens
that are about to expire. It runs once at startup and then every `triggerInterval`. See
`config.housekeeper` in [values.yaml][values] for the defaults.

- Run exactly one housekeeper per installation.
- Set `concurrencyLimit`, the number of sessions processed in parallel, to at least 1.
- Keep `tokenRefreshTriggerInterval` at least as long as `triggerInterval`: access tokens that
  expire within `tokenRefreshTriggerInterval` are refreshed.

## Modules

Session Manager is built from modules. The sections `database`, `valkey`, `trust`,
`credentials` and `migrate` select theirs with `module` and, for `trust` and `migrate`,
`dbModule`. The defaults in `values.yaml` are the only modules built into Session Manager:
keep them.

### apps

`apps` defines the long-running components of the API server, keyed by a name you choose:

- Configure exactly one entry with `module: app.module.grpcserver`, the gRPC server configured
  in `grpc`. Without it, ExtAuthZ and CMK cannot reach Session Manager, and the readiness probe
  of the API server fails.
- List at least one service under `services`, and each service module at most once. Startup
  fails otherwise.
- `appsOrder` optionally lists app names in start order. Startup fails if a name is not in
  `apps`.

| Service module | Called by | Options |
| --- | --- | --- |
| `service.module.grpc.session` | ExtAuthZ: session checks (`GetSession`) and identity provider lookups (`GetOIDCProvider`) | `allowHttpScheme`: accept token introspection endpoints over `http`; keep `false`, for local development only. `trust`, `sessionStore`, `credentials`: the modules it uses |
| `service.module.grpc.trustmapping` | CMK's tenant manager: apply, block, unblock and remove tenant trust records | `trust` |
| `service.module.grpc.oidcmapping` | CMK releases that use the older `oidcmapping` API for the same operations | `trust` |

List `session` and `trustmapping`. Keep `oidcmapping` as long as a CMK release that uses the
older API may call Session Manager. The chart's default lists all three:

```yaml
config:
  apps:
    grpc:
      module: app.module.grpcserver
      services:
        - module: service.module.grpc.session
        - module: service.module.grpc.trustmapping
        - module: service.module.grpc.oidcmapping
```

## Identity provider requirements

Each tenant's identity provider must meet these requirements:

| Requirement | Detail |
| --- | --- |
| Discovery | `<issuer>/.well-known/openid-configuration` reachable over HTTPS. Its `issuer` must equal the trust record's issuer exactly, including any trailing `/` |
| Endpoints | `authorization_endpoint`, `token_endpoint` and `jwks_uri`. `introspection_endpoint`, where Session Manager checks the access token on every session check. `end_session_endpoint` for logout at the identity provider |
| Client | Authorization code flow with PKCE (`S256`). Redirect URI = `callbackURL`. Client authentication as configured in `clientAuth` |
| Scopes | `openid`, `profile`, `email` and `groups` are always requested. The provider must accept the `groups` scope |
| ID token | Signed with an algorithm listed in `id_token_signing_alg_values_supported`, with a `kid` in the header. `iss` = trust issuer, `aud` contains the trust client ID |
| Claims | `sub`, `email`, `given_name`, `family_name` and `groups` (an array of strings). Optional: `sid` for back-channel logout |
| Refresh tokens | Needed if sessions should outlive the access token |

The signing keys are taken from the discovery document's `jwks_uri`, not from the trust
record.

## Tenant trust records

Session Manager stores one trust record per tenant in PostgreSQL. CMK creates and updates the
records when it processes the tenant's authentication settings from the
[Registry](/components/cmk/registry); see
[Onboard a tenant](/components/cmk/security/configuration#step-8-onboard-a-tenant).

| Field | Used by | Effect |
| --- | --- | --- |
| `tenant_id` | All | Key of the record |
| `issuer` | Session Manager, ExtAuthZ | Discovery base URL; must match the ID token `iss` and the token `iss` for API clients |
| `client_id` | Session Manager, ExtAuthZ | Client ID for login, token refresh, introspection and logout. Must appear in the ID token `aud` |
| `jwks_uri` | ExtAuthZ | Signing keys for bearer tokens from this tenant's identity provider |
| `audiences` | ExtAuthZ | Accepted `aud` values for bearer tokens from this tenant's identity provider |
| `blocked` | Session Manager | Session checks fail with `TENANT_BLOCKED` |

Additional properties passed with the tenant's authentication settings are currently not
stored.

## Common settings

See these sections in [values.yaml][values] for all keys and examples.

| Section | Notes |
| --- | --- |
| `status` | Keep `enabled: true`: the probes need it. `address` must match the `http-status` container port. Keep `profiling: false` in production. `timeout` has no effect |
| `logger` | Level, format, field names and masking of personal data |
| `audit` | OTLP/HTTP endpoint and HTTP client for the audit events of sign-ins. Set `endpoint` to deliver them; otherwise, each attempt logs an error. Chart versions before 0.11.0 set `http://localhost:4043/logs`: replace it |
| `telemetry` | OpenTelemetry export of traces, metrics and logs, or Prometheus metrics on the status port |

Do not set the environment variable `DEBUGFEATURES` in production. It makes Session Manager
log complete outgoing HTTP requests and responses, including tokens.

## Troubleshooting

| Symptom | Log message | Cause and fix |
| --- | --- | --- |
| Pods stay in `ContainerCreating` | - | A Secret from `extraVolumes` is missing. Create the Secrets before `helm install` |
| Pod does not start | `no config file found at the paths` | Config not mounted as `/etc/session-manager/config.yaml`; with chart versions before 0.11.0, check `nameOverride` |
| Pod does not start | `DB schema version mismatch` | The migration job did not run or failed |
| Pod does not start | `reading DB schema version` | Database not reachable or wrong credentials. Check for a trailing newline in the password file |
| Migration job fails | `client_id is not set in the config` | Set `sessionManager.clientAuth.clientID` |
| Pod does not start | `CSRF secret must be at least 32 bytes` | Secret too short or empty |
| Pod does not start | `creating valkey client` | Valkey not reachable, or `host` without port |
| Pod does not start | `missing mTLS configuration` | `clientAuth.type: mtls` without `clientAuth.mTLS` |
| Pod does not start | `environment variable not set` | A value reference with `source: env` whose variable is not set. Chart versions before 0.11.0 pass no environment variables to the housekeeper and the migration job |
| Pod does not start | `appsOrder references unknown app` | A name in `appsOrder` is not a key of `apps` |
| Pod does not start | `appears more than once in the load set` | A service module is listed twice, or two apps use `app.module.grpcserver` |
| Pod does not start | `requires at least one service under services` | The `app.module.grpcserver` entry has no services |
| API server not ready | - | `apps` has no `app.module.grpcserver` entry, or `grpc.address` does not match the `grpc` container port |
| Login `400` | `request URI does not match an allowed redirect base URL` | `allowedRedirectBaseURLs` missing or does not match `request_uri` |
| Login `404` | `getting trust from repository: not_found` | No trust record for the tenant; onboard the tenant's authentication settings |
| Login `500` | `issuer does not match` | Trust issuer differs from the discovery document's issuer, often by a trailing `/` |
| Login `500` | `"http" scheme is not allowed` | Identity provider not on HTTPS |
| Identity provider shows `invalid_scope` | - | The provider does not offer the `groups` scope |
| Callback `400` | `Query argument __Host-LoginCSRF is required` | Login CSRF cookie not sent back: `sameSite` not `Lax`, plain HTTP, a different host, or a second login in another tab |
| Callback `400` | `Query argument code is required` | The identity provider returned an error; check its logs |
| Callback `410` | `state_expired` | The login took longer than `sessionDuration` |
| Callback `500` | `exchanging code for tokens` with `invalid_client` or `invalid_grant` | Wrong client credentials or redirect URI at the identity provider |
| Callback `500` | `invalid audience claim` | Trust `client_id` not in the ID token `aud` |
| Callback `500` | `cannot unmarshal string` for `groups` | The identity provider sends `groups` as a string; configure it as a list |
| API `401` after login | ExtAuthZ logs `CSRF token is not valid` | Session Manager and ExtAuthZ use different CSRF secrets. Use [the same secret](/components/cmk/security/configuration#shared-csrf-secret) in both |
| API `401` after login | `Could not introspect access token`, `Access token is not active` | Introspection fails or the token was revoked |
| API `403` `TENANT_BLOCKED` | `Tenant is blocked` | The tenant is blocked |
| Sessions not cleaned up | `Error during session housekeeping` | Housekeeper cannot read Valkey |

[values]: https://github.com/openkcm/session-manager/blob/main/charts/session-manager/values.yaml
[readme]: https://github.com/openkcm/session-manager/blob/main/charts/session-manager/README.md
