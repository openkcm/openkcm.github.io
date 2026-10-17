# Sign-in, groups and roles

You sign in to CMK with your tenant's own identity provider. What you may do
depends on your role, which CMK derives from the groups the identity provider
reports for you. This page explains the roles, the groups behind them, and how
tenant administrators give colleagues access.

## Sign in

1. Open the CMK UI address that your cloud service provider gave you.
1. CMK sends you to your tenant's identity provider. Sign in there as usual.
1. You return to the CMK UI. Your name and role are shown when you select your
   avatar.

Your session ends when you sign out, or after a period of inactivity set by your
provider.

## Roles

| Area | Auditor | Key administrator | Tenant administrator |
| --- | --- | --- | --- |
| Key configurations, keys and their tags | View | View, create, change, delete | – |
| Systems | View | View, connect, disconnect | – |
| Approval requests (Tasks) | View | View, create, approve, confirm | – |
| User groups | View | View | View, create, change, delete |
| Approval settings | View | View | View, change |

- **Key administrators** see only the key configurations, and their keys, that
  belong to one of their groups. They see all systems.
- **Auditors** see everything in the tenant and change nothing.
- **Tenant administrators** manage access and settings. They cannot see or
  change keys, which keeps key management separate from administration.

## One role per person

Your role comes from the groups that your identity provider puts into your
sign-in token. CMK compares them with the **IAM identifier** of each CMK group.

- If none of your groups matches a CMK group, CMK refuses access with
  **No user role detected** (`ZERO_ROLES_NOT_ALLOWED`).
- If your groups match groups with **different roles**, for example a key
  administrator group and the auditor group, CMK refuses access with
  **Role conflict detected** (`MULTIPLE_ROLES_NOT_ALLOWED`). Ask your identity
  provider team to remove you from one of them.
- Being in several groups with the **same** role is fine. As a key
  administrator, you then see the key configurations of all those groups.

## Default groups

When your tenant is created, CMK creates two groups. They cannot be renamed,
changed or deleted.

| Group | Role | IAM identifier |
| --- | --- | --- |
| TenantAdministrator | Tenant administrator | `KMS_TenantAdministrator_<tenant ID>` |
| TenantAuditor | Auditor | `KMS_TenantAuditor_<tenant ID>` |

Ask your identity provider team to create groups with exactly these names, and
to include them in the sign-in token, for example in a `groups` claim. Your
cloud service provider tells you which claim your tenant uses.

## Create a key administrator group

Key administrators always belong to a group that a tenant administrator
creates. You can create several, for example one per team or business unit;
each key configuration belongs to exactly one of them.

1. Go to **User Groups** and select **Create Group**.
1. Enter a **Name**, for example `Payments`, and optionally a description. The
   role is always **Key Administrator**.
1. CMK generates the IAM identifier `KMS_<name>_<tenant ID>`, for example
   `KMS_Payments_acme`.
1. Ask your identity provider team to create a group with this exact identifier
   and add the key administrators to it.

Names and IAM identifiers may contain letters, digits, spaces, `-` and `_`.
Names can have up to 64 characters, IAM identifiers up to 128. Both must be
unique in the tenant.

On a group's detail page, **IAM Synced** shows whether the identity provider
knows a group with that IAM identifier.

## Change or delete a group

- **Edit** lets you change the name, the description and the IAM identifier of
  a key administrator group, for example to match an existing group of your
  identity provider. Members keep their role only if the new identifier
  matches their groups.
- A group that owns a key configuration cannot be deleted.
- Changes to groups take effect within about two minutes.

## Troubleshooting

| You see | What to do |
| --- | --- |
| **No user role detected** | Your identity provider does not send any group that matches a CMK group. Check your group memberships and the group claim |
| **Role conflict detected** | You are in groups with different roles. Leave all but one of them |
| You see no key configurations | You are not in the administrator group of any key configuration, or none exists yet |
| A new colleague still has no access | Wait two minutes after changing a group, then sign in again |

## See also

- [Key configurations](/components/cmk/guide/key-configurations)
- [Approvals](/components/cmk/guide/approvals)
- [CMK authorization](/components/cmk/security/cmk-authorization): how CMK
  enforces roles on every request
