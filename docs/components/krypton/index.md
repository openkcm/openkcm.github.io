# Krypton

Krypton is one of the two OpenKCM components. It creates and operates
cryptographic keys: it generates key hierarchies for tenants, protects each key
with its parent key, stores the protected key material, and provides keys to
authorized workloads.

Repository: [openkcm/krypton](https://github.com/openkcm/krypton)

::: warning Pre-production
Krypton is under active development and not intended for production use yet.
This page gives an overview; detailed documentation will follow.
:::

## Concepts

| Concept | Description |
| --- | --- |
| Tenant | Owner of a set of keys. Key material is kept separate per tenant |
| Key hierarchy | Configurable chain of key levels, called key kinds. Each kind has a role and an algorithm |
| Key | A key of one kind, with versions. Every key except a root key has a parent key |
| Sealing | The key material of each key is encrypted with its parent key before it is stored |
| Vault | Storage for sealed key material: OpenBao, with one namespace per tenant, or SQLite for development |

The example configuration uses four levels:

| Kind | Role | Purpose |
| --- | --- | --- |
| `K0` | `root` | Tenant root key |
| `K1` | `kek` | Key encryption key |
| `K2` | `tek` | Tenant encryption key |
| `K3` | `dek` | Data encryption key |

## Components

| Component | Purpose |
| --- | --- |
| Root server | Owns the key hierarchy and key material, and serves the administration and KMIP APIs |
| Agent | Registers with the root server and receives tenant and key metadata from it |
| CLI | Command-line client for the root server |
| [Krypton operator](https://github.com/openkcm/krypton-operator) | Experimental. Installs Krypton into remote edge clusters |

Key metadata is stored in PostgreSQL.

## Interfaces

| API | Purpose |
| --- | --- |
| `TenantService` (gRPC) | Create, get and list tenants |
| `KeyService` (gRPC) | Announce, activate, get and list keys, and walk the hierarchy |
| `ActionService` (gRPC) | Status of asynchronous actions |
| Agent `Service` (gRPC) | Register agents and receive their heartbeats |
| KMIP (optional) | `Get` and `GetAttributes` for workloads |

## Security basics

- Configure the `auth` section of the root server in every environment. It
  enables mutual TLS (TLS 1.3) and an allowlist of client identities for the
  gRPC API. Without it, the gRPC API accepts connections without TLS or
  authentication.
- The KMIP server requires mutual TLS. A client certificate's common name must
  equal the tenant ID of the keys it requests.
- Krypton keeps key material in locked memory and disables core dumps.

## Current limitations

- Key versions are modelled, but key rotation is not implemented yet.
- The connection between CMK's customer keys and Krypton's root keys is not
  implemented yet.

## Deployment and development

- The root server ships as the Helm chart `krypton-root` in the repository's
  `charts/root` directory.
- `make dev` in the repository starts PostgreSQL and a local Krypton server.
- Building Krypton requires the Go experiment `runtimesecret`
  (`GOEXPERIMENT=runtimesecret`).

## Using Krypton with CMK

Krypton runs on its own. In an OpenKCM deployment with CMK, the
[CMK-2-Krypton Bridge](/components/cmk/krypton-bridge) receives CMK's key tasks
and creates the corresponding keys in Krypton.

## See also

- [Krypton overview](/overview/krypton): what Krypton is for and when to use it
- [Krypton releases](https://github.com/openkcm/krypton/releases)
- [Glossary](/overview/glossary)
