# Signed client data

After ExtAuthZ allows a request, it tells the backend who the caller is through
two HTTP headers. CMK trusts these headers only if the signature is valid and
the data is fresh.

## Headers

| Header | Content |
| --- | --- |
| `x-client-data` | JSON describing the caller, base64url-encoded without padding |
| `x-client-data-signature` | RS256 signature over the encoded `x-client-data` value, base64url-encoded without padding |

ExtAuthZ also removes the `x-forwarded-client-cert` header from allowed
requests.

## Fields

| Field | Session | Bearer token | Client certificate |
| --- | --- | --- | --- |
| `identifier` | User ID (`sub`) | `sub` claim | Certificate subject (RFC 2253) |
| `email` | `email` claim of the ID token | `mail` claim | First email address in the certificate's subject alternative names |
| `given_name`, `family_name` | From the ID token | empty | empty |
| `groups` | From the ID token, refreshed by token introspection | `groups` claim | `null` |
| `type` | `user` | `user` | `system`, or `technical-user` if the certificate has an email address |
| `region` | empty | empty | Region from the trusted subjects file |
| `auth_context` | `issuer` and `client_id` of the tenant's identity provider | `issuer` | `null` |
| `kid`, `alg` | Key ID and `RS256` | same | same |
| `createdAt` | Creation time, RFC 3339 with nanoseconds | same | same |
| `ttl` | Validity in nanoseconds, `60000000000` (one minute) | same | same |

`type` and `region` are filled only when the ExtAuthZ feature gates
`enrich-header-with-client-type` and `enrich-header-with-client-region` are
enabled.

If a request carries several credentials that are all allowed, the client data
comes from the client certificate first, then the bearer token, then the
session.

Example for a CMK UI user:

```json
{
  "identifier": "8f2c-user-id",
  "email": "jane.doe@example.com",
  "given_name": "Jane",
  "family_name": "Doe",
  "groups": ["KMS_KeyAdmins_acme"],
  "type": "user",
  "region": "",
  "auth_context": {
    "issuer": "https://idp.example.com/realms/acme",
    "client_id": "cmk-session-manager"
  },
  "kid": "key2",
  "alg": "RS256",
  "createdAt": "2026-10-15T09:12:33.123456789Z",
  "ttl": 60000000000
}
```

More examples are in the [request walkthrough](/components/cmk/security/walkthrough).

## Signing keys

ExtAuthZ signs the client data with an RSA private key. CMK verifies the
signature with the matching public key. A **key ID** ties the two together:
ExtAuthZ writes it into the client data as `kid`, and CMK uses it to pick the
public key.

```mermaid
flowchart TB
    subgraph EX["ExtAuthZ: /etc/extauthz-signing"]
        direction LR
        KID["keyId<br/>content: key1"] -- "selects" --> PRIV["key1.pem<br/>private key"]
    end
    subgraph HDR["Request headers"]
        direction LR
        CD["x-client-data<br/>kid: key1"]
        SIG["x-client-data-signature"]
    end
    subgraph CM["CMK API server: /etc/signing-keys"]
        direction LR
        PUB["key1.pem<br/>public key"]
    end
    EX -- "signs with key1" --> HDR
    HDR -- "kid key1 selects<br/>the public key" --> CM
```

The key ID must be identical in four places:

| Place | Value for the key ID `key1` |
| --- | --- |
| Content of ExtAuthZ's key ID file | `key1` |
| File name of ExtAuthZ's private key | `key1.pem` (or `key1`) |
| `kid` in `x-client-data` | `key1`, set by ExtAuthZ |
| File name of CMK's public key | `key1.pem` |

### Both sides at a glance

| | ExtAuthZ: signs | CMK API server: verifies |
| --- | --- | --- |
| Setting | `clientData.signingKeyIDFilePath` | `clientData.signingKeysPath` |
| Points to | The key ID file. Its directory is the key directory | The key directory |
| Typical value | `/etc/extauthz-signing/keyId` | `/etc/signing-keys` |
| Directory holds | The key ID file and the **private** keys | The **public** keys |
| Key ID of a key file | File name, with or without `.pem` | File name without `.pem` |
| Keys in use | Only the key named in the key ID file | Every key; the `kid` of the client data selects one |
| Key format | RSA private key in PEM, PKCS #1 (`BEGIN RSA PRIVATE KEY`) or PKCS #8 (`BEGIN PRIVATE KEY`), not encrypted | RSA public key in PEM: `BEGIN PUBLIC KEY`, `BEGIN RSA PUBLIC KEY`, or a certificate |
| Loading | Directory read at startup, then watched | Directory read at startup, then watched |
| Directory missing | Startup fails: `path does not exist` | Startup fails: `creating data loader: path does not exist` |
| Key missing or invalid | Allowed requests fail at the gateway with `500 INTERNAL_SERVER_ERROR` | CMK rejects the request with `500 NO_BUSINESS_DATA` |

### ExtAuthZ: signing

```yaml
# ExtAuthZ configuration
clientData:
  signingKeyIDFilePath: /etc/extauthz-signing/keyId
```

The key directory, with a second key prepared for the next rotation:

```text
/etc/extauthz-signing/
├── keyId       # content: key1
├── key1.pem    # private key, in use
└── key2.pem    # private key, unused until keyId says key2
```

For every allowed request, ExtAuthZ:

1. Reads the key ID from the key ID file. Surrounding whitespace is removed, so
   a trailing newline does no harm.
1. Takes the file named like the key ID, or else `<key ID>.pem`, from the same
   directory, and parses it as an RSA private key.
1. Builds the client data with `kid` set to the key ID, `alg` to `RS256`,
   `createdAt` to the current time and `ttl` to one minute.
1. Encodes the client data as JSON, then as base64url without padding. The
   result is the `x-client-data` value.
1. Hashes this value with SHA-256, signs the hash with RSASSA-PKCS1-v1_5 and
   encodes the signature as base64url without padding. The result is the
   `x-client-data-signature` value.
1. Has Envoy forward the request with both headers. They replace headers of the
   same name sent by the client, and `x-forwarded-client-cert` is removed.

ExtAuthZ does not check the key at startup: a missing or broken key shows only
when the first request is allowed. The startup log entry
`Using client data reading the signing key from` shows the configured path, and
at debug level each allowed request logs `Check(): client data` with the
`x-client-data` value.

With the ExtAuthZ Helm chart, these are the default values:

```yaml
config:
  clientData:
    signingKeyIDFilePath: /etc/extauthz-signing/keyId

extraVolumes:
  - name: extauthz-signing-keys-volume
    projected:
      sources:
        - secret:
            name: extauthz-signing-keys-secret

extraVolumeMounts:
  - name: extauthz-signing-keys-volume
    mountPath: /etc/extauthz-signing
    readOnly: true
```

Do not mount the key files with `subPath`: Kubernetes never updates such files.

### CMK: verification

```yaml
# CMK configuration (API server)
clientData:
  signingKeysPath: /etc/signing-keys
  authContextFields:
    - issuer
    - client_id
```

The key directory:

```text
/etc/signing-keys/
├── key1.pem    # public key for kid "key1"
└── key2.pem    # public key for kid "key2"
```

- CMK loads every file directly in the directory whose name ends with `.pem`, and
  uses the file name without `.pem` as the key ID. Key IDs are case-sensitive.
- Other files, such as a `keyId` file, and subdirectories are ignored.
- Name each public key exactly like its private key. A file named
  `key1.pub.pem` gets the key ID `key1.pub` and never matches.
- Only the API server verifies client data. The other CMK processes do not need
  the keys.

For every API request except `GET /swagger`, the API server checks, in this
order:

1. `x-client-data` is present and decodes to JSON.
1. A public key exists for the `kid` of the client data.
1. `alg` is `RS256`.
1. The public key file holds a valid RSA public key.
1. `x-client-data-signature` is present.
1. The client data has not expired: `createdAt` plus `ttl` is not in the past.
1. The signature matches.
1. `auth_context` is reduced to the entries listed in `authContextFields`.
1. `groups` is not empty. If there are several groups, they must not map to
   different roles; `GET /tenants`, `GET /tenants/{tenantID}` and
   `GET /userInfo` skip this check.

Then [CMK authorization](/components/cmk/security/cmk-authorization) decides
what the caller may do. If a check fails:

| Failed check | Response | CMK log entry `Client data processing error` contains |
| --- | --- | --- |
| 1 | `500 NO_BUSINESS_DATA` | `no client data header found` or `failed to decode business data from header` |
| 2 to 4 | `500 NO_BUSINESS_DATA` | `public key not found or invalid` |
| 5 | `500 NO_BUSINESS_DATA` | `missing client data signature header` |
| 6 | `500 NO_BUSINESS_DATA` | `client data has expired` |
| 7 | `500 NO_BUSINESS_DATA` | `crypto/rsa: verification error` |
| 9 | `403 ZERO_ROLES_NOT_ALLOWED` or `403 MULTIPLE_ROLES_NOT_ALLOWED` | - |

With the CMK Helm chart:

```yaml
config:
  clientData:
    signingKeysPath: /etc/signing-keys
    authContextFields: [issuer, client_id]

extraVolumes:
  - name: client-data-public-keys
    secret:
      secretName: cmk-client-data-public-keys

extraVolumeMounts:
  - name: client-data-public-keys
    mountPath: /etc/signing-keys
    readOnly: true
```

### Kubernetes Secrets

Keep the two halves in two Secrets. ExtAuthZ's Secret holds private keys and is
never mounted into CMK.

| Secret | Namespace | Entries | Mounted by | At |
| --- | --- | --- | --- | --- |
| `extauthz-signing-keys-secret` | `envoy-gateway-system` | `keyId`, and `key1.pem`, `key2.pem` with **private** keys | ExtAuthZ | `/etc/extauthz-signing` |
| `cmk-client-data-public-keys` | `services` | `key1.pem`, `key2.pem` with **public** keys | CMK API server | `/etc/signing-keys` |

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: extauthz-signing-keys-secret
  namespace: envoy-gateway-system
stringData:
  keyId: key1
  key1.pem: |
    -----BEGIN PRIVATE KEY-----
    ...
    -----END PRIVATE KEY-----
---
apiVersion: v1
kind: Secret
metadata:
  name: cmk-client-data-public-keys
  namespace: services
stringData:
  key1.pem: |
    -----BEGIN PUBLIC KEY-----
    ...
    -----END PUBLIC KEY-----
```

Some deployments give both Secrets the same name. Whatever the names, make sure
CMK's copy contains only public keys. This command prints the first line of each
entry, without the keys themselves:

```bash
kubectl -n services get secret cmk-client-data-public-keys -o json \
  | jq -r '.data | to_entries[] | "\(.key): \(.value | @base64d | split("\n")[0])"'
```

Every `.pem` entry must show `-----BEGIN PUBLIC KEY-----` (or
`BEGIN RSA PUBLIC KEY`, or `BEGIN CERTIFICATE`), never `PRIVATE KEY`.

### Create a key pair

```bash
# Private key, for ExtAuthZ
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out key1.pem
# Public key, for CMK
openssl pkey -in key1.pem -pubout -out key1.pub.pem
# Key ID file, for ExtAuthZ
printf 'key1' > keyId

# Check that the public key belongs to the private key: prints nothing if it does
diff <(openssl pkey -in key1.pem -pubout) key1.pub.pem
```

Create the two Secrets. CMK gets the public key under the name `key1.pem`:

```bash
kubectl -n envoy-gateway-system create secret generic extauthz-signing-keys-secret \
  --from-file=keyId --from-file=key1.pem
kubectl -n services create secret generic cmk-client-data-public-keys \
  --from-file=key1.pem=key1.pub.pem
```

Choosing key IDs:

- Use letters, digits, `-`, `_` and `.`. The key ID becomes a file name and a
  Secret entry.
- Give every new key pair a new key ID. Never reuse a key ID for other key
  material.
- If several ExtAuthZ deployments sign for the same CMK, for example one per
  gateway, give each its own key IDs. CMK holds the public keys of all of them.

### Check a signed request

To check a header pair by hand, take both values, for example from a test
backend that echoes request headers, and the public key CMK has for the `kid`:

```bash
# Decode base64url without padding
b64url_decode() {
  local s
  s=$(printf '%s' "$1" | tr '_-' '/+')
  while [ $(( ${#s} % 4 )) -ne 0 ]; do s="$s="; done
  printf '%s' "$s" | openssl base64 -d -A
}

DATA='<value of x-client-data>'
SIG='<value of x-client-data-signature>'

# Show the client data, including kid, createdAt and ttl
b64url_decode "$DATA" | jq .

# Verify the signature with the public key that CMK has for this kid
b64url_decode "$SIG" > signature.bin
printf '%s' "$DATA" | openssl dgst -sha256 -verify key1.pub.pem -signature signature.bin
```

The last command prints `Verified OK` if the public key matches the private key
that signed the data, and `Verification Failure` otherwise.

### Test CMK without ExtAuthZ

For local development, the CMK repository contains a tool that signs client
data with a private key of your choice:

```bash
# In a checkout of github.com/openkcm/cmk
go run ./cmd/clientData \
  -clientData cmd/clientData/tenantAdmin_clientData.json \
  -key /path/to/private-key.pem \
  -ttl 10m
```

- It prints the two headers; send them with your requests to the API server.
- The input file uses `mail` for the email, `reg` for the region and
  `AuthContext` for the authentication context. Its `kid` must match a public
  key in CMK's `signingKeysPath`.
- Without `-ttl`, the headers are valid for one year. Use the tool only with
  local test keys, never with the keys of a real deployment.

## Validity

Client data is valid for one minute, the `ttl` set by ExtAuthZ. CMK rejects it
once `createdAt` plus `ttl` lies in the past. Keep the clocks of ExtAuthZ and CMK
synchronized: if CMK's clock runs more than a minute ahead, CMK rejects every
request as expired. The short lifetime limits the value of a captured header.

## Key rotation

Rotate without downtime by giving CMK the new public key before any ExtAuthZ pod
signs with the new private key:

| Step | ExtAuthZ Secret | CMK Secret | Then |
| --- | --- | --- | --- |
| Start | `keyId`: `key1`; `key1.pem` | `key1.pem` | - |
| 1. Add the new public key | unchanged | `key1.pem`, `key2.pem` | Restart CMK |
| 2. Switch ExtAuthZ | `keyId`: `key2`; `key1.pem`, `key2.pem` | unchanged | Restart ExtAuthZ |
| 3. Wait | unchanged | unchanged | At least one minute after the last ExtAuthZ pod restarted |
| 4. Remove the old key | `keyId`: `key2`; `key2.pem` | `key2.pem` | Restart both |

```bash
kubectl -n services rollout restart deployment/cmk                # CMK API server, named after the Helm release
kubectl -n envoy-gateway-system rollout restart deployment/extauthz
```

- While ExtAuthZ restarts pod by pod, some pods sign with `key1` and others with
  `key2`. CMK accepts both, because it has both public keys.
- Restart after every change. Kubernetes updates a mounted Secret by swapping a
  symbolic link: new files usually appear in the running services, but a
  changed file content, such as a new value in `keyId`, is not picked up.

### Replacing a compromised key

If the private key may be known to someone else, remove its public key from CMK
at once, even though requests fail until ExtAuthZ uses the new key:

1. Create a new key pair with a new key ID, for example `key3`.
1. In CMK's Secret, add `key3.pem` and remove the compromised public key.
   Restart CMK.
1. In ExtAuthZ's Secret, add `key3.pem`, set `keyId` to `key3` and remove the
   compromised private key. Restart ExtAuthZ.

Between steps 2 and 3, allowed requests fail with `500 NO_BUSINESS_DATA`.

## Troubleshooting

The error code tells you which side to look at: `INTERNAL_SERVER_ERROR` comes
from ExtAuthZ at the gateway, `NO_BUSINESS_DATA` from CMK.

| Symptom | Log entry | Cause |
| --- | --- | --- |
| ExtAuthZ or CMK does not start | `path does not exist` | The key directory is not mounted |
| Every allowed request `500 INTERNAL_SERVER_ERROR` | ExtAuthZ: `Check(): failed to encode client data` with `signing key ID file "keyId" not found in storage` | The key ID file is missing, or `signingKeyIDFilePath` names another file |
| Every allowed request `500 INTERNAL_SERVER_ERROR` | ExtAuthZ: `signing key with ID "key2" not found in storage` | No private key file for the key ID in the key ID file |
| Every allowed request `500 INTERNAL_SERVER_ERROR` | ExtAuthZ: `failed to parse private key` | The file is not an unencrypted RSA private key in PEM |
| `500 NO_BUSINESS_DATA` | CMK: `public key not found or invalid` | No `<kid>.pem` in `signingKeysPath`, a file named differently (`key1.pub.pem`), or not an RSA public key |
| `500 NO_BUSINESS_DATA` | CMK: `crypto/rsa: verification error` | CMK's public key does not belong to ExtAuthZ's private key with the same key ID. Check with the `diff` command above |
| `500 NO_BUSINESS_DATA` | CMK: `client data has expired` | Clocks of ExtAuthZ and CMK differ by more than a minute |
| `500 NO_BUSINESS_DATA` | CMK: `no client data header found` | The request reached CMK without passing ExtAuthZ: route all CMK API traffic through the gateway |
| Old key still used after a rotation | - | ExtAuthZ was not restarted after `keyId` changed |
