# Session Manager

Session Manager handles browser login for the CMK UI. It runs the OpenID Connect
flow against each tenant's identity provider, keeps the resulting sessions, and
answers session checks from ExtAuthZ. It also stores which identity provider
each tenant trusts.

Repository: [openkcm/session-manager](https://github.com/openkcm/session-manager)

## Processes and storage

| Process | Purpose |
| --- | --- |
| `apiserver` | HTTP login endpoints and the gRPC API |
| `housekeeper` | Removes idle sessions and refreshes tokens that are about to expire |
| `migrate` | Applies database migrations |

- **PostgreSQL** stores the tenant trust records: tenant ID, issuer, client ID,
  JWKS URI, audiences and a blocked flag.
- **Valkey** stores login state and sessions, including the user's OAuth tokens.

## HTTP endpoints

| Endpoint | Purpose |
| --- | --- |
| `/sm/auth` | Starts a login for a tenant |
| `/sm/callback` | Receives the authorization code from the identity provider |
| `/sm/logout` | Ends the session and starts RP-initiated logout at the identity provider |
| `/sm/bclogout` | Receives back-channel logout requests from the identity provider |

All responses carry security headers and a strict Content Security Policy.

## Login flow

1. `/sm/auth` checks the return URL against `allowedRedirectBaseURLs` and looks
   up the tenant's trust record.
1. It creates a random state value and a PKCE `S256` challenge, stores them, and
   sets a `__Host-LoginCSRF` cookie bound to that state.
1. It redirects the browser to the tenant's identity provider with the scopes
   `openid profile email groups` and the client ID from the trust record.
1. `/sm/callback` checks the login CSRF cookie and that the state has not
   expired.
1. It exchanges the code for tokens using the PKCE verifier. Session Manager
   authenticates to the identity provider with mutual TLS (the default) or a
   client secret.
1. It verifies the ID token: signature against the provider's JWKS, issuer,
   audience (the client ID), expiry, and `at_hash` when present.
1. It creates the session, sets the session and CSRF cookies, records a
   `UserLoginSuccess` audit event, and redirects to the return URL.

Failed logins are recorded in the application log.

## Sessions

| Setting | Default | Meaning |
| --- | --- | --- |
| `sessionDuration` | `12h` | Maximum lifetime of a session |
| `idleSessionTimeout` | `90m` | Session ends after this period without requests |

The session cookie is scoped to one tenant: its name is the configured cookie
name followed by the tenant ID. ExtAuthZ expects the name to start with
`__Host-Http-SESSION-`. The CSRF cookie must be readable by the CMK UI, which
sends its value back in the `x-csrf-token` header. ExtAuthZ checks that header,
so Session Manager and ExtAuthZ **must be configured with the same CSRF secret**;
see [Shared CSRF secret](/components/cmk/security/configuration#shared-csrf-secret).

## Session checks

ExtAuthZ calls the gRPC method `GetSession` for every request that carries a
session cookie. Session Manager checks, in this order:

1. The session exists and has not been idle for too long.
1. The tenant is not blocked.
1. The session belongs to the requested tenant.
1. The access token is still active at the identity provider (token
   introspection, cached for 30 seconds).

It then refreshes the user's groups from the introspection result and resets
the idle timer.

## Tenant trust

Each tenant has one trust record that names its identity provider. CMK
maintains these records during tenant onboarding and offboarding, through the
`oidcmapping` gRPC service:

- **Apply** creates or updates the trust for a tenant.
- **Block** and **Unblock** stop or resume session-based access for a tenant:
  session checks for a blocked tenant fail with `TENANT_BLOCKED`.
- **Remove** deletes the trust when a tenant is offboarded.

ExtAuthZ uses the same records, through `GetOIDCProvider`, to validate bearer
tokens issued by a tenant's identity provider.

## Deployment

Session Manager ships as a Helm chart with separate deployments for the API
server and the housekeeper, and a migration job.

- [Session Manager configuration reference](/components/cmk/security/session-manager-config)
- [Request walkthrough](/components/cmk/security/walkthrough)
- [Hardening checklist](/components/cmk/security/hardening#session-manager)
