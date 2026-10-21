# Krypton security

Krypton holds the key material that protects your tenants' data. This page lists
what a Krypton deployment needs to be secure: who may connect, how secrets are
provided, where key material is stored, and what the hosts must allow.

::: warning Pre-production
Krypton is not intended for production use yet. Apply these requirements in
every shared environment, and review them again with each release.
:::

## Mutual TLS on the gRPC port

Configure `auth` on the root node in every environment except a local test.
Without it, the root node serves its gRPC APIs in plain text to every client
that can reach it.

```yaml
auth:
  type: mtls
  config:
    server: # certificate of the root node, and the CA of the client certificates
      cert_path: /etc/krypton/grpc/tls.crt
      key_path: /etc/krypton/grpc/tls.key
      ca_path: /etc/krypton/grpc/ca.crt
    client: # a client certificate, key and CA; all three are required
      cert_path: /etc/krypton/grpc/tls.crt
      key_path: /etc/krypton/grpc/tls.key
      ca_path: /etc/krypton/grpc/ca.crt
  identity:
    - name: root
      uri: kryptonid://example.org/node/root
    - name: agent-eu10
      uri: kryptonid://example.org/node/agent-eu10
```

With `auth`, the gRPC port requires TLS 1.3 and a client certificate signed by
the CA of `server.ca_path`. The certificate must have exactly one URI in its
subject alternative names, and that URI must be one of the `identity` entries.

- `identity` must list the root node and every agent of the topology, each under
  its name.
- Add only the agents, and the administrators and services that manage tenants
  and keys, such as the CMK-2-Krypton Bridge. Every listed identity can call the
  root node's APIs.
- Issue the client certificates from a CA that you use only for Krypton, and give
  each client its own identity URI.

## Network access

| Port | Allow from |
| --- | --- |
| Root node, gRPC (8080) | The agents and the services that manage keys |
| Root node, KMIP (5696) | The workloads that fetch keys |
| Agent, gRPC (9091) | The root node only |

Enforce this with network policies (the root node's Helm chart has
`networkPolicy`), and run the root node and the agents in a service mesh with
mutual TLS. Keep the Services of type `ClusterIP`.

## KMIP clients

The KMIP server returns a key to a client whose certificate's common name is the
key's tenant ID. Issue KMIP client certificates from a CA that you use only for
them, give each workload a certificate with the ID of its own tenant, and
restrict the KMIP port to those workloads. See [KMIP](/components/krypton/kmip).

## Root key and other sealer secrets

The root key seals the root keys of all tenants. Each sealer of type
`aes256gcm-staticsecret` reads its 32-byte secret, base64-encoded, from an
environment variable.

- Generate the secrets with a secure random generator
  (`openssl rand -base64 32`) and keep them in Kubernetes Secrets; enable
  encryption at rest for Secrets in your cluster.
- Keep a backup of the root key in a separate, protected place. Without it, the
  sealed keys cannot be read again.
- Never put secrets into the configuration file or the ConfigMap.

## Key storage

| Vault | Use |
| --- | --- |
| `unsafe-sqlite-memory`, `unsafe-sqlite` | Development and tests only |
| `openbao` | Shared environments. Connect to OpenBao over TLS (`https://` address and `BAO_CACERT`), with a token that has access only to Krypton's namespaces (`BAO_TOKEN` from a Secret) |

Key material is always sealed before it reaches a vault, and never stored in
PostgreSQL.

## Databases

Give the root node and each agent their own PostgreSQL database and user.
Connect with `sslmode=verify-full`, and keep the URL in a Secret
(`DATABASE_URL`, `AGENT_DATABASE_URL`).

## Protected memory

Krypton locks memory that holds key material (`mlock`), keeps it out of core
dumps, and disables core dumps for the process. The root node's Helm chart runs
it as a non-root user without capabilities and with a read-only root file
system; run agents the same way. Each piece of key material in use locks at
least one memory page, so the locked-memory limit of the container
(`RLIMIT_MEMLOCK`) must cover the keys used at the same time; raise it in your
container runtime if the logs report failures to lock memory.

## Checklist

- [ ] `auth` configured on the root node; agents connect with their own client
  certificates.
- [ ] `auth.identity` lists only the root node, the agents and the services that
  manage keys.
- [ ] Network policies on the gRPC, KMIP and agent ports; a service mesh with
  mutual TLS between the root node and the agents.
- [ ] KMIP client certificates from a dedicated CA, with the tenant ID as common
  name.
- [ ] Root key and sealer secrets in Secrets, backed up; nothing secret in the
  configuration.
- [ ] OpenBao over TLS for all vaults outside development.
- [ ] Own PostgreSQL database per node, with `sslmode=verify-full`.

## See also

- [Install the root node](/components/krypton/install#secure-the-grpc-apis)
- [Agents](/components/krypton/agents)
- [Configuration reference](/components/krypton/configuration)
