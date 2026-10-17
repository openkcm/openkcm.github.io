# ExtAuthZ

ExtAuthZ is the policy decision point for OpenKCM. Envoy Gateway calls it for
every protected request. ExtAuthZ authenticates the caller, evaluates Cedar
policies, and on success returns signed information about the caller for the
backend service.

Repository: [openkcm/extauthz](https://github.com/openkcm/extauthz)

## How Envoy calls ExtAuthZ

ExtAuthZ implements Envoy's external authorization gRPC API
(`envoy.service.auth.v3.Authorization/Check`). Each regional deployment runs its
own ExtAuthZ next to its Envoy Gateway, and asks its own region's Session
Manager about sessions. An Envoy Gateway `SecurityPolicy` with `extAuth` is
attached to the CMK routes, and to the Registry's route if you publish the
Registry through a gateway. See [Configure Envoy Gateway](/components/cmk/security/configuration#step-7-configure-envoy-gateway).

## Credential checks

ExtAuthZ looks for up to three credentials in a request.

### Client certificate

Envoy forwards the client certificate in the `x-forwarded-client-cert` (XFCC)
header. ExtAuthZ:

- checks that the subject in the header matches the certificate,
- looks the subject up in the trusted subjects file, which maps each trusted
  subject to a region,
- checks the certificate's validity period,
- removes the XFCC header from the request it allows.

Envoy is responsible for validating the certificate chain during the TLS
handshake.

### Bearer token

- Only `RS256` signed JWTs are accepted.
- The token's `jku` header, or its issuer, must be an `https` URL.
- ExtAuthZ first looks for a statically configured provider, then for the
  trust record of the tenant in the request path, from
  [Session Manager](/components/cmk/session-manager#tenant-trust). If neither
  matches, the request is denied with `403`.
- `kid` and `exp` are required. The audience is checked when the provider has
  audiences configured.
- The token is checked with the provider's introspection endpoint, if it has one.
  Introspection results for `GET` requests are cached for 30 seconds, and signing
  keys for 5 minutes.

### Session cookie

Session checks apply only to paths that start with one of the configured
`sessionPathPrefixes`, for example `/cmk/v1/`. The path segment that follows is
the tenant ID.

- The session cookie is `__Host-Http-SESSION-<tenant>`.
- ExtAuthZ calls Session Manager's `GetSession`, which checks idle time, tenant
  status, tenant match and token validity.
- The `x-csrf-token` header must carry a valid HMAC-SHA256 CSRF token for the
  session, on every request including `GET`. Session Manager creates the token,
  ExtAuthZ checks it, so **both must be configured with the same CSRF secret**.
  See [Shared CSRF secret](/components/cmk/security/configuration#shared-csrf-secret).

## Combining results

Each credential check produces one result. The most restrictive result decides
the request:

| Result | Meaning | Envoy response |
| --- | --- | --- |
| `UNAUTHENTICATED` | A credential was missing or invalid | 401 |
| `DENIED` | The policy did not allow the request, or no provider matches the token | 403 |
| `TENANT_BLOCKED` | The tenant is blocked | 403 |
| `ALLOWED` | The credential and the policy allow the request | Forward |

## Cedar policies

ExtAuthZ evaluates [Cedar](https://www.cedarpolicy.com) policies loaded from
`*.cedar` files in `cedar.policyPath`. A request maps to Cedar like this:

| Cedar element | Value |
| --- | --- |
| Principal | `Subject::"<subject>"`, the certificate subject or token subject |
| Action | `Action::"<HTTP method>"` |
| Context | `type` (`x509`, `jwt` or `session`), `host`, `path`, `issuer` |

Example: allow a technical system with a client certificate to call `/api/*`.

```text
permit (
    principal == Subject::"CN=TechSys01,OU=MyUnit,O=MyOrg,C=DE",
    action in [Action::"GET", Action::"POST", Action::"DELETE"],
    resource
) when {
    context.type == "x509" &&
    context.host == "myorg.com" &&
    context.path like "/api/*" &&
    context.issuer == "CN=MyCA,OU=MyUnit,O=MyOrg,C=DE"
};
```

Certificate subjects and issuers use the RFC 2253 format that Envoy produces:
most specific attribute first, separated by commas without spaces. The
comparison is exact.

More examples are in the repository's `examples/policies.cedar`. For a complete
setup, see [Security configuration](/components/cmk/security/configuration#cedar-policies).

## Client data for the backend

When a request is allowed, ExtAuthZ adds two headers for the backend service:
`x-client-data` and `x-client-data-signature`. It signs the client data with
the RSA private key named in its `keyId` file
(`clientData.signingKeyIDFilePath`), and writes that key ID into the client data.
CMK verifies the signature with the public key of the same name
(`clientData.signingKeysPath`). See
[Signed client data](/components/cmk/security/client-data#signing-keys).

## Configuration

Every setting, with defaults, examples and troubleshooting, is described in the
[ExtAuthZ configuration reference](/components/cmk/security/extauthz-config). The
[configuration guide](/components/cmk/security/configuration) shows how ExtAuthZ is
set up together with Session Manager, CMK and Envoy Gateway.

## Deployment

ExtAuthZ ships as a Helm chart. Policies and trusted subjects are mounted from
ConfigMaps, the signing keys and the CSRF secret from Secrets. The image is
distroless and runs as non-root.
