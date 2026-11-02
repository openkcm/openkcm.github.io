# OpenKCM vs. KMS offerings

OpenKCM is not another key management service (KMS). A KMS holds keys and
performs key operations for its owner. OpenKCM manages the relationship between
a provider's customers and the provider's services: which customer key protects
which service, who may change that, and what happens everywhere when it changes.
It uses a KMS as the keystore for the customer keys.

## What sets OpenKCM apart

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
   key: Domain (System), service and data keys in configurable hierarchies,
   delivered to workloads over the KMIP standard
   <Badge type="danger" text="Sandbox" />.

## Comparison

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

## OpenKCM works with them

- **A KMS as keystore.** CMK keeps the customer keys in AWS KMS today: BYOK keys
  in an account that the provider runs for the tenant, HYOK keys in the
  customer's own account. Further keystores, such as other cloud KMSs, enterprise
  key managers or HSMs, can be added as [keystore plugins](/components/cmk/plugins).
- **OpenBao as vault.** Krypton stores its sealed key material in OpenBao.
- **Standard protocols.** Workloads get keys over KMIP; services integrate
  through documented gRPC and AMQP 1.0 interfaces, independent of any cloud.

## When to use what

| You want to | Use |
| --- | --- |
| Protect your own resources in one cloud | That cloud's KMS |
| Manage secrets and encryption for your own applications | Vault or OpenBao |
| Manage your enterprise's keys across clouds and data centers, with HSMs | An enterprise key manager |
| Let your customers control the keys for their data in all your services | OpenKCM, with one of the above as keystore |

## Sources

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
