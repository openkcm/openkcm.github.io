# Hardening checklist

Review these settings before you expose an OpenKCM installation to real users or
real keys. Chart defaults and example configurations favor ease of setup over
security.

## Edge

- Route every API request for CMK and the Registry through ExtAuthZ. A route
  without the external authorization policy bypasses authentication. Only the
  Session Manager routes (`/sm/*`) stay without it.
- Let Envoy validate client certificates. ExtAuthZ checks the certificate
  subject and validity but relies on Envoy for the chain.
- Set `headers.xForwardedClientCert.mode: SanitizeSet` in the
  `ClientTrafficPolicy`, so that clients cannot send their own
  `x-forwarded-client-cert` header.
- Set `path.escapedSlashesAction: RejectRequest` and keep slash merging on, so
  that Cedar policies and the tenant in the path see normalized paths.
- List explicit CORS origins, methods and headers (`content-type`,
  `x-csrf-token`) instead of `*`, because the CMK route allows credentials.
- Restrict the identity provider's administration console to administrators if
  it is published through the same gateway.

## Internal network

- ExtAuthZ (gRPC 9092) and Session Manager (gRPC 9091) do not authenticate
  their callers. Session Manager's gRPC API can change tenant trust records.
  Allow only Envoy to reach ExtAuthZ, and only ExtAuthZ and CMK to reach Session
  Manager's gRPC port, with network policies or service mesh authorization
  policies.
- The gRPC connections between OpenKCM services do not use TLS unless you
  configure `secretRef.type: mtls`. Otherwise run all services in a service mesh
  with mutual TLS.
- Keep the status ports (ExtAuthZ 8080, Session Manager 8888) reachable only by
  the kubelet and your monitoring.

## Session Manager

- Set `allowedRedirectBaseURLs` to the exact CMK UI origins, each ending with
  `/`. Never add `/` or a bare host without a trailing `/`.
- Replace the chart's example `csrfSecret` with a random value of at least 32
  bytes, and use **the same value in ExtAuthZ**
  ([Shared CSRF secret](/components/cmk/security/configuration#shared-csrf-secret)).
- Keep `allowHttpScheme` disabled, in `sessionManager` and in the
  `service.module.grpc.session` service.
- Use the recommended [cookie templates](/components/cmk/security/session-manager-config#cookie-templates)
  and write `sameSite` exactly as `Lax`, `Strict` or `None`.
- Authenticate to identity providers with mutual TLS where they support it.
- Protect Valkey with authentication, `secretRef.type: mtls` and network
  policies. It stores sessions together with access and refresh tokens.
- Use TLS to PostgreSQL by setting `PGSSLMODE=verify-full` and `PGSSLROOTCERT`
  for the Session Manager pods.
- Disable gRPC reflection (`grpc.flags.reflection: false`) and profiling
  (`status.profiling: false`).
- Never set the `DEBUGFEATURES` environment variable in production; it logs
  tokens.
- Use `logger.level: info`.

## ExtAuthZ

- Use **the same CSRF secret as Session Manager**, without a trailing newline,
  and store it in a Secret. Check both copies after every change.
- Connect to Session Manager with `secretRef.type: mtls`, or through a service
  mesh with mutual TLS. The chart default is `insecure`.
- Set `audiences` for every entry in `jwt.providers`. Without them, any token of
  that issuer is accepted, also tokens issued for other applications.
- Keep token introspection enabled so that revoked tokens are rejected.
- Keep Cedar policies narrow: restrict `context.host` and `context.path`, name
  principals for technical users, and never use `context.issuer like "*"`
  outside of test environments.
- Keep the trusted subjects file limited to the systems that need access.
- Disable profiling (`status.profiling: false`) and gRPC reflection, and use
  `logger.level: info`. At `debug` level, ExtAuthZ logs client data.
- Run at least two replicas; Envoy denies requests if ExtAuthZ is unavailable.

## CMK

- Use `logger.level: info`. At `debug` level, CMK logs its complete
  configuration.
- Keep `http.swaggerEnabled` and `status.profiling` disabled.
- Connect to PostgreSQL with `database.parameters.ssl.mode: verify-full`.
- Use `scheduler.taskQueue.secretRef.type: mtls` for the task queue.
- Use `amqps://` URLs for `tenantManager` and `eventProcessor`.
- Set `checksum` for external plugins, and keep credentials that plugins must
  not see out of the pod's environment: plugins inherit it.
- `extraVolumes` are mounted into every CMK pod. Mount only the Secrets the
  components need.
- Give tenant administrator and auditor membership
  (`KMS_TenantAdministrator_<tenant>`, `KMS_TenantAuditor_<tenant>`) only to the
  intended users in the identity provider.

## Signed client data

- Keep the private signing keys in a Secret that only ExtAuthZ can read, and
  give CMK only the public keys.
- Rotate the signing key regularly, following the
  [rotation procedure](/components/cmk/security/client-data#key-rotation).
- Keep clocks synchronized; client data is valid for one minute.

## Service-to-service traffic

- CMK and the Registry exchange tenant and key tasks through the AMQP broker,
  including the tenants' authentication settings. Connect with `amqps://` and
  client certificates (`secretRef.type: mtls`), give each service its own
  certificate, and allow each service to publish and consume only its own
  queues and exchanges.

## Identity providers

- Use a dedicated realm or tenant and a dedicated client for Session Manager.
  Do not share its client secret with other applications.
- Issue `groups` as a list in ID tokens and in introspection responses.
- Configure back-channel logout so that a logout at the identity provider ends
  the CMK session.

## Audit

- Configure `audit.endpoint` in every service and forward events to a store
  that operators of OpenKCM cannot modify.
- Monitor delivery errors in the service logs; failed events are not retried.
