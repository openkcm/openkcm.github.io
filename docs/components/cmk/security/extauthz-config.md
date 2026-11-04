# ExtAuthZ configuration reference

This page describes the configuration of [ExtAuthZ](/components/cmk/extauthz):
how ExtAuthZ applies each setting, what it requires, and what happens when a
setting is wrong. For the end-to-end setup with Session Manager, CMK and Envoy
Gateway, see the [regional installation guide](/components/cmk/security/configuration).
The Helm chart's
[values.yaml](https://github.com/openkcm/extauthz/blob/main/charts/extauthz/values.yaml)
documents every key with its default and examples; this page links to it for
settings that need no further explanation.

Settings marked as a *value reference* take `source: embedded | env | file`, and
settings marked as *credentials* take a `secretRef`. Both are described in
[Configuration conventions](/components/cmk/security/configuration#configuration-conventions).
YAML examples show the keys under `config` of the Helm values, which are the
top-level keys of `config.yaml`.

## How ExtAuthZ reads its configuration

| Aspect | Behaviour |
| --- | --- |
| File | `config.yaml`, parsed as YAML |
| Search order | `/etc/extauthz/`, then `$HOME/.extauthz/`, then the working directory. The first file found is used |
| Helm chart | Renders the `config` value into a ConfigMap named after the release (`extauthz-config` for a release named `extauthz`; with `configMap.immutable`, the name ends with a hash of the content) and mounts its key `config.yaml` with `subPath` at `/etc/extauthz/config.yaml` |
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
| OIDC discovery documents | Static providers: on first use, then kept for the process lifetime. Tenant identity providers: whenever needed | Restart, for static providers |
| Identity provider signing keys (JWKS) | On first use, cached for 5 minutes per provider and key ID | Automatic |

From chart version 0.15.0, the Helm chart restarts the pods when a value under
`config` changes. Policies, trusted subjects and Secrets that you manage
yourself still need a restart after you change them:

```sh
kubectl -n envoy-gateway-system rollout restart deployment/extauthz
```

The Deployment is named like the release, or `<release>-extauthz` if the
release name does not contain `extauthz`. Older chart versions never restart
the pods on their own.

### Helm chart and rendered keys

The chart is in the
[extauthz repository](https://github.com/openkcm/extauthz/tree/main/charts/extauthz).
Its [README](https://github.com/openkcm/extauthz/blob/main/charts/extauthz/README.md)
lists the resources it creates and the upgrade notes from 0.14.x.

- **Chart 0.15.0 and later** writes every key under `config` into
  `config.yaml`, except the chart keys `environment`, `labels`, `application`
  and `isImmutable`:
  - `config.environment` and `config.labels` become `application.environment`
    and `application.labels`. `application.name` is the chart name
    (`nameOverride`).
  - `config.application` overrides single fields of `application`, for example
    `name: extauthz-eu10` to tell several installations apart in logs, traces
    and metrics.
  - `config.isImmutable` is the old name of `configMap.immutable`.
- ExtAuthZ rejects unknown keys, so a misspelled key stops the pods at startup
  instead of being ignored. `labels` and `featureGates` accept any name.
  `featureFlags` is accepted but has no effect in ExtAuthZ.
- **Older charts** render only `environment`, `labels`, `isImmutable`,
  `featureGates`, `logger`, `status`, `telemetry`, `grpcServer`, `cedar`,
  `mtls`, `jwt`, `clientData`, `audit`, `valkey`, `sessionPathPrefixes`,
  `sessionManager` and `csrfSecret`, and drop other keys such as
  `featureFlags`.

Chart 0.15.0 also sets probes, resource requests and a restrictive security
context, runs the pods as user and group 65532 (`fsGroup` 65532), and can
create a NetworkPolicy (`networkPolicy.enabled`) that admits only Envoy
Gateway. It disables `sessionManager` until you configure it, and refuses to
render when `sessionManager.enabled` is `true` without `sessionManager.secretRef`.
Container ports come from `extraPorts`; the chart's Service exposes `grpc`
(9092) and `http-status` (8080).

Where the chart's defaults differ from ExtAuthZ's own:

| Setting | ExtAuthZ default | Chart 0.15.0 default |
| --- | --- | --- |
| `status.enabled` | `false` | `true` |
| `status.address` | `:8888` | `:8080` |
| `grpcServer.flags.health` | `false` | `true` |
| `cedar.policyPath` | - | `/etc/extauthz-policies` |
| `mtls.trustedSubjectsYaml` | - | `/etc/extauthz-mtls/trustedSubjects.yaml` |
| `clientData.signingKeyIDFilePath` | - | `/etc/extauthz-signing/keyId` |
| `sessionPathPrefixes` | `[]` | `["/cmk/v1/"]` |
| `featureGates` | Both gates `false` | Both gates `true` |
| `application.environment` | Empty | `production` |

`logger.level` is `info` in both.

### Volumes

ExtAuthZ reads its policies, trusted subjects and signing keys from files. The
pod always mounts the configuration file and, with `tmpVolume.enabled`, a
writable `emptyDir` at `/tmp`. The default `extraVolumes` and
`extraVolumeMounts` add three volumes from objects that you create in the
release namespace. The chart does not create them, and the pods do not start
until they exist:

| Object | Mount path | Keys | Read through |
| --- | --- | --- | --- |
| ConfigMap `extauthz-trusted-subjects` | `/etc/extauthz-mtls` | `trustedSubjects.yaml` | `mtls.trustedSubjectsYaml` |
| ConfigMaps `extauthz-systems-policies` and `extauthz-users-policies`, projected into one volume | `/etc/extauthz-policies` | `*.cedar` files, with different names in the two ConfigMaps | `cedar.policyPath` |
| Secret `extauthz-signing-keys-secret` | `/etc/extauthz-signing` | `keyId` and `<key ID>.pem` | `clientData.signingKeyIDFilePath` |

- Every key of these objects becomes a file of the same name.
- Setting `extraVolumes` or `extraVolumeMounts` replaces the whole list. Repeat
  the three default entries when you add your own, for example the CSRF secret
  or credentials for outgoing connections. The
  [minimal configuration](#minimal-configuration) shows both lists.
- Mount nothing at `/etc/extauthz/config.yaml` or over `/etc/extauthz`: that
  directory holds the configuration file.
- Mount Secrets with `defaultMode: 0440`. The pods run with `fsGroup` 65532, so
  ExtAuthZ can read them. For a projected volume, set `defaultMode` on
  `projected`.
- To use other names or paths, change the volumes and the matching paths under
  `config`.

Create the objects from local files:

```sh
NS=envoy-gateway-system
kubectl -n $NS create configmap extauthz-trusted-subjects --from-file=trustedSubjects.yaml
kubectl -n $NS create configmap extauthz-systems-policies --from-file=systems.cedar
kubectl -n $NS create configmap extauthz-users-policies --from-file=users.cedar
kubectl -n $NS create secret generic extauthz-signing-keys-secret \
  --from-file=keyId --from-file=key-2026-10.pem
```

The formats of these files are described in [cedar](#cedar), [mtls](#mtls) and
[clientData](#clientdata).

## Minimal configuration

Helm values for chart 0.15.0, for CMK UI users (sessions) and one statically
trusted token issuer. The chart's defaults set `status`, `grpcServer`,
`logger`, `cedar`, `mtls`, `clientData` and `sessionPathPrefixes`:

```yaml
# extauthz-values.yaml
replicaCount: 2

networkPolicy:
  enabled: true
  grpc:
    from:
      - podSelector:
          matchLabels: { app.kubernetes.io/name: envoy }

extraVolumes:
  # The chart's default volumes, repeated because the list is replaced
  - name: extauthz-trusted-subjects-volume
    configMap:
      name: extauthz-trusted-subjects
  - name: extauthz-policies-volume
    projected:
      sources:
        - configMap:
            name: extauthz-systems-policies
        - configMap:
            name: extauthz-users-policies
  - name: extauthz-signing-keys-volume
    projected:
      defaultMode: 0440
      sources:
        - secret:
            name: extauthz-signing-keys-secret
  # The CSRF secret, shared with Session Manager
  - name: csrf-secret
    secret:
      secretName: csrf-secret
      items: [{ key: csrf_secret, path: csrf_secret }]
      defaultMode: 0440
extraVolumeMounts:
  - name: extauthz-trusted-subjects-volume
    mountPath: /etc/extauthz-mtls
    readOnly: true
  - name: extauthz-policies-volume
    mountPath: /etc/extauthz-policies
    readOnly: true
  - name: extauthz-signing-keys-volume
    mountPath: /etc/extauthz-signing
    readOnly: true
  - name: csrf-secret
    mountPath: /etc/credentials/csrf-secret
    readOnly: true

config:
  jwt:
    providers:
      - issuer: https://idp.example.com/realms/cmk
        audiences: [cmk-api]
  sessionManager:
    enabled: true
    address: session-manager.services.svc.cluster.local:9091
    secretRef:
      type: insecure      # plain gRPC inside a service mesh with mutual TLS
  csrfSecret:             # the same bytes as Session Manager's sessionManager.csrfSecret
    source: file
    file: { path: /etc/credentials/csrf-secret/csrf_secret, format: binary }
```

## grpcServer

The gRPC server that Envoy Gateway calls for every request, with the Envoy
external authorization API. The chart sets `address: :9092` to match its `grpc`
port and `flags.health: true`. Keep `flags.health: true`: the readiness probe
calls the gRPC health service. Keep `flags.reflection: false` in production.

The other settings have defaults that suit Envoy Gateway: the largest request
message (`maxRecvMsgSize`, 120 MiB), the keepalive enforcement (`efPolMinTime`,
`180s`: clients that send keepalive pings more often are disconnected;
`efPolPermitWithoutStream`), the connection lifetime and server pings
(`attributes.*`: connections are closed after about 30 minutes) and the client
of the readiness check (`client.*`). `config.grpcServer` in
[values.yaml](https://github.com/openkcm/extauthz/blob/main/charts/extauthz/values.yaml)
lists each one with its default. `enabled` and `maxSendMsgSize` are accepted but
have no effect.

The gRPC API serves plain gRPC. Only Envoy Gateway may reach it: enable the
chart's NetworkPolicy with the Envoy Gateway proxies as the only peers, and run
ExtAuthZ in a service mesh with mutual TLS.

## status

The HTTP server for the probes, the build version and Prometheus metrics. The
chart enables it on `:8080`, the `http-status` port that its probes use;
ExtAuthZ's own defaults are `enabled: false` and `address: :8888`.
`profiling: true` serves the Go profiling endpoints at `/debug/pprof/` on the
status port; set it only for troubleshooting and keep `false` in production.
`timeout` is accepted but has no effect. See `config.status` in
[values.yaml](https://github.com/openkcm/extauthz/blob/main/charts/extauthz/values.yaml).

| Endpoint | Purpose |
| --- | --- |
| `/probe/liveness` | Always `200` while the process runs. Used by the chart's startup and liveness probes |
| `/probe/readiness` | `200` when ExtAuthZ answers its own gRPC health check within 5 seconds, otherwise `503`. Does not check identity providers, keys or Session Manager |
| `/version` | Build information |
| `/metrics` | Prometheus metrics, with `telemetry.metrics.enabled` and `telemetry.metrics.prometheus.enabled` |

## cedar

| Setting | Default | Description |
| --- | --- | --- |
| `policyPath` | - (chart: `/etc/extauthz-policies`) | Directory with the policy files. ExtAuthZ loads every file that ends in `.cedar` directly in this directory; other files and subdirectories are ignored |

Policies are loaded once at startup. A file holds any number of `permit` and
`forbid` policies, each ending with `;`, and `//` comments. A syntax error
stops startup with `failed to create policy set`. If no policy file is found,
ExtAuthZ starts and denies every authenticated request with `403`. In the debug
log, policies are named `<file name>-<n>`, counted from 0 in each file, for
example `systems.cedar-0`.

### Request model

ExtAuthZ evaluates the policies once for each credential in the request. A
request is allowed if at least one `permit` policy matches and no `forbid`
policy does.

| Cedar element | Value |
| --- | --- |
| Principal | `Subject::"<subject>"` |
| Action | `Action::"<HTTP method>"`, for example `Action::"GET"` |
| Resource | Not set. Write `resource` without a condition |
| Context | Attributes listed below, all strings |
| Entities | None, and no schema. Without an entity hierarchy, compare the principal with `==` or `in [ ... ]` |

The subject depends on the credential:

| Credential | Subject |
| --- | --- |
| Session | The user ID (`sub`) from the session |
| Bearer token | The token's `sub` claim |
| Client certificate | The certificate subject, written as in the [trusted subjects file](#mtls), for example `CN=billing,OU=Clients,O=Example Corp,C=DE` |

Cedar strings use `\` as escape character: write every backslash of a subject
twice. The subject `CN=billing,OU=Clients,O=Example\, Inc.,C=US` becomes
`Subject::"CN=billing,OU=Clients,O=Example\\, Inc.,C=US"`.

### Context attributes

| Attribute | Session | Bearer token | Client certificate |
| --- | --- | --- | --- |
| `context.type` | `"session"` | `"jwt"` | `"x509"` |
| `context.host` | Request host | Request host | Request host |
| `context.path` | Request path including the query string | same | same |
| `context.issuer` | Issuer of the tenant's identity provider | The token's `iss` claim | Certificate issuer, written like the subjects |
| `context.jwksURI` | - | The token's `jku` header, or `""` | - |

A policy whose condition reads a missing attribute, for example
`context.jwksURI` for a client certificate, does not apply, whether it is a
`permit` or a `forbid` policy. Check `context.type == "jwt" &&` or
`context has jwksURI &&` before you read `context.jwksURI`.

`context.path` is the path as Envoy Gateway forwards it. Let Envoy Gateway
normalize paths and reject ambiguous ones (see the
[hardening checklist](/components/cmk/security/hardening#edge)), and match with
`like "/cmk/v1/*"` rather than on exact strings, because the path includes the
query string.

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
    context.host == "api.example.com" &&
    context.path like "/cmk/v1/*"
};
```

A technical system with a client certificate:

```text
permit (
    principal == Subject::"CN=billing,OU=Clients,O=Example Corp,C=DE",
    action in [Action::"GET", Action::"POST"],
    resource
) when {
    context.type == "x509" &&
    context.issuer == "CN=Example Client CA,O=Example Corp,C=DE" &&
    context.host == "api.example.com" &&
    context.path like "/cmk/v1/*"
};
```

Read-only access for several certificate subjects, one of them with an escaped
comma:

```text
permit (
    principal,
    action == Action::"GET",
    resource
) when {
    principal in [
        Subject::"CN=reporting,OU=Clients,O=Example Corp,C=DE",
        Subject::"CN=billing,OU=Clients,O=Example\\, Inc.,C=US"
    ] &&
    context.type == "x509" &&
    context.issuer == "CN=Example Client CA,O=Example Corp,C=DE" &&
    context.host == "api.example.com" &&
    context.path like "/cmk/v1/*"
};
```

Block one kind of request for everyone. `forbid` always wins over `permit`:

```text
forbid (principal, action == Action::"DELETE", resource)
when { context.path like "/cmk/v1/*/keyConfigurations*" };
```

Without a matching `permit`, a request is denied.

## mtls

| Setting | Default | Description |
| --- | --- | --- |
| `trustedSubjectsYaml` | - (chart: `/etc/extauthz-mtls/trustedSubjects.yaml`) | Path of the trusted subjects file. **Required**: startup fails if it is empty, contains `..`, cannot be read or is not valid YAML |

The file maps each region to the client certificate subjects that may call
through Envoy Gateway. A region is any name; with
`enrich-header-with-client-region`, ExtAuthZ passes it to CMK in the client
data.

```yaml
eu10:
  - CN=billing,OU=Clients,O=Example Corp,C=DE
  - CN=reporting,OU=Clients,O=Example Corp,C=DE
us10:
  - 'CN=billing,OU=Clients,O=Example\, Inc.,C=US'
```

- Write each subject as Envoy formats it (RFC 2253): the most specific
  attribute first, separated by commas without spaces, for example
  `CN=TechSys01,OU=MyUnit,O=MyOrg,C=DE`. The comparison is an exact string
  match.
- In a value, escape `,` `+` `"` `\` `<` `>` `;` and `=` with `\`. Put a subject
  that contains `\` in single quotes, as in the `us10` entry.
- ExtAuthZ also reads the subject from the certificate and requires both to be
  equal. Use certificates whose subject has only the attributes `CN`, `OU`, `O`,
  `L`, `ST`, `C`, `DC` and `UID`, with ASCII values.
- `openssl x509 -noout -subject -nameopt RFC2253 -in client.crt` prints a
  subject in this form, after `subject=`, unless a value contains `=`.
- List each subject in one region only. With duplicates, the region is not
  predictable.
- Empty region names and empty subjects stop startup. An empty file (`{}`) is
  valid and trusts no certificate.

Listed subjects still need a Cedar policy that permits the request.

### Client certificate checks

ExtAuthZ reads the `x-forwarded-client-cert` header, which Envoy Gateway sets
with the `Subject` and `Cert` of the verified client certificate. If the header
contains several elements, for example from several proxies, every element must
pass.

| Step | Failure |
| --- | --- |
| The element is well-formed and contains `Cert`, a certificate that can be parsed | `401` |
| `Subject` of the element, if present, equals the subject that ExtAuthZ reads from the certificate | `403` |
| The subject is in the trusted subjects file | `403` |
| The certificate is within its validity period | `403` |
| A Cedar policy permits the request | `403` |

Envoy Gateway validates the certificate chain against your client CA and sets
the header itself, replacing any value that a client sends. Configure both as
described in
[Client certificates and path handling](/components/cmk/security/configuration#client-certificates-and-path-handling),
and let only Envoy Gateway reach ExtAuthZ (see [grpcServer](#grpcserver)).

## jwt

| Setting | Default | Description |
| --- | --- | --- |
| `issuerClaimKeys` | `[iss]` | Claims that hold the token issuer, tried in order. The first claim with a string value selects the provider. `context.issuer` is always the `iss` claim |
| `providers` | `[]` | Statically trusted token issuers |
| `httpClient` | - | HTTP client for token introspection at static providers |
| `oauth2` | - | Client authentication for token introspection at tenant identity providers |

### jwt.providers

| Field | Default | Description |
| --- | --- | --- |
| `issuer` | - | The issuer exactly as it appears in the token, including any trailing `/` |
| `issuerURI` | value of `issuer` | `https` base URL of the OpenID Connect discovery document (`<issuerURI>/.well-known/openid-configuration`). Set it if `issuer` is not that URL |
| `jwksURI` | from discovery | `https` URL of the signing keys. A provider with `jwksURI` serves only tokens whose `jku` header equals this URL |
| `audiences` | - | Accepted `aud` values. **Set them for every provider**: ExtAuthZ checks the audience only against a non-empty list |
| `disableTokenIntrospection` | `false` | Skip [token introspection](#token-introspection) |

`issuerURI` and `jwksURI` must be `https` URLs; startup fails with
`invalid URL scheme` otherwise. Because `issuerURI` defaults to `issuer`, a
provider whose `issuer` is not an `https` URL needs `issuerURI`.

### Provider selection

ExtAuthZ first checks that the token's `jku` header, if present, or otherwise
its issuer is an `https` URL. A token that fails this check gets `401`. Then
ExtAuthZ uses the first provider that matches:

1. If the token has a `jku` header: a static provider whose `jwksURI` equals
   that header and whose `issuer` equals the token issuer.
1. A static provider **without** `jwksURI` whose `issuer` equals the token
   issuer.
1. The identity provider of the tenant in the request path, from Session
   Manager. This works only on paths under `sessionPathPrefixes`, because the
   tenant ID comes from the path.

If none matches, the request is denied with `403` and the message
`No provider found`. As a result:

- For tokens without a `jku` header, configure the issuer without `jwksURI`.
- A token whose issuer is not an `https` URL needs an `https` `jku` header.
- List each `issuer` without `jwksURI`, and each `jwksURI`, only once.

Static provider with discovery and token introspection, for tokens with or
without `jku`:

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

Static provider with fixed signing keys and without discovery, for tokens whose
issuer claim is `automation` and whose `jku` header is the `jwksURI`:

```yaml
jwt:
  providers:
    - issuer: automation
      issuerURI: https://idp.example.com/realms/automation
      jwksURI: https://idp.example.com/realms/automation/protocol/openid-connect/certs
      audiences: [cmk-api, cmk-automation]
      disableTokenIntrospection: true
```

### Token requirements

| Requirement | Detail |
| --- | --- |
| Header | `Authorization: Bearer <token>`. The word `Bearer` is case-sensitive |
| Algorithm | `RS256` only |
| Key ID | The token header must contain `kid`. The provider's JWKS must contain a key with that `kid` and `"use": "sig"` |
| `jku` or issuer | The `jku` header, if present, otherwise the issuer claim, must be an `https` URL |
| `exp` | Required |
| `exp`, `nbf`, `iat` | Checked with 1 minute of clock-skew tolerance |
| `aud` | Must contain one of the provider's `audiences`, if configured |
| `groups` | Optional. If present, it must be an array of strings |

Claims used for the client data: `sub` (identifier), `mail` (email) and
`groups`. Name claims are not read from tokens.

### Token introspection

ExtAuthZ checks with the identity provider whether the token is still active,
unless the provider sets `disableTokenIntrospection`.

- The endpoint is the `introspection_endpoint` of the provider's discovery
  document. Use identity providers that publish one.
- The request is `POST` with the form field `token=<token>`.
- Static providers authenticate with [`jwt.httpClient`](#jwt-httpclient).
  Tenant identity providers authenticate with [`jwt.oauth2`](#jwt-oauth2) and
  the tenant's client ID.
- Results are cached for 30 seconds per token. The cache is used only for `GET`
  requests; other methods always introspect.
- An inactive token gets `401`. If the endpoint cannot be reached or does not
  answer `200`, the request gets `401`.

### jwt.httpClient

Used only for token introspection at static providers. Discovery documents and
signing keys are fetched without it and are verified against the system CA
certificates of the image: their endpoints need certificates from a CA in that
bundle.

- `timeout` limits each request (default `10s`).
- Client authentication is one of `basicAuth` (username and password as value
  references), `oauth2Auth` (as [`jwt.oauth2`](#jwt-oauth2), plus
  `credentials.clientID`) and `apiToken` (sent as
  `Authorization: Api-Token <token>`). If several are set, ExtAuthZ uses the
  first in this order: `basicAuth`, `oauth2Auth`, `apiToken`.
- `mtls` adds a client certificate, and `transportAttributes` sets the
  connection pool and timeouts of the transport.

`config.jwt` in
[values.yaml](https://github.com/openkcm/extauthz/blob/main/charts/extauthz/values.yaml)
describes each field, with an example of each form. `audit.httpClient` takes
the same settings.

### jwt.oauth2

A template for introspection at **tenant** identity providers. ExtAuthZ fills
in the client ID that Session Manager returns for the tenant (a
`credentials.clientID` in the template is replaced) and authenticates with the
template's credentials. Configure it when the tenants' identity providers have
a client ID; without a valid template, tokens from these identity providers are
denied with `403`.

| Field | Default | Description |
| --- | --- | --- |
| `credentials.authMethod` | `post` | `post`, `basic`, `jwt`, `private` or `none`, see below |
| `credentials.clientSecret` | - | Value reference, for `post`, `basic` and `jwt` |
| `credentials.clientAssertion`, `credentials.clientAssertionType` | - | Value references, for `private` |
| `url` | - | Value reference: the token endpoint, used as audience of the client assertion with `jwt` |
| `mtls` | - | Client certificate. It authenticates the client on its own, without a secret or assertion |

| `authMethod` | ExtAuthZ sends |
| --- | --- |
| `post` | `client_id` and `client_secret` in the request body |
| `basic` | The client ID and `clientSecret` in the `Authorization` header |
| `jwt` | A client assertion signed with `clientSecret` (HS256) |
| `private` | The configured `clientAssertion` and `clientAssertionType` |
| `none` | `client_id` only, for public clients |

Except with `none`, the template needs a `clientSecret`, a `clientAssertion` or
`mtls`. A secret and an assertion cannot be combined.

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
| `sessionPathPrefixes` | `[]` (chart: `["/cmk/v1/"]`) | Path prefixes whose next path segment is the tenant ID |

On these paths, and only when `sessionManager.enabled` is `true`, ExtAuthZ:

- checks the tenant's session cookie `__Host-Http-SESSION-<tenant ID>` together
  with the CSRF token in the `x-csrf-token` header, and
- checks bearer tokens that no static provider matches against the tenant's
  identity provider.

A trailing `/` is added to each prefix. The first matching prefix wins.

| Request path | Prefix `/cmk/v1/` | Result |
| --- | --- | --- |
| `/cmk/v1/acme/keys` | matches | Tenant `acme` |
| `/cmk/v1/acme` | matches | Tenant `acme` |
| `/cmk/v1/` | matches | `401 missing tenant id in the path` |
| `/cmk/v1` | no match | Not a session path |
| `/registry/v1/acme` | no match | Not a session path |

With an empty list, ExtAuthZ does not use Session Manager at all, even with
`sessionManager.enabled: true`.

## sessionManager

Connection to [Session Manager](/components/cmk/session-manager).

| Setting | Default | Description |
| --- | --- | --- |
| `enabled` | `false` | Enable session cookies and tenant identity providers |
| `address` | - | `host:port` of Session Manager's gRPC API. Startup fails if empty |
| `secretRef` | - | **Required.** `type: insecure`, or `type: mtls` with `mtls.cert`, `mtls.certKey` and `mtls.serverCa`. Other types stop startup |
| `attributes.keepaliveTime`, `attributes.keepaliveTimeout` | `80s`, `40s` | Client keepalive |

Session Manager serves plain gRPC. Run ExtAuthZ and Session Manager in a
service mesh with mutual TLS and set `secretRef: { type: insecure }`:

```yaml
sessionManager:
  enabled: true
  address: session-manager.services.svc.cluster.local:9091
  secretRef:
    type: insecure        # inside a service mesh with mutual TLS
```

Use `type: mtls` when ExtAuthZ reaches Session Manager through a proxy that
terminates TLS and requires a client certificate:

```yaml
sessionManager:
  enabled: true
  address: session-manager-tls.example.internal:9443
  secretRef:
    type: mtls
    mtls:
      cert:     { source: file, file: { path: /etc/credentials/sm/tls.crt, format: binary } }
      certKey:  { source: file, file: { path: /etc/credentials/sm/tls.key, format: binary } }
      serverCa: { source: file, file: { path: /etc/credentials/sm/ca.crt, format: binary } }
```

The connection is opened on first use, so an unreachable Session Manager does
not stop startup. It shows up as `401` responses for session requests and
`403` for tokens of tenant identity providers.

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

- Use at least 32 bytes: Session Manager does not start with fewer.
- The value is used byte for byte. A trailing newline in the file is part of
  the secret. Create the Secret without one, for example with
  `--from-literal`.
- A missing setting does not stop startup; every session request then fails the
  CSRF check.

Create the secret once and store the same value in both namespaces:

```sh
CSRF_SECRET="$(openssl rand -hex 32)"
# ExtAuthZ's namespace
kubectl -n envoy-gateway-system create secret generic csrf-secret \
  --from-literal=csrf_secret="$CSRF_SECRET"
# Session Manager's namespace
kubectl -n services create secret generic csrf-secret \
  --from-literal=csrf_secret="$CSRF_SECRET"
```

ExtAuthZ reads the secret with:

```yaml
csrfSecret:
  source: file
  file: { path: /etc/credentials/csrf-secret/csrf_secret, format: binary }
```

The [minimal configuration](#minimal-configuration) shows how to mount the
Secret into ExtAuthZ. Session Manager reads the same value with
[`sessionManager.csrfSecret`](/components/cmk/security/session-manager-config#sessionmanager).

ExtAuthZ checks the `x-csrf-token` header on **every** session request,
including `GET`. Session Manager issues the token when the user signs in. Its
format is `<hex HMAC-SHA256>.<hex random value>`; the HMAC, keyed with the CSRF
secret, binds the token to the session ID. Tokens do not expire on their own;
they end with the session.

## clientData

| Setting | Default | Description |
| --- | --- | --- |
| `signingKeyIDFilePath` | - (chart: `/etc/extauthz-signing/keyId`) | Path of a file that contains the ID of the active signing key. Its directory holds the private keys and must exist at startup |

- The file content, with surrounding whitespace removed, is the key ID. Use
  only letters, digits, `-`, `_` and `.`, without `.pem`, for example
  `key-2026-10`.
- The private key is read from `<key ID>.pem` or `<key ID>` in the same
  directory. Further keys, for example the previous one, may stay in the
  directory; ExtAuthZ signs only with the key named in the key ID file.
- Supported formats: unencrypted PEM-encoded RSA private keys in PKCS #8
  (`BEGIN PRIVATE KEY`) or PKCS #1 (`BEGIN RSA PRIVATE KEY`). Use 2048 bits or
  more.
- ExtAuthZ writes the key ID into every client data as `kid`. CMK must have the
  matching public key as `<key ID>.pem` in its
  [`clientData.signingKeysPath`](/components/cmk/security/cmk-config#clientdata).
- The key is not checked at startup. If it is missing or invalid, every allowed
  request fails at the gateway with `500 INTERNAL_SERVER_ERROR`, and ExtAuthZ
  logs `Check(): failed to encode client data`.
- If the directory does not exist, startup fails with `path does not exist`.

Create the Secret from files, so that no private key is written into a
manifest:

```sh
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out key-2026-10.pem
printf 'key-2026-10' > keyId
kubectl -n envoy-gateway-system create secret generic extauthz-signing-keys-secret \
  --from-file=keyId --from-file=key-2026-10.pem
```

The chart mounts it at `/etc/extauthz-signing` (see [Volumes](#volumes)); set
`defaultMode: 0440` on the volume. CMK gets only the public keys, under the same
file names, in a Secret of its own. Never mount this Secret into CMK.

[Signed client data](/components/cmk/security/client-data#signing-keys) describes
both sides in detail: the signing steps, CMK's checks, key generation,
[rotation](/components/cmk/security/client-data#key-rotation) and
troubleshooting.

## featureGates

| Feature gate | ExtAuthZ default | Chart default | Description |
| --- | --- | --- | --- |
| `enrich-header-with-client-type` | `false` | `true` | Add `type` to the client data: `system` (client certificate without an email address), `technical-user` (client certificate with one) or `user` (bearer token or session) |
| `enrich-header-with-client-region` | `false` | `true` | Add `region` from the trusted subjects file for client certificates |

A gate that is not listed is `false`. Other gate names are accepted and have no
effect.

## valkey

Valkey is used only for the
[burst detection](/components/cmk/security/audit#denied-and-unauthenticated-requests)
of unauthenticated requests. ExtAuthZ counts them per identity (the token
issuer where it is known, otherwise the tenant of a session path) in a Valkey
shared by all pods. When an identity reaches `rateDetection.threshold` requests
within `rateDetection.window`, ExtAuthZ sends one audit event for all pods.
Without `rateDetection.enabled`, ExtAuthZ never connects to Valkey. The events
are delivered only with [`audit`](#audit).

- `address` is required with `rateDetection.enabled`: a value reference with
  one or more `host:port`, separated by commas. With `masterSet`, these are the
  Sentinel addresses.
- `user` and `password` are optional value references.
- For TLS, set `secretRef.type: mtls` with a client certificate. Only this
  type enables TLS.
- `rateDetection.threshold` must be at least `1` (default `50`).
  `rateDetection.window` is counted in whole seconds, at least 1 second
  (default `1m`). Keep `rateDetection.cooldown` at least as long as `window`
  (default: the value of `window`).
- `rateDetection.queueSize`, `workers` and `dispatchTimeout` size the queue of
  audit events. They also apply when only `audit` is set.

`config.valkey` in
[values.yaml](https://github.com/openkcm/extauthz/blob/main/charts/extauthz/values.yaml)
lists every setting with its default, and examples with Sentinel and with
credentials from files or environment variables.

## audit

| Setting | Default | Description |
| --- | --- | --- |
| `endpoint` | - | URL of the OTLP/HTTP logs endpoint, for example `https://otel-collector:4318/v1/logs`. If empty, no audit events are sent |
| `httpClient` | - | Timeout (default `10s`), client authentication and client certificate for the endpoint, as for [`jwt.httpClient`](#jwt-httpclient) |
| `additionalProperties` | - | Properties added to every event, as a YAML map in a string, for example `"{ service: extauthz, region: eu10 }"` |

Events are queued and sent by background workers; when the queue is full,
events are dropped. `valkey.rateDetection.queueSize` (default `1024`),
`workers` (`4`) and `dispatchTimeout` (`10s`) size the queue, also without
Valkey. Events are sent as OTLP JSON with `POST`. Any status other than `200`
or `201` counts as a failure and is logged. See
[Audit logging](/components/cmk/security/audit).

```yaml
audit:
  endpoint: https://otel-collector:4318/v1/logs
  httpClient:
    mtls:
      cert:     { source: file, file: { path: /etc/credentials/audit/tls.crt, format: binary } }
      certKey:  { source: file, file: { path: /etc/credentials/audit/tls.key, format: binary } }
      serverCa: { source: file, file: { path: /etc/credentials/audit/ca.crt, format: binary } }
  additionalProperties: "{ service: extauthz, region: eu10 }"
```

## logger

| Setting | Default | Description |
| --- | --- | --- |
| `level` | `info` | `debug`, `info`, `warn` or `error` |
| `format` | `json` | `json` or `text` |
| `source` | `false` | Add the source file and line |
| `formatter` | - | Time format, field names and masking of personal data. See `config.logger` in [values.yaml](https://github.com/openkcm/extauthz/blob/main/charts/extauthz/values.yaml) |

The chart's default level is also `info`. At `debug` level, ExtAuthZ logs the
reason for every decision and the client data it issues. Use `info` in
production and `debug` only for troubleshooting.

## telemetry

OpenTelemetry export of traces, metrics and logs. Without it, nothing is
exported; the logs on standard output are not affected. Each of
`telemetry.traces`, `telemetry.metrics` and `telemetry.logs` takes:

| Field | Description |
| --- | --- |
| `enabled` | Export this signal. Default `false` |
| `protocol` | `grpc` or `http` (OTLP) |
| `host` | **Required.** Value reference: the collector as `host:port`, without scheme |
| `url` | With `http` only: the URL path. If empty, traces go to `/v1/traces` and metrics to `/v1/metrics`. For logs, set `/v1/logs`: an empty value sends logs to the root path |
| `secretRef` | **Required.** With `grpc`: `insecure`, `mtls`, `api-token` or `basic`. With `http`: `insecure`, `mtls` or `api-token` |

- `api-token` uses TLS and sends `Authorization: Api-Token <token>`. `basic`
  uses TLS and basic authentication.
- `metrics.prometheus.enabled` serves the metrics at `/metrics` on the status
  port instead of exporting them. It needs `metrics.enabled`; `protocol`,
  `host` and `secretRef` of `metrics` are then not used.
- `dynatraceOneAgent: true` adds the Dynatrace OneAgent metadata to the
  telemetry attributes.
- All traces are sampled. Each request creates the span `ext_authz.check` with
  the attributes `ext_authz.decision` and `ext_authz.auth_type`. Exported logs
  are sent in addition to standard output, masked as configured in
  `logger.formatter.fields.masking`.

```yaml
telemetry:
  traces:
    enabled: true
    protocol: http
    host: { value: otel-collector.monitoring:4318 }
    secretRef: { type: api-token, apiToken: { source: env, env: OTEL_API_TOKEN } }
  logs:
    enabled: true
    protocol: http
    host: { value: otel-collector.monitoring:4318 }
    url: /v1/logs
    secretRef: { type: api-token, apiToken: { source: env, env: OTEL_API_TOKEN } }
  metrics:
    enabled: true
    prometheus: { enabled: true }
```

`config.telemetry` in
[values.yaml](https://github.com/openkcm/extauthz/blob/main/charts/extauthz/values.yaml)
has further examples, including `grpc` with `mtls` and `basic`.

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
| Pods stay in `ContainerCreating` | - | A ConfigMap or Secret of the [volumes](#volumes) is missing, or `extraVolumes` and `extraVolumeMounts` do not match |
| Startup fails | `has invalid keys: <key>` | Unknown key in the configuration. Check spelling and nesting |
| Startup fails | `failed to create policy set` | Cedar syntax error in a policy file |
| Startup fails | `trusted subjects file path cannot be empty`, `could not read trusted subjects file` | Set `mtls.trustedSubjectsYaml` and mount the file |
| Startup fails | `path does not exist` | The directory of `clientData.signingKeyIDFilePath` is not mounted |
| Startup fails | `invalid URL scheme` | A provider's `issuerURI` (default: its `issuer`) or `jwksURI` is not an `https` URL |
| Pod never ready | - | `grpcServer.flags.health` is not `true`, or `status.address` does not match the probe port |
| Every authenticated request `403` | - | No policy loaded: check the path in the startup log entry `Handling cedar policies` and that `.cedar` files are mounted directly in it. Also check principals written with spaces |
| Certificate clients `403` | `Subject not trusted` | Subject not in the trusted subjects file, or written differently from Envoy's format (order, spaces, escaping) |
| Certificate clients `403` | `Header subject not matching with certificate subject` | The certificate subject has attributes other than `CN`, `OU`, `O`, `L`, `ST`, `C`, `DC` and `UID`, or non-ASCII values |
| Token `401` | `Missing kid in token header`, `Missing exp in token claims` | The identity provider must issue `kid` and `exp` |
| Token `401` | `Invalid URL scheme` | The token's `jku` header or, without one, its issuer is not an `https` URL |
| Token `401` | `Failed to validate token audience` | `aud` does not contain a configured audience |
| Token `401` | `Failed to validate token claims` | Clock skew of more than one minute, or token expired |
| Token `401` | `could not find key for key ID` | The JWKS has no key with this `kid` and `"use": "sig"` |
| Token `401` | `introspecting token` | Introspection endpoint not reachable or rejects the client credentials |
| Token `403` | `Failed to get provider for issuer` | No [provider matches](#provider-selection): check the exact issuer string including a trailing `/`, and that a provider with `jwksURI` gets tokens with exactly this `jku` header |
| Session `401` | `CSRF token is not valid` | `x-csrf-token` missing, or the CSRF secrets of ExtAuthZ and Session Manager differ (including a trailing newline) |
| Session `401` | `failed to get session from session manager` | Session Manager not reachable, or `secretRef` does not match how ExtAuthZ reaches it |
| Session `401` | `missing tenant id in the path` | Path ends right after the session prefix |
| Allowed requests `500 INTERNAL_SERVER_ERROR` | `signing key ID file "keyId" not found`, `signing key with ID "key-2026-10" not found`, `failed to parse private key` | Signing key Secret incomplete, or not an unencrypted RSA private key |
| CMK answers `500 NO_BUSINESS_DATA` | CMK: `public key not found or invalid`, `crypto/rsa: verification error` | CMK has no public key for ExtAuthZ's key ID, or one that does not match. See [client data troubleshooting](/components/cmk/security/client-data#troubleshooting) |
