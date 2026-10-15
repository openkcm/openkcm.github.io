# Request walkthrough

This page follows real requests through Envoy Gateway, Session Manager,
ExtAuthZ and CMK, showing the URLs, headers and cookies at each step. Use it to
understand the flow and to compare with what you see in browser developer tools
or proxy logs.

The examples use these values:

| Value | Example |
| --- | --- |
| API host | `api.example.com` |
| CMK UI host | `ui.example.com` |
| Tenant | `acme` |
| Tenant identity provider | `https://idp.example.com/realms/acme` |
| Client ID in the trust record | `cmk-session-manager` |

Long random values are shortened with `…`.

## Browser login

### 1. The CMK UI starts the login

The UI sends the browser to Session Manager with the tenant and the page to
return to:

```http
GET /sm/auth?tenant_id=acme&request_uri=https%3A%2F%2Fui.example.com%2F%23%2Facme HTTP/1.1
Host: api.example.com
```

| Parameter | Required | Meaning |
| --- | --- | --- |
| `tenant_id` | yes | Tenant whose identity provider is used |
| `request_uri` | yes | Where to return after the login. Must start with an entry of `allowedRedirectBaseURLs` |
| `error_uri` | no | Where to send the browser if the login fails. Must also match `allowedRedirectBaseURLs` |

Session Manager loads the tenant's trust record, reads the identity provider's
discovery document, stores the pending login in Valkey and answers:

```http
HTTP/1.1 302 Found
Location: https://idp.example.com/realms/acme/protocol/openid-connect/auth?client_id=cmk-session-manager&code_challenge=E9Mel…&code_challenge_method=S256&redirect_uri=https%3A%2F%2Fapi.example.com%2Fsm%2Fcallback&response_type=code&scope=openid+profile+email+groups&state=Qx7vK…
Set-Cookie: __Host-LoginCSRF=6f1c…; Path=/; HttpOnly; Secure; SameSite=Lax
```

- `state` is a random 64-character value that identifies the pending login.
- `code_challenge` is the PKCE challenge; the verifier stays in Valkey.
- `__Host-LoginCSRF` binds the callback to this browser.

If something is wrong, Session Manager answers with JSON, or redirects to
`error_uri` with `errorCode` and `errorDescription` appended:

| Status | Body | Cause |
| --- | --- | --- |
| `400` | `{"error":"invalid_request","error_description":"request URI does not match an allowed redirect base URL"}` | `request_uri` not allowed |
| `404` | `{"error":"not_found","error_description":"not found"}` | No trust record for the tenant |
| `500` | `{"error":"unknown","error_description":"unknown error"}` | Discovery failed or issuer mismatch; see the logs |

### 2. The identity provider calls back

After the user signs in, the identity provider sends the browser back:

```http
GET /sm/callback?code=SplxlOBeZQ…&state=Qx7vK… HTTP/1.1
Host: api.example.com
Cookie: __Host-LoginCSRF=6f1c…
```

Session Manager:

1. Checks the login CSRF cookie against `state`, and that the pending login has
   not expired.
1. Exchanges the code at the token endpoint:

   ```http
   POST /realms/acme/protocol/openid-connect/token HTTP/1.1
   Host: idp.example.com
   Authorization: Basic Y21rLXNlc3Npb24tbWFuYWdlcjo…
   Content-Type: application/x-www-form-urlencoded

   grant_type=authorization_code&code=SplxlOBeZQ…&redirect_uri=https%3A%2F%2Fapi.example.com%2Fsm%2Fcallback&code_verifier=dBjftJeZ4…
   ```

1. Verifies the ID token: signature, `iss` equal to the trust issuer, `aud`
   containing `cmk-session-manager`, and `exp`, `nbf` and `iat` with one minute
   of tolerance.
1. Creates the session in Valkey and records a `UserLoginSuccess` audit event.

```http
HTTP/1.1 302 Found
Location: https://ui.example.com/#/acme
Set-Cookie: __Host-Http-SESSION-acme=Zk3m…; Path=/; HttpOnly; Secure; SameSite=None
Set-Cookie: CSRF-acme=9a4e…; Path=/; Domain=example.com; Secure; SameSite=Strict
```

| Cookie | Value | Read by |
| --- | --- | --- |
| `__Host-Http-SESSION-acme` | Session ID, 32 characters | ExtAuthZ, Session Manager |
| `CSRF-acme` | CSRF token, 321 characters | The CMK UI, which copies it into `X-CSRF-Token` |

## API call from the CMK UI

### 3. The browser calls the CMK API

```http
GET /cmk/v1/acme/keys HTTP/1.1
Host: api.example.com
Origin: https://ui.example.com
Cookie: __Host-Http-SESSION-acme=Zk3m…; CSRF-acme=9a4e…
X-CSRF-Token: 9a4e…
```

### 4. Envoy asks ExtAuthZ

Envoy Gateway sends the request attributes to ExtAuthZ. ExtAuthZ:

1. Finds the session path prefix `/cmk/v1/` and takes `acme` as the tenant.
1. Calls Session Manager's `GetSession` with the session ID and `acme`. Session
   Manager checks that the session is active, that the tenant is not blocked,
   that the session belongs to `acme`, and that the access token is still active
   at the identity provider.
1. Checks `X-CSRF-Token` against the session ID with its CSRF secret, which must
   be the same secret Session Manager used to create the token.
1. Evaluates the Cedar policies with `context.type == "session"`.

### 5. ExtAuthZ allows the request

Envoy forwards the request to CMK with two added headers:

```http
GET /cmk/v1/acme/keys HTTP/1.1
Host: api.example.com
x-client-data: eyJpZGVudGlmaWVyIjoiOGYyYy11c2VyLWlkIiwiZW1haWwiOiJqYW5lLmRvZUBleGFtcGxlLmNvbSIs…
x-client-data-signature: Qm9vdGgh…
```

Decoded `x-client-data`:

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

- The header is base64url-encoded JSON without padding. The signature is
  RS256 over the encoded header value, also base64url without padding.
- `ttl` is in nanoseconds: `60000000000` is one minute.
- `type` and `region` are filled only when the ExtAuthZ feature gates
  `enrich-header-with-client-type` and `enrich-header-with-client-region` are
  enabled.

To decode the header yourself:

```bash
python3 -c 'import base64,sys; s=sys.argv[1]; print(base64.urlsafe_b64decode(s + "=" * (-len(s) % 4)).decode())' "$X_CLIENT_DATA"
```

### 6. CMK authorizes the request

CMK verifies the signature with the public key `key2.pem`, checks that the data
is not older than one minute, maps the group `KMS_KeyAdmins_acme` (a key
administrator group created in CMK for tenant `acme`) to its role, checks that the
role may list keys, and answers.

### When the API call is rejected

ExtAuthZ answers in Envoy's place with JSON:

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{"error":{"code":"AUTHENTICATION_REQUIRED","status":401,"message":"CSRF token is not valid"}}
```

| Status | `code` | Typical cause |
| --- | --- | --- |
| `401` | `AUTHENTICATION_REQUIRED` | No or invalid credentials, invalid CSRF token, expired or idle session |
| `403` | `FORBIDDEN` | No Cedar policy permits the request, or no provider for a bearer token |
| `403` | `TENANT_BLOCKED` | The tenant is blocked |
| `500` | `INTERNAL_SERVER_ERROR` | Client data could not be signed |

If ExtAuthZ allows the request but CMK rejects it, the response comes from CMK:

| Status | `code` | Cause |
| --- | --- | --- |
| `403` | `ZERO_ROLES_NOT_ALLOWED` | None of the user's groups is mapped to a role in this tenant |
| `403` | `MULTIPLE_ROLES_NOT_ALLOWED` | The user's groups map to more than one role |
| `500` | `NO_BUSINESS_DATA` | Client data missing, unsigned, signed with an unknown key ID, or expired. Check that CMK has the public key for ExtAuthZ's active key ID |

## API call with a bearer token

A technical user calls the API with a token from a statically configured issuer:

```bash
curl -H "Authorization: Bearer $TOKEN" https://api.example.com/cmk/v1/acme/keys
```

The token must be RS256-signed with a `kid` and contain at least:

```json
{
  "iss": "https://idp.example.com/realms/cmk",
  "sub": "svc-automation",
  "aud": "cmk-api",
  "exp": 1792079999,
  "groups": ["KMS_KeyAdmins_acme"]
}
```

ExtAuthZ verifies the token, checks it at the introspection endpoint, evaluates
the policies with `context.type == "jwt"`, and issues client data with
`"identifier": "svc-automation"` and `"auth_context": {"issuer": "https://idp.example.com/realms/cmk"}`.
The email address is taken from a `mail` claim, if present.

## API call with a client certificate

A technical system presents a client certificate to Envoy:

```bash
curl --cert billing.crt --key billing.key https://api.example.com/cmk/v1/acme/keys
```

Envoy validates the certificate and passes it to ExtAuthZ:

```text
x-forwarded-client-cert: Hash=1a2b…;Cert="-----BEGIN%20CERTIFICATE-----…";Subject="CN=billing-service,O=Example Corp,C=DE"
```

ExtAuthZ checks the subject against the trusted subjects file, evaluates the
policies with `context.type == "x509"`, removes the header and issues client
data:

```json
{
  "identifier": "CN=billing-service,O=Example Corp,C=DE",
  "email": "",
  "groups": null,
  "type": "system",
  "region": "eu10",
  "auth_context": null,
  "kid": "key2",
  "alg": "RS256",
  "createdAt": "2026-10-15T09:12:33.123456789Z",
  "ttl": 60000000000
}
```

## Logout

### User logout

```http
GET /sm/logout?tenant_id=acme&post_logout_redirect_uri=https%3A%2F%2Fui.example.com%2F HTTP/1.1
Host: api.example.com
Cookie: __Host-Http-SESSION-acme=Zk3m…
```

Session Manager deletes the session and redirects to the identity provider's
`end_session_endpoint`, or directly to `post_logout_redirect_uri` if the
provider has none:

```http
HTTP/1.1 302 Found
Location: https://idp.example.com/realms/acme/protocol/openid-connect/logout?client_id=cmk-session-manager&post_logout_redirect_uri=https%3A%2F%2Fui.example.com%2F
```

`post_logout_redirect_uri` must match `allowedRedirectBaseURLs` and be
registered at the identity provider.

### Back-channel logout

When the user signs out at the identity provider, the provider can end the
session directly:

```http
POST /sm/bclogout HTTP/1.1
Host: api.example.com
Content-Type: application/x-www-form-urlencoded

logout_token=eyJhbGciOi…
```

Session Manager finds the session by the token's `sid` claim, verifies the
token's signature and deletes the session. Configure
`https://api.example.com/sm/bclogout` as the back-channel logout URL at the
identity provider.

## Lifetimes

| Item | Lifetime |
| --- | --- |
| Pending login (`state`) | `sessionDuration` (default 12 hours) |
| Session | `sessionDuration` |
| Idle session | Ends after `idleSessionTimeout` (default 90 minutes) without API calls |
| Access token | Refreshed by the housekeeper shortly before it expires |
| Introspection result | 30 seconds, for `GET` requests |
| Client data | 1 minute |
