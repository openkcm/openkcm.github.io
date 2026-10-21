# Krypton

Krypton is one of the two OpenKCM components. It creates and operates
cryptographic keys: it manages key hierarchies for tenants, protects each key
with its parent key, stores the protected key material in a vault, and provides
keys to authorized workloads. A root node holds the top of every hierarchy, and
agents can take over the lower levels close to the workloads.

Repository: [openkcm/krypton](https://github.com/openkcm/krypton)

::: warning Pre-production
Krypton is under active development and not intended for production use yet.
These pages describe the `main` branch, which becomes the next release.
Release v0.1.0 uses an older configuration format and agent protocol: run the
root node and the agents from the same release.
:::

## What works today

| Capability | Status |
| --- | --- |
| Tenants: create, read and list | Available |
| Key hierarchies and topologies, defined in the root node's configuration | Available |
| Announce keys on the root node and on agents | Available: the root node records the key and sends it to the agent that manages it |
| Read keys, their parents and their descendants; list keys with filters | Available |
| Agents: registration, heartbeats and deregistration | Available |
| Activate keys | Accepted by the API, but not processed yet: the key stays in the state `active`, status `pending` |
| Key versions and key material | Not created yet: they follow from the activation |
| KMIP `Get` and `GetAttributes` | Available for active keys with key material |
| Suspend, deactivate, destroy and rotate keys | Not implemented |
| Parent keys held by another node (agents sealing with the root's key) | Not implemented |

## Components

| Component | Purpose |
| --- | --- |
| Root node | Holds the configuration of the hierarchy and the topology, the top kinds of every key hierarchy, and the key metadata of all tenants. Serves the gRPC APIs and, optionally, KMIP |
| Agent | Takes over the lower kinds of a hierarchy for a part of the topology, for example a region or cloud. Registers with the root node and receives the tenants and keys it manages |
| `kr` CLI | Command-line client for the root node's gRPC APIs |
| [Krypton operator](https://github.com/openkcm/krypton-operator) | Experimental. Installs Krypton into remote edge clusters |

The root node and every agent keep their key metadata in their own PostgreSQL
database, and the key material in a vault: OpenBao, or SQLite for development.

## Find your way

| You want to | Read |
| --- | --- |
| Understand key hierarchies, kinds, segments and key bindings | [Concepts](/components/krypton/concepts) |
| See how the root node, agents, databases and vaults work together | [Architecture](/components/krypton/architecture) |
| Know the states of a key and what changes them | [Key lifecycle](/components/krypton/key-lifecycle) |
| Run Krypton on your machine and try it with the CLI | [Getting started](/components/krypton/getting-started) |
| Manage tenants and keys | [The kr CLI](/components/krypton/cli) and the [gRPC API](/components/krypton/api) |
| Give workloads their keys | [KMIP](/components/krypton/kmip) |
| Install the root node in Kubernetes | [Install the root node](/components/krypton/install) |
| Run agents | [Agents](/components/krypton/agents) |
| Secure a deployment | [Security](/components/krypton/security) |
| Look up a configuration key | [Configuration reference](/components/krypton/configuration) |

## Using Krypton with CMK

Krypton runs on its own. In an OpenKCM deployment with CMK, the
[CMK-2-Krypton Bridge](/components/cmk/krypton-bridge) receives CMK's key tasks
and creates the corresponding keys in Krypton.

## See also

- [Krypton overview](/overview/krypton): what Krypton is for and when to use it
- [Krypton releases](https://github.com/openkcm/krypton/releases)
- [Glossary](/overview/glossary)
