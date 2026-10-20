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

| Setting | Description |
| --- | --- |
| `apiBaseUrl` | Base URL of the API gateway, for example `https://api.example.com`. Used for both the CMK API and the Session Manager endpoints |

The setting is read from `config/config.json` of the deployed web application.
Because the UI uses one base URL, the CMK API and the Session Manager login
endpoints must be served from the same host.

The UI expects Session Manager's CSRF cookie to be named `CSRF`. See
[Security configuration](/components/cmk/security/configuration#settings-that-must-match).

## Deployment

The CMK UI ships as an nginx container image and a Helm chart. Deploy it in
every regional deployment, with `apiBaseUrl` set to that region's API gateway:
a UI serves only the tenants of its region.

The image contains a `config.json` for local development. Replace it with your
own, from a ConfigMap mounted over `/usr/share/nginx/html/config/config.json`:

```bash
kubectl -n services create configmap cmk-ui-config --from-file=config.json
```

Values for the chart:

```yaml
ui:
  image:
    registry: ghcr.io/openkcm
    repository: cmk-ui/images/cmk-ui
    tag: v0.0.5
imagePullSecrets: []          # the image is public
global:
  volumes:
    - name: config
      configMap:
        name: cmk-ui-config
  volumeMounts:
    - name: config
      mountPath: /usr/share/nginx/html/config/config.json
      subPath: config.json
      readOnly: true
```

```bash
helm upgrade --install cmk-ui oci://ghcr.io/openkcm/charts/cmk-ui \
  --version 0.2.0 --namespace services -f cmk-ui-values.yaml
```

Set `ui.image` explicitly: the chart's default image is a placeholder, and its
default pull Secret `registry-access` is not needed for the public image. The
Service serves the UI on port `8080`; route the UI host to it at your gateway.
A change to the ConfigMap takes effect when the pods restart.
