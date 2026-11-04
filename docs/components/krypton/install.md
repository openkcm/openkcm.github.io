# Install the root node

Install the Krypton root node in Kubernetes with the Helm chart `krypton-root`.
This page covers a first installation, persistent key storage, mutual TLS, KMIP
and network restrictions. The chart's
[README](https://github.com/openkcm/krypton/tree/main/charts/root) and
`values.yaml` document every value.

## Prerequisites

- Kubernetes 1.23 or later and Helm 3.
- PostgreSQL for the root node, with its own database. The root node creates its
  tables at startup, so its user needs to own the database or have `CREATE` on
  its schema.
- amd64 nodes, or the arm64 setting in [Image](#image).

## First installation

1. Create a Secret with the PostgreSQL URL and the root key, which seals the
   tenants' root keys: 32 random bytes, base64-encoded. Keep a backup of the root
   key; without it, sealed keys cannot be read again.

   ```sh
   kubectl -n services create secret generic krypton-secret \
     --from-literal=database-url='postgres://krypton:<password>@postgresql.services:5432/krypton?sslmode=verify-full' \
     --from-literal=root-key="$(openssl rand -base64 32)"
   ```

2. Install the chart:

   ```sh
   helm install krypton-root oci://ghcr.io/openkcm/charts/krypton-root \
     --version 0.1.0 -n services \
     --set database.existingSecret=krypton-secret \
     --set rootKey.existingSecret=krypton-secret
   ```

3. Read the release notes. They show the address of the gRPC APIs,
   `krypton-root.services.svc:8080`, and warn about values with which the root
   node would not start or would be exposed.

The default configuration is the demo hierarchy `K0` (root) → `K1` (key
encryption key) → `K2` (data encryption key), with the key material in the pod's
memory. Replace it with your own hierarchy under `config` in a values file; see
[Concepts](/components/krypton/concepts) and the
[Configuration reference](/components/krypton/configuration).

## Keep keys across restarts

The default vault `unsafe-sqlite-memory` loses all key material when the pod
stops. Choose a persistent vault for each kind in `config.key_bindings`:

| Vault | Setup | Use |
| --- | --- | --- |
| `unsafe-sqlite` | A SQLite file on a PersistentVolumeClaim (`extraVolumes`, `extraVolumeMounts`) | Development, one replica |
| `openbao` | `config.address` of OpenBao; its token and CA certificate from `BAO_TOKEN` and `BAO_CACERT` in `extraEnvs` | Shared storage, one namespace per tenant |

With a SQLite vault, keep one replica and the default update strategy
`Recreate`: each pod has its own file, and a ReadWriteOnce volume cannot be
mounted by two pods on different nodes. For example:

```yaml
extraVolumes:
  - name: vault-data
    persistentVolumeClaim: { claimName: krypton-root-vault-data }
extraVolumeMounts:
  - name: vault-data
    mountPath: /var/lib/krypton
config:
  key_bindings:
    K1:
      vault: { name: kek-vault, type: unsafe-sqlite, config: { path: /var/lib/krypton/kek.db } }
    K2:
      vault: { name: dek-vault, type: unsafe-sqlite, config: { path: /var/lib/krypton/dek.db } }
```

## Secure the gRPC APIs

Configure mutual TLS in every environment except a local test: set `config.auth`
with the server certificate, the CA of the clients and the identities that may
connect, and mount the certificate files from a Secret. Enable the chart's
network policy and allow the gRPC port only from the agents and the services that
manage keys:

```yaml
networkPolicy:
  enabled: true
  grpc:
    from:
      - namespaceSelector:
          matchLabels: { kubernetes.io/metadata.name: services }
```

See [Security](/components/krypton/security) for the requirements, and the
chart's `values.yaml` for an example of `config.auth`.

## Enable KMIP

Add `config.kmip`, mount its certificate files, and add the port `kmip` to
`ports` and `service.ports`; values.yaml has examples. See
[KMIP](/components/krypton/kmip).

## Image

The chart deploys `ghcr.io/openkcm/krypton/images/root` with the tag of its
`appVersion`. The release image contains the binary per architecture and does
not start it with its own command, so the chart starts the amd64 binary. On arm64
nodes set:

```yaml
image:
  command: [/root/root.linux-arm64]
```

## Versions

These pages and chart 0.1.0 describe the configuration of `main`, the next
Krypton release. Release v0.1.0 reads an older format for TLS settings (for
example `server_cert`, `server_key` and `client_ca` instead of `cert_path`,
`key_path` and `ca_path`) and has no `connections`. The chart's default
configuration works with both. When you upgrade from 0.0.1 of the chart, follow
its upgrade notes: two values were renamed, and the chart stops with an error
while the old ones are set.

## See also

- [Agents](/components/krypton/agents)
- [Security](/components/krypton/security)
- [Configuration reference](/components/krypton/configuration)
