# CMK API

Everything you can do in the CMK UI, you can also do through the CMK REST API,
for example to automate the setup of key configurations or to connect systems
from a deployment pipeline. This page explains how to call the API, and the
conventions it uses.

## Base URL

```
https://<API host>/cmk/v1/<tenant ID>
```

Your cloud service provider gives you the API host and your tenant ID. All
paths on this page are relative to this base URL. The API is described in
OpenAPI format in the CMK repository:
[apis/cmk/cmk-ui.yaml](https://github.com/openkcm/cmk/blob/main/apis/cmk/cmk-ui.yaml).

## Authentication

Every request passes the API gateway, which checks who you are before CMK sees
the request. The gateway accepts three kinds of callers:

| Caller | How it authenticates | Typical use |
| --- | --- | --- |
| Browser | Session cookie from the sign-in, plus the `X-CSRF-Token` header | The CMK UI |
| Technical user or automation | `Authorization: Bearer <access token>` from an identity provider that your provider has configured | Scripts, pipelines |
| Technical system | Client certificate (mutual TLS) with a subject that your provider has registered | Services of the cloud service |

The token or certificate must carry the groups that give the caller a role in
your tenant, exactly as for people; see
[Sign-in, groups and roles](/components/cmk/guide/access). Ask your provider
which identity provider, audience and group claim to use for technical users.

```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://api.example.com/cmk/v1/acme/keyConfigurations
```

## Conventions

| Topic | Convention |
| --- | --- |
| Formats | JSON. `PATCH` requests use `Content-Type: application/merge-patch+json` |
| Paging | `$top` (default 20) and `$skip` (default 0). Add `$count=true` to get the total number of items |
| Filtering | `$filter` with `eq` and `and` on the fields that each list documents, and `$search` for free text where supported |
| Keys | `GET /keys` requires the query parameter `keyConfigurationID` |
| Identifiers | Objects are identified by UUIDs, for example `keyConfigurationID` |

Example: the first 50 systems in region `eu10`, with the total count:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://api.example.com/cmk/v1/acme/systems?\$filter=region%20eq%20'eu10'&\$top=50&\$count=true"
```

## Errors

Errors have the same structure everywhere:

```json
{
  "error": {
    "code": "KEY_LIMIT_EXCEEDED",
    "message": "…",
    "status": 409,
    "requestID": "…"
  }
}
```

Quote the `requestID` when you contact your provider about an error.

| Code | Status | Meaning |
| --- | --- | --- |
| `FORBIDDEN` | 403 | Your role does not allow this action, or the object belongs to a key configuration of another group |
| `ZERO_ROLES_NOT_ALLOWED` | 403 | The caller's groups do not match any CMK group |
| `MULTIPLE_ROLES_NOT_ALLOWED` | 403 | The caller's groups map to more than one role |
| `ACTION_REQUIRE_WORKFLOW` | 400 | The change needs approval; create an approval request instead |
| `UNIQUE_ERROR` | 409 | An object with this name already exists |
| `KEY_CONFIG_LIMIT_EXCEEDED`, `KEY_LIMIT_EXCEEDED`, `SYSTEM_LIMIT_EXCEEDED` | 409 | A tenant limit is reached |
| `BYOK_NOT_ALLOWED`, `HYOK_NOT_ALLOWED` | 4xx | The key type or provider is not enabled for your tenant |

A `401` or `403` with a short message from the gateway means the gateway did not
accept your credentials; check the token or certificate.

## Common tasks

| Task | Request | Guide |
| --- | --- | --- |
| Create a key configuration | `POST /keyConfigurations` | [Key configurations](/components/cmk/guide/key-configurations#create-a-key-configuration) |
| Create a BYOK key | `POST /keys` | [Keys](/components/cmk/guide/keys#_1-create-the-key) |
| Get the BYOK wrapping key | `GET /keys/{keyID}/importParams` | [Keys](/components/cmk/guide/keys#_2-download-the-wrapping-key) |
| Import BYOK key material | `POST /keys/{keyID}/importKeyMaterial` | [Keys](/components/cmk/guide/keys#_4-import-the-wrapped-material) |
| Enable or disable a BYOK key | `PATCH /keys/{keyID}` with `{"enabled": false}` | [Keys](/components/cmk/guide/keys#enable-and-disable-a-key) |
| Set the primary key | `PATCH /keyConfigurations/{keyConfigurationID}` with `{"primaryKeyID": "…"}` | [Key configurations](/components/cmk/guide/key-configurations#add-keys-and-choose-the-primary-key) |
| Connect a system | `PATCH /systems/{systemID}/link` | [Systems](/components/cmk/guide/systems#connect-a-system) |
| Disconnect a system | `DELETE /systems/{systemID}/link` | [Systems](/components/cmk/guide/systems#disconnect-a-system) |
| Retry or cancel a failed change | `POST /systems/{systemID}/recoveryActions` with `{"action": "RETRY"}` | [Systems](/components/cmk/guide/systems#when-a-change-fails) |
| Request an approval | `POST /workflows` | [Approvals](/components/cmk/guide/approvals#through-the-api) |
| Manage groups | `GET`, `POST /groups`, `PATCH`, `DELETE /groups/{groupID}` | [Groups](/components/cmk/guide/access#create-a-key-administrator-group) |
| Your own identity and role | `GET /userInfo` | |

## See also

- [Manage your keys](/components/cmk/guide/)
- [Request walkthrough](/components/cmk/security/walkthrough): the HTTP
  exchanges, step by step
