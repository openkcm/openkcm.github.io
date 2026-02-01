import { withMermaid } from "vitepress-plugin-mermaid";
import { fileURLToPath, URL } from 'node:url'

// https://vitepress.dev/reference/site-config
export default withMermaid({
  title: "OpenKCM",
  description: "Welcome to OpenKCM Documentation",
  base: '/',
  head: [['link', {
    rel: 'icon',
    href: 'https://raw.githubusercontent.com/openkcm/openkcm.github.io/refs/heads/main/docs/assets/logo.svg'
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
        text: 'Documentation',
        items: [
          {text: 'Software as a Service', link: '/saas/getting-started'},
        ]
      },
    ],

    editLink: {
      pattern: 'https://github.com/openkcm/openkcm.github.io/blob/main/docs/:path',
      text: 'Edit this page on GitHub'
    },

    logo: {
      src: 'https://raw.githubusercontent.com/openkcm/openkcm.github.io/refs/heads/main/docs/assets/logo.svg',
      width: 24,
      height: 24
    },

    search: {
      provider: 'local'
    },

    sidebar: {
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
      '/saas/': [
        {
          text: 'Software as a Service',
          collapsed: false,
          items: [
            {text: 'Getting Started', link: '/saas/getting-started'},
          ],
        },
        {
          text: 'Usage Guides',
          collapsed: true,
          items: [
            {text: 'Overview', link: '/saas/usage-guides/'},
          ],
        },
        {
          text: "Architecture",
          collapsed: false,
          items: [
            {text: 'Overview', link: '/saas/architecture/'},
          ],
        },

        {
          text: "API References",
          collapsed: true,
          items: [
            {text: 'Overview', link: '/saas/api-references/'},
            {text: 'CMK', link: '/saas/api-references/cmk'},
            {text: 'Crypto', link: '/saas/api-references/crypto'},
          ],
        },
      ],

      socialLinks: [
        {icon: 'github', link: 'https://github.com/openkcm/'}
      ],
    }
  }
})
