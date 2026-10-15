# CMK authorization and tenant isolation

CMK accepts a request only if it carries valid
[signed client data](/components/cmk/security/client-data) and the caller's role
allows the requested API operation in the requested tenant.

## Request pipeline

CMK runs each API request through these steps, in order:

1. Set security headers, including a restrictive Content Security Policy.
1. Limit the request body size.
1. Add tracing and a request ID.
1. Resolve the tenant from the `{tenant}` path segment.
1. Recover from panics and log the request.
1. Validate the request against the OpenAPI specification.
1. Verify the client data: signature, algorithm, key ID and validity period.
1. Map the caller's groups to a role.
1. Check that the role may call the requested API operation.

## Roles

| Role | Purpose |
| --- | --- |
| `TENANT_ADMINISTRATOR` | Manages the tenant: settings, groups and their roles |
| `KEY_ADMINISTRATOR` | Manages keys, key configurations, systems and workflows |
| `TENANT_AUDITOR` | Read-only access for audits |

API permissions per role:

| Resource | Tenant administrator | Key administrator | Tenant auditor |
| --- | --- | --- | --- |
| Tenant | Read, update | - | Read |
| Tenant settings | Read, update | Read | Read |
| Groups | Read, create, update, delete | Read | Read |
| Keys | - | Read, create, update, delete, rotate | Read |
| Key configurations | - | Read, create, update, delete | Read |
| Systems | - | Read, update, link and unlink | Read |
| System groups | - | Read, update | Read |
| Workflows | - | Read, create, update, delete | Read |

The tenant administrator cannot manage keys, and the key administrator cannot
change who holds which role.

Each tenant maps its own identity provider groups to these roles. A caller must
belong to at least one mapped group, and all of the caller's groups must map to
the same role. CMK rejects callers whose groups resolve to no role
(`403 ZERO_ROLES_NOT_ALLOWED`) or to more than one role
(`403 MULTIPLE_ROLES_NOT_ALLOWED`), which keeps duties separated.

## Groups and identity provider claims

CMK matches the entries of the caller's `groups` claim against the **IAM
identifier** of each CMK group. The comparison is exact.

When a tenant is onboarded, CMK creates two groups:

| CMK group | Role | IAM identifier |
| --- | --- | --- |
| `TenantAdministrator` | `TENANT_ADMINISTRATOR` | `KMS_TenantAdministrator_<tenant ID>` |
| `TenantAuditor` | `TENANT_AUDITOR` | `KMS_TenantAuditor_<tenant ID>` |

These names cannot be changed. CMK also reports them to the Registry as the
tenant's user groups.

Tenant administrators create further groups with the `KEY_ADMINISTRATOR` role
through the CMK API or UI. A new group gets the IAM identifier
`KMS_<group name>_<tenant ID>`, which can be changed afterwards to match an
existing group in the identity provider.

**Your identity provider must issue these identifiers in the `groups` claim.**
For tenant `acme`, a tenant administrator's ID token contains:

```json
{
  "sub": "8f2c-user-id",
  "groups": ["KMS_TenantAdministrator_acme"]
}
```

With Keycloak, for example, create groups with exactly these names and add
users to them. The group membership mapper must issue group names without the
full path.

Changes to groups and their roles take effect within two minutes, when CMK
refreshes its cached mappings.

## Deny by default

Every API operation has an explicit authorization rule that lists the roles
allowed to call it. If an operation has no rule, CMK denies the request with
`403 Forbidden`.

## Tenant isolation

- The tenant ID comes from the request path, and every database access is
  scoped to that tenant.
- CMK stores each tenant's data in its own PostgreSQL schema.
- Session cookies are issued per tenant, and Session Manager checks that a
  session belongs to the tenant in the path.
- A blocked tenant is rejected by ExtAuthZ before the request reaches CMK.

## Users and groups

CMK uses an [identity management plugin](/components/cmk/plugins#identity-management-plugins)
to read users and groups from the tenant's directory, for example to check that
a group exists before mapping it to a role, or to find the approvers of a
workflow.

## Workflows

Sensitive key operations can require approval through a workflow. CMK uses the
identity management plugin to find the approvers.

Requests that CMK rejects at the authorization step are recorded as
[audit events](/components/cmk/security/audit).
