# Registry and Orbital

The Registry is the global source of truth for tenants and the systems they own.
Orbital is the library that OpenKCM services use to send work to each other and
track it until it is done.

## Registry

Repository: [openkcm/registry](https://github.com/openkcm/registry)

The Registry keeps track of:

- **Tenants**: registration, labels, user groups, and their status (active,
  blocked or terminated).
- **Systems**: the services that consume keys in a region, their status and
  labels, and which tenant they are mapped to.
- **Authentication settings** per tenant. The Registry sends them to CMK as an
  Orbital job, and CMK applies them to
  [Session Manager](/components/cmk/session-manager#tenant-trust).

For each regional system, the Registry stores the ID of the system's L2 key and
whether the system's L1 key has been claimed. It does not store key material.

### Registry API

| gRPC service | Operations |
| --- | --- |
| Tenant | Register, get, list, block, unblock, terminate, labels, user groups |
| System | Register, list, delete, update status, update L1 key claim, labels |
| Mapping | Map or unmap a system to a tenant |
| Auth | Apply, get, list and remove a tenant's authentication settings |

The API definitions are in [api-sdk](https://github.com/openkcm/api-sdk).

Every setting of the Registry is described in the
[Registry configuration reference](/components/cmk/security/registry-config).

### Registry and CMK

The Registry sends tenant jobs, such as onboarding a new tenant, to the CMK
instance of the tenant's region through Orbital. CMK reports the result back the
same way.

## Orbital

Repository: [openkcm/orbital](https://github.com/openkcm/orbital)

Orbital is a Go library, not a service. It synchronizes state across service
boundaries with eventual consistency:

1. A service creates a **job**, for example "disable this key".
1. Orbital splits the job into **tasks**, one per **target**, for example one
   per region.
1. Orbital sends each task to its target and tracks the result until all tasks
   are done or have failed.

Jobs and tasks are stored in PostgreSQL, so they survive restarts.

| Transport | Typical use |
| --- | --- |
| AMQP | Between CMK, the Registry and regional systems |
| Solace | Message broker alternative to AMQP |
| gRPC | Direct service-to-service calls |
| Embedded | Within a single process |

Orbital can sign task requests and responses. The signature travels in the
`X-Message-Signature` header, and a receiver can be configured to reject
messages without a valid signature.

CMK and the Registry use Orbital.
