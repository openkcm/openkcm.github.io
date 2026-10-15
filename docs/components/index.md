# Components

OpenKCM consists of two separate products. Each has its own components,
repositories, releases and documentation.

| Product | Purpose | Status |
| --- | --- | --- |
| [CMK](/components/cmk/) | Customer-Managed Keys: governance of customer keys in the customers' own keystores, tenants, roles, approval workflows and propagation to regions | Active |
| [Krypton](/components/krypton/) | Key hierarchies and key material for tenants, and key delivery to workloads | Pre-production |

## CMK

CMK consists of the services CMK, CMK UI, Registry, ExtAuthZ and Session
Manager, plus plugins for keystores and identity management.
[Go to the CMK documentation](/components/cmk/).

## Krypton

Krypton consists of a root server, agents and a command-line client.
[Go to the Krypton documentation](/components/krypton/).
