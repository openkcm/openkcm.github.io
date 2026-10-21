# Krypton configuration reference

The root node reads a YAML configuration file and environment variables; an
agent reads a short bootstrap file and gets the rest of its configuration from the
root node. This page lists every key. The Helm chart writes everything under its
value `config` into the root node's file.

The root node checks the configuration at startup and exits with an error if it
is not consistent. It ignores keys it does not know: check their spelling.

## Root node environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `ROOT_CONFIG_PATH` | `config.yaml` | Path of the configuration file. The Helm chart sets `/etc/krypton/config.yaml` |
| `DATABASE_URL` | none, required | PostgreSQL URL, for example `postgres://krypton:<password>@<host>:5432/krypton?sslmode=verify-full` |
| `SERVER_PORT` | `8080` | Port of the gRPC server |
| `KRYPTON_ROOT_KEY` and other sealer secrets | none | The secrets that `secret.config.name` of the sealers names: 32 bytes, base64-encoded |
| `BAO_TOKEN`, `BAO_CACERT`, other `BAO_*` | none | Token and TLS settings of the OpenBao client, for `openbao` vaults |

## Root node configuration file

| Key | Required | Meaning |
| --- | --- | --- |
| `name` | yes | Name of the root node, used in `connections`, `auth.identity` and `parent_key_provider` |
| `role` | yes | `root` |
| `hierarchy` | yes | The key kinds, see [hierarchy](#hierarchy) |
| `segment` | yes | The kinds the root node manages: `start_kind` (the `root` kind) and `end_kind` |
| `key_bindings` | yes | One binding per kind of `segment`, see [key_bindings](#key-bindings) |
| `selector_labels` | no | Metadata labels of the root node |
| `topology` | no | The agents and their segments, see [topology](#topology) |
| `connections` | yes | gRPC addresses of the root node and every agent, see [connections](#connections) |
| `auth` | no | Mutual TLS on the gRPC port, see [auth](#auth) |
| `kmip` | no | The KMIP server, see [kmip](#kmip) |

### hierarchy

```yaml
hierarchy:
  name: example
  key_specs:
    - kind: K0
      role: root          # root, kek, tek or dek
      algorithm: AES256   # the only algorithm
      labels_spec:
        allow_user_labels: true
    - kind: K1
      role: dek
      algorithm: AES256
      labels_spec:
        allow_user_labels: false
        requirements:
          tier: { is_required: true, validator: { type: enum, params: { values: "gold,silver" } } }
          owner: { is_required: false, validator: { type: regex, params: { pattern: "^[a-z0-9-]+$" } } }
```

Rules: `name` is not empty; the first kind has the role `root` and is the only
one with it; with more than one kind, the last has the role `dek`; kinds between
them are `kek` or `tek`; kind names are unique. With `allow_user_labels: false`, a
kind needs at least one requirement; regular expressions must compile and enums
need values.

### key_bindings

```yaml
key_bindings:
  K0:
    sealer:
      name: root-key-sealer
      type: aes256gcm-staticsecret
      config:
        secret:
          type: envvar
          config: { name: KRYPTON_ROOT_KEY }
  K1:
    crypto: { name: kek-crypto, type: aes256gcm }
    vault: { name: kek-vault, type: openbao, config: { address: https://openbao.example.org:8200 } }
```

| Key | Types and options |
| --- | --- |
| `sealer` | `aes256gcm-staticsecret`, with `config.secret`: `type: envvar` and `config.name` of the environment variable |
| `crypto` | `aes256gcm` |
| `vault` | `unsafe-sqlite-memory`; `unsafe-sqlite` with `config.path`; `openbao` with `config.address` |
| `parent_key_provider` | `agent_name`: `root` or a segment name. Only for the first kind of an agent segment |

The binding of the `root` kind has a `sealer` and no `crypto`; every other kind
has a `crypto`. A node has bindings for exactly the kinds of its segment.

### topology

```yaml
topology:
  segments:
    - name: agent-eu10                     # the agent's name
      segment: { start_kind: K2, end_kind: K3 }
      selector_labels: { region: eu10 }
      key_bindings: { … }                  # as above, for K2 and K3
```

Each segment starts with a `tek` kind, whose binding has a `sealer` and a
`parent_key_provider`, and contains no `root` kind. Segment names are unique. The
parent kind of the segment's first kind must be in the segment of the
`parent_key_provider`. An empty topology (`topology: {}`) means no agents. See
[Agents](/components/krypton/agents).

### connections

```yaml
connections:
  - name: root
    address: { type: grpc, url: krypton-root.services.svc:8080 }
  - name: agent-eu10
    address: { type: grpc, url: krypton-agent-eu10.services.svc:9091 }
```

One entry with a unique name for the root node (its `name`) and for each
segment of `topology`. `type` is `grpc`. The root node calls the agents at their
address, and gives each agent the address of the node that holds its parent
keys.

### auth

```yaml
auth:
  type: mtls
  config:
    server: { cert_path: …, key_path: …, ca_path: … }
    client: { cert_path: …, key_path: …, ca_path: … }
  identity:
    - name: root
      uri: kryptonid://example.org/node/root
```

`type` is `mtls`. `config.server` and `config.client` need all three file paths.
`identity` lists the root node and every segment, each once, and may list further
clients; each `uri` is a [Krypton identity](/components/krypton/concepts#identities).
See [Security](/components/krypton/security#mutual-tls-on-the-grpc-port).

### kmip

```yaml
kmip:
  bind_addr: 0.0.0.0
  port: 5696
  tls: { cert_path: …, key_path: …, ca_path: … }
```

`bind_addr` is not empty, `port` is between 1 and 65535, and `tls` needs all three
file paths. See [KMIP](/components/krypton/kmip).

## Agent bootstrap configuration

| Key | Required | Meaning |
| --- | --- | --- |
| `name` | yes | The agent's name: a segment of the root node's topology |
| `role` | yes | `agent` |
| `krypton_root.address` | yes | `type: grpc` and `url` of the root node |
| `auth` | no | `type: mtls` with `config.client` and `config.server` file paths, as on the root node. Required when the root node uses `auth` |

```yaml
name: agent-eu10
role: agent
krypton_root:
  address: { type: grpc, url: krypton-root.services.svc:8080 }
```

The agent's environment variables are listed in
[Agents](/components/krypton/agents#run-an-agent).

## See also

- [Concepts](/components/krypton/concepts)
- [Install the root node](/components/krypton/install)
- [`examples/root.config.yaml`](https://github.com/openkcm/krypton/blob/main/examples/root.config.yaml)
  in the repository
