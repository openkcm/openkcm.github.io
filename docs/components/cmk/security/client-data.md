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

## Signing

- ExtAuthZ reads the active key ID from the file named in
  `clientData.signingKeyIDFilePath` and signs with the private key `<kid>.pem` in
  the same directory.
- CMK loads every `*.pem` file in `clientData.signingKeysPath` and uses the file
  name without `.pem` as the key ID. It parses them as RSA public keys.
- CMK rejects client data with an unknown key ID, another algorithm, an invalid
  signature or an expired validity, with `500 NO_BUSINESS_DATA`.

Supported key formats:

| Service | Format |
| --- | --- |
| ExtAuthZ (private key) | PEM, PKCS #8 (`BEGIN PRIVATE KEY`) or PKCS #1 (`BEGIN RSA PRIVATE KEY`) |
| CMK (public key) | PEM, `BEGIN PUBLIC KEY`, `BEGIN RSA PUBLIC KEY`, or a certificate |

Generate a key pair with:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out key2.pem
openssl pkey -in key2.pem -pubout -out key2.pub.pem
```

## Validity

Client data is valid for one minute. CMK rejects it if its creation time plus
TTL lies in the past, so keep the clocks of ExtAuthZ and CMK synchronized. The
short lifetime limits the value of a captured header.

## Key rotation

Rotate without downtime by giving CMK the new public key before ExtAuthZ starts
using the new private key:

1. Generate a new key pair with a new key ID, for example `key2`.
1. Add `key2.pem` (public key) to CMK's public key Secret, keeping `key1.pem`.
   Restart CMK.
1. Add `key2.pem` (private key) to ExtAuthZ's signing key Secret, keeping
   `key1.pem`, and change `keyId` to `key2`. Restart ExtAuthZ.
1. Wait at least one minute, so that no client data signed with `key1` is still
   valid.
1. Remove `key1.pem` from both Secrets and restart both services.

Both services watch their key directories, but Kubernetes updates mounted
Secrets by replacing a symbolic link, which is not reliably detected. Restart the
pods after every change to make sure the new keys are used.
