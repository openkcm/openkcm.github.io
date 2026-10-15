---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "OpenKCM"
  text: "Open Key Chain Manager"
  tagline: "Open-source key management for cloud services: customers keep control over the keys that protect their data, with BYOK, HYOK, roles, approvals and audit."
  image:
    src: https://raw.githubusercontent.com/openkcm/openkcm.github.io/refs/heads/main/docs/assets/official_logo.svg
    alt: OpenKCM
  actions:
    - theme: brand
      text: Overview
      link: /overview/
#    - theme: brand
#      text: Software as a Service
#      link: /saas/getting-started
    - theme: alt
      text: Components
      link: /components/
    - theme: alt
      text: Roadmap
      link: https://github.com/openkcm/.github/blob/main/ROADMAP.md

features:
  - title: 🔗 CMK
    details: Govern customer keys with system-managed keys, BYOK (bring your own key) and HYOK (hold your own key), per-tenant identity providers, roles, approvals and audit.
    link: /overview/cmk
  - title: 🧱 Krypton
    details: Creates and operates the cryptographic keys, with key hierarchies and key delivery over KMIP. Used by CMK and usable on its own. In pre-production.
    link: /overview/krypton
  - title: 🔌 Pluggable
    details: Keystores and user directories connect through plugins. AWS KMS and SCIM directories are supported today.
    
  - title: 👨‍💻 Kubernetes-native
    details: Every service ships as a container image with a Helm chart, and the documentation covers configuration and hardening.
---
