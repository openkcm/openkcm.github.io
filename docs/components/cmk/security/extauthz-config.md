# ExtAuthZ configuration reference

This page describes every configuration setting of
[ExtAuthZ](/components/cmk/extauthz), how ExtAuthZ applies it, and what happens
when it is wrong. For the end-to-end setup with Session Manager, CMK and Envoy
Gateway, see the [configuration guide](/components/cmk/security/configuration).

Settings marked as a *value reference* take `source: embedded | env | file`, and
settings marked as *credentials* take a `secretRef`. Both are described in
[Configuration conventions](/components/cmk/security/configuration#configuration-conventions).

## How ExtAuthZ reads its configuration

| Aspect | Behaviour |
| --- | --- |
| File | `config.yaml`, parsed as YAML |
| Search order | `/etc/extauthz/`, then `$HOME/.extauthz/`, then the working directory. The first file found is used |
| Helm chart | Renders the `config` value into a ConfigMap named after the release (`extauthz-config` for a release named `extauthz`; with `configMap.immutable`, the name ends with a hash of the content) and mounts it at `/etc/extauthz` |
| Key names | Case-insensitive |
| Unknown keys | **Startup fails** with `has invalid keys: <key>` |
| Environment variables | Cannot override settings. Use a value reference with `source: env` for single values |
| Defaults | Applied to every setting that is missing or zero. An explicit `0` is replaced by the default |

### When changes take effect

| What | Loaded | After a change |
| --- | --- | --- |
| Configuration file | At startup | Restart |
| Cedar policies | At startup | Restart |
| Trusted subjects | At startup | Restart |
| CSRF secret | At startup | Restart |
| Client data signing keys | At startup, then the directory is watched; the key is taken from memory for every request | Restart. In a Kubernetes Secret volume a changed `keyId` value is not picked up |
| OIDC discovery documents | On first use, then kept for the process lifetime | Restart |
| Identity provider signing keys (JWKS) | On first use, cached for 5 minutes per key ID | Automatic |

From chart version 0.15.0, the Helm chart restarts the pods when a value under
`config` changes. Policies, trusted subjects and Secrets that you manage
yourself still need a restart: run
`kubectl rollout restart deployment/extauthz` after you change them. Older
chart versions never restart the pods on their own.

### Helm chart and rendered keys

The chart is in the
[extauthz repository](https://github.com/openkcm/extauthz/tree/main/charts/extauthz);
its `values.yaml` documents every value.

- **Chart 0.15.0 and later** renders every key under `config` into
  `config.yaml`. Only `config.environment` and `config.labels` become
  `application.environment` and `application.labels`. A misspelled key
  therefore stops ExtAuthZ at startup instead of being ignored.
- **Older charts** render only `environment`, `labels`, `isImmutable`,
  `featureGates`, `logger`, `status`, `telemetry`, `grpcServer`, `cedar`,
  `mtls`, `jwt`, `clientData`, `audit`, `valkey`, `sessionPathPrefixes`,
  `sessionManager` and `csrfSecret`, and drop other keys such as
  `featureFlags`.

Chart 0.15.0 also sets probes, resource requests and a restrictive security
context by default, disables `sessionManager` until you configure it, and can
create a NetworkPolicy (`networkPolicy.enabled`) that admits only Envoy Gateway.

The chart mounts these volumes by default. It does not create them; provide
them with the same names:

| Volume source | Kind | Mount path | Used by |
| --- | --- | --- | --- |
| `extauthz-trusted-subjects` | ConfigMap | `/etc/extauthz-mtls` | `mtls.trustedSubjectsYaml` |
| `extauthz-systems-policies`, `extauthz-users-policies` | ConfigMaps | `/etc/extauthz-policies` | `cedar.policyPath` |
| `extauthz-signing-keys-secret` | Secret | `/etc/extauthz-signing` | `clientData.signingKeyIDFilePath` |

Mount the CSRF secret and any identity provider credentials with
`extraVolumes` and `extraVolumeMounts`. Container ports come only from
`extraPorts`; the chart's Service exposes `grpc` (9092) and `http-status`
(8080).

## Minimal configuration

A working configuration for CMK UI users (sessions) and one statically trusted
token issuer:

```yaml
config:
  logger:
    level: info
    format: json
  status:
    enabled: true
    address: :8080              # must match the chart's http-status port
  grpcServer:
    address: :9092
    flags:
      health: true              # required, otherwise the pod never becomes ready

  cedar:
    policyPath: /etc/extauthz-policies
  mtls:
    trustedSubjectsYaml: /etc/extauthz-mtls/trustedSubjects.yaml

  jwt:
    providers:
      - issuer: https://idp.example.com/realms/cmk
        audiences: [cmk-api]

  sessionPathPrefixes: ["/cmk/v1/"]
  sessionManager:
    enabled: true
    address: session-manager.services.svc.cluster.local:9091
    secretRef:
      type: insecure            # only inside a service mesh with mutual TLS

  clientData:
    signingKeyIDFilePath: /etc/extauthz-signing/keyId

  csrfSecret:                   # same secret as Session Manager sessionManager.csrfSecret
    source: file
    file:
      path: /etc/credentials/csrf-secret/csrf_secret
      format: binary
```

## grpcServer

The gRPC server that Envoy calls for every request.

| Setting | Default | Description |
| --- | --- | --- |
| `address` | `:9092` | Listen address |
| `flags.health` | `false` | Serve the gRPC health service. **Set to `true`**: the readiness probe calls it |
| `flags.reflection` | `false` | Serve gRPC reflection. Keep disabled in production |
| `maxRecvMsgSize` | `125829120` | Maximum size of a request in bytes |
| `efPolMinTime` | `180s` | Minimum interval between keepalive pings from Envoy. Clients that ping more often are disconnected |
| `efPolPermitWithoutStream` | `false` | Allow keepalive pings without active calls |
| `attributes.maxConnectionIdle` | `1800s` | Close idle connections after this time |
| `attributes.maxConnectionAge` | `1800s` | Close connections after this age |
| `attributes.maxConnectionAgeGrace` | `300s` | Grace period for open calls when a connection is closed |
| `attributes.time` | `120m` | Interval of server keepalive pings |
| `attributes.timeout` | `20s` | Timeout for a server keepalive ping |

The gRPC server does not use TLS and does not authenticate callers. Allow
connections only from the Envoy proxies, with a network policy or the
authorization policies of your service mesh.

## status

The HTTP server for probes and diagnostics.

| Setting | Default | Description |
| --- | --- | --- |
| `enabled` | `false` | Start the status server. The chart's probes need it |
| `address` | `:8888` | Listen address. The chart's Service and default probes use `:8080`, so set `:8080` or change the chart ports |
| `profiling` | `false` | Serve Go profiling endpoints. Keep disabled in production |

| Endpoint | Purpose |
| --- | --- |
| `/probe/liveness` | Always `200` while the process runs |
| `/probe/readiness` | `200` when ExtAuthZ answers its own gRPC health check within 5 seconds, otherwise `503`. Does not check identity providers, keys or Session Manager |
| `/version` | Build information |
| `/metrics` | Prometheus metrics, only with `telemetry.metrics.prometheus.enabled` |

## cedar

| Setting | Default | Description |
| --- | --- | --- |
| `policyPath` | - | Directory with the policy files. ExtAuthZ loads every file that ends in `.cedar` directly in this directory; subdirectories are ignored |

Policies are loaded once at startup. A syntax error stops startup with
`failed to create policy set`. If no policy file is found, ExtAuthZ starts and
denies every authenticated request with `403`.

### Request model

ExtAuthZ evaluates the policies once for each credential in the request.

| Cedar element | Value |
| --- | --- |
| Principal | `Subject::"<subject>"` |
| Action | `Action::"<HTTP method>"`, for example `Action::"GET"` |
| Resource | Not set. Write `resource` without a condition |
| Context | Attributes listed below, all strings |
| Entities | None. `principal in ...` group checks are not available |

The subject depends on the credential:

| Credential | Subject |
| --- | --- |
| Session | The user ID (`sub`) from the session |
| Bearer token | The token's `sub` claim |
| Client certificate | The certificate subject in RFC 2253 format, for example `CN=billing,O=Example Corp,C=DE` |

### Context attributes

| Attribute | Session | Bearer token | Client certificate |
| --- | --- | --- | --- |
| `context.type` | `"session"` | `"jwt"` | `"x509"` |
| `context.host` | Request host | Request host | Request host |
| `context.path` | Request path including the query string | same | same |
| `context.issuer` | Issuer of the tenant's identity provider | The token's `iss` claim | Certificate issuer in RFC 2253 format |
| `context.jwksURI` | - | The token's `jku` header, or `""` | - |

A condition that reads a missing attribute, for example `context.jwksURI` for a
client certificate, makes Cedar skip that policy. Guard such conditions with
`context has jwksURI`.

`context.path` is the path as Envoy received it, without normalization. Let
Envoy normalize paths (see the [hardening checklist](/components/cmk/security/hardening#edge))
and match with `like "/cmk/v1/*"` rather than on exact strings.

### Policy examples

Users of the CMK UI:

```text
permit (
    principal is Subject,
    action in [Action::"GET", Action::"POST", Action::"PUT", Action::"PATCH", Action::"DELETE"],
    resource
) when {
    context.type == "session" &&
    context.host == "api.example.com" &&
    context.path like "/cmk/v1/*"
};
```

An automation client with tokens from a statically trusted issuer:

```text
permit (
    principal == Subject::"svc-automation",
    action in [Action::"GET", Action::"POST"],
    resource
) when {
    context.type == "jwt" &&
    context.issuer == "https://idp.example.com/realms/cmk" &&
    context.path like "/cmk/v1/*"
};
```

A technical system with a client certificate:

```text
permit (
    principal == Subject::"CN=billing-service,O=Example Corp,C=DE",
    action in [Action::"GET"],
    resource
) when {
    context.type == "x509" &&
    context.issuer == "CN=Example Clients CA,O=Example Corp,C=DE" &&
    context.path like "/cmk/v1/*"
};
```

Block one path for everyone. `forbid` always wins over `permit`:

```text
forbid (principal, action == Action::"DELETE", resource)
when { context.path like "/cmk/v1/*/tenants*" };
```

Without a matching `permit`, a request is denied.

## mtls

| Setting | Default | Description |
| --- | --- | --- |
| `trustedSubjectsYaml` | - | Path of the trusted subjects file. **Required**: startup fails if it is empty, contains `..`, cannot be read or is not valid YAML |

The file maps each region to the certificate subjects that are trusted from that
region:

```yaml
eu10:
  - "CN=billing-service,O=Example Corp,C=DE"
  - "CN=reporting-service,O=Example Corp,C=DE"
us10:
  - "CN=billing-service-us,O=Example Corp,C=US"
```

- Write subjects in RFC 2253 format, as Envoy produces them: most specific
  attribute first, separated by commas **without spaces**. The comparison is an
  exact string match.
- List each subject only once. With duplicates, the region is not predictable.
- Empty region names and empty subjects stop startup.
- An empty file (`{}`) is valid and trusts no certificate.

### Client certificate checks

ExtAuthZ reads the `x-forwarded-client-cert` header. If it contains several
elements, for example from several proxies, every element must pass.

| Step | Failure |
| --- | --- |
| Header is well-formed and contains `Cert` | `401` |
| Certificate can be parsed | `401` |
| `Subject` in the header equals the certificate subject | `403` |
| Subject is in the trusted subjects file | `403` |
| Certificate is within its validity period | `403` |
| A Cedar policy permits the request | `403` |

ExtAuthZ does not verify the certificate chain or revocation. Envoy must
validate client certificates and must replace, not forward, any
`x-forwarded-client-cert` header that a client sends. See
[Client certificates](/components/cmk/security/configuration#client-certificates-and-path-handling).

## jwt

| Setting | Default | Description |
| --- | --- | --- |
| `issuerClaimKeys` | `[iss]` | Claims that hold the token issuer, tried in order. The first claim with a string value selects the provider |
| `providers` | - | Statically trusted token issuers |
| `httpClient` | - | HTTP client for token introspection at static providers |
| `oauth2` | - | Client authentication for token introspection at tenant identity providers |

### jwt.providers

| Field | Default | Description |
| --- | --- | --- |
| `issuer` | - | The issuer exactly as it appears in the token, including any trailing `/` |
| `issuerURI` | value of `issuer` | Base URL for OpenID Connect discovery. Set it if `issuer` is not a URL |
| `jwksURI` | from discovery | URL of the signing keys. Setting it avoids the discovery request for keys |
| `audiences` | - | Accepted `aud` values. If empty, the audience is **not** checked |
| `disableTokenIntrospection` | `false` | Skip token introspection |

`issuerURI` and `jwksURI` must use `https`; startup fails otherwise.

ExtAuthZ selects the provider for a token in this order:

1. A static provider whose `jwksURI` equals the token's `jku` header and whose
   `issuer` equals the token issuer.
1. A static provider whose `issuer` equals the token issuer.
1. The trust record of the tenant in the request path, from Session Manager.
   This works only on paths under `sessionPathPrefixes`, because the tenant ID
   comes from the path.

If none matches, the request is denied with `403` and the message
`No provider found`.

Static provider with fixed signing keys and without discovery:

```yaml
jwt:
  providers:
    - issuer: https://idp.example.com/realms/cmk
      jwksURI: https://idp.example.com/realms/cmk/protocol/openid-connect/certs
      audiences: [cmk-api]
      disableTokenIntrospection: true
```

Static provider with discovery and token introspection:

```yaml
jwt:
  providers:
    - issuer: https://idp.example.com/realms/cmk
      audiences: [cmk-api]
  httpClient:
    timeout: 5s
    basicAuth:
      username:
        source: file
        file: { path: /etc/credentials/idp/client-id, format: binary }
      password:
        source: file
        file: { path: /etc/credentials/idp/client-secret, format: binary }
```

### Token requirements

| Requirement | Detail |
| --- | --- |
| Header | `Authorization: Bearer <token>`. The word `Bearer` is case-sensitive |
| Algorithm | `RS256` only |
| Key ID | The token header must contain `kid`. The provider's JWKS must contain a key with that `kid` and `"use": "sig"` |
| Issuer | `https` URL, unless matched by a static provider with `issuerURI` |
| `exp` | Required |
| `exp`, `nbf`, `iat` | Checked with 1 minute of clock-skew tolerance |
| `aud` | Must contain one of the provider's `audiences`, if configured |
| `groups` | Optional. If present, it must be an array of strings |

Claims used for the client data: `sub` (identifier), `mail` (email) and
`groups`. Name claims are not read from tokens.

### Token introspection

ExtAuthZ checks with the identity provider whether the token is still active,
unless the provider sets `disableTokenIntrospection`.

- The endpoint is the `introspection_endpoint` from the provider's discovery
  document. If the document has none, the token is treated as active.
- The request is `POST` with the form field `token=<token>`.
- Static providers authenticate with `jwt.httpClient`. Tenant identity
  providers authenticate with `jwt.oauth2`, using the tenant's client ID.
- Results are cached for 30 seconds. The cache is used only for `GET` requests;
  other methods always introspect.
- An inactive token gets `401`. If the endpoint cannot be reached, the request
  gets `401`.

### jwt.httpClient

Used only for introspection at static providers.

| Field | Default | Description |
| --- | --- | --- |
| `timeout` | `10s` | Request timeout |
| `basicAuth.username`, `basicAuth.password` | - | Basic authentication, as value references |
| `apiToken` | - | Sends `Authorization: Api-Token <token>` |
| `oauth2Auth` | - | OAuth 2.0 client authentication |
| `mtls` | - | Client certificate (`cert`, `certKey`, `serverCa`, `rootCAs`) |
| `transportAttributes` | - | Connection pool and TLS handshake tuning |

### jwt.oauth2

A template for introspection at **tenant** identity providers. ExtAuthZ fills in
the tenant's client ID from the trust record. The template must contain a client
authentication method; otherwise tokens from tenant identity providers are
denied with `403`.

| Field | Default | Description |
| --- | --- | --- |
| `credentials.authMethod` | `post` | `post` (client secret in the body), `basic`, `jwt`, `private` or `none` |
| `credentials.clientSecret` | - | Value reference |
| `credentials.clientAssertionType`, `credentials.clientAssertion` | - | For `jwt` and `private` |
| `mtls` | - | Client certificate |

```yaml
jwt:
  oauth2:
    credentials:
      authMethod: post
      clientSecret:
        source: file
        file: { path: /etc/credentials/tenant-introspection/client-secret, format: binary }
```

## sessionPathPrefixes

| Setting | Default | Description |
| --- | --- | --- |
| `sessionPathPrefixes` | - | Path prefixes whose next path segment is the tenant ID. Session cookies and tenant identity providers are only used on these paths |

A trailing `/` is added to each prefix. The first matching prefix wins.

| Request path | Prefix `/cmk/v1/` | Result |
| --- | --- | --- |
| `/cmk/v1/acme/keys` | matches | Tenant `acme` |
| `/cmk/v1/acme` | matches | Tenant `acme` |
| `/cmk/v1/` | matches | `401 missing tenant id in the path` |
| `/cmk/v1` | no match | Not a session path |
| `/registry/v1/acme` | no match | Not a session path |

Session checks are active only if `sessionManager.enabled` is `true` **and** at
least one prefix is configured.

## sessionManager

Connection to [Session Manager](/components/cmk/session-manager).

| Setting | Default | Description |
| --- | --- | --- |
| `enabled` | `false` | Enable session cookies and tenant identity providers |
| `address` | - | `host:port` of Session Manager's gRPC API. Startup fails if empty |
| `secretRef` | - | **Required.** `type: insecure` or `type: mtls` with `mtls.cert`, `mtls.certKey` and `mtls.serverCa`. Other types stop startup |
| `attributes.keepaliveTime`, `attributes.keepaliveTimeout` | `80s`, `40s` | Client keepalive |

The connection is opened on first use, so an unreachable Session Manager does
not stop startup. It shows up as `401` responses for session requests.

```yaml
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

## csrfSecret

::: danger Shared with Session Manager
ExtAuthZ and Session Manager **must use the same CSRF secret**. ExtAuthZ's
`csrfSecret` and Session Manager's `sessionManager.csrfSecret` must contain
exactly the same bytes. Session Manager creates the CSRF token with its secret
when the user signs in; ExtAuthZ checks the token with its own secret on every
session request. If the secrets differ, every API call from the CMK UI fails with
`401` and `CSRF token is not valid`. See
[Shared CSRF secret](/components/cmk/security/configuration#shared-csrf-secret).
:::

| Setting | Default | Description |
| --- | --- | --- |
| `csrfSecret` | empty | Value reference to the CSRF secret. **Must contain exactly the same bytes** as Session Manager's `sessionManager.csrfSecret` |

- ExtAuthZ does not check the length. Session Manager requires at least 32
  bytes, so use at least 32.
- The value is used byte for byte. A trailing newline in the file is part of
  the secret. Create the file without one, for example with
  `openssl rand -hex 32 | tr -d '\n'`.
- A missing setting does not stop startup; every session request then fails the
  CSRF check.

The same secret, configured in both services:

```yaml
# ExtAuthZ
config:
  csrfSecret:
    source: file
    file: { path: /etc/credentials/csrf-secret/csrf_secret, format: binary }

# Session Manager
config:
  sessionManager:
    csrfSecret:
      source: file
      file: { path: /etc/credentials/csrf-secret/csrf_secret, format: binary }
```

Both files must have the same content. If the services run in different
namespaces, create a Secret in each namespace from the same value.

ExtAuthZ checks the `x-csrf-token` header on **every** session request,
including `GET`. Session Manager issues the token when the user signs in. Its
format is `<hex HMAC-SHA256>.<hex random value>`; the HMAC binds the token to the
session ID. Tokens do not expire on their own; they end with the session.

## clientData

| Setting | Default | Description |
| --- | --- | --- |
| `signingKeyIDFilePath` | - | Path of a file that contains the ID of the active signing key. Its directory holds the private keys |

- The file content, with surrounding whitespace removed, is the key ID.
- The private key is read from `<key ID>` or `<key ID>.pem` in the same
  directory.
- Supported formats: unencrypted PEM-encoded RSA private keys in PKCS #1
  (`BEGIN RSA PRIVATE KEY`) or PKCS #8 (`BEGIN PRIVATE KEY`).
- ExtAuthZ writes the key ID into every client data as `kid`. CMK must have the
  matching public key as `<key ID>.pem` in its
  [`clientData.signingKeysPath`](/components/cmk/security/cmk-config#clientdata).
- The key is not checked at startup. If it is missing or invalid, every allowed
  request fails at the gateway with `500 INTERNAL_SERVER_ERROR`, and ExtAuthZ
  logs `Check(): failed to encode client data`.
- If the directory does not exist, startup fails with `path does not exist`.

[Signed client data](/components/cmk/security/client-data#signing-keys) describes
both sides in detail: the signing steps, CMK's checks, key generation, rotation
and troubleshooting.

Example Secret, with two keys so you can rotate:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: extauthz-signing-keys-secret
  namespace: envoy-gateway-system
stringData:
  keyId: key2
  key1.pem: |
    -----BEGIN PRIVATE KEY-----
    ...
  key2.pem: |
    -----BEGIN PRIVATE KEY-----
    ...
```

Mount it in the directory of the key ID file. These are the Helm chart's
defaults:

```yaml
extraVolumes:
  - name: extauthz-signing-keys-volume
    projected:
      sources:
        - secret:
            name: extauthz-signing-keys-secret
extraVolumeMounts:
  - name: extauthz-signing-keys-volume
    mountPath: /etc/extauthz-signing
    readOnly: true
```

CMK gets only the public keys, under the same file names, in a Secret of its
own. Never mount this Secret into CMK.

## featureGates

| Feature gate | Default | Description |
| --- | --- | --- |
| `enrich-header-with-client-type` | `false` | Add `type` (`user`, `technical-user` or `system`) to the client data |
| `enrich-header-with-client-region` | `false` | Add `region` from the trusted subjects file for client certificates |

The chart's default configuration enables both.

## valkey

Valkey is used only for the
[burst detection](/components/cmk/security/audit#denied-and-unauthenticated-requests)
of unauthenticated requests. Without `rateDetection.enabled`, ExtAuthZ never
connects to it.

| Setting | Default | Description |
| --- | --- | --- |
| `address` | - | Value reference. One or more `host:port`, separated by commas |
| `user`, `password` | - | Value references |
| `prefix` | - | Prefix for the counter keys |
| `secretRef` | - | Only `type: mtls` enables TLS |
| `masterSet` | - | Sentinel master set name. Setting it switches to Sentinel |
| `topologyRefreshInterval` | `0` | Sentinel topology refresh interval. `0` disables it |
| `rateDetection.enabled` | `false` | Enable burst detection |
| `rateDetection.threshold` | `50` | Unauthenticated requests per identity and window that make a burst. Must be at least `1` |
| `rateDetection.window` | `1m` | Counting window |
| `rateDetection.cooldown` | value of `window` | Time without further events for the same identity. Keep it at least as long as `window` |
| `rateDetection.countUnknown` | `false` | Also count requests without any credentials |
| `rateDetection.queueSize` | `1024` | Size of the audit queue. When it is full, events are dropped |
| `rateDetection.workers` | `4` | Workers that send audit events |
| `rateDetection.dispatchTimeout` | `10s` | Timeout for one queued event |

## audit

| Setting | Default | Description |
| --- | --- | --- |
| `endpoint` | - | OTLP/HTTP logs endpoint. If empty, no audit events are sent |
| `httpClient` | - | Timeout and credentials for the endpoint, as for `jwt.httpClient` |
| `additionalProperties` | - | YAML map, as a string, of properties added to every event |

Events are sent as OTLP JSON with `POST`. Any status other than `200` or `201`
counts as a failure and is logged. See [Audit logging](/components/cmk/security/audit).

## logger

| Setting | Default | Description |
| --- | --- | --- |
| `level` | `info` | `debug`, `info`, `warn` or `error`. The chart default is `debug` |
| `format` | `json` | `json` or `text` |
| `source` | `false` | Add the source code location |

At `debug` level, ExtAuthZ logs the reason for every decision and the client
data it issues. Use `info` in production.

## telemetry

`telemetry.traces`, `telemetry.metrics` and `telemetry.logs` take `enabled`,
`protocol` (`grpc` or `http`), `host` or `url`, and `secretRef`. Prometheus
metrics on `/metrics` need both `telemetry.metrics.enabled` and
`telemetry.metrics.prometheus.enabled`. Each request creates the span
`ext_authz.check` with the attributes `ext_authz.decision` and
`ext_authz.auth_type`.

## Responses

| Decision | HTTP status | Body |
| --- | --- | --- |
| Allowed | Request is forwarded | - |
| No credentials, invalid credentials, invalid CSRF token | `401` | `{"error":{"code":"AUTHENTICATION_REQUIRED","status":401,"message":"..."}}` |
| Policy or trust check failed, no provider for the token | `403` | `{"error":{"code":"FORBIDDEN","status":403,"message":"Permission denied"}}` |
| Tenant blocked | `403` | `{"error":{"code":"TENANT_BLOCKED","status":403,"message":"Tenant is blocked"}}` |
| Client data could not be signed | `500` | `{"error":{"code":"INTERNAL_SERVER_ERROR","status":500,"message":"Internal server error"}}` |

When a request is allowed, ExtAuthZ removes `x-forwarded-client-cert` and adds
`x-client-data` and `x-client-data-signature`. If a request carries several
credentials, the most restrictive result decides; when all are allowed, the
client data comes from the client certificate, then the token, then the
session.

## Troubleshooting

Set `logger.level: debug` to see the reason for each decision in the log entry
`Check(): overall result`.

| Symptom | Log message | Cause and fix |
| --- | --- | --- |
| Startup fails | `has invalid keys: <key>` | Unknown key in the configuration. Check spelling and nesting |
| Startup fails | `failed to create policy set` | Cedar syntax error in a policy file |
| Startup fails | `trusted subjects file path cannot be empty`, `could not read trusted subjects file` | Set `mtls.trustedSubjectsYaml` and mount the file |
| Startup fails | `path does not exist` | The directory of `clientData.signingKeyIDFilePath` is not mounted |
| Startup fails | `invalid URL scheme` | A provider's `issuerURI` or `jwksURI` is not `https` |
| Pod never ready | - | `grpcServer.flags.health` is not `true`, or `status.address` does not match the probe port |
| Every authenticated request `403` | - | No policy loaded: check the path in the startup log entry `Handling cedar policies` and that `.cedar` files are mounted directly in it. Also check principals written with spaces |
| Certificate clients `403` | `Subject not trusted` | Subject not in the trusted subjects file, or written with spaces |
| Token `401` | `Missing kid in token header`, `Missing exp in token claims` | The identity provider must issue `kid` and `exp` |
| Token `401` | `Failed to validate token audience` | `aud` does not contain a configured audience |
| Token `401` | `Failed to validate token claims` | Clock skew of more than one minute, or token expired |
| Token `401` | `could not find key for key ID` | The JWKS has no key with this `kid` and `"use": "sig"` |
| Token `401` | `introspecting token` | Introspection endpoint not reachable or rejects the client credentials |
| Token `403` | `Failed to get provider for issuer` | No provider for the `iss` value; check the exact string including a trailing `/` |
| Session `401` | `CSRF token is not valid` | `x-csrf-token` missing, or the CSRF secrets of ExtAuthZ and Session Manager differ (including a trailing newline) |
| Session `401` | `failed to get session from session manager` | Session Manager not reachable, or wrong `secretRef` |
| Session `401` | `missing tenant id in the path` | Path ends right after the session prefix |
| Allowed requests `500 INTERNAL_SERVER_ERROR` | `signing key ID file "keyId" not found`, `signing key with ID "key2" not found`, `failed to parse private key` | Signing key Secret incomplete, or not an unencrypted RSA private key |
| CMK answers `500 NO_BUSINESS_DATA` | CMK: `public key not found or invalid`, `crypto/rsa: verification error` | CMK has no public key for ExtAuthZ's key ID, or one that does not match. See [client data troubleshooting](/components/cmk/security/client-data#troubleshooting) |
