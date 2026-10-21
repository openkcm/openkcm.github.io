# Agents

An agent takes over the lower kinds of a key hierarchy for one part of your
topology, for example a region or a cloud, close to the workloads that use them.
This page explains how to describe agents in the root node's configuration and
how to run them.

::: info Current scope
Agents register with the root node, send heartbeats, and receive the tenants and
keys they manage. The processing of key material on agents, including fetching
their parent keys from the root node, is not implemented yet. There is no Helm
chart for agents yet.
:::

## Describe the agent on the root node

The root node decides which agents exist. For each agent, its configuration
needs:

1. A **segment** in `topology.segments`, named like the agent. It starts with a
   `tek` kind and covers the kinds below it that the agent manages. The `tek`
   binding has a `sealer` and a `parent_key_provider` (`agent_name: root`, or
   the name of the agent that manages the kind above).
2. An entry in **`connections`** with the agent's name and the gRPC address at
   which the root node reaches it, for example
   `krypton-agent-eu10.services.svc:9091`.
3. With mutual TLS, an entry in **`auth.identity`** with the agent's name and the
   URI of its client certificate.

The root node's own segment then ends above the agent's `tek`. An example with
one agent, `agent-eu10`, for the hierarchy `K0` → `K1` → `K2` (`tek`) → `K3`:

```yaml
segment: { start_kind: K0, end_kind: K1 }
topology:
  segments:
    - name: agent-eu10
      segment: { start_kind: K2, end_kind: K3 }
      selector_labels: { region: eu10 }
      key_bindings:
        K2:
          sealer:
            name: tek-sealer
            type: aes256gcm-staticsecret
            config: { secret: { type: envvar, config: { name: KRYPTON_TEK_KEY } } }
          crypto: { name: tek-crypto, type: aes256gcm }
          vault: { name: tek-vault, type: openbao, config: { address: https://openbao.eu10.example.org:8200 } }
          parent_key_provider: { agent_name: root }
        K3:
          crypto: { name: dek-crypto, type: aes256gcm }
          vault: { name: dek-vault, type: openbao, config: { address: https://openbao.eu10.example.org:8200 } }
connections:
  - name: root
    address: { type: grpc, url: krypton-root.services.svc:8080 }
  - name: agent-eu10
    address: { type: grpc, url: krypton-agent-eu10.services.svc:9091 }
```

Keys of the agent's kinds are announced with the agent's name as target
(`kr announce key … --target-name agent-eu10`).

## Run an agent

An agent runs the image `ghcr.io/openkcm/krypton/images/agent` of the same
Krypton release as the root node. It needs its own PostgreSQL database; a
database used by the root node is refused.

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `AGENT_BOOTSTRAP_CONFIG_PATH` | `config.yaml` | Path of the bootstrap configuration |
| `AGENT_DATABASE_URL` | none, required | PostgreSQL URL of the agent's database |
| `AGENT_PORT` | `9091` | Port of the agent's gRPC server, which the root node calls |
| `AGENT_ID` | random | ID of this instance, a UUID |
| Sealer secrets, for example `KRYPTON_TEK_KEY` | none | Secrets named in the key bindings of the agent's segment, for the processing of key material |

The bootstrap configuration names the agent and the root node:

```yaml
name: agent-eu10
role: agent
krypton_root:
  address: { type: grpc, url: krypton-root.services.svc:8080 }
# With mutual TLS on the root node:
# auth:
#   type: mtls
#   config:
#     client: { cert_path: /etc/krypton/tls/tls.crt, key_path: /etc/krypton/tls/tls.key, ca_path: /etc/krypton/tls/ca.crt }
#     server: { cert_path: /etc/krypton/tls/tls.crt, key_path: /etc/krypton/tls/tls.key, ca_path: /etc/krypton/tls/ca.crt }
```

With `auth`, the agent connects with TLS 1.3 and its client certificate, which
must carry the agent's identity URI. The configuration requires both `client`
and `server` file paths.

## Registration and health

1. At startup the agent registers with the root node under its name. The root
   node accepts only names of its topology segments (and, with mutual TLS,
   listed identities), and returns the agent's configuration.
2. The agent sends a heartbeat every 30 seconds.
3. When it stops, the agent deregisters.

If the registration fails, the agent exits; run it with a restart policy, as a
Kubernetes Deployment does. The root node marks agents without a heartbeat for
30 seconds as `unhealthy` and after 90 seconds as `de-registered`, and removes
them after 120 seconds.

Restrict the agent's gRPC port to the root node, for example with a
NetworkPolicy, and see [Security](/components/krypton/security).

## Try it locally

[Getting started](/components/krypton/getting-started) runs a root node and the
agent `agent-k1` of the repository's example configuration on one machine.

## See also

- [Concepts](/components/krypton/concepts#segments-and-the-topology)
- [Architecture](/components/krypton/architecture#agents)
- [Configuration reference](/components/krypton/configuration#agent-bootstrap-configuration)
