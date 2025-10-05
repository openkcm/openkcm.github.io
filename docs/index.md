---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "OpenKCM"
  text: "Open Key Chain Manager"
  tagline: "Secure, scalable, and open-source Key Management tailored to 
meet the growing demands of data protection in modern cloud environments. It helps organizations manage 
cryptographic keys efficiently while ensuring compliance with stringent security and privacy standards."
  image:
    src: https://raw.githubusercontent.com/openkcm/openkcm.github.io/refs/heads/main/docs/assets/logo.svg
    alt: OpenKCM
  actions:
    - theme: brand
      text: Overview
      link: /overview/
    - theme: alt
      text: Software as a Service
      link: /saas/getting-started

features:
  - title: 🔗 Customer Managed Keys
    details: Centralized solution to govern customer encryption keys (Level 1 keys), with BYOK (Bring Your Own Key) and HYOK (Hold Your Own Key) capabilities.
  - title: 🧱 Crypto Layer
    details: Solution to govern key encryption keys (Level 2-4 keys).
  - title: ☁️ SaaS Solution
    details: Pluggable for hybrid and edge deployments.
    
  - title: 👨‍💻 DevOps-Ready by Design
    details: End-to-end Software and lifecycle management powered by Kubernetes.
---
