# Introduction

An adopter of OpenKCM lets its customers control the keys that protect their
data, across many services and regions. This page shows the building blocks and
how they are laid out, the main flows, what the provider's own services integrate
with, and how OpenKCM differs from other key management offerings.

## The problem it solves

A provider runs many services, in many regions, for many customers. Each service
encrypts the data it stores and sends. Customers in regulated industries ask for
three things:

1. **Own the key.** The key that protects their data comes from them (BYOK) or
   stays in their own keystore (HYOK).
2. **Decide who may use it.** Their own people, signing in with their own
   identity provider, connect services to keys, with separation of duties,
   approvals and an audit trail.
3. **Withdraw it everywhere.** Disabling the key reaches every service and region
   that uses it, without a separate request to each service team.

A key management service (KMS) answers the first point for one account in one
cloud. OpenKCM answers all three for every customer of a provider, across all of
the provider's services: it manages the **key chain**, from the customer's key
down to the keys that the services use.

## Architecture at a glance

OpenKCM separates four concerns:

| Plane | Component | Responsibility |
| --- | --- | --- |
| Governance | [CMK](/overview/cmk): Registry and CMK-2-Krypton Bridge (central); CMK (per region) | Tenants, customer keys and their keystores, systems, roles, approvals, audit, propagation of key changes. Holds no key material |
| Root of trust | Keystores | The customer keys (L1): in a keystore that the provider runs for the tenant (BYOK), or in the customer's own keystore (HYOK) |
| Execution | [Krypton](/overview/krypton): root node, agents | The key hierarchies below the customer key (L2 to L4): generation, sealing, storage, delivery to workloads |
| Consumption | The provider's services | Use the keys to encrypt the customers' data, and act on key changes |

Identity and access sit in front of the governance plane: each customer signs in
with their own identity provider, and every request is checked at the gateway.

```mermaid
flowchart TB
    subgraph Customer["Customer"]
        direction LR
        IdP["Identity provider<br/>and directory"]
        OKS["Own keystore<br/>(HYOK keys)"]
    end
    subgraph Gov["Governance plane: CMK"]
        direction LR
        REG["Registry<br/>(central)"]
        GW["API gateway<br/>with ExtAuthZ"]
        SM["Session Manager"]
        CMK["CMK<br/>(per region)"]
        BR["CMK-2-Krypton Bridge<br/>(central)"]
    end
    PKS["Keystores run for the tenants<br/>(BYOK keys)"]
    subgraph Exec["Execution plane: Krypton"]
        direction LR
        KR["Root node"]
        AG["Agents"]
    end
    subgraph Svc["Provider services, per system region"]
        SYS["Systems"]
    end
    U["Customer's key administrators"] -- "UI / API" --> GW
    GW --> CMK
    U -- "sign-in" --> SM
    SM -- "OpenID Connect" --> IdP
    REG -- "tenants of the region" --> CMK
    CMK -- "keystore plugins" --> OKS
    CMK -- "keystore plugins" --> PKS
    CMK -- "key and system tasks (AMQP)" --> SYS
    SYS -- "register systems (gRPC)" --> REG
    CMK -- "key and system tasks (AMQP),<br/>key management API (gRPC)" --> BR
    BR -- "register systems (gRPC)" --> REG
    BR -- "tenants and keys (gRPC)" --> KR
    KR -- "keys of a region" --> AG
    SYS -- "keys (KMIP)" --> KR
```

## The key chain

The customer key is the root of a chain of keys. Each key protects the keys of
the level below, so a few customer keys protect the many keys that services use,
and withdrawing a customer key cuts off everything below it.

| Level | Key | Held in | Managed by | Status |
| --- | --- | --- | --- | --- |
| L1 | Customer key | Keystore (BYOK) or the customer's own keystore (HYOK) | CMK | Available, with AWS KMS |
| L2 | Tenant key | Krypton | Krypton, driven by CMK through the Bridge | <Badge type="danger" text="Sandbox" /> |
| L3 | Service key | Krypton | Krypton | <Badge type="danger" text="Sandbox" /> |
| L4 | Data encryption key | Krypton, delivered to the workload | Krypton | <Badge type="danger" text="Sandbox" /> |

The levels of the Krypton hierarchy are configurable; L2 to L4 is the layout that
CMK uses. Protecting the L2 key with the customer's L1 key is part of the target
architecture and not implemented yet; until then, CMK propagates key changes to
the systems, which act on them.


### What sets OpenKCM apart

1. **Built for providers and their customers.** A provider runs OpenKCM once for
   all its customers. Each customer is a tenant with its own identity provider,
   roles, approvals and audit events. Cloud KMSs are built for the owner of an
   account; giving a provider access to a customer's key there is set up with
   cross-account or cross-tenant permissions for each resource that uses it.
2. **One customer key for every service and region.** Services register their
   systems once in the Registry. A key change reaches every linked system in
   every region, and CMK tracks which systems have confirmed it. With a KMS,
   each service checks the key when it next needs it, and each provider service
   integrates with the KMS on its own.
3. **BYOK and HYOK under one governance.** Imported and customer-held keys go
   through the same roles, approvals, propagation and audit.
4. **Governance separated from key material.** The control plane decides and
   records, and never holds key material. Key operations stay in the keystore
   that holds the key.
5. **Open source and cloud-neutral.** Apache 2.0, self-hosted on any Kubernetes,
   with keystores as plugins. Cloud KMSs are proprietary services of their
   cloud; HashiCorp Vault is source-available under the Business Source License
   since August 2023; enterprise key managers are commercial appliances or
   services.
6. **The whole key chain.** With Krypton, the chain continues below the customer
   key: tenant, service and data keys in configurable hierarchies, delivered to
   workloads over the KMIP standard <Badge type="danger" text="Sandbox" />.

### Comparison

| | Cloud provider KMS | Self-hosted secrets managers | Enterprise key managers | SaaS customer key features | OpenKCM |
| --- | --- | --- | --- | --- | --- |
| Examples | AWS KMS, Azure Key Vault and Managed HSM, Google Cloud KMS | HashiCorp Vault, OpenBao | Thales CipherTrust, Fortanix DSM, Entrust KeyControl | Salesforce Shield, Microsoft Purview Customer Key, Google Workspace client-side encryption | CMK and Krypton |
| Built for | The account owner, protecting resources in that cloud and their own applications | An organization's own applications and secrets | An enterprise's keys across clouds, applications and HSMs | The customers of one SaaS vendor | A provider offering customer-controlled keys to its customers |
| Runs | In that cloud | Self-hosted; Vault also as a managed service | Physical or virtual appliance, or as a service | In the vendor's service | Self-hosted by the provider on Kubernetes |
| License | Proprietary | Vault: Business Source License 1.1; OpenBao: MPL 2.0 | Proprietary | Proprietary | Apache 2.0 |
| Customer brings the key (BYOK) | Key import | Key import into Transit | Yes, to several clouds | Salesforce Shield; Purview Customer Key with keys in Azure Key Vault | Yes, with AWS KMS today |
| Key stays with the customer (HYOK) | AWS External Key Store, Azure Managed HSM external key management, Google Cloud External Key Manager, each through a proxy or partner run outside the cloud | The keys are held in Vault or OpenBao | Yes, as the external key manager of the clouds | Salesforce cache-only keys, Workspace client-side encryption | Yes, keys in the customer's own keystore, with AWS KMS today |
| Where a key change takes effect | The services of that cloud that use the key, when they next use it | The applications that call it | The clouds and applications it is integrated with | That vendor's services | Every service of the provider that registers its systems, in every region, with confirmation |
| Workload key access | The cloud's API | API; KMIP in Vault Enterprise | API, KMIP, PKCS#11 | Inside the service | KMIP (Krypton) <Badge type="danger" text="Sandbox" /> |

Based on the vendors' documentation as of October 2026; see
[Sources](#sources).

### OpenKCM works with them

- **A KMS as keystore.** CMK keeps the customer keys in AWS KMS today: BYOK keys
  in an account that the provider runs for the tenant, HYOK keys in the
  customer's own account. Further keystores, such as other cloud KMSs, enterprise
  key managers or HSMs, can be added as [keystore plugins](/components/cmk/plugins).
- **OpenBao as vault.** Krypton stores its sealed key material in OpenBao.
- **Standard protocols.** Workloads get keys over KMIP; services integrate
  through documented gRPC and AMQP 1.0 interfaces, independent of any cloud.

### When to use what

| You want to | Use |
| --- | --- |
| Protect your own resources in one cloud | That cloud's KMS |
| Manage secrets and encryption for your own applications | Vault or OpenBao |
| Manage your enterprise's keys across clouds and data centers, with HSMs | An enterprise key manager |
| Let your customers control the keys for their data in all your services | OpenKCM, with one of the above as keystore |

### Sources

- AWS:
  [AWS KMS](https://docs.aws.amazon.com/kms/latest/developerguide/overview.html),
  [importing key material](https://docs.aws.amazon.com/kms/latest/developerguide/importing-keys.html),
  [external key stores](https://docs.aws.amazon.com/kms/latest/developerguide/keystore-external.html),
  [access from other accounts](https://docs.aws.amazon.com/kms/latest/developerguide/key-policy-modifying-external-accounts.html)
- Microsoft:
  [Azure Key Vault](https://learn.microsoft.com/en-us/azure/key-vault/general/basic-concepts),
  [Managed HSM external key management](https://learn.microsoft.com/en-us/azure/key-vault/managed-hsm/external-key-management-overview),
  [cross-tenant customer-managed keys](https://learn.microsoft.com/en-us/azure/storage/common/customer-managed-keys-configure-cross-tenant-new-account),
  [Purview Customer Key](https://learn.microsoft.com/en-us/purview/customer-key-overview)
- Google:
  [Cloud KMS](https://docs.cloud.google.com/kms/docs/key-management-service),
  [Cloud External Key Manager](https://docs.cloud.google.com/kms/docs/ekm),
  [Workspace client-side encryption](https://developers.google.com/workspace/cse/guides/overview)
- HashiCorp and OpenBao:
  [Vault license](https://www.hashicorp.com/en/bsl),
  [Vault Transit](https://developer.hashicorp.com/vault/docs/secrets/transit),
  [Vault KMIP](https://developer.hashicorp.com/vault/docs/secrets/kmip),
  [OpenBao secrets engines](https://openbao.org/docs/secrets/)
- Enterprise key managers:
  [Thales CipherTrust Cloud Key Management](https://www.thalesdocs.com/ctp/cm/2.7/reference/cckmapi/cckm-overview/index.html),
  [Fortanix DSM](https://www.fortanix.com/platform/data-security-manager),
  [Entrust KeyControl](https://nshielddocs.entrust.com/interops-docs/hpe-storage-9000/deploy-entrust-kc.html)
- [Salesforce Shield BYOK](https://help.salesforce.com/s/articleView?id=xcloud.security_shield_pe_byok.htm)

## Status

The governance plane is available; the execution plane is in <Badge type="danger" text="Sandbox" />.

| Part | Status |
| --- | --- |
| Registry, CMK, CMK UI, ExtAuthZ, Session Manager | Available |
| BYOK and HYOK customer keys, with AWS KMS | Available |
| Propagation of key and system changes to the systems of every region | Available |
| Keystores other than AWS KMS | Not yet available; can be added as plugins |
| Krypton key hierarchies and KMIP delivery | <Badge type="danger" text="Sandbox" /> |
| CMK-2-Krypton Bridge | Early stage |
| Customer key protecting the Krypton hierarchy | Not yet available |

## See also

- [Core concepts](/overview/core-concept)
- [Trust model](/overview/trust-model)
- [Deployment planning](/components/cmk/deployment)
- [Krypton architecture](/components/krypton/architecture)
