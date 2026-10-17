import { withMermaid } from "vitepress-plugin-mermaid";
import { fileURLToPath, URL } from 'node:url'

const resourcesSidebar = [
  {
    text: 'Resources',
    items: [
      {text: 'Roadmap', link: '/roadmap/'},
      {text: 'Releases', link: '/releases/'},
      {text: 'Contributing', link: '/contribute/contributing'},
      {text: 'Documentation style guide', link: '/contribute/style-guide'},
    ]
  },
]

// https://vitepress.dev/reference/site-config
export default withMermaid({
  title: "OpenKCM",
  description: "OpenKCM documentation: customer-controlled key chain management for services",
  base: '/',
  // The SaaS section is unfinished placeholder content; keep it out of the
  // published site and the search index until it is written.
  srcExclude: ['saas/**'],
  head: [['link', {
    rel: 'icon',
    href: 'https://raw.githubusercontent.com/openkcm/openkcm.github.io/refs/heads/main/docs/assets/official_logo.svg'
  }]],
  vite: {
    // Pre-bundle mermaid with all its dependencies for the dev server. Without
    // it, Vite serves mermaid's CommonJS dependencies (such as fastdom) as ES
    // modules and the page fails to load.
    optimizeDeps: {
      include: ['mermaid'],
    },
    resolve: {
      alias: [
        {
          find: /^.*\/VPFooter\.vue$/,
          replacement: fileURLToPath(
              new URL('./theme/components/VPFooter.vue', import.meta.url)
          )
        },
      ]
    }
  },
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      {text: 'Home', link: '/'},
      {text: 'Overview', link: '/overview/', activeMatch: '^/overview/'},
      {
        text: 'Components',
        activeMatch: '^/components/',
        items: [
          {text: 'CMK', link: '/components/cmk/', activeMatch: '^/components/cmk/'},
          {text: 'Krypton', link: '/components/krypton/', activeMatch: '^/components/krypton/'},
        ]
      },
      {
        text: 'Resources',
        activeMatch: '^/(roadmap|releases|contribute)/',
        items: [
          {text: 'Roadmap', link: '/roadmap/'},
          {text: 'Releases', link: '/releases/'},
          {text: 'Contributing', link: '/contribute/contributing'},
          {text: 'Documentation style guide', link: '/contribute/style-guide'},
        ]
      },
    ],

    editLink: {
      pattern: 'https://github.com/openkcm/openkcm.github.io/blob/main/docs/:path',
      text: 'Edit this page on GitHub'
    },

    logo: {
      src: 'https://raw.githubusercontent.com/openkcm/openkcm.github.io/refs/heads/main/docs/assets/official_logo.svg',
      width: 24,
      height: 24
    },

    search: {
      provider: 'local'
    },

    sidebar: {
      '/components/cmk/': [
        {
          text: 'CMK',
          items: [
            {text: 'Start here', link: '/components/cmk/'},
          ]
        },
        {
          text: 'Manage your keys',
          items: [
            {text: 'Getting started', link: '/components/cmk/guide/'},
            {text: 'Sign-in, groups and roles', link: '/components/cmk/guide/access'},
            {text: 'Key configurations', link: '/components/cmk/guide/key-configurations'},
            {text: 'Keys', link: '/components/cmk/guide/keys'},
            {text: 'Tenant', link: '/components/cmk/guide/tenant'},
            {text: 'Systems', link: '/components/cmk/guide/systems'},
            {text: 'Approvals', link: '/components/cmk/guide/approvals'},
          ]
        },
        {
          text: 'Integrate',
          items: [
            {text: 'CMK API', link: '/components/cmk/api'},
            {text: 'Connect a regional tenant', link: '/components/cmk/tenant-integration'},
            {text: 'Connect a regional system', link: '/components/cmk/system-integration'},
            {text: 'CMK-2-Krypton Bridge', link: '/components/cmk/krypton-bridge'},
          ]
        },
        {
          text: 'Deploy and operate',
          items: [
            {text: 'Deployment planning', link: '/components/cmk/deployment'},
            {text: 'Configuration guide', link: '/components/cmk/security/configuration'},
            {text: 'Request walkthrough', link: '/components/cmk/security/walkthrough'},
            {text: 'Operations', link: '/components/cmk/operations'},
            {text: 'Hardening checklist', link: '/components/cmk/security/hardening'},
          ]
        },
        {
          text: 'Security',
          items: [
            {text: 'Security architecture', link: '/components/cmk/security/'},
            {text: 'Signed client data', link: '/components/cmk/security/client-data'},
            {text: 'CMK authorization', link: '/components/cmk/security/cmk-authorization'},
            {text: 'Audit logging', link: '/components/cmk/security/audit'},
          ]
        },
        {
          text: 'Reference: services',
          collapsed: true,
          items: [
            {text: 'CMK service', link: '/components/cmk/cmk-service'},
            {text: 'CMK UI', link: '/components/cmk/cmk-ui'},
            {text: 'Registry', link: '/components/cmk/registry'},
            {text: 'ExtAuthZ', link: '/components/cmk/extauthz'},
            {text: 'Session Manager', link: '/components/cmk/session-manager'},
            {text: 'Plugins', link: '/components/cmk/plugins'},
          ]
        },
        {
          text: 'Reference: configuration',
          collapsed: true,
          items: [
            {text: 'CMK', link: '/components/cmk/security/cmk-config'},
            {text: 'CMK plugins', link: '/components/cmk/security/cmk-plugins'},
            {text: 'Registry', link: '/components/cmk/security/registry-config'},
            {text: 'ExtAuthZ', link: '/components/cmk/security/extauthz-config'},
            {text: 'Session Manager', link: '/components/cmk/security/session-manager-config'},
          ]
        },
      ],
      '/components/krypton/': [
        {
          text: 'Krypton',
          items: [
            {text: 'Overview', link: '/components/krypton/'},
          ]
        },
      ],
      '/overview/': [
        {
          text: 'Overview',
          items: [
            {text: 'Introduction', link: '/overview/'},
            {text: 'Core concepts', link: '/overview/core-concept'},
            {text: 'CMK', link: '/overview/cmk'},
            {text: 'Krypton', link: '/overview/krypton'},
            {text: 'Trust model', link: '/overview/trust-model'},
            {text: 'Glossary', link: '/overview/glossary'},
          ]
        }
      ],
      '/roadmap/': resourcesSidebar,
      '/releases/': resourcesSidebar,
      '/contribute/': resourcesSidebar,
      // '/saas/': [
      //   {
      //     text: 'Software as a Service',
      //     collapsed: false,
      //     items: [
      //       {text: 'Getting Started', link: '/saas/getting-started'},
      //     ],
      //   },
      //   {
      //     text: 'Usage Guides',
      //     collapsed: true,
      //     items: [
      //       {text: 'Overview', link: '/saas/usage-guides/'},
      //     ],
      //   },
      //   {
      //     text: "Architecture",
      //     collapsed: false,
      //     items: [
      //       {text: 'Overview', link: '/saas/architecture/'},
      //     ],
      //   },
      //
      //   {
      //     text: "API References",
      //     collapsed: true,
      //     items: [
      //       {text: 'Overview', link: '/saas/api-references/'},
      //       {text: 'CMK', link: '/saas/api-references/cmk'},
      //       {text: 'Crypto', link: '/saas/api-references/crypto'},
      //     ],
      //   },
      // ],
    },

    socialLinks: [
      {icon: 'github', link: 'https://github.com/openkcm/'}
    ],
  }
})
