# Glossary

The terms used across the OpenKCM documentation, in alphabetical order. Each
entry links to the page that explains the term in detail.

## A–F

| Term | Meaning |
| --- | --- |
| Approval workflow | A request for a sensitive key operation that other users must approve before CMK carries it out. See [Approvals](/components/cmk/guide/approvals) |
| Audit event | A record of a security-relevant action, such as a key change, a login or a rejected request, sent to the operator's log collector. See [Audit logging](/components/cmk/security/audit) |
| Auditor | Short for tenant auditor: the CMK role that can read everything in a tenant and change nothing. See [Roles](/components/cmk/guide/access#roles) |
| BYOK | Bring your own key. The customer generates the key material and imports it, wrapped, into the keystore that the platform provides for the tenant. See [Keys](/components/cmk/guide/keys#bring-your-own-key-byok) |
| Cedar | The policy language that ExtAuthZ uses to decide which caller may call which API path. See [ExtAuthZ](/components/cmk/extauthz) |
| Client data | A short-lived, signed statement about the caller that ExtAuthZ adds to every allowed request, and that CMK verifies. See [Signed client data](/components/cmk/security/client-data) |
| CMK | Customer-Managed Keys: the OpenKCM component that governs customer keys, their keystores, tenants, roles, approvals and the propagation of key changes. See [CMK](/overview/cmk) |
| CMK-2-Krypton Bridge | The CMK service that turns CMK's key decisions into Krypton operations. See [CMK-2-Krypton Bridge](/components/cmk/krypton-bridge) |
| CMK UI | The web console in which tenant users manage their keys, systems, groups and approvals. See [CMK UI](/components/cmk/cmk-ui) |
| Customer key | The tenant's root key, managed through CMK and kept in a keystore. Level L1 of the key hierarchy |
| DEK | Data encryption key: a key that encrypts data. Level L4 of the key hierarchy |
| Envoy Gateway | The API gateway in front of CMK. It terminates TLS and asks ExtAuthZ to check every request |
| ExtAuthZ | The service that authenticates every API request at the gateway, evaluates policies and signs the client data. See [ExtAuthZ](/components/cmk/extauthz) |

## G–K

| Term | Meaning |
| --- | --- |
| Group | A group of users from the tenant's identity provider. CMK maps groups to roles through their IAM identifiers. See [Groups and roles](/components/cmk/guide/access) |
| HYOK | Hold your own key. The key stays in the customer's own keystore; CMK links it and checks its state regularly. See [Keys](/components/cmk/guide/keys#hold-your-own-key-hyok) |
| IAM identifier | The name of a group as the identity provider sends it in the user's token, for example `KMS_TenantAdministrator_acme` |
| Identity provider (IdP) | The OpenID Connect service that authenticates a tenant's users, for example the customer's corporate login |
| KEK | Key encryption key: a key that protects other keys |
| Key administrator | The CMK role that manages keys, key configurations and systems in a tenant. See [Roles](/components/cmk/guide/access#roles) |
| Key configuration | A container for keys in CMK. It belongs to an administrator group, holds one or more keys, and has a primary key that its linked systems use. See [Key configurations](/components/cmk/guide/key-configurations) |
| Key hierarchy | Keys arranged in levels, where each key protects the keys of the level below. Disabling the customer key cuts off every key below it. See [Core concepts](/overview/core-concept#key-hierarchy) |
| Key version | A version of a key's material. Keystores create new versions when a key is rotated; CMK detects and records them |
| Keystore | The service where key material lives and key operations happen, for example AWS KMS. CMK connects to keystores through plugins |
| Keystore pool | A set of prepared keystores from which CMK assigns one to each new tenant |
| KMIP | Key Management Interoperability Protocol. Workloads use it to fetch their keys from Krypton |
| Krypton | The OpenKCM component that creates and operates cryptographic key hierarchies and delivers keys to workloads. See [Krypton](/overview/krypton) |

## L–R

| Term | Meaning |
| --- | --- |
| L1 to L4 | The levels of the key hierarchy: customer key, tenant key, service key and data encryption key |
| OpenBao | The secrets store in which Krypton keeps sealed key material |
| Orbital | The library that CMK and the Registry use to send jobs and tasks between services over an AMQP broker, and to track their results |
| Plugin | A separate process that connects CMK to a keystore or to a user directory. See [Plugins](/components/cmk/plugins) |
| Primary key | The key of a key configuration that its linked systems use |
| Region | A location where systems run. CMK sends key and system changes to each region |
| Registry | The global registry of tenants and systems. It onboards tenants and sends them to CMK. See [Registry](/components/cmk/registry) |
| Role | What a user may do in a tenant: tenant administrator, key administrator or auditor. A user holds exactly one role per tenant |

## S–Z

| Term | Meaning |
| --- | --- |
| SCIM | System for Cross-domain Identity Management: a standard API for user directories, used by CMK to look up users and groups |
| Session Manager | The service that runs the browser sign-in with the tenant's identity provider and keeps the browser sessions. See [Session Manager](/components/cmk/session-manager) |
| System | A service instance of the cloud service in a region that uses a tenant's key, for example a database of that tenant. See [Systems](/components/cmk/guide/systems) |
| System-managed key | A key that the keystore generates on request. Not available in the current version of CMK; use BYOK or HYOK |
| Tenant | A customer of the cloud service. Each tenant has its own keys, users, identity provider and data, isolated from other tenants |
| Tenant administrator | The CMK role that manages the tenant's groups and settings. It has no access to keys. See [Roles](/components/cmk/guide/access#roles) |
| Trust | The record that tells Session Manager and ExtAuthZ which identity provider a tenant uses |
| Wrapping | Encrypting a key with another key, for example to import BYOK key material safely |

## See also

- [Core concepts](/overview/core-concept)
- [Trust model](/overview/trust-model)
