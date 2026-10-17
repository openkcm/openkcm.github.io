# Session Manager configuration reference

This page describes every configuration setting of
[Session Manager](/components/cmk/session-manager), the requirements on identity
providers and tenant trust records, and how to diagnose problems. For the
end-to-end setup, see the [configuration guide](/components/cmk/security/configuration).
For the HTTP exchanges in detail, see the
[request walkthrough](/components/cmk/security/walkthrough).

Settings marked as a *value reference* take `source: embedded | env | file`, and
settings marked as *credentials* take a `secretRef`. Both are described in
[Configuration conventions](/components/cmk/security/configuration#configuration-conventions).

## How Session Manager reads its configuration

| Aspect | Behaviour |
| --- | --- |
| File | `config.yaml`, parsed as YAML |
| Locations | `/etc/session-manager/config.yaml` and `./config.yaml`. If both exist, values from the second override the first |
| Helm chart | Renders the `config` value into a ConfigMap named after the release (`session-manager` for a release named `session-manager`; with `configMap.immutable`, the name ends with a hash of the content) and mounts it at `/etc/session-manager`. Chart versions before 0.11.0 mount it at `/etc/<chart name>`: with them, do not set `nameOverride` |
| Unknown keys | **Ignored without a warning.** Check spelling and nesting carefully |
| Key names | Section names that select a module (`database`, `valkey`, `trust`, `credentials`, `migrate`, `apps`) must be written exactly in lowercase. Other keys are case-insensitive |
| Environment variables | Cannot override settings. Use a value reference with `source: env`. The PostgreSQL client also reads the standard `PG*` variables |
| Defaults | Applied to every setting that is missing or zero |
| Duplicate keys | Startup fails with `mapping key "<key>" already defined` |

### Processes

The same binary and configuration run three processes:

| Process | Command | Loads | Checks at startup |
| --- | --- | --- | --- |
| API server | `session-manager api-server` | Everything | Database schema version, CSRF secret length, callback URL, audit logger, HTTP and gRPC listeners |
| Housekeeper | `session-manager housekeeper` | Database, Valkey, trust, credentials | Connections only |
| Migration | `session-manager migrate` | Database | `sessionManager.clientAuth.clientID` must be set |

### When changes take effect

| What | After a change |
| --- | --- |
| Configuration file | The chart restarts the API server and housekeeper pods automatically. Chart versions before 0.11.0 restart only the API server: **restart the housekeeper yourself** |
| Tenant trust records | Immediately; they are read from the database on every login and session check |
| Identity provider discovery documents | Cached for 30 minutes per issuer |
| CSRF secret, client credentials | Restart |

## Helm chart

The chart is in the
[session-manager repository](https://github.com/openkcm/session-manager/tree/main/charts/session-manager).
Its `values.yaml` documents every value, and its README shows a complete
installation with the credentials mounted from Secrets.

| Resource | Details |
| --- | --- |
| API server Deployment | Ports `http` 8080, `grpc` 9091, `http-status` 8888. Probes on `/probe/liveness` and `/probe/readiness` |
| Housekeeper Deployment | Always one replica, replaced with the `Recreate` strategy so that two housekeepers never run at the same time. Probes on the status port |
| Migration Job | Runs as a Helm pre-install and pre-upgrade hook, with its own hook copy of the configuration |
| ConfigMap | Rendered from the `config` value |
| Service | Exposes 8080, 8888 and 9091 |
| NetworkPolicy | Optional (`networkPolicy.enabled`): admits only the peers you list for the sign-in endpoints, the gRPC API and the status port |

All three workloads mount the same `extraVolumes` and receive the same
`extraEnvs`, so value references with `source: file` and `source: env` work in
every process. Chart versions before 0.11.0 pass no environment variables to the
housekeeper and the migration job; with them, use `source: file` for all value
references.

Chart 0.11.0 and later render every key under `config` into `config.yaml`, run
as a non-root user with a read-only root filesystem, and ship no example
credentials. Set these values in every installation:

| Setting | Why |
| --- | --- |
| `database.host`, `user`, `password`; `valkey.host`, `password` | Session Manager does not start without its stores. Use `source: file` for the passwords |
| `sessionManager.callbackURL` | Must be the public HTTPS URL of `/sm/callback` |
| `sessionManager.allowedRedirectBaseURLs` | Without it every login and logout fails with `400` |
| `sessionManager.csrfSecret` | At least 32 bytes, **the same as ExtAuthZ's `csrfSecret`** |
| `sessionManager.clientAuth.clientID`, `clientSecret` | The database migration of a new installation fails without the client ID |
| `sessionManager.csrfCookieTemplate.domain` | Must be the parent domain of the UI and API hosts |

The release notes printed by `helm install` and `helm upgrade` list the settings
that are missing or not production-ready.

Older charts render only fixed sections of `config` and drop other keys such as
`appsOrder`. They also ship example values for the settings above, including a
published example CSRF secret and `localhost` URLs, and enable gRPC reflection:
replace all of them.

## Minimal configuration

```yaml
config:
  logger:
    level: info
  status:
    enabled: true
  http:
    address: :8080
  grpc:
    address: :9091
    flags:
      health: true
      reflection: false

  database:
    host: { value: postgresql.services.svc.cluster.local }
    port: "5432"
    name: session_manager
    user:     { source: file, file: { path: /etc/credentials/database/username, format: binary } }
    password: { source: file, file: { path: /etc/credentials/database/password, format: binary } }

  valkey:
    host: { value: valkey-primary.storage.svc.cluster.local:6379 }
    user: { value: default }
    password: { source: file, file: { path: /etc/credentials/valkey/password, format: binary } }
    prefix: session-manager
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
    csrfSecret:                 # same secret as ExtAuthZ csrfSecret
      source: file
      file: { path: /etc/credentials/csrf-secret/csrf_secret, format: binary }
    clientAuth:
      type: client_secret
      clientID: cmk-session-manager
      clientSecret:
        source: file
        file: { path: /etc/credentials/client-auth/client-secret, format: binary }
    sessionCookieTemplate:
      name: __Host-Http-SESSION
      path: /
      secure: true
      httpOnly: true
      sameSite: None
    csrfCookieTemplate:
      name: CSRF
      path: /
      domain: example.com
      secure: true
      sameSite: Strict
    loginCSRFCookieTemplate:
      path: /
      secure: true
      httpOnly: true
      sameSite: Lax

  apps:
    grpc:
      module: app.module.grpcserver
      services:
        - module: service.module.grpc.session
        - module: service.module.grpc.trustmapping
        - module: service.module.grpc.oidcmapping
```

## http

| Setting | Default | Description |
| --- | --- | --- |
| `address` | `:8080` | Listen address of the `/sm/*` endpoints. A Unix socket address starting with `unix://` is also accepted |
| `shutdownTimeout` | `5s` | Grace period at shutdown |

The HTTP server does not terminate TLS. Envoy Gateway terminates TLS in front of
it.

## grpc

| Setting | Default | Description |
| --- | --- | --- |
| `address` | `:9092` | Listen address. The chart uses `:9091`; ExtAuthZ and CMK must use the same port |
| `flags.health` | `false` | Serve the gRPC health service. The chart sets `true` |
| `flags.reflection` | `false` | Serve gRPC reflection. Disable it in production. Chart versions before 0.11.0 set `true` |
| `shutdownTimeout` | `5s` | Grace period at shutdown |
| `maxRecvMsgSize`, `efPolMinTime`, `efPolPermitWithoutStream`, `attributes.*` | | Same as for [ExtAuthZ](/components/cmk/security/extauthz-config#grpcserver) |

The gRPC server exists only if an entry in `apps` uses `app.module.grpcserver`.
It does not use TLS and does not authenticate callers: it can change tenant
trust records. Allow connections only from ExtAuthZ and CMK, with a network
policy or the authorization policies of your service mesh.

## database

PostgreSQL holds the tenant trust records.

| Setting | Default | Description |
| --- | --- | --- |
| `module` | `database.module.pgxpool` | Database module |
| `host` | - | Value reference |
| `port` | - | Port, for example `"5432"` |
| `name` | - | Database name |
| `user`, `password` | - | Value references |

There are no settings for TLS or connection pooling. The PostgreSQL client reads
the standard environment variables for anything not configured, for example
`PGSSLMODE=verify-full` and `PGSSLROOTCERT`. Without them, TLS is used only if
the server offers it, and the server certificate is not verified.

The migration job must have run before the API server starts. The API server
checks the schema version and stops with
`DB schema version mismatch: required 6, got <n>` otherwise.

## valkey

Valkey holds login state and sessions, including the users' access and refresh
tokens. Protect it accordingly.

| Setting | Default | Description |
| --- | --- | --- |
| `module` | `sessionstore.module.valkey` | Session store module |
| `host` | - | Value reference. One or more `host:port`, separated by commas. The port is required |
| `user`, `password` | - | Value references |
| `prefix` | - | Prefix for all keys. A trailing `:` is removed |
| `secretRef` | - | Only `type: mtls` enables TLS. Any other type connects without TLS |
| `masterSet` | - | Sentinel master set name. Setting it switches to Sentinel |
| `topologyRefreshInterval` | `0` | Sentinel topology refresh interval |

Session Manager connects to Valkey at startup and stops with
`creating valkey client` if it cannot.

### Keys in Valkey

| Key | Content | Lifetime |
| --- | --- | --- |
| `<prefix>:state:<state>` | Pending login: tenant, PKCE verifier, return URLs | `sessionDuration` |
| `<prefix>:session:<session ID>` | Session: user, groups, tokens, CSRF token | `sessionDuration` |
| `<prefix>:active:<session ID>` | Marker that the session is in use | `idleSessionTimeout`, extended on every session check |
| `<prefix>:accessToken:accessToken_<session ID>` | Access token | `sessionDuration` |
| `<prefix>:refreshToken:refreshToken_<session ID>` | Refresh token | `sessionDuration` |
| `<prefix>:providerSession:providerSession_<sid>` | Maps the identity provider's session ID to the session | `sessionDuration` |

## sessionManager

### Sessions and redirects

| Setting | Default | Description |
| --- | --- | --- |
| `callbackURL` | `/sm/callback` | Sent to the identity provider as `redirect_uri`. Must be the absolute public URL, for example `https://api.example.com/sm/callback`, and registered at every identity provider. The endpoint itself is always served at `/sm/callback` |
| `allowedRedirectBaseURLs` | - | Allowed starts of `request_uri`, `error_uri` and `post_logout_redirect_uri`. **Required** |
| `sessionDuration` | `12h` | Maximum session lifetime. Also the lifetime of a pending login |
| `idleSessionTimeout` | `90m` | A session ends after this time without API requests |
| `allowHttpScheme` | `false` | Accept identity providers served over `http`. For local development only |
| `csrfSecret` | - | Value reference. **At least 32 bytes**, or the API server does not start. **Must be the same secret as ExtAuthZ's `csrfSecret`**, see below |

::: danger csrfSecret is shared with ExtAuthZ
Session Manager and ExtAuthZ **must use the same CSRF secret**: Session
Manager's `sessionManager.csrfSecret` and ExtAuthZ's `csrfSecret` must contain
exactly the same bytes. Session Manager creates the CSRF token with this secret
when the user signs in, and ExtAuthZ checks the token with its own copy on every
API call. If the secrets differ, users can sign in but every API call from the
CMK UI fails with `401` and `CSRF token is not valid`. See
[Shared CSRF secret](/components/cmk/security/configuration#shared-csrf-secret).
:::

`allowedRedirectBaseURLs` is compared with the beginning of the requested URL,
character by character and case-sensitive:

| Entry | Requested URL | Result |
| --- | --- | --- |
| `https://ui.example.com/` | `https://ui.example.com/#/acme/keys` | Allowed |
| `https://ui.example.com/` | `https://UI.example.com/` | Rejected (case) |
| `https://ui.example.com/` | `https://ui.example.com.attacker.test/` | Rejected |
| `https://ui.example.com` | `https://ui.example.com.attacker.test/` | **Allowed** |

Always end entries with `/`, and never add `/` or other short prefixes on their
own.

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
| `sameSite` | Exactly `Lax`, `Strict` or `None`. Any other spelling, such as `lax`, silently omits the attribute |

Recommended values:

| Template | `name` | `path` | `domain` | `secure` | `httpOnly` | `sameSite` |
| --- | --- | --- | --- | --- | --- | --- |
| `sessionCookieTemplate` | `__Host-Http-SESSION` (required by ExtAuthZ) | `/` | empty | `true` | `true` | `None`, or `Lax` if UI and API share a registrable domain |
| `csrfCookieTemplate` | `CSRF` (required by the CMK UI) | `/` | parent domain of UI and API | `true` | `false` | `Strict` |
| `loginCSRFCookieTemplate` | empty (defaults to `__Host-LoginCSRF`) | `/` | empty | `true` | `true` | `Lax` |

The login CSRF cookie must be `Lax`: it has to be sent when the identity
provider redirects the browser back to `/sm/callback`.

Session Manager logs a warning, but does not fail, if the session cookie name
does not start with `__Host-Http-`, or a cookie is not `Secure` or `HttpOnly` as
expected. With the recommended login CSRF cookie, it logs
`CSRF cookie is marked as HttpOnly` and `not marked as SameSite=Strict` on every
login; these two warnings are expected.

### clientAuth

How Session Manager authenticates to the identity providers when it exchanges
the authorization code and refreshes tokens.

| Setting | Default | Description |
| --- | --- | --- |
| `type` | `mtls` | `mtls`, `client_secret`, `client_secret_post` or `insecure` (development only; logs a warning) |
| `mTLS.cert`, `mTLS.certKey` | - | Client certificate and key, for `mtls`. Startup fails with `missing mTLS configuration` if `type` is `mtls` and this block is missing |
| `mTLS.serverCa`, `mTLS.rootCAs` | - | CA certificates to verify the identity provider |
| `mTLS.attributes.serverName` | - | Server name for TLS verification |
| `clientSecret` | - | Value reference, for `client_secret` and `client_secret_post` |
| `clientID` | - | Required by the migration job. Use the client ID registered at your identity provider |

- `client_secret` and `client_secret_post` behave the same: the code exchange
  first sends the credentials with HTTP basic authentication and falls back to
  the request body; the token refresh sends them in the body.
- The same secret or certificate is used for all tenants. The client ID itself
  comes from each tenant's trust record.

## housekeeper

Settings for the housekeeper process.

| Setting | Default | Description |
| --- | --- | --- |
| `triggerInterval` | `10m` | How often housekeeping runs. It also runs once at startup |
| `concurrencyLimit` | `10` | Sessions processed in parallel |
| `tokenRefreshTriggerInterval` | `15m` | Refresh access tokens that expire within this time. Keep it at least as long as `triggerInterval` |

Each run deletes sessions whose `active` marker has expired and refreshes access
tokens that are about to expire. Run exactly one housekeeper.

## Modules

Session Manager is built from modules. The defaults fit a standard installation.

| Setting | Default | Description |
| --- | --- | --- |
| `trust.module` | `trust.module.oidc` | Tenant trust records |
| `trust.dbModule` | `database.module.pgxpool` | Database used for trust records |
| `credentials.module` | `credentials.module.oauth2` | Client authentication, configured in `sessionManager.clientAuth` |
| `migrate.module` | `trust.migration.module.oidc` | Database migrations |
| `migrate.dbModule` | `database.module.pgxpool` | Database used by the migrations |

### apps

`apps` defines the long-running components, keyed by a name you choose.
`appsOrder` optionally sets their start order.

| Service module | Called by | Settings |
| --- | --- | --- |
| `service.module.grpc.session` | ExtAuthZ: `GetSession`, `GetOIDCProvider`, `GetTrust` | `trust`, `sessionStore`, `credentials`, `allowHttpScheme` (default `false`, applies to the introspection endpoint) |
| `service.module.grpc.oidcmapping` | CMK: apply, block, unblock and remove tenant trust | `trust` |
| `service.module.grpc.trustmapping` | Tools that manage trust records directly | `trust` |

An `app.module.grpcserver` entry needs at least one service.

## Identity provider requirements

Each tenant's identity provider must meet these requirements:

| Requirement | Detail |
| --- | --- |
| Discovery | `<issuer>/.well-known/openid-configuration` reachable over HTTPS. Its `issuer` must equal the trust record's issuer exactly, including any trailing `/` |
| Endpoints | `authorization_endpoint`, `token_endpoint` and `jwks_uri` are required. `introspection_endpoint` is used to check access tokens; without it, tokens are treated as active. `end_session_endpoint` enables logout at the identity provider |
| Client | Authorization code flow with PKCE (`S256`). Redirect URI = `callbackURL`. Client authentication as configured in `clientAuth` |
| Scopes | `openid`, `profile`, `email` and `groups` are always requested. The provider must accept the `groups` scope |
| ID token | Signed with an algorithm listed in `id_token_signing_alg_values_supported`, with a `kid` in the header. `iss` = trust issuer, `aud` contains the trust client ID |
| Claims | `sub`, `email`, `given_name`, `family_name` and `groups` (an array of strings). Optional: `sid` for back-channel logout |
| Refresh tokens | Needed if sessions should outlive the access token |

The signing keys are taken from the discovery document's `jwks_uri`, not from
the trust record.

## Tenant trust records

Session Manager stores one trust record per tenant in PostgreSQL. CMK creates
and updates the records when it processes the tenant's authentication settings
from the [Registry](/components/cmk/registry); see
[Onboard a tenant](/components/cmk/security/configuration#step-8-onboard-a-tenant).

| Field | Used by | Effect |
| --- | --- | --- |
| `tenant_id` | All | Key of the record |
| `issuer` | Session Manager, ExtAuthZ | Discovery base URL; must match the ID token `iss` and the token `iss` for API clients |
| `client_id` | Session Manager, ExtAuthZ | Client ID for login, token refresh, introspection and logout. Must appear in the ID token `aud` |
| `jwks_uri` | ExtAuthZ | Signing keys for bearer tokens from this tenant's identity provider |
| `audiences` | ExtAuthZ | Accepted `aud` values for bearer tokens from this tenant's identity provider |
| `blocked` | Session Manager | Session checks fail with `TENANT_BLOCKED` |

Additional properties passed with the tenant's authentication settings are
currently not stored.

## Common settings

| Section | Notes |
| --- | --- |
| `status` | `enabled` (chart: `true`), `address` (`:8888`), `profiling` (keep `false`). The readiness probe does not check the database or Valkey |
| `logger` | `level` (`info`), `format` (`json`) |
| `audit` | `endpoint`, `httpClient`, `additionalProperties`, as for [ExtAuthZ](/components/cmk/security/extauthz-config#audit). Without an endpoint, sign-ins work, but the audit events are not delivered and each attempt logs an error. Chart versions before 0.11.0 set `http://localhost:4043/logs` |
| `telemetry` | As for [ExtAuthZ](/components/cmk/security/extauthz-config#telemetry) |

Do not set the environment variable `DEBUGFEATURES` in production. It makes
Session Manager log complete outgoing HTTP requests and responses, including
tokens.

## Troubleshooting

| Symptom | Log message | Cause and fix |
| --- | --- | --- |
| Pod does not start | `no config file found at the paths` | Config not mounted at `/etc/session-manager`; with chart versions before 0.11.0, check `nameOverride` |
| Pod does not start | `DB schema version mismatch: required 6, got <n>` | The migration job did not run or failed |
| Pod does not start | `reading DB schema version` | Database not reachable or wrong credentials. Check for a trailing newline in the password file |
| Migration job fails | `client_id is not set in the config` | Set `sessionManager.clientAuth.clientID` |
| Pod does not start | `CSRF secret must be at least 32 bytes` | Secret too short or empty |
| Pod does not start | `creating valkey client` | Valkey not reachable, or `host` without port |
| Pod does not start | `missing mTLS configuration` | `clientAuth.type: mtls` without `clientAuth.mTLS` |
| Pod does not start | `environment variable not set` | A value reference with `source: env` whose variable is not set. Chart versions before 0.11.0 pass no environment variables to the housekeeper and the migration job |
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
