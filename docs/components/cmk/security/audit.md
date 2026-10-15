# Audit logging

OpenKCM services send audit events as OpenTelemetry (OTLP) log records to an
endpoint configured per service. Forward them to your SIEM or log archive.

## Delivery

- Each service sends events to its `audit.endpoint` with an HTTP `POST` of OTLP
  JSON. Only `200` and `201` count as delivered; other responses are logged as
  errors. Events are not retried.
- If `audit.endpoint` is empty, the service sends no audit events. The Session
  Manager chart defaults to `http://localhost:4043/logs`, which needs a
  collector next to the pod.
- `audit.httpClient` sets the timeout and the credentials for the endpoint, and
  `audit.additionalProperties` adds fixed properties to every event.

```yaml
audit:
  endpoint: https://otel-collector.example.com/v1/logs
  httpClient:
    timeout: 5s
    mtls:
      cert:    { source: file, file: { path: /etc/credentials/audit/tls.crt, format: binary } }
      certKey: { source: file, file: { path: /etc/credentials/audit/tls.key, format: binary } }
```

## Events by component

| Component | Events |
| --- | --- |
| ExtAuthZ | `UnauthorizedRequest`, `UnauthenticatedRequest` |
| Session Manager | `UserLoginSuccess` |
| CMK | Key lifecycle, system linking, tenant deletion and rejected requests (see below) |

The Registry does not send audit events yet. Session Manager does not send
events for failed logins yet; failed logins appear only in its application log.

### CMK events

| Area | Events |
| --- | --- |
| Keys | `CmkCreate`, `CmkDelete`, `CmkDetach`, `CmkEnable`, `CmkDisable`, `CmkRotate` |
| Key availability | `CmkAvailable`, `CmkUnavailable` |
| Systems | `CmkOnboarding`, `CmkOffboarding`, `CmkSwitch`, `CmkTenantModification` |
| Tenants | `CmkTenantDelete` |
| Access | `UnauthorizedRequest` |

## Denied and unauthenticated requests

ExtAuthZ treats failed requests in two ways:

- **Denied** and **tenant blocked** requests produce an `UnauthorizedRequest`
  event right away.
- **Unauthenticated** requests are reported only when burst detection is
  enabled. ExtAuthZ counts them per issuer or, if there is none, per tenant.
  When the count crosses a threshold within a time window, it sends one
  `UnauthenticatedRequest` event for the burst instead of one per request.
  The counters are shared between ExtAuthZ replicas through Valkey.

Events are sent asynchronously from a queue, so audit delivery does not slow
down request handling. If the queue is full, events are dropped and counted
rather than blocking requests.

Burst detection is configured in ExtAuthZ under `valkey.rateDetection`:

| Setting | Default | Meaning |
| --- | --- | --- |
| `enabled` | `false` | Turns burst detection on. Requires Valkey |
| `threshold` | `50` | Unauthenticated requests for one identity that make up a burst |
| `window` | `1m` | Time window for counting |
| `cooldown` | value of `window` | Time during which no further event is sent for the same identity. Keep it at least as long as `window` |
| `countUnknown` | `false` | Also count requests without any credentials, such as health probes |
| `queueSize` | `1024` | Size of the event queue |
| `workers` | `4` | Workers that send events |
| `dispatchTimeout` | `10s` | Timeout for one queued event |

The OTLP endpoint for audit events is set in the `audit` section of each
service's configuration. See the
[ExtAuthZ configuration reference](/components/cmk/security/extauthz-config#audit).

## Personal data in logs

Audit events contain the identifiers needed to trace an action back to a
caller, so treat the audit log as personal data. For application logs,
[common-sdk](https://github.com/openkcm/common-sdk) provides a logging
middleware that masks personal data.
