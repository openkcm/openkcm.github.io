# Your tenant

Your **tenant** is your organization's space in CMK. It holds your keys, key
configurations, systems, groups and settings, separated from every other
customer of your cloud service provider. This page explains how your tenant is
set up, where it runs, which settings it has, and what happens when your
provider blocks or removes it.

## How your tenant is set up

You do not create or delete tenants in CMK. Your cloud service provider
registers your tenant when you become a customer:

1. Your provider registers the tenant, with the **region** that serves it.
1. CMK in that region creates the tenant and two groups:
   `KMS_TenantAdministrator_<tenant ID>` and `KMS_TenantAuditor_<tenant ID>`.
1. Your provider connects your **identity provider**, so that your users sign
   in with your usual login.
1. A member of the tenant administrator group in your identity provider signs
   in and creates the groups for your key administrators; see
   [Sign-in, groups and roles](/components/cmk/guide/access).

Your provider then gives you the address of the CMK UI, your tenant ID and the
name of the administrator group.

## Tenant ID, name and role

| Property | Where you see it |
| --- | --- |
| Tenant ID | In the CMK UI address (`https://ui.example.com/#/<tenant ID>/…`), in every API path (`/cmk/v1/<tenant ID>/…`) and in the names of your default groups. It never changes |
| Name | In the tenant menu at the top of the CMK UI. Your provider sets it |
| Role | `LIVE`, `TEST` or `TRIAL`: the kind of tenant your provider registered |

Tenant administrators and auditors can read these properties through the API:

```http
GET /cmk/v1/acme/tenantInfo
```

```json
{ "id": "acme", "name": "ACME Corporation", "role": "LIVE" }
```

## Your region

CMK runs separately in several regions, and your tenant belongs to exactly one
of them, chosen by your provider when your tenant was registered. Your keys,
key configurations, groups and settings are kept in that region, and you work
with the CMK UI and API of that region only. The region of a tenant cannot be
changed.

Your systems can run in other regions: CMK in your tenant's region sends key
changes to your systems in every region that your provider supports. See
[Systems](/components/cmk/guide/systems).

## Several tenants

Some organizations have more than one tenant, for example a test tenant and a
live tenant. If several tenants in the same region use the same identity
provider, the **tenant menu** at the top of the CMK UI lists them, and you
switch between them there. Your role can differ in each tenant: it comes from
your groups in that tenant.

Through the API, the list of these tenants is:

```http
GET /cmk/v1/acme/tenants
```

A tenant in another region, or one that uses another identity provider, is not
listed. Open the CMK UI address of its region instead.

## Tenant settings

| Settings | What they control | Who can change them |
| --- | --- | --- |
| [Groups](/components/cmk/guide/access) | Who holds which role in your tenant | Tenant administrators |
| [Approval settings](/components/cmk/guide/approvals#approval-settings) | How many approvals sensitive changes need, and how long requests stay open and are kept | Tenant administrators. Key administrators and auditors can view them |
| [Limits](/components/cmk/guide/key-configurations#limits) | How many key configurations your tenant can have, and how many keys and systems each key configuration can have | Your provider. Everyone in the tenant can view them |
| Keystores | Which key types you can use: BYOK and its regions, HYOK and its keystore types | Your provider. Everyone in the tenant can view them |

Through the API:

| Request | Returns |
| --- | --- |
| `GET /cmk/v1/acme/tenantConfigurations/limits` | `keyConfigurations`, `keys` and `systems`: the limits that apply to your tenant, including any your provider set for you |
| `GET /cmk/v1/acme/tenantConfigurations/keystores` | `byok.allow` and `byok.supportedRegions`; `hyok.allow` and `hyok.providers`, for example `AWS` |
| `GET` and `PATCH /cmk/v1/acme/tenantConfigurations/workflow` | The approval settings |

## Blocked and removed tenants

Your provider can **block** your tenant, for example during a contract
dispute. While it is blocked, requests with a sign-in session are rejected with
`403` and the code `TENANT_BLOCKED`, so you cannot work in the CMK UI. Your
keys, key configurations, settings and system connections stay as they are,
and your systems keep the keys they have. When your provider unblocks the
tenant, you can work with it again.

When you leave the cloud service, your provider **removes** your tenant. CMK
then disconnects your systems, detaches your keys and deletes the tenant with
all its key configurations, groups and settings. HYOK keys stay in your own
keystore. The tenant ID cannot be used again.

## Troubleshooting

| Problem | Cause and fix |
| --- | --- |
| The CMK UI shows **Invalid tenant** or **Select a valid tenant** | The tenant ID in the address is wrong, or the tenant is served by another region. Use the address and tenant ID your provider gave you |
| **Access denied: You do not have access to the selected tenant** | Your identity provider does not send a group of this tenant for you. See [Sign-in, groups and roles](/components/cmk/guide/access#troubleshooting) |
| Every request fails with `TENANT_BLOCKED` | Your provider has blocked the tenant. Contact your provider |
| A tenant of your organization is missing from the tenant menu | It is in another region or uses another identity provider. Open its own CMK UI address |
| An action fails with `KEY_CONFIG_LIMIT_EXCEEDED`, `KEY_LIMIT_EXCEEDED` or `SYSTEM_LIMIT_EXCEEDED` | A limit of your tenant is reached. Ask your provider to raise it |

## See also

- [Sign-in, groups and roles](/components/cmk/guide/access)
- [Systems](/components/cmk/guide/systems)
- [Approvals](/components/cmk/guide/approvals)
