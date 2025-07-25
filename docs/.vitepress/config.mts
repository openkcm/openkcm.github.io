import { withMermaid } from "vitepress-plugin-mermaid";
import { fileURLToPath, URL } from 'node:url'

// https://vitepress.dev/reference/site-config
export default withMermaid({
  title: "OpenKCM",
  description: "Welcome to OpenKCM Documentation",
  base: '/',
  head: [['link', { rel: 'icon', href: 'https://raw.githubusercontent.com/openkcm/openkcm.github.io/refs/heads/main/docs/assets/logo.png' }]],
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
      {text: 'Documentation',
      items: [
        {text: 'Software as a Service', link: '/saas/getting-started'},
      ]},
    ],

    editLink: {
      pattern: 'https://github.com/openkcm/openkcm.github.io/blob/main/docs/:path',
      text: 'Edit this page on GitHub'
    },

    logo: {
      src: 'https://raw.githubusercontent.com/openkcm/openkcm.github.io/refs/heads/main/docs/assets/logo.png',
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
            { text: 'Index', link: '/overview/' },
            { text: 'Design Principles', link: '/overview/principles' },
            ]
        }
      ],
      '/saas/': [
        {
            text: 'Software as a Service',
            collapsed: false,
            items: [
                { text: 'Getting Started', link: '/saas/getting-started' },
            ],
        },
        {
          text: 'Usage Guides',
          collapsed: true,
          items: [
              { text: 'Overview', link: '/saas/usage-guides/' },
          ],
        },
        {
            text: "Architecture",
            collapsed: false,
            items: [
                { text: 'Overview', link: '/saas/architecture/' },
            ],
        },
        {
          text: "Providers",
          collapsed: false,
          items: [
            { text: 'Overview', link: '/saas/architecture/providers/' },
            { text: 'Brokers', link: '/saas/architecture/providers/brokers' },
            { text: 'libvirt-provider', link: '/saas/architecture/providers/libvirt-provider' },
            { text: 'ceph-provider', link: '/saas/architecture/providers/ceph-provider' },
          ],
        },
        {
          text: "Kubernetes Integration",
          collapsed: false,
          items: [
            { text: 'Overview', link: '/saas/kubernetes/' },
            { text: 'Cloud Controller Manager', link: '/saas/kubernetes/cloud-controller-manager' },
            { text: 'CSI Driver', link: '/saas/kubernetes/csi-driver' },
            { text: 'Gardener Integration', link: '/saas/kubernetes/gardener' },
          ],
        },
        {
          text: "API References",
          collapsed: true,
          items: [
            { text: 'Overview', link: '/saas/api-references/' },
            { text: 'Core', link: '/saas/api-references/core' },
            { text: 'Compute', link: '/saas/api-references/compute' },
            { text: 'Storage', link: '/saas/api-references/storage' },
            { text: 'Networking', link: '/saas/api-references/networking' },
            { text: 'IPAM', link: '/saas/api-references/ipam' },
            { text: 'Common', link: '/saas/api-references/common' },
          ],
        },
      ],
    '/baremetal/': [
      {
        text: 'Overview', link: '/baremetal/',
      },
      {
        text: "Architecture",
        collapsed: false,
        items: [
          { text: 'Overview', link: '/baremetal/architecture' },
          { text: 'Discovery', link: '/baremetal/architecture/discovery' },
          { text: 'Provisioning', link: '/baremetal/architecture/provisioning' },
        ],
      },
      {
        text: "Kubernetes Integration",
        collapsed: false,
        items: [
          { text: 'Overview', link: '/baremetal/kubernetes/' },
          { text: 'Cloud Controller Manager', link: '/baremetal/kubernetes/cloud-controller-manager' },
          { text: 'Metal Loadbalancer Controller', link: '/baremetal/kubernetes/metal-loadbalancer-controller' },
          { text: 'Cluster API Provider', link: '/baremetal/kubernetes/capi' },
          { text: 'Gardener Integration', link: '/baremetal/kubernetes/gardener' },
        ],
      },
      {
        text: "API References",
        collapsed: true,
        items: [
          { text: 'Overview', link: '/baremetal/api-references/' },
          { text: 'metal-operator', link: '/baremetal/api-references/metal-operator' },
          { text: 'boot-operator', link: '/baremetal/api-references/boot-operator' },
        ],
      },
    ]},

    socialLinks: [
      { icon: 'github', link: 'https://github.com/openkcm/' }
    ],
  }
})
