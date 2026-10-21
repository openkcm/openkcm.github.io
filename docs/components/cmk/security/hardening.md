# Hardening checklist

Review these settings before you expose an OpenKCM installation to real users or
real keys. The chart defaults are safe where a default can be, but several
settings depend on your environment and must be decided by you. The
[regional installation guide](/components/cmk/security/configuration) applies
most of them.

## Edge

- Route every API request for CMK through ExtAuthZ: attach the external
  authorization `SecurityPolicy` to every route of a CMK service. Only the
  Session Manager routes (`/sm/*`) stay without it.
- Let Envoy validate client certificates against your client CA
  (`tls.clientValidation` in the `ClientTrafficPolicy`). ExtAuthZ checks the
  certificate subject and validity; the chain is checked by Envoy.
- Set `headers.xForwardedClientCert.mode: SanitizeSet` in the
  `ClientTrafficPolicy`, so that only Envoy sets the `x-forwarded-client-cert`
  header.
- Set `path.escapedSlashesAction: RejectRequest` and keep slash merging on, so
  that Cedar policies and the tenant in the path see normalized paths.
- List explicit CORS origins, methods and headers (`content-type`,
  `x-csrf-token`) instead of `*`, because the CMK route allows credentials.
- Serve the CMK UI only through the gateway, with the response headers
  `Content-Security-Policy: frame-ancestors 'none'`, `X-Frame-Options: DENY`,
  `Strict-Transport-Security` and `X-Content-Type-Options: nosniff`; see the
  [CMK UI route](/components/cmk/security/configuration#cmk-ui-route).
- Restrict the identity provider's administration console to administrators if
  it is published through the same gateway.

## Internal network

- Run all services in a service mesh with mutual TLS. The gRPC connections
  between the services inside the cluster use `secretRef.type: insecure` and
  rely on the mesh for encryption and authentication. Connections that leave the
  mesh, for example to a Registry in another cluster, go through a gateway or
  mesh that terminates TLS and checks client certificates.
- Allow each gRPC API only to its callers, with the charts' network policies or
  the mesh's authorization policies:

  | Service | Port | Allowed callers | Chart setting |
  | --- | --- | --- | --- |
  | ExtAuthZ | gRPC 9092 | Envoy Gateway | `networkPolicy.grpc.from` |
  | Session Manager | gRPC 9091 | ExtAuthZ and every CMK process | `networkPolicy.grpc.from` |
  | Session Manager | HTTP 8080 | Envoy Gateway | `networkPolicy.http.from` |
  | CMK | HTTP 8081 | Envoy Gateway | `networkPolicy.http.from` |
  | Registry | gRPC 9092 | The regional CMKs and CMK-2-Krypton Bridges, your onboarding tooling and your cloud services | `networkPolicy.grpc.from` |

  Select the CMK processes with `app.kubernetes.io/part-of: cmk`: the tenant
  manager and the event reconciler carry their own `app.kubernetes.io/name`.
  Callers in other clusters cannot be selected by pod selectors; allow them
  with the mesh's authorization policies.
- Restrict the Registry's `Tenant.Region` to your CMK regions and `Tenant.ID`
  to lowercase letters, digits and hyphens with its `validations`; see
  [Connect a regional tenant](/components/cmk/tenant-integration#step-1-register-the-tenant).
- Keep the status ports (ExtAuthZ 8080; CMK, Registry, Session Manager and
  Checker 8888) reachable only by the kubelet and your monitoring, with
  `networkPolicy.status.from`.

## Session Manager

- Set `allowedRedirectBaseURLs` to the exact CMK UI origins, each ending with
  `/`.
- Set `csrfSecret` from a Secret, to a random value of at least 32 bytes, and
  use **the same value in ExtAuthZ**
  ([Shared CSRF secret](/components/cmk/security/configuration#shared-csrf-secret)).
- Keep `allowHttpScheme` disabled, in `sessionManager` and in the
  `service.module.grpc.session` service.
- Use the recommended [cookie templates](/components/cmk/security/session-manager-config#cookie-templates).
  Set `sessionCookieTemplate.sameSite: Lax` when the UI and API hosts share a
  parent domain, and write `sameSite` exactly as `Lax`, `Strict` or `None`.
- Authenticate to identity providers with mutual TLS where they support it.
- Protect Valkey with authentication, `secretRef.type: mtls` and network
  policies. It stores sessions together with access and refresh tokens.
- Use TLS to PostgreSQL by setting `PGSSLMODE=verify-full` and `PGSSLROOTCERT`
  for the Session Manager pods.
- Keep gRPC reflection (`grpc.flags.reflection`) and profiling
  (`status.profiling`) off.
- Never set the `DEBUGFEATURES` environment variable in production; it logs
  tokens.
- Use `logger.level: info`.

## ExtAuthZ

- Use **the same CSRF secret as Session Manager**, without a trailing newline,
  and store it in a Secret. Check both copies after every change.
- Set `sessionManager.secretRef`: `insecure` inside the service mesh, or `mtls`
  through a proxy that terminates TLS. The chart requires you to choose.
- Set `audiences` for every entry in `jwt.providers`, so that only tokens issued
  for CMK are accepted.
- Make sure every identity provider publishes an `introspection_endpoint`, so
  that revoked tokens are rejected.
- Keep Cedar policies narrow: restrict `context.host` and `context.path`, name
  principals for technical users, and never use `context.issuer like "*"`
  outside of test environments.
- Keep the trusted subjects file limited to the systems that need access.
- Keep profiling (`status.profiling`) and gRPC reflection
  (`grpcServer.flags.reflection`) off, and use `logger.level: info`.
- Run at least two replicas; Envoy denies requests while ExtAuthZ is
  unavailable.

## CMK

- Use `logger.level: info`; `debug` and `trace` log the complete configuration.
- Keep `http.swaggerEnabled` and `status.profiling` disabled.
- Connect to PostgreSQL with `database.parameters.ssl.mode: verify-full`, the
  chart default.
- Use `scheduler.taskQueue.secretRef.type: mtls` for the task queue.
- Use `amqps://` URLs for `tenantManager` and `eventProcessor`, with client
  certificates.
- Set `checksum` for external plugins, and keep the pod's environment free of
  credentials that plugins do not need: plugins run with the pod's environment.
- `extraVolumes` are mounted into every CMK pod. Mount only the Secrets the
  components need, with `defaultMode: 0440`.
- Keep every password, key and token in a mounted Secret (`source: file`).
  Values with `source: embedded` are stored in plain text in the ConfigMaps.
- Enable `networkPolicy` and allow only Envoy Gateway on the API port
  (`networkPolicy.http.from`). Keep the Service type `ClusterIP`.
- Keep `cmkctl.deploy` off except for maintenance: the cmkctl pod holds all of
  CMK's credentials.
- Give tenant administrator and auditor membership
  (`KMS_TenantAdministrator_<tenant>`, `KMS_TenantAuditor_<tenant>`) only to the
  intended users in the identity provider.

## CMK UI

- Keep the chart's security defaults: nginx as a non-root user, a read-only
  root filesystem, all capabilities dropped and the `RuntimeDefault` seccomp
  profile.
- Set `config.apiBaseUrl` to the region's own API host, with `https://`.
- Enable `networkPolicy` and admit only the gateway in `networkPolicy.http.from`.

## Checker

- If you publish Checker's `/healthz` outside the cluster, set
  `config.healthcheck.maskURLs: true` and restrict the callers with
  `networkPolicy` or your gateway.

## Signed client data

- Keep the private signing keys in a Secret that only ExtAuthZ can read, and
  give CMK only the public keys, in a Secret of its own. Check that every `.pem`
  entry of CMK's Secret is a public key, with the
  [Secret check command](/components/cmk/security/client-data#kubernetes-secrets).
- Use RSA keys of at least 3072 bits, and a new key ID for every key pair.
- Keep only the public keys of active signing keys in CMK's directory, and
  remove a public key when its private key is retired.
- Rotate the signing key regularly, following the
  [rotation procedure](/components/cmk/security/client-data#key-rotation). If a
  private key may be exposed, follow
  [Replacing a compromised key](/components/cmk/security/client-data#replacing-a-compromised-key).
- Route all CMK API traffic through the gateway, so that every request carries
  client data signed by ExtAuthZ.
- Keep clocks synchronized; client data is valid for one minute.

## Service-to-service traffic

- CMK and the Registry exchange tenant and key tasks through the AMQP broker,
  including the tenants' authentication settings. Connect with `amqps://` and
  client certificates (`secretRef.type: mtls`), give each service its own
  certificate, and allow each service to publish and consume only its own
  queues.
- Give every CMK region its own pair of tenant job queues, so that each
  region's tenant manager reads only the jobs of its own tenants.

## Identity providers

- Use a dedicated realm or tenant and a dedicated client for Session Manager.
  Do not share its client secret with other applications.
- Issue `groups` as a list in ID tokens and in introspection responses.
- Configure back-channel logout so that a logout at the identity provider ends
  the CMK session.

## Audit

- Configure `audit.endpoint` in every service and forward events to a store
  that operators of OpenKCM cannot modify.
- Monitor delivery errors in the service logs, and alert on them.
