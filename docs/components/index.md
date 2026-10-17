# Components

OpenKCM consists of two components. Each has its own services, repositories,
releases and documentation.

| Component | Purpose | Status |
| --- | --- | --- |
| [CMK](/components/cmk/) | Customer-Managed Keys: governance of customer keys and their keystores, tenants, roles, approval workflows and propagation to regions | Available |
| [Krypton](/components/krypton/) | Cryptographic keys: key hierarchies, key material and key delivery to workloads | Pre-production |

```mermaid
flowchart LR
    subgraph CMK["CMK"]
        S["CMK services"] -- "key tasks" --> B["CMK-2-Krypton Bridge"]
    end
    subgraph KR["Krypton"]
        K["Krypton root server"]
    end
    B -- "gRPC" --> K
    W["Workloads"] -- "KMIP" --> K
```

- **CMK requires Krypton** for its cryptographic key operations. It drives
  Krypton through the [CMK-2-Krypton Bridge](/components/cmk/krypton-bridge), a
  CMK service.
- **Krypton is independent.** It does not depend on CMK and can be deployed and
  used on its own.

## CMK

CMK consists of the services CMK, CMK UI, Registry, ExtAuthZ, Session Manager
and the CMK-2-Krypton Bridge, plus plugins for keystores and identity management.
The Registry runs once, in a central deployment, and registers all tenants and
systems; the other services run in one regional deployment per CMK region.
[Go to the CMK documentation](/components/cmk/).

## Krypton

Krypton consists of a root server, agents and a command-line client.
[Go to the Krypton documentation](/components/krypton/).
