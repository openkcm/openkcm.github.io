import { withMermaid } from "vitepress-plugin-mermaid";
import { fileURLToPath, URL } from 'node:url'

// https://vitepress.dev/reference/site-config
export default withMermaid({
  title: "OpenKCM",
  description: "Welcome to OpenKCM Documentation",
  base: '/',
  head: [['link', { rel: 'icon', href: 'https://raw.githubusercontent.com/openkcm/OpenKCM/refs/heads/main/docs/assets/logo_borderless.svg' }]],
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
        {text: 'Infrastructure as a Service', link: '/iaas/getting-started'},
        {text: 'Bare Metal Automation', link: '/baremetal/'},
      ]},
    ],

    editLink: {
      pattern: 'https://github.com/openkcm/openkcm.github.io/blob/main/docs/:path',
      text: 'Edit this page on GitHub'
    },

    logo: {
      src: 'https://raw.githubusercontent.com/openkcm/openkcm.github.io/refs/heads/main/docs/assets/logo_borderless.svg',
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
      '/iaas/': [
        {
            text: 'Infrastructure as a Service',
            collapsed: false,
            items: [
                { text: 'Getting Started', link: '/iaas/getting-started' },
            ],
        },
        {
          text: 'Usage Guides',
          collapsed: true,
          items: [
              { text: 'Overview', link: '/iaas/usage-guides/' },
              { text: 'Compute', link: '/iaas/usage-guides/compute'},
              { text: 'Networking', link: '/iaas/usage-guides/networking' },
              { text: 'Storage', link: '/iaas/usage-guides/storage' },
              { text: 'IPAM', link: '/iaas/usage-guides/ipam' },
              { text: 'Core', link: '/iaas/usage-guides/core' },
          ],
        },
        {
            text: "Architecture",
            collapsed: false,
            items: [
                { text: 'Overview', link: '/iaas/architecture/' },
                { text: 'Scheduling and Orchestration', link: '/iaas/architecture/scheduling' },
                { text: 'Runtime Interface', link: '/iaas/architecture/runtime-interface' },
                { text: 'Networking', link: '/iaas/architecture/networking' },
                { text: 'Operating System Images', link: '/iaas/architecture/os-images' },
            ],
        },
        {
          text: "Providers",
          collapsed: false,
          items: [
            { text: 'Overview', link: '/iaas/architecture/providers/' },
            { text: 'Brokers', link: '/iaas/architecture/providers/brokers' },
            { text: 'libvirt-provider', link: '/iaas/architecture/providers/libvirt-provider' },
            { text: 'ceph-provider', link: '/iaas/architecture/providers/ceph-provider' },
          ],
        },
        {
          text: "Kubernetes Integration",
          collapsed: false,
          items: [
            { text: 'Overview', link: '/iaas/kubernetes/' },
            { text: 'Cloud Controller Manager', link: '/iaas/kubernetes/cloud-controller-manager' },
            { text: 'CSI Driver', link: '/iaas/kubernetes/csi-driver' },
            { text: 'Gardener Integration', link: '/iaas/kubernetes/gardener' },
          ],
        },
        {
          text: "API References",
          collapsed: true,
          items: [
            { text: 'Overview', link: '/iaas/api-references/' },
            { text: 'Core', link: '/iaas/api-references/core' },
            { text: 'Compute', link: '/iaas/api-references/compute' },
            { text: 'Storage', link: '/iaas/api-references/storage' },
            { text: 'Networking', link: '/iaas/api-references/networking' },
            { text: 'IPAM', link: '/iaas/api-references/ipam' },
            { text: 'Common', link: '/iaas/api-references/common' },
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
