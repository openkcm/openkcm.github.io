# Security and integration

This page shows how the architecture protects the keys and the tenants, how the
components connect, what the provider's own services and tools integrate with,
and the technology an OpenKCM deployment is built on.

## Security principles

| Principle | How the architecture implements it |
| --- | --- |
| No key material in the governance plane | CMK, the Registry and the CMK-2-Krypton Bridge hold references, metadata and policy. Key material stays in keystores, and in Krypton only sealed |
| Every request checked twice | ExtAuthZ authenticates the caller at the gateway and signs the result; CMK verifies the signature and the caller's role |
| Tenant isolation | Own identity provider, roles and database schema per tenant; keys in Krypton separated per tenant; a workload gets only the keys of the tenant in its client certificate |
| Separation of duties | Tenant administrators, key administrators and auditors are separate roles, and sensitive changes can require approval by other users |
| Encrypted, authenticated service traffic | Mutual TLS between services through a service mesh; client certificates on the AMQP broker, on Krypton's gRPC APIs and on KMIP |
| Protected key material | Krypton seals every key with its parent key before it stores it, and keeps unsealed keys only in locked memory |
| Traceability | Key, system, login and access events as audit events |

See the [Trust model](/overview/trust-model), the
[CMK security architecture](/components/cmk/security/) and
[Krypton security](/components/krypton/security).

## Connections

Authenticate and encrypt every connection between the components. The table
lists each connection and how to protect it.

| From | To | Protocol | Protect with |
| --- | --- | --- | --- |
| Customer's browser or automation | Envoy Gateway of the CMK region | HTTPS | TLS; ExtAuthZ checks a session cookie, a bearer token or a client certificate on every request |
| Session Manager | Customer's identity provider | OpenID Connect | TLS; one identity provider per tenant |
| Registry | CMK of each region | AMQP 1.0, through Orbital | Client certificates on the broker (SASL `EXTERNAL`) |
| CMK, the Bridge, provider services and onboarding | Registry | gRPC | Mutual TLS through a service mesh; allow only these callers |
| CMK | Systems of each system region, and the Bridge | AMQP 1.0, through Orbital | Client certificates on the broker |
| Provider's onboarding and services | CMK-2-Krypton Bridge | gRPC | Mutual TLS through a service mesh; allow only these callers |
| CMK-2-Krypton Bridge | Krypton root node | gRPC | Mutual TLS, with the Bridge's own Krypton identity |
| Krypton root node | Agents | gRPC | Mutual TLS, with an identity per agent |
| Workloads | Krypton | KMIP | Mutual TLS, with a client certificate whose common name is the tenant ID |
| CMK | Keystores | The keystore's API, through a keystore plugin | The keystore's own authentication; AWS KMS today |
| All services | Audit collector | OTLP | TLS to the provider's collector |

## What the provider integrates

| Integration point | Who implements it | Interface |
| --- | --- | --- |
| Tenant onboarding | The provider's onboarding | [CMK-2-Krypton Bridge gRPC API](/components/cmk/krypton-bridge#interfaces), which registers the tenant in the Registry; the identity provider through the [Registry gRPC API](/components/cmk/tenant-integration) |
| System registration | Each provider service, or the Bridge for the systems it creates keys for | [Registry gRPC API](/components/cmk/system-integration) |
| Key and system tasks | Each provider service, per system region | AMQP 1.0 queues, through [Orbital](https://github.com/openkcm/orbital) |
| Key delivery | Workloads | [KMIP over mutual TLS](/components/krypton/workloads) (Krypton, <Badge type="danger" text="Sandbox" />) |
| Customer sign-in | The customer | OpenID Connect identity provider, per tenant |
| Keystores | The provider, as plugins | [Keystore plugins](/components/cmk/plugins); AWS KMS today |
| User directories | The provider, as plugins | SCIM directory plugins |
| Audit | The provider's security operations | OTLP log records to the provider's [audit collector](/components/cmk/security/audit) |
| Automation by customers | The customer | [CMK REST API](/components/cmk/api) |

## Technology stack

| Need | Technology |
| --- | --- |
| Runtime | Kubernetes 1.23 or later; every service as a container image with a Helm chart |
| Databases | PostgreSQL, one database per service and region |
| Task queue and sessions | Valkey or Redis |
| Messaging between regions and services | AMQP 1.0, for example RabbitMQ 4, with client certificates |
| Gateway | Envoy Gateway with external authorization |
| Service traffic | A service mesh with mutual TLS, for example Linkerd or Istio |
| Sign-in | OpenID Connect, per tenant |
| Key storage | AWS KMS (customer keys); OpenBao (Krypton) |
| Workload key access | KMIP |
| Observability and audit | OpenTelemetry (OTLP) |

## See also

- [Hardening](/components/cmk/security/hardening)
- [Deployment planning](/components/cmk/deployment#network-layout): ports and
  who may reach them
- [Connect a regional system](/components/cmk/system-integration)
