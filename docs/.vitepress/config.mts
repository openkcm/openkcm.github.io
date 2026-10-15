import { withMermaid } from "vitepress-plugin-mermaid";
import { fileURLToPath, URL } from 'node:url'

// https://vitepress.dev/reference/site-config
export default withMermaid({
  title: "OpenKCM",
  description: "Welcome to OpenKCM Documentation",
  base: '/',
  // The SaaS section is unfinished placeholder content; keep it out of the
  // published site and the search index until it is written.
  srcExclude: ['saas/**'],
  head: [['link', {
    rel: 'icon',
    href: 'https://raw.githubusercontent.com/openkcm/openkcm.github.io/refs/heads/main/docs/assets/official_logo.svg'
  }]],
  vite: {
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
      {text: 'Overview', link: '/overview'},
      {
        text: 'Components',
        activeMatch: '^/components/',
        items: [
          {text: 'CMK', link: '/components/cmk/', activeMatch: '^/components/cmk/'},
          {text: 'Krypton', link: '/components/krypton/', activeMatch: '^/components/krypton/'},
        ]
      },
      // {
      //   text: 'Documentation',
      //   items: [
      //     {text: 'Software as a Service', link: '/saas/getting-started'},
      //   ]
      // },
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
            {text: 'Overview', link: '/components/cmk/'},
            {text: 'CMK service', link: '/components/cmk/cmk-service'},
            {text: 'CMK UI', link: '/components/cmk/cmk-ui'},
            {text: 'Registry', link: '/components/cmk/registry'},
            {text: 'ExtAuthZ', link: '/components/cmk/extauthz'},
            {text: 'Session Manager', link: '/components/cmk/session-manager'},
            {text: 'Plugins', link: '/components/cmk/plugins'},
          ]
        },
        {
          text: 'Security',
          items: [
            {text: 'Security architecture', link: '/components/cmk/security/'},
            {text: 'Signed client data', link: '/components/cmk/security/client-data'},
            {text: 'CMK authorization', link: '/components/cmk/security/cmk-authorization'},
            {text: 'Audit logging', link: '/components/cmk/security/audit'},
            {text: 'Hardening checklist', link: '/components/cmk/security/hardening'},
          ]
        },
        {
          text: 'Configuration',
          items: [
            {text: 'Configuration guide', link: '/components/cmk/security/configuration'},
            {text: 'Request walkthrough', link: '/components/cmk/security/walkthrough'},
            {text: 'CMK reference', link: '/components/cmk/security/cmk-config'},
            {text: 'CMK plugins', link: '/components/cmk/security/cmk-plugins'},
            {text: 'ExtAuthZ reference', link: '/components/cmk/security/extauthz-config'},
            {text: 'Session Manager reference', link: '/components/cmk/security/session-manager-config'},
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
            {text: 'Index', link: '/overview/'},
            {text: 'Core Concept', link: '/overview/core-concept'},
            {text: 'Customer Managed Key', link: '/overview/cmk'},
            {text: 'Crypto', link: '/overview/crypto'},
            {text: 'Trust Model', link: '/overview/trust-model'},
          ]
        }
      ],
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
