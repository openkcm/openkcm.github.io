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

- **Container images** are published to the GitHub Container Registry under
  `ghcr.io/openkcm` with every release.
- **Helm charts** are in the `charts/` directory of each service repository and
  are released together with the service.
- **Plugins** are not deployed on their own: they are bundled into the CMK
  image that includes plugins.

Use explicit image tags or digests in your deployments rather than `latest`.

## See also

- [Roadmap](/roadmap/)
- [Deployment planning](/components/cmk/deployment)
