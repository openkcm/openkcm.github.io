# Releases

Each OpenKCM service and library is released on its own, from its own GitHub
repository. This page tells you where to find the releases, the release notes
and the deployable artifacts of every component.

## Versioning

- Every repository follows [semantic versioning](https://semver.org). Versions
  below 1.0 can change in incompatible ways between minor releases, so read the
  release notes before you upgrade.
- Most repositories create their releases from
  [conventional commits](https://www.conventionalcommits.org), so each release
  lists its features, fixes and breaking changes. The release notes are on the
  GitHub release page, and most repositories also keep a `CHANGELOG.md`.
- The services do not share a version number. Upgrade them one at a time and
  check the release notes of each.

## CMK

| Component | What it contains | Releases |
| --- | --- | --- |
| CMK service | API server, tenant manager, event reconciler, task scheduler and worker, database migrator, `cmkctl` | [cmk](https://github.com/openkcm/cmk/releases) |
| CMK UI | Web console | [cmk-ui](https://github.com/openkcm/cmk-ui/releases) |
| Registry | Registry of tenants and systems | [registry](https://github.com/openkcm/registry/releases) |
| ExtAuthZ | Request authentication and authorization at the gateway | [extauthz](https://github.com/openkcm/extauthz/releases) |
| Session Manager | Browser sign-in and sessions | [session-manager](https://github.com/openkcm/session-manager/releases) |
| CMK-2-Krypton Bridge | Connection from CMK to Krypton | [cmk-krypton-bridge](https://github.com/openkcm/cmk-krypton-bridge/releases) |
| Checker | Health of the cluster and versions of the services, over HTTP | [checker](https://github.com/openkcm/checker/releases) |
| Keystore plugins | AWS KMS and other keystore integrations | [keystore-plugins](https://github.com/openkcm/keystore-plugins/releases) |
| Identity management plugins | SCIM directory integration | [identity-management-plugins](https://github.com/openkcm/identity-management-plugins/releases) |

## Krypton

| Component | What it contains | Releases |
| --- | --- | --- |
| Krypton | Root server, agents and command-line client | [krypton](https://github.com/openkcm/krypton/releases) |

## Libraries

These libraries are used by the services. You need them only if you build your
own integration or plugin.

| Library | Purpose | Releases |
| --- | --- | --- |
| plugin-sdk | Build keystore and identity management plugins | [plugin-sdk](https://github.com/openkcm/plugin-sdk/releases) |
| orbital | Jobs and tasks between services over AMQP | [orbital](https://github.com/openkcm/orbital/releases) |
| api-sdk | gRPC API definitions shared between services | [api-sdk](https://github.com/openkcm/api-sdk/releases) |
| common-sdk | Configuration, logging, audit and authentication helpers | [common-sdk](https://github.com/openkcm/common-sdk/releases) |

## Artifacts

Every service is published as a container image and a Helm chart in the GitHub
Container Registry. The charts are OCI artifacts: install them directly from
the registry, without `helm repo add`.

| Service | Helm chart | Container image |
| --- | --- | --- |
| CMK | `oci://ghcr.io/openkcm/charts/cmk` | `ghcr.io/openkcm/cimages/mk/cmk-full-plugins` |
| CMK UI | `oci://ghcr.io/openkcm/charts/cmk-ui` | `ghcr.io/openkcm/images/cmk-ui` |
| Registry | `oci://ghcr.io/openkcm/charts/registry` | `ghcr.io/openkcm/images/registry` |
| ExtAuthZ | `oci://ghcr.io/openkcm/charts/extauthz` | `ghcr.io/openkcm/images/extauthz` |
| Session Manager | `oci://ghcr.io/openkcm/charts/session-manager` | `ghcr.io/openkcm/images/session-manager` |
| Checker | `oci://ghcr.io/openkcm/charts/checker` | `ghcr.io/openkcm/images/checker` |
| Krypton root server and agent | `oci://ghcr.io/openkcm/charts/krypton-root` | `ghcr.io/openkcm/images/krypton/root`, `ghcr.io/openkcm/images/krypton/agent` |
| CMK-2-Krypton Bridge | `oci://ghcr.io/openkcm/charts/cmkkryptonbridge` | `ghcr.io/openkcm/images/cmk-krypton-bridge` |

Show the latest version of a chart, and the service version it deploys by
default (`appVersion`), with:

```bash
helm show chart oci://ghcr.io/openkcm/charts/cmk
```

- **Chart and service versions.** Each chart deploys, by default, the service
  version it was released with: the image tag defaults to the chart's
  `appVersion`. Pin the chart version with `--version`; set `image.tag` or
  `image.digest` only to deploy another service version.
- **Chart documentation.** Each chart's `README.md` lists the resources it
  creates and its upgrade notes, and its `values.yaml` documents every value,
  including every setting of the service, with examples. Both are in the
  `charts/` directory of the service repository.
- **Plugins** are not deployed on their own: the CMK image `cmk-full-plugins`
  contains the binaries of the plugin images
  `ghcr.io/openkcm/images/keystore-plugins` and
  `ghcr.io/openkcm/images/identity-management-plugins`.
- **Krypton** is in pre-production. The `krypton-root` chart deploys the root
  server; see [Install the root server](/components/krypton/#install-the-root-server).
- **The CMK-2-Krypton Bridge** is in early development; see its
  [current state](/components/cmk/krypton-bridge#current-state).

Use explicit chart versions, and image tags or digests, rather than `latest`.

## See also

- [Roadmap](/roadmap/)
- [Deployment planning](/components/cmk/deployment)
