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
  gRPC API.
- The KMIP server requires mutual TLS. A client certificate's common name must
  equal the tenant ID of the keys it requests.
- Krypton keeps key material in locked memory and disables core dumps.

## Current limitations

- Key versions are modelled, but key rotation is not implemented yet.
- The connection between CMK's customer keys and Krypton's root keys is not
  implemented yet.

## Install the root server

The root server ships as the Helm chart `krypton-root`
(`oci://ghcr.io/openkcm/charts/krypton-root`). Its
[README](https://github.com/openkcm/krypton/tree/main/charts/root) describes the
installation, and its `values.yaml` the whole root server configuration.

1. Provide PostgreSQL. The root server creates its tables at startup.
2. Create a Secret with the PostgreSQL URL and the root key, which seals the
   tenant root keys. Keep a backup of the root key:

   ```sh
   kubectl -n services create secret generic krypton-secret \
     --from-literal=database-url='postgres://krypton:<password>@postgresql.services:5432/krypton?sslmode=verify-full' \
     --from-literal=root-key="$(openssl rand -base64 32)"
   ```

3. Install the chart with the Secret:

   ```sh
   helm install krypton-root oci://ghcr.io/openkcm/charts/krypton-root \
     --version 0.1.0 -n services \
     --set database.existingSecret=krypton-secret \
     --set rootKey.existingSecret=krypton-secret
   ```

The default configuration keeps the keys in the pod's memory, for a first try.
To keep them across restarts, put them in SQLite files on a volume or in
OpenBao; the chart's README has an example. Restrict access to the gRPC APIs
with `config.auth` (mutual TLS) and the chart's network policy. The release
notes warn about values with which the root server would not start.

The gRPC APIs listen on port 8080 of the Service `krypton-root`, for example
`krypton-root.services.svc.cluster.local:8080`. The chart starts the amd64
binary of the release image; on arm64 nodes, set
`image.command: [/root/root.linux-arm64]`.

## Development

- `make dev` in the repository starts PostgreSQL and a local Krypton server.
- Building Krypton requires the Go experiment `runtimesecret`
  (`GOEXPERIMENT=runtimesecret`).
- `make helm-test` renders the chart and checks the rendered configuration
  with the root server's own code.

## Using Krypton with CMK

Krypton runs on its own. In an OpenKCM deployment with CMK, the
[CMK-2-Krypton Bridge](/components/cmk/krypton-bridge) receives CMK's key tasks
and creates the corresponding keys in Krypton.

## See also

- [Krypton overview](/overview/krypton): what Krypton is for and when to use it
- [Krypton releases](https://github.com/openkcm/krypton/releases)
- [Glossary](/overview/glossary)
