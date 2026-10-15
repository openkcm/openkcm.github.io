# CMK plugin configuration

CMK talks to customer keystores and directories through [plugins](/components/cmk/plugins).
This page shows complete configuration examples for every plugin CMK can use
today. The fields of a plugin entry are described in the
[CMK configuration reference](/components/cmk/security/cmk-config#plugins).

## How plugins are configured

Plugins are listed in the `plugins` section of the CMK configuration. Each entry
either starts an external plugin binary (`path` set) or selects a plugin built
into CMK (`path` empty). CMK passes `yamlConfiguration` to the plugin when it
starts it.

| Plugin | Type | Where it comes from |
| --- | --- | --- |
| AWS KMS | `KeystoreInstanceKeyOperation` | External binary from [keystore-plugins](https://github.com/openkcm/keystore-plugins) |
| SCIM | `IdentityManagementService` | Built into CMK (`name: scim`), or external binary from [identity-management-plugins](https://github.com/openkcm/identity-management-plugins) |
| Static SCIM | `IdentityManagementService` | External binary from identity-management-plugins, for tests and demos |
| `noop` | Every type | Built into CMK. Accepts calls and does nothing |

The image `cmk-full-plugins` contains the external binaries:

| Binary | Path in the image |
| --- | --- |
| AWS KMS keystore plugin | `/etc/plugins/keystore/keystoreop-aws` |
| SCIM | `/etc/plugins/identity-management/scim` |
| Static SCIM | `/etc/plugins/identity-management/scim-static` |

To check the binaries in your image:

```bash
kubectl -n services exec deploy/cmk -- ls /etc/plugins/keystore /etc/plugins/identity-management
```

Things to know before you start:

- **Plugin secrets** are read by the plugin itself, through value references in
  `yamlConfiguration`. Mount them as files into the CMK pods. The chart mounts
  `extraVolumes` into every CMK component.
- **Plugin processes inherit the environment** of the CMK pod. Prefer files over
  environment variables for plugin credentials.
- **Required plugins:** the task worker needs a `NotificationService` and a
  `SystemInformationService` plugin; use `noop` if you have none.
- **At most one** plugin each of `IdentityManagementService`,
  `NotificationService`, `SystemInformationService` and
  `CertificateIssuerService`; any number of keystore plugins.
- **Integrity:** set `checksum` (hex SHA-256 of the binary) for external
  plugins. Get it with `sha256sum` on the binary from the image.

## Complete example

A typical installation with AWS KMS, a SCIM directory and `noop` plugins for the
remaining types:

```yaml
config:
  plugins:
    # Customer keys in AWS KMS: system-managed, BYOK and HYOK
    - name: AWS
      type: KeystoreInstanceKeyOperation
      path: /etc/plugins/keystore/keystoreop-aws
      checksum: "<sha256 of keystoreop-aws>"
      logLevel: info
      tags: [default_keystore, hyok]
      yamlConfiguration: |
        auth:
          method: ambient

    # Users and groups from the tenants' SCIM directory
    - name: scim
      type: IdentityManagementService
      logLevel: info
      yamlConfiguration: |
        host:
          value: https://scim.example.com/scim/v2
        auth:
          type: basic
          basic:
            username: { source: file, file: { path: /etc/plugins-credentials/scim/username } }
            password: { source: file, file: { path: /etc/plugins-credentials/scim/password } }

    # Required by the task worker
    - { name: noop, type: NotificationService }
    - { name: noop, type: SystemInformationService }
    - { name: noop, type: CertificateIssuerService }

extraVolumes:
  - name: scim-credentials
    secret: { secretName: cmk-scim-credentials }
extraVolumeMounts:
  - { name: scim-credentials, mountPath: /etc/plugins-credentials/scim, readOnly: true }
```

## AWS KMS keystore plugin

The AWS plugin creates, imports, enables, disables and deletes keys in AWS KMS.

| Entry field | Value |
| --- | --- |
| `type` | `KeystoreInstanceKeyOperation` |
| `path` | `/etc/plugins/keystore/keystoreop-aws` |
| `name` | Your choice, for example `AWS`. The lowercase name is used in feature flags: `enable_byok_aws`, `enable_hyok_aws`, `detect_hyok_rotation_aws` |
| `tags` | `default_keystore` for system-managed and BYOK keys; `hyok` for HYOK keys |

### Authentication methods

The `auth` section of `yamlConfiguration` selects how the plugin gets AWS
credentials:

| `method` | Credentials | Use when |
| --- | --- | --- |
| `perRequest` (default) | Sent by CMK with each request, from the keystore configuration | Credentials differ per keystore |
| `ambient` | The pod's environment: EKS IRSA or Pod Identity, EC2/ECS roles, environment variables | CMK runs on AWS. No secrets in the configuration |
| `accessKey` | An IAM access key in the plugin configuration | Outside AWS, with a dedicated IAM user |
| `assumeRole` | STS `AssumeRole`, starting from ambient credentials or an access key | Keys in other AWS accounts, one role per tenant |
| `rolesAnywhere` | IAM Roles Anywhere with a certificate and key held by the plugin | Outside AWS, without long-lived access keys |

The plugin rejects unknown keys, unsupported methods, missing sections,
durations outside 15 minutes to 12 hours, and unreadable secrets when CMK starts
it. Secret values are trimmed of surrounding whitespace.

### Ambient credentials

```yaml
yamlConfiguration: |
  auth:
    method: ambient
```

On EKS, annotate the CMK service account for IRSA, for example
`eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/openkcm-cmk`.

### Access key

```yaml
yamlConfiguration: |
  auth:
    method: accessKey
    accessKey:
      accessKeyId:
        source: file
        file: { path: /etc/aws/access-key-id }
      secretAccessKey:
        source: file
        file: { path: /etc/aws/secret-access-key }
```

```yaml
extraVolumes:
  - name: aws-keystore
    secret: { secretName: cmk-aws-keystore }   # keys: access-key-id, secret-access-key
extraVolumeMounts:
  - { name: aws-keystore, mountPath: /etc/aws, readOnly: true }
```

The access key is read once, when CMK starts the plugin. Restart CMK after
rotating it.

### Assume role

```yaml
yamlConfiguration: |
  auth:
    method: assumeRole
    cacheSize: 1024
    assumeRole:
      source: ambient                 # or accessKey, with an accessKey section
      region: eu-central-1            # optional; defaults to the key's region
      roleArn: arn:aws:iam::123456789012:role/openkcm-keystore
      externalId:
        source: file
        file: { path: /etc/aws/external-id }
      sessionName: openkcm-keystore-plugin
      duration: 1h
      allowedRoleArns:
        - "arn:aws:iam::*:role/openkcm-*"
```

A role ARN or external ID sent with a request overrides the configured one.
`allowedRoleArns` limits which roles can be assumed (`*` matches any
characters); set it whenever requests can name roles. Each target role must
trust the plugin's identity:

```json
{
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::111111111111:role/openkcm-cmk" },
  "Action": "sts:AssumeRole",
  "Condition": { "StringEquals": { "sts:ExternalId": "<external ID>" } }
}
```

### IAM Roles Anywhere

```yaml
yamlConfiguration: |
  auth:
    method: rolesAnywhere
    rolesAnywhere:
      clientCert:
        source: file
        file: { path: /etc/aws-ra/tls.crt }
      privateKey:
        source: file
        file: { path: /etc/aws-ra/tls.key }
      trustAnchorArn: arn:aws:rolesanywhere:eu-central-1:123456789012:trust-anchor/1234
      profileArn: arn:aws:rolesanywhere:eu-central-1:123456789012:profile/5678
      roleArn: arn:aws:iam::123456789012:role/openkcm-keystore
      sessionDuration: 1h
      allowedRoleArns:
        - "arn:aws:iam::123456789012:role/openkcm-*"
```

The certificate and key are read again for every new session, so certificates
renewed on disk, for example by cert-manager, are used without a restart.

### Per-request credentials

Without an `auth` section, every request must carry the credentials in the
keystore configuration that CMK sends, either an access key
(`AUTH_TYPE_SECRET`) or a Roles Anywhere certificate (`AUTH_TYPE_CERTIFICATE`).

### Errors

Authentication failures are reported with a reason:

| Reason | Cause |
| --- | --- |
| `ROLE_NOT_ALLOWED` | The role is not in `allowedRoleArns` |
| `UNTRUSTED_CERTIFICATE`, `CANNOT_ASSUME_ROLE`, `TRUST_ANCHOR_NOT_FOUND`, `ROLE_NOT_IN_PROFILE`, `PROFILE_NOT_FOUND` | IAM Roles Anywhere rejected the session |
| `AUTHENTICATION_ERROR` | Any other credentials failure, for example STS denied `AssumeRole` |

## SCIM identity management plugin

The SCIM plugin reads users and groups from a SCIM 2.0 directory. CMK uses it to
check that a group exists before it is mapped to a role, and to find the
approvers of a workflow.

| Entry field | Built-in plugin | External plugin |
| --- | --- | --- |
| `name` | `scim` | Your choice |
| `type` | `IdentityManagementService` | `IdentityManagementService` |
| `path` | empty | `/etc/plugins/identity-management/scim` |

Both read the same `yamlConfiguration`:

| Field | Default | Description |
| --- | --- | --- |
| `host` | - | Value reference. Base URL of the SCIM API, for example `https://scim.example.com/scim/v2` |
| `auth.type` | - | `basic` or `mtls` |
| `auth.basic.username`, `auth.basic.password` | - | Value references, for `basic` |
| `auth.mtls.cert`, `auth.mtls.certKey`, `auth.mtls.serverCa` | - | Value references, for `mtls` |
| `authContext` | - | Value reference to a YAML document that routes requests per tenant, see below |
| `params.groupAttribute` | `displayName` | SCIM attribute used to find a group by name |
| `params.userAttribute` | `groups.display` | SCIM attribute used to find the groups of a user |
| `params.groupMembersAttribute` | - | SCIM attribute that holds a group's members, if your directory uses a different one |
| `params.listMethod` | `POST` | HTTP method for list queries: `POST` or `GET` |

Secret files are read byte for byte. Create them without a trailing newline,
for example with `printf '%s' "$PASSWORD" > password`.

### Group names in the directory

CMK looks up a group by its **IAM identifier**, for example
`KMS_TenantAdministrator_acme`, and the plugin compares it with
`params.groupAttribute`. So the groups in the directory must have the CMK
identifiers as their `displayName`, or `groupAttribute` must name an attribute
that holds them. See
[Groups and identity provider claims](/components/cmk/security/cmk-authorization#groups-and-identity-provider-claims).

### Basic authentication

```yaml
- name: scim
  type: IdentityManagementService
  yamlConfiguration: |
    host:
      value: https://scim.example.com/scim/v2
    auth:
      type: basic
      basic:
        username: { source: file, file: { path: /etc/plugins-credentials/scim/username } }
        password: { source: file, file: { path: /etc/plugins-credentials/scim/password } }
```

### Mutual TLS

```yaml
- name: scim
  type: IdentityManagementService
  yamlConfiguration: |
    host:
      value: https://scim.example.com/scim/v2
    auth:
      type: mtls
      mtls:
        cert:     { source: file, file: { path: /etc/plugins-credentials/scim/tls.crt } }
        certKey:  { source: file, file: { path: /etc/plugins-credentials/scim/tls.key } }
        serverCa: { source: file, file: { path: /etc/plugins-credentials/scim/ca.crt } }
```

### Per-tenant directories

`authContext` lets each request go to the directory of the caller's tenant. It
reads entries of the caller's auth context, which contains the fields listed in
CMK's `clientData.authContextFields`, for example `issuer` and `client_id`.

| Field | Description |
| --- | --- |
| `hostField` | Auth context entry whose value is the SCIM base URL. If the entry is missing, `host` is used |
| `basePath` | Path appended to the URL from `hostField` |
| `headerFields` | Request headers to set, as `header name: auth context entry` |

```yaml
- name: scim
  type: IdentityManagementService
  yamlConfiguration: |
    host:
      value: https://scim.example.com/scim/v2     # fallback
    auth:
      type: mtls
      mtls:
        cert:     { source: file, file: { path: /etc/plugins-credentials/scim/tls.crt } }
        certKey:  { source: file, file: { path: /etc/plugins-credentials/scim/tls.key } }
        serverCa: { source: file, file: { path: /etc/plugins-credentials/scim/ca.crt } }
    authContext:
      value: |
        headerFields:
          X-Tenant-Issuer: issuer
          X-Client-Id: client_id
```

## Static SCIM plugin

For tests and demos: users and groups are defined in the configuration.

```yaml
- name: static-directory
  type: IdentityManagementService
  path: /etc/plugins/identity-management/scim-static
  yamlConfiguration: |
    json_data: |
      {
        "users": [
          {"id": "u1", "userName": "alice", "emails": [{"value": "alice@example.com", "primary": true}]},
          {"id": "u2", "userName": "bob",   "emails": [{"value": "bob@example.com",   "primary": true}]}
        ],
        "groups": [
          {"id": "g1", "displayName": "KMS_TenantAdministrator_acme", "members": [{"value": "u1"}]},
          {"id": "g2", "displayName": "KMS_KeyAdmins_acme",           "members": [{"value": "u2"}]}
        ]
      }
```

Users and groups use the SCIM `User` and `Group` representations. Membership can
be declared on the group (`members`), on the user (`groups`), or both. IDs must
be unique.

## noop plugins

The built-in `noop` plugin exists for every type. It accepts every call and does
nothing:

```yaml
- { name: noop, type: NotificationService }        # no notifications are sent
- { name: noop, type: SystemInformationService }   # no additional system information
- { name: noop, type: CertificateIssuerService }   # no certificates are issued
```

## Troubleshooting

| Log message | Cause and fix |
| --- | --- |
| `unsupported plugin type "<type>"` | Misspelled `type` |
| `builtin plugin "<name>" not found` | `path` is empty and no built-in plugin has this name and type |
| `failed to load external plugin <name>` | `path` wrong, binary missing from the image, or not executable |
| `plugin type "<type>" constraint not satisfied` | More than one plugin of a type that allows only one |
| `invalid checksum` | `checksum` does not match the binary |
| `failed to parse auth configuration` | Unknown key or wrong structure in the AWS plugin's `auth` section |
| `failed to configure AWS authentication` | AWS credentials could not be loaded, for example a missing secret file |
| `Failed loading base host`, `Failed to unmarshal auth context` | SCIM `host` or `authContext` invalid |
| `failed to load notification plugin`, `system information plugin not configured` | The task worker needs these plugin types; add `noop` entries |
| `Plugin health check threshold reached` | The plugin process stopped responding; CMK shuts down |
