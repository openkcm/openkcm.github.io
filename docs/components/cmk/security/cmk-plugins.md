# CMK plugin configuration

CMK talks to keystores and user directories through [plugins](/components/cmk/plugins).
This page shows complete configuration examples for every plugin CMK can use
today. The fields of a plugin entry are described in the
[CMK configuration reference](/components/cmk/security/cmk-config#plugins) and,
under `config.plugins`, in the
[CMK chart's values.yaml](https://github.com/openkcm/cmk/blob/main/charts/cmk/values.yaml).

## How plugins are configured

Plugins are listed in `config.plugins` of the chart values. Each entry either
starts an external plugin binary (`path` set) or selects a plugin built into CMK
(`path` empty, selected by `name` and `type`). CMK passes `yamlConfiguration` to
the plugin when it loads it, and the plugin checks it. The tenant manager and the
task worker do not start when a plugin fails to load or rejects its settings; the
API server and the event reconciler log `Failed to load plugin`.

| Plugin | Type | Where it comes from |
| --- | --- | --- |
| AWS KMS | `KeystoreInstanceKeyOperation` | External binary from [keystore-plugins](https://github.com/openkcm/keystore-plugins) |
| Keystore provider | `KeystoreProvider` | Not in the CMK images. A binary of your own, see [Keystore provider plugin](#keystore-provider-plugin) |
| SCIM | `IdentityManagementService` | Built into CMK (`name: scim`), or external binary from [identity-management-plugins](https://github.com/openkcm/identity-management-plugins) |
| Static SCIM | `IdentityManagementService` | External binary from identity-management-plugins 0.6.0 or later, for tests and demos |
| `noop` | Every type | Built into CMK. Accepts calls and does nothing |

The image `images/cmk/cmk-full-plugins`, the chart's default, contains the
external binaries:

| Binary | Path in the image |
| --- | --- |
| AWS KMS keystore plugin | `/etc/plugins/keystore/keystoreop-aws` |
| SCIM | `/etc/plugins/identity-management/scim` |
| Static SCIM | `/etc/plugins/identity-management/scim-static` |

### List the bundled plugins

The image is distroless and has no shell, so `kubectl exec` cannot list its
files. Copy the plugins out of the image with Docker instead, to list them and to
compute the checksums for `checksum`. Set `<tag>` to the image tag you deploy and
`--platform` to the architecture of your nodes:

```bash
image=ghcr.io/openkcm/images/cmk/cmk-full-plugins:<tag>
id=$(docker create --platform linux/amd64 "$image" /cmkd)
docker export "$id" | tar -tvf - | grep 'etc/plugins/'
docker cp "$id":/etc/plugins ./plugins
docker rm "$id"
sha256sum plugins/keystore/* plugins/identity-management/*   # macOS: shasum -a 256
```

### Things to know before you start

- **Plugin settings** in `yamlConfiguration` are read by the plugin, not by CMK.
  The SCIM plugins do not apply the default `source: embedded` of value
  references: give every value reference an explicit `source`.
- **Plugin secrets** are read by the plugin itself, through value references in
  `yamlConfiguration`. Store them in Secrets and mount them read-only into the CMK
  pods with `extraVolumes` and `extraVolumeMounts`, under
  `/etc/credentials/<purpose>`. The chart mounts them into every CMK component.
  The pods run with `fsGroup: 65532`, so the files stay readable with
  `defaultMode: 0440`.
- **One volume per name:** the examples on this page mount one projected volume
  `credentials` at `/etc/credentials`. If you already have one, add the Secret
  sources of the examples to it.
- **Plugin processes inherit the environment** of the CMK pod. Prefer files over
  environment variables for plugin credentials.
- **Required plugins:** the task worker needs a `NotificationService` and a
  `SystemInformationService` plugin; use `noop` if you have none.
- **At most one** plugin each of `IdentityManagementService`,
  `NotificationService`, `SystemInformationService` and
  `CertificateIssuerService`; any number of `KeystoreInstanceKeyOperation` and
  `KeystoreProvider` plugins.
- **Integrity:** set `checksum` (hex SHA-256 of the binary) for external
  plugins. Compute it as shown in [List the bundled plugins](#list-the-bundled-plugins).

## Complete example

A typical installation with AWS KMS, a SCIM directory with mutual TLS, and `noop`
plugins for the remaining types:

```yaml
config:
  plugins:
    # Customer keys in AWS KMS: BYOK and HYOK
    - name: AWS
      type: KeystoreInstanceKeyOperation
      path: /etc/plugins/keystore/keystoreop-aws
      checksum: "<sha256 of keystoreop-aws>"
      logLevel: info
      tags: [default_keystore, hyok]
      yamlConfiguration: |
        auth:
          method: ambient

    # Keystore pool and default keystores for BYOK keys: a KeystoreProvider plugin with the
    # name of the default_keystore plugin. Not in the CMK images; uncomment it once your
    # image contains the binary. See "Keystore provider plugin".
    # - name: AWS
    #   type: KeystoreProvider
    #   path: /etc/plugins/keystore-provider/aws
    #   checksum: "<sha256 of the binary>"

    # Users and groups from the SCIM directory
    - name: scim
      type: IdentityManagementService
      logLevel: info
      yamlConfiguration: |
        host: { source: embedded, value: "https://scim.example.com/scim/v2" }
        auth:
          type: mtls
          mtls:
            cert: { source: file, file: { path: /etc/credentials/scim/tls.crt } }
            certKey: { source: file, file: { path: /etc/credentials/scim/tls.key } }
            serverCa: { source: file, file: { path: /etc/credentials/scim/ca.crt } }
        params:
          groupAttribute: { source: embedded, value: displayName }
          userAttribute: { source: embedded, value: groups.display }
          groupMembersAttribute: { source: embedded, value: "" }
          listMethod: { source: embedded, value: POST }
        authContext: { source: embedded, value: "" }

    # Required by the task worker
    - { name: noop, type: NotificationService }
    - { name: noop, type: SystemInformationService }
    - { name: noop, type: CertificateIssuerService }

extraVolumes:
  - name: credentials
    projected:
      defaultMode: 0440
      sources:
        - secret:
            name: cmk-scim
            items:
              - { key: tls.crt, path: scim/tls.crt }
              - { key: tls.key, path: scim/tls.key }
              - { key: ca.crt, path: scim/ca.crt }
extraVolumeMounts:
  - { name: credentials, mountPath: /etc/credentials, readOnly: true }
```

Create the Secret in the CMK namespace:

```bash
kubectl -n services create secret generic cmk-scim \
  --from-file=tls.crt --from-file=tls.key --from-file=ca.crt
```

## AWS KMS keystore plugin

The AWS plugin creates, imports, enables, disables and deletes keys in AWS KMS.

| Entry field | Value |
| --- | --- |
| `type` | `KeystoreInstanceKeyOperation` |
| `path` | `/etc/plugins/keystore/keystoreop-aws` |
| `name` | Your choice, for example `AWS`. Keys and keystores refer to the plugin by this name, so keep it once in use. The lowercase name is used in feature flags: `enable_byok_aws`, `enable_hyok_aws`, `detect_hyok_rotation_aws` |
| `tags` | `default_keystore` for BYOK keys (exactly one plugin); `hyok` for HYOK keys |

### Authentication methods

The `auth` section of `yamlConfiguration` selects how the plugin gets AWS
credentials. It needs keystore-plugins 0.1.7 or later.

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
        file: { path: /etc/credentials/aws/access-key-id }
      secretAccessKey:
        source: file
        file: { path: /etc/credentials/aws/secret-access-key }
```

```yaml
extraVolumes:
  - name: credentials
    projected:
      defaultMode: 0440
      sources:
        - secret:
            name: cmk-aws-keystore   # keys: access-key-id, secret-access-key
            items:
              - { key: access-key-id, path: aws/access-key-id }
              - { key: secret-access-key, path: aws/secret-access-key }
extraVolumeMounts:
  - { name: credentials, mountPath: /etc/credentials, readOnly: true }
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
        file: { path: /etc/credentials/aws/external-id }
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
        file: { path: /etc/credentials/aws/tls.crt }
      privateKey:
        source: file
        file: { path: /etc/credentials/aws/tls.key }
      trustAnchorArn: arn:aws:rolesanywhere:eu-central-1:123456789012:trust-anchor/1234
      profileArn: arn:aws:rolesanywhere:eu-central-1:123456789012:profile/5678
      roleArn: arn:aws:iam::123456789012:role/openkcm-keystore
      sessionDuration: 1h
      allowedRoleArns:
        - "arn:aws:iam::123456789012:role/openkcm-*"
```

`clientCert` holds the client certificate, optionally followed by its CA
certificates; `privateKey` holds the unencrypted RSA key. The certificate and key
are read again for every new session, so certificates renewed on disk, for
example by cert-manager, are used without a restart.

### Per-request credentials

Without an `auth` section, or with `method: perRequest`, every request must carry
the credentials in the keystore configuration that CMK sends, either an access
key (`AUTH_TYPE_SECRET`) or a Roles Anywhere certificate
(`AUTH_TYPE_CERTIFICATE`).

### Errors

Authentication failures are reported with a reason:

| Reason | Cause |
| --- | --- |
| `ROLE_NOT_ALLOWED` | The role is not in `allowedRoleArns` |
| `UNTRUSTED_CERTIFICATE`, `CANNOT_ASSUME_ROLE`, `TRUST_ANCHOR_NOT_FOUND`, `ROLE_NOT_IN_PROFILE`, `PROFILE_NOT_FOUND` | IAM Roles Anywhere rejected the session |
| `AUTHENTICATION_ERROR` | Any other credentials failure, for example STS denied `AssumeRole` |

## Keystore provider plugin

BYOK keys are created in the tenant's default keystore. CMK takes this keystore
from the keystore pool and grants the tenant access to it through a
`KeystoreProvider` plugin:

- The `keystore:fill` task creates the keystores of the pool with it.
- When a tenant's default keystore is used, CMK grants access to it with this
  plugin, for the tenant's key management certificate and for the crypto layer
  subjects of `cryptoLayer.certX509Trusts`, if not done yet.

CMK uses the `KeystoreProvider` plugin whose `name` equals the `name` of the
`KeystoreInstanceKeyOperation` plugin tagged `default_keystore`. CMK adds
`supportedregions`, from `keystorePool.supportedRegions`, to the
`yamlConfiguration` of every `KeystoreProvider` plugin.

The CMK images contain no `KeystoreProvider` plugin:
[keystore-plugins](https://github.com/openkcm/keystore-plugins) provides only the
AWS key operations plugin. For BYOK keys, build an image on `cmk-full-plugins`
that adds a `KeystoreProvider` binary for your keystore provider, and add an entry
with the same name as the `default_keystore` plugin:

```yaml
config:
  plugins:
    - name: AWS                                  # the name of the default_keystore plugin
      type: KeystoreProvider
      path: /etc/plugins/keystore-provider/aws   # where your image has the binary
      checksum: "<sha256 of the binary>"
      yamlConfiguration: |
        # settings of your plugin
```

BYOK keys must also be allowed, with `featureGates.allow-byok` or the feature flag
`enable_byok_<name>`, see
[featureGates and featureFlags](/components/cmk/security/cmk-config#featuregates-and-featureflags).

HYOK keys stay in the customers' own keystores and do not need a
`KeystoreProvider` plugin. Without one, the `keystore:fill` task fails; disable
it with `config.scheduler.tasks: [{ taskType: keystore:fill, enabled: false }]` if
you use HYOK keys only. See
[scheduler](/components/cmk/security/cmk-config#scheduler) and
[keystorePool](/components/cmk/security/cmk-config#keystorepool-provisioning-and-landscape).

## SCIM identity management plugin

The SCIM plugin reads users and groups from a SCIM 2.0 directory. CMK uses it to
check that a group exists before it is mapped to a role, and to find the
approvers of a workflow.

| Entry field | Built-in plugin | External plugin |
| --- | --- | --- |
| `name` | `scim` | Your choice |
| `type` | `IdentityManagementService` | `IdentityManagementService` |
| `path` | empty | `/etc/plugins/identity-management/scim` |

Both read the same `yamlConfiguration`. `host`, `auth`, every `params` field and
`authContext` are required, and every value reference needs an explicit `source`.
A missing setting, or a value reference without `source`, stops the plugin with a
`Failed loading …` error, see [Troubleshooting](#troubleshooting).

| Field | Description |
| --- | --- |
| `host` | Value reference. Base URL of the SCIM API, with `/Users` and `/Groups` below it, for example `https://scim.example.com/scim/v2`, without a trailing slash |
| `auth.type` | `mtls` or `basic` |
| `auth.mtls.cert`, `auth.mtls.certKey` | Value references, for `mtls`: the client certificate (PEM, followed by its intermediate CAs) and its unencrypted private key |
| `auth.mtls.serverCa` | Optional value reference: the CA that signed the directory's server certificate |
| `auth.mtls.rootCAs` | Optional list of value references: more trusted CAs. Without `serverCa` and `rootCAs`, the plugin trusts the CAs of the image |
| `auth.mtls.attributes.serverName` | Optional: the server name expected in the directory's certificate, if it differs from the host in `host` |
| `auth.basic.username`, `auth.basic.password` | Value references, for `basic` |
| `params.groupAttribute` | Value reference. SCIM attribute that CMK filters groups by to find a group by name. Empty: `displayName` |
| `params.userAttribute` | Value reference. SCIM attribute that CMK filters groups by to find the groups of a user. Empty: `groups.display` |
| `params.groupMembersAttribute` | Value reference. If set, the attribute that CMK requests (`attributes` query parameter) when it reads the members of a group. Empty: the whole group |
| `params.listMethod` | Value reference. `POST` (searches with `POST` to `/Users/.search` and `/Groups/.search`) or `GET` (with the filter in the query string). Empty: `POST` |
| `authContext` | Value reference to a YAML document that routes requests per tenant, see [Per-tenant directories](#per-tenant-directories). Empty: every request goes to `host` |

An empty value, `{ source: embedded, value: "" }`, selects the default of a
`params` field.

The plugin reads the files of value references once, when CMK starts it, byte
for byte. Restart CMK after you change them. Create passwords and other text
values without a trailing newline, for example with `kubectl create secret
--from-literal` as shown under [Basic authentication](#basic-authentication); PEM
files may end with one.

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
    host: { source: embedded, value: "https://scim.example.com/scim/v2" }
    auth:
      type: basic
      basic:
        username: { source: file, file: { path: /etc/credentials/scim/username } }
        password: { source: file, file: { path: /etc/credentials/scim/password } }
    params:
      groupAttribute: { source: embedded, value: displayName }
      userAttribute: { source: embedded, value: groups.display }
      groupMembersAttribute: { source: embedded, value: "" }
      listMethod: { source: embedded, value: POST }
    authContext: { source: embedded, value: "" }
```

```yaml
extraVolumes:
  - name: credentials
    projected:
      defaultMode: 0440
      sources:
        - secret:
            name: cmk-scim   # keys: username, password
            items:
              - { key: username, path: scim/username }
              - { key: password, path: scim/password }
extraVolumeMounts:
  - { name: credentials, mountPath: /etc/credentials, readOnly: true }
```

```bash
kubectl -n services create secret generic cmk-scim \
  --from-literal=username='<username>' --from-literal=password='<password>'
```

### Mutual TLS

```yaml
- name: scim
  type: IdentityManagementService
  yamlConfiguration: |
    host: { source: embedded, value: "https://scim.example.com/scim/v2" }
    auth:
      type: mtls
      mtls:
        cert: { source: file, file: { path: /etc/credentials/scim/tls.crt } }
        certKey: { source: file, file: { path: /etc/credentials/scim/tls.key } }
        serverCa: { source: file, file: { path: /etc/credentials/scim/ca.crt } }
    params:
      groupAttribute: { source: embedded, value: displayName }
      userAttribute: { source: embedded, value: groups.display }
      groupMembersAttribute: { source: embedded, value: "" }
      listMethod: { source: embedded, value: POST }
    authContext: { source: embedded, value: "" }
```

Mount the Secret `cmk-scim` with the keys `tls.crt`, `tls.key` and `ca.crt` as in
the [complete example](#complete-example).

### Settings from a JSON file

All settings can come from one JSON file, for example a Secret created with
`kubectl -n services create secret generic cmk-scim-settings --from-file=scim.json`.
Each value reference selects one field with `format: json` and `jsonPath`:

- `jsonPath` uses dot notation from `$` only, for example `$.auth.cert`. Bracket
  notation is not supported.
- Without `format: json`, `jsonPath` is ignored and the whole file is the value.
- The selected field must be a JSON string. PEM values are JSON strings with `\n`
  for the line breaks.

Example content of `scim.json`:

```json
{
  "host": "https://scim.example.com/scim/v2",
  "auth": {
    "cert": "-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----\n",
    "certKey": "-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n",
    "serverCa": "-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----\n"
  },
  "params": {
    "groupAttribute": "displayName",
    "userAttribute": "groups.display",
    "groupMembersAttribute": "",
    "listMethod": "POST"
  }
}
```

```yaml
config:
  plugins:
    - name: scim
      type: IdentityManagementService
      yamlConfiguration: |
        host:
          source: file
          file: { path: /etc/credentials/scim.json, format: json, jsonPath: "$.host" }
        auth:
          type: mtls
          mtls:
            cert:
              source: file
              file: { path: /etc/credentials/scim.json, format: json, jsonPath: "$.auth.cert" }
            certKey:
              source: file
              file: { path: /etc/credentials/scim.json, format: json, jsonPath: "$.auth.certKey" }
            serverCa:
              source: file
              file: { path: /etc/credentials/scim.json, format: json, jsonPath: "$.auth.serverCa" }
        params:
          groupAttribute:
            source: file
            file: { path: /etc/credentials/scim.json, format: json, jsonPath: "$.params.groupAttribute" }
          userAttribute:
            source: file
            file: { path: /etc/credentials/scim.json, format: json, jsonPath: "$.params.userAttribute" }
          groupMembersAttribute:
            source: file
            file:
              path: /etc/credentials/scim.json
              format: json
              jsonPath: "$.params.groupMembersAttribute"
          listMethod:
            source: file
            file: { path: /etc/credentials/scim.json, format: json, jsonPath: "$.params.listMethod" }
        authContext: { source: embedded, value: "" }

extraVolumes:
  - name: credentials
    projected:
      defaultMode: 0440
      sources:
        - secret:
            name: cmk-scim-settings
            items: [{ key: scim.json, path: scim.json }]
extraVolumeMounts:
  - { name: credentials, mountPath: /etc/credentials, readOnly: true }
```

### Per-tenant directories

`authContext` lets each request go to the directory of the caller's tenant, or
carry tenant headers to a shared directory. It reads entries of the caller's auth
context, which contains the fields listed in CMK's
[`clientData.authContextFields`](/components/cmk/security/cmk-config#clientdata),
for example `issuer` and `client_id`.

| Field | Description |
| --- | --- |
| `headerFields` | Request headers to set, as `header name: auth context entry`. Entries that the auth context does not contain are left out |
| `hostField` | Auth context entry whose value, joined with `basePath`, is the SCIM base URL. If the entry is missing or empty, `host` is used |
| `basePath` | Path joined to the value of `hostField` |

A shared directory that selects the tenant by request headers:

```yaml
- name: scim
  type: IdentityManagementService
  yamlConfiguration: |
    host: { source: embedded, value: "https://scim.example.com/scim/v2" }
    auth:
      type: mtls
      mtls:
        cert: { source: file, file: { path: /etc/credentials/scim/tls.crt } }
        certKey: { source: file, file: { path: /etc/credentials/scim/tls.key } }
        serverCa: { source: file, file: { path: /etc/credentials/scim/ca.crt } }
    params:
      groupAttribute: { source: embedded, value: displayName }
      userAttribute: { source: embedded, value: groups.display }
      groupMembersAttribute: { source: embedded, value: "" }
      listMethod: { source: embedded, value: POST }
    authContext:
      source: embedded
      value: |
        headerFields:
          X-Tenant-Issuer: issuer
          X-Client-Id: client_id
```

Use `hostField` only when all of these hold:

- `hostField` is `issuer`. ExtAuthZ sets it only for tokens and sessions of the
  identity providers it is configured to trust.
- Each of these identity providers serves the SCIM API of its tenant at
  `<issuer>/<basePath>`.
- `auth.type` is `mtls`, and `serverCa` or `rootCAs` holds only the CAs that
  signed the server certificates of these directories.
- Requests without the entry, for example requests authenticated with a client
  certificate, may go to the directory at `host`.

```yaml
authContext:
  source: embedded
  value: |
    hostField: issuer
    basePath: scim/v2
    headerFields:
      X-Client-Id: client_id
```

## Static SCIM plugin

For tests and demos: users and groups are defined in the configuration. Needs
identity-management-plugins 0.6.0 or later in the image.

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
be declared on the group (`members`), on the user (`groups`, for example
`[{"value": "g1"}]`), or both. Every user and group needs an `id`, unique among
the users or the groups. CMK finds a group by its `displayName`, so the
[group naming rule](#group-names-in-the-directory) applies.

## noop plugins

The built-in `noop` plugin exists for every type. It accepts every call and does
nothing:

```yaml
- { name: noop, type: NotificationService }        # no notifications are sent
- { name: noop, type: SystemInformationService }   # no additional system information
- { name: noop, type: CertificateIssuerService }   # no certificates are issued
```

## Troubleshooting

A plugin that rejects its settings is logged as
`failed to configure plugin "<name>"`, followed by the plugin's own message.

| Log message | Cause and fix |
| --- | --- |
| `unsupported plugin type "<type>"` | Misspelled `type` |
| `builtin plugin "<name>" not found` | `path` is empty and no built-in plugin has this name and type |
| `failed to load external plugin <name>` | `path` wrong, binary missing from the image, or not executable |
| `plugin type "<type>" constraint not satisfied` | More than one plugin of a type that allows only one |
| `invalid checksum` | `checksum` does not match the binary |
| `failed to parse auth configuration` | Unknown key or wrong structure in the AWS plugin's `auth` section |
| `failed to configure AWS authentication` | AWS credentials could not be loaded, for example a missing secret file |
| `Failed loading base host`, `Failed loading group attribute`, `Failed loading user attribute`, `Failed loading group members attribute`, `Failed loading list method`, `Failed loading auth context` | The SCIM setting `host`, a `params` field or `authContext` cannot be read. The reason follows the message, see the next rows |
| `no credential found, based on given credentials source` | The setting is missing, or its value reference has no `source` |
| `no such file or directory`, `permission denied` | The file of a value reference is not mounted at this path, or not readable: check `extraVolumeMounts` and `defaultMode: 0440` |
| `key error: <field> not found in object` | `jsonPath` names a field that the JSON file does not contain |
| `invalid credential format, expect string value` | `jsonPath` selects a field that is not a JSON string |
| `Failed to unmarshal auth context` | The `authContext` value is not a valid YAML document |
| `API Auth not implemented` | SCIM `auth.type` is missing or not `basic` or `mtls` |
| `failed to load the client id`, `failed to load the client secret` | SCIM `auth.basic.username` or `auth.basic.password` cannot be read |
| `failed to parse client certificate x509 pair` | SCIM `auth.mtls` files cannot be read, or the certificate and key do not match |
| `Failed parsing static data` | Static SCIM `json_data` is not valid JSON, or a user or group has no or a duplicate `id` |
| `plugin not found: <name>`, `failed to get default keystore` | No `KeystoreProvider` plugin with the name of the `default_keystore` plugin, see [Keystore provider plugin](#keystore-provider-plugin) |
| `failed to load notification plugin`, `system information plugin not configured` | The task worker needs these plugin types; add `noop` entries |
| `Plugin health check threshold reached` | The plugin process stopped responding; CMK shuts down |
