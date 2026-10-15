# CMK UI

The CMK UI is the web console for [CMK](/components/cmk/cmk-service). Tenant
administrators, key administrators and auditors use it to manage keys, systems,
groups and workflows.

Repository: [openkcm/cmk-ui](https://github.com/openkcm/cmk-ui)

## Architecture

- A single-page application built with SAPUI5 and TypeScript.
- Served as static files by nginx.
- Calls the CMK REST API directly from the browser.

## Sign-in

The UI has no login logic of its own. It uses
[Session Manager](/components/cmk/session-manager):

1. To sign in, the UI sends the browser to
   `<apiBaseUrl>/sm/auth?tenant_id=<tenant>&request_uri=<current page>`.
1. After the login, Session Manager redirects back to the UI and sets a session
   cookie and a CSRF cookie for the tenant.
1. The UI sends API requests with credentials (cookies) and copies the value of
   the `CSRF-<tenant>` cookie into the `X-CSRF-Token` header.
1. To sign out, the UI calls Session Manager's logout endpoint with the CSRF
   token.

The UI shows only the functions that the user's
[role](/components/cmk/security/cmk-authorization#roles) allows. CMK enforces the
same rules on every API call.

## Key management

The UI provides wizards to create system-managed keys and to link HYOK keys.
Importing BYOK key material is available through the CMK API.

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

The CMK UI ships as an nginx container image and a Helm chart.
