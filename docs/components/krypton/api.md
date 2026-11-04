# Krypton gRPC API

The Krypton root node offers its functions as gRPC services: tenants, keys and
actions for administrators and integrations such as the
[CMK-2-Krypton Bridge](/components/cmk/krypton-bridge), and a service for agents.
This page lists the services and their rules. The
[`kr` CLI](/components/krypton/cli) uses the same API.

## Connect

All services of the root node share one port: 8080, or the port in the
environment variable `SERVER_PORT`. In Kubernetes, use the Service of the
[Helm chart](/components/krypton/install), for example
`krypton-root.<namespace>.svc:8080`.

| Root node configuration | Connection |
| --- | --- |
| With `auth` | TLS 1.3 with a client certificate, see [Authentication](#authentication) |
| Without `auth` | Plaintext. For development only |

The protocol definitions are in the repository under
[`api-specs/v1/proto`](https://github.com/openkcm/krypton/tree/main/api-specs/v1/proto).
The server does not offer gRPC reflection, so tools such as `grpcurl` need the
proto files. From the root of the repository:

```sh
grpcurl -plaintext -import-path api-specs/v1/proto -proto admin/admin.proto \
  -d '{"name":"acme"}' localhost:8080 krypton.v1.admin.TenantService/CreateTenant
```

Timestamps such as `createdAt` are Unix time in nanoseconds.

## Services

| Service | For | Purpose |
| --- | --- | --- |
| `krypton.v1.admin.TenantService` | Administrators, integrations | Create and read tenants |
| `krypton.v1.admin.keys.KeyService` | Administrators, integrations | Announce, activate and read keys |
| `krypton.v1.admin.actions.ActionService` | Administrators, integrations | Status of background work |
| `krypton.v1.agents.Service` | Agents | Registration and heartbeats |

Each agent serves two services for the root node on its own port:
`krypton.v1.agents.tenants.TenantService` (`UpsertTenant`) and
`krypton.v1.agents.keys.KeyService` (`UpsertKey`). Only the root node calls them.

## Authentication

With `auth` in the root node's configuration, the root node accepts a call only
if the client:

1. connects with TLS 1.3 and presents a certificate signed by the CA of
   `auth.config.server.ca_path`;
2. has exactly one URI in the certificate's subject alternative names;
3. and that URI is one of the identities in `auth.identity`.

Otherwise the call fails with `Unauthenticated` (no or invalid certificate, not
exactly one URI) or `PermissionDenied` (URI not listed). See
[Security](/components/krypton/security#mutual-tls-on-the-grpc-port).

## Errors

The services return gRPC status codes, and in the details a
`krypton.v1.ErrorDetails` message with a code that tells clients whether to retry:

| Code | Meaning |
| --- | --- |
| `RETRY` | A temporary problem, for example in the database. Retry later |
| `ABORT` | Retrying the same request will not help |

Typical status codes: `InvalidArgument` for malformed requests (for example an ID
that is not a UUID), `NotFound`, `FailedPrecondition` when the state does not
allow the request, and `Internal`.

## TenantService

| RPC | Request | Result |
| --- | --- | --- |
| `CreateTenant` | `name`, `labels` | The new tenant, with the ID that Krypton assigned |
| `GetTenant` | `id` | The tenant, or `NotFound` |
| `ListTenants` | none | All tenants |

## KeyService

| RPC | Request | Result |
| --- | --- | --- |
| `AnnounceKey` | `tenant_id`, `kind`, `name`, `parent_id`, `target_name`, `labels` | The key, in `pre-activation` with the status `pending`. `target_name` is the agent that manages the key; empty for the root node |
| `ActivateKey` | `tenant_id`, `id`, `cascading` | `job_group_id` of the activation; see [Key lifecycle](/components/krypton/key-lifecycle#activate-a-key) |
| `GetKey` | `tenant_id`, `id` | The key, with its lifecycle state and processing status |
| `GetParentKeys` | `tenant_id`, `id` | The chain from the root key down to the key, including the key |
| `GetDescendantKeys` | `tenant_id`, `id` | The key and all keys below it, as layers from the top |
| `ListKeys` | `tenant_id` and optional filters: `name` (contained, ignoring case), `kind`, `life_cycle_state`, `managed_by`, `labels` (all must match), `is_order_by_created_at_asc`, `limit`, `cursor` | A page of keys and the `cursor` of the next page. Without `limit`, 50 keys per page. An empty result is `NotFound` |

`AnnounceKey` rejects a key whose kind is not in the hierarchy or not in the
segment of the target node, a missing or wrong parent, and a key with the same
name but other properties (`FailedPrecondition`, key conflict). Announcing the
same key again returns the existing key. `ActivateKey` requires all ancestors to
be `active` with the status `completed`.

## ActionService

| RPC | Request | Result |
| --- | --- | --- |
| `GetAction` | `id` | The type and status (`CREATED`, `PROCESSING`, `DONE`, `FAILED`, `CANCELED`) of an action, and the key it concerns |

`GetAction` reports announcements (`announce-key`). The response of
`AnnounceKey` does not include the action's ID yet: follow an announcement with
`GetKey` until the key's status is `completed` or `failed`.

## Agent service

Agents call `krypton.v1.agents.Service`:

| RPC | Purpose |
| --- | --- |
| `Register` | `agent_name`, `instance_id`. The name must be a segment of the root node's topology (and, with `auth`, one of the identities). Returns the agent's configuration |
| `SendHeartbeat` | Marks the agent `healthy` |
| `Deregister` | Marks the agent `de-registered` when it stops |

## See also

- [The kr CLI](/components/krypton/cli)
- [Key lifecycle](/components/krypton/key-lifecycle)
- [KMIP](/components/krypton/kmip)
