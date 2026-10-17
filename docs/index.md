---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "OpenKCM"
  text: "Customer-controlled keys for cloud services"
  tagline: "Open-source key management that lets the customers of a cloud service own the keys that protect their data, decide who may use them, and withdraw them at any time."
  image:
    src: https://raw.githubusercontent.com/openkcm/openkcm.github.io/refs/heads/main/docs/assets/official_logo.svg
    alt: OpenKCM
  actions:
    - theme: brand
      text: What is OpenKCM?
      link: /overview/
    - theme: alt
      text: Manage your keys
      link: /components/cmk/guide/
    - theme: alt
      text: Deploy CMK
      link: /components/cmk/deployment
    - theme: alt
      text: GitHub
      link: https://github.com/openkcm

features:
  - title: 🔑 Keys under customer control
    details: Bring your own key material (BYOK), or hold your own key (HYOK) in your own keystore. Disable a key, and every system that uses it is informed.
    link: /overview/cmk
    linkText: About CMK
  - title: 👥 Separation of duties
    details: Each tenant signs in with its own identity provider. Roles keep administration, key management and auditing apart, and sensitive changes can require approval.
    link: /components/cmk/guide/access
    linkText: Roles and access
  - title: 🌍 Every region informed
    details: CMK sends key and system changes to the services of every region and tracks the result, so a decision in CMK is enforced where the data lives.
    link: /components/cmk/system-integration
    linkText: Connect a system
  - title: 🧱 Krypton
    details: Creates and operates cryptographic key hierarchies and delivers keys to workloads over KMIP. Used by CMK, and usable on its own. In pre-production.
    link: /overview/krypton
    linkText: About Krypton
  - title: 🔌 Pluggable
    details: Keystores and user directories connect through plugins. AWS KMS and SCIM directories are supported today; further keystores can be added as plugins.
    link: /components/cmk/plugins
    linkText: Plugins
  - title: ☸️ Kubernetes-native
    details: Every service ships as a container image with a Helm chart. The documentation covers planning, configuration, hardening and operations.
    link: /components/cmk/deployment
    linkText: Deployment planning
---

## Find your way

| You are… | Start here | Then |
| --- | --- | --- |
| **Evaluating OpenKCM** for your platform | [Overview](/overview/) | [Core concepts](/overview/core-concept), [Trust model](/overview/trust-model) |
| **A customer** who manages keys in CMK: tenant administrator, key administrator or auditor | [Manage your keys](/components/cmk/guide/) | [Keys](/components/cmk/guide/keys), [Approvals](/components/cmk/guide/approvals) |
| **Building a cloud service** that encrypts data with customer keys | [Connect a regional system](/components/cmk/system-integration) | [CMK API](/components/cmk/api), [Krypton](/components/krypton/) |
| **Operating the platform** that runs CMK | [Deployment planning](/components/cmk/deployment) | [Configuration guide](/components/cmk/security/configuration), [Operations](/components/cmk/operations) |
| **Contributing** to OpenKCM | [Contributing](/contribute/contributing) | [Releases](/releases/), [Roadmap](/roadmap/) |

New to the terms? The [glossary](/overview/glossary) explains them all.
