# CMK service

The CMK service is the core service of the [CMK](/components/cmk/) product: the
governance control plane for customer keys. Tenants
use it to register their root keys, link those keys to the systems that should
use them, and control the key lifecycle. CMK holds key metadata and policy, not
key material: key operations run in a keystore through plugins, either the
keystore the platform provides for the tenant or, for HYOK keys, the customer's
own keystore.

Repository: [openkcm/cmk](https://github.com/openkcm/cmk)

## Responsibilities

- Manage customer keys and their key configurations.
- Link systems (the services that consume a key in a region) to a key, switch
  them to another key, or unlink them.
- Propagate key and system changes to the regional systems.
- Run approval workflows for sensitive operations.
- Map the tenant's identity provider groups to CMK roles. See
  [CMK authorization](/components/cmk/security/cmk-authorization).

## Key types

Each tenant gets a dedicated keystore, which CMK takes from a pool of prepared
keystores. The pool is kept filled through the keystore provider plugin and the
`keystore:fill` task. System-managed and BYOK keys are created in this keystore;
HYOK keys stay in the customer's own keystore.

| Key type | Who creates the key material | How CMK uses it |
| --- | --- | --- |
| System-managed | The keystore provider, on request from CMK | CMK creates the key through a keystore plugin |
| BYOK (bring your own key) | The customer, outside the provider | The customer imports wrapped key material into the provider through CMK |
| HYOK (hold your own key) | The customer, in their own keystore | CMK links an existing key by its ID in the customer's keystore |

### Bring your own key

1. CMK asks the keystore provider for import parameters (a wrapping public key
   and the wrapping algorithm) and returns them to the customer.
1. The customer wraps the key material with that public key.
1. The customer sends the wrapped material to CMK, which passes it to the
   provider's import operation.

CMK does not store the key material.

### Hold your own key

CMK links an existing key in the customer's keystore. The key must be enabled
and of type AES-256. Every five minutes, CMK checks the state of linked HYOK
keys and propagates changes, for example a key that the customer disabled.

## Key rotation

CMK does not rotate key material itself. Rotation happens in the keystore. CMK
can detect new key versions in the provider and then sends a
`SYSTEM_KEY_ROTATE` task to the affected systems. This detection is controlled
by a feature flag.

## Propagation to regions

CMK sends changes to the systems in each region as tasks, using
[Orbital](/components/cmk/registry#orbital) over AMQP. In a deployment with
Krypton, the [CMK-Krypton bridge](/components/cmk/krypton-bridge) receives the
tasks of its region and carries them out in Krypton.

| Task | Purpose |
| --- | --- |
| `KEY_ENABLE`, `KEY_DISABLE` | Enable or disable a key for its systems |
| `KEY_DELETE`, `KEY_DETACH` | Remove a key, or detach it from its systems |
| `SYSTEM_LINK`, `SYSTEM_UNLINK` | Start or stop using a key for a system |
| `SYSTEM_SWITCH` | Move a system to another key |
| `SYSTEM_KEY_ROTATE` | Tell a system that its key has a new version |

Tenant onboarding and offboarding jobs arrive from the
[Registry](/components/cmk/registry) in the same way.

## Processes

CMK is one binary, `cmkd`, with a subcommand per process. Each runs as its own
deployment.

| Process | Purpose |
| --- | --- |
| `api-server` | REST API for the CMK UI and API clients |
| `tenant-manager` | Tenant onboarding and offboarding |
| `event-reconciler` | Sends tasks to regional systems and tracks their results |
| `task-scheduler` | Schedules periodic tasks, such as the HYOK state check |
| `task-worker` | Runs scheduled and asynchronous tasks |
| `db-migrator` | Applies database migrations |

## REST API

The API is described in an OpenAPI specification in the repository
(`apis/cmk/cmk-ui.yaml`). Its main resources are keys, key configurations,
systems, system groups, workflows, tenants and groups.

## Storage

- **PostgreSQL**: one schema per tenant.
- **Redis**: queue for asynchronous tasks. It holds no key material.

## Plugins

CMK uses [plugins](/components/cmk/plugins) for keystore operations, keystore
management, identity management, notifications, system information and
certificate issuing.

## User interface

The [CMK UI](https://github.com/openkcm/cmk-ui) is a SAPUI5 web application
that calls the CMK REST API. Users sign in through
[Session Manager](/components/cmk/session-manager).

## Deployment

CMK ships as a Helm chart. The container image includes the keystore plugins.

- [CMK configuration reference](/components/cmk/security/cmk-config)
- [Configuration guide](/components/cmk/security/configuration#step-5-configure-cmk)
