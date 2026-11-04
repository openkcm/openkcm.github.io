# CMK UI

The CMK UI is the web console for [CMK](/components/cmk/cmk-service). Tenant
administrators, key administrators and auditors use it to manage keys, systems,
groups and workflows.

Repository: [openkcm/cmk-ui](https://github.com/openkcm/cmk-ui)

## Architecture

- A single-page application built with OpenUI5 and TypeScript.
- Served as static files by nginx.
- Calls the CMK REST API directly from the browser.

## Sign-in

The UI has no login logic of its own. It uses
[Session Manager](/components/cmk/session-manager):

1. To sign in, the UI sends the browser to
   `<apiBaseUrl>/sm/auth?tenant_id=<tenant>&request_uri=<current page>&error_uri=<error page>`.
1. After the login, Session Manager redirects back to the UI and sets a session
   cookie and a CSRF cookie for the tenant.
1. The UI sends API requests with credentials (cookies) and copies the value of
   the `CSRF-<tenant>` cookie into the `X-CSRF-Token` header.
1. To sign out, the UI sends the browser to
   `<apiBaseUrl>/sm/logout?tenant_id=<tenant>&post_logout_redirect_uri=<UI page>`.
   Session Manager ends the session and the sign-in at the identity provider.

The UI shows only the functions that the user's
[role](/components/cmk/security/cmk-authorization#roles) allows. CMK enforces the
same rules on every API call.

## Key management

The UI provides wizards to create BYOK keys and import their key material, and
to link HYOK keys from AWS KMS. See [Keys](/components/cmk/guide/keys).

## Configuration

The UI reads its configuration in the browser, from files that nginx serves
next to the web application. The Helm chart writes them from its values:

| Chart value | File | Description |
| --- | --- | --- |
| `config.apiBaseUrl` | `config/config.json` | Address of the API gateway as the browser reaches it, for example `https://api.example.com`. Used for both the CMK API (`/cmk/v1`) and the Session Manager endpoints (`/sm`). Required |
| `config.bisEnabled` | `config/config.json` | Show the built-in support widget. Default `false` |
| `config.bisEnvironment` | `config/config.json` | Environment of the built-in support: `test` (default) or `live` |
| `configYaml` | `config/config.yaml` | Labels and visibility of the system fields. Default: the file of the image; the chart's `values.yaml` shows its format |

Both files are public, because the browser loads them: they hold no secrets.
Because the UI uses one base URL, the CMK API and the Session Manager login
endpoints must be served from the same host. If the UI and the API have
different hosts, the gateway must allow requests from the UI's origin (CORS),
and Session Manager must accept the UI as a return address
(`allowedRedirectBaseURLs`).

The UI expects Session Manager's CSRF cookie to be named `CSRF`. See
[Security configuration](/components/cmk/security/configuration#settings-that-must-match).

## Deployment

The CMK UI ships as the container image `ghcr.io/openkcm/images/cmk-ui`
and the Helm chart `oci://ghcr.io/openkcm/charts/cmk-ui`. Deploy it in every
regional deployment, with `config.apiBaseUrl` set to that region's API gateway:
a UI serves only the tenants of its region.

Values for the chart, for example `cmk-ui-values.yaml`:

```yaml
replicaCount: 2

config:
  apiBaseUrl: https://api.example.com

networkPolicy:
  enabled: true
  http:
    from:
      - namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: envoy-gateway-system } }
```

```bash
helm upgrade --install cmk-ui oci://ghcr.io/openkcm/charts/cmk-ui \
  --version 0.3.0 --namespace services -f cmk-ui-values.yaml
```

- The chart deploys the CMK UI release of its `appVersion` from the public
  image. Set `image.tag` or `image.digest` only to deploy another release.
- The Service serves the UI over HTTP on port `8080`. Publish it through your
  gateway, which terminates TLS, and admit only the gateway with the network
  policy.
- nginx runs as a non-root user with a read-only root filesystem, all
  capabilities dropped and the `RuntimeDefault` seccomp profile.
- The pods restart when `config` or `configYaml` changes.
- The release notes warn while `config.apiBaseUrl` is empty or does not use
  HTTPS.
- Image v0.0.5 requires amd64 nodes. On clusters with other nodes, set
  `pod.nodeSelector: { kubernetes.io/arch: amd64 }`.

The chart's [README](https://github.com/openkcm/cmk-ui/tree/main/charts/cmk-ui)
lists the resources it creates, and its `values.yaml` documents every value.

### Upgrading from chart 0.2.x

Chart 0.3.0 reorganized the values like the other OpenKCM charts, and stops
with an error while values of 0.2.x under `ui` or `global` are set:

| Chart 0.2.x | Chart 0.3.0 |
| --- | --- |
| A ConfigMap with `config.json`, mounted with `global.volumes` and `global.volumeMounts` | `config` and `configYaml`. Remove the mount, then delete the old ConfigMap |
| `ui.image` | `image`; the default is the public release image |
| `imagePullSecrets` (default `registry-access`) | `imagePullSecrets` (default empty) |
| `ui.replicaCount`, `ui.autoscaling` | `replicaCount`, `hpa` |
| `global.resources`, `global.serviceAccount` | `resources`, `serviceAccount` |

The chart's README lists every moved value. Resource names and selector labels
are unchanged.
