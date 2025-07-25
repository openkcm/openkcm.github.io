# Gardener Integration with OpenKCM Bare Metal

Apart from the [Cluster API Provider for Bare Metal](/baremetal/kubernetes/capi), OpenKCM is also integrated with 
[Gardener](https://gardener.cloud), a Kubernetes-native project for managing Kubernetes clusters at scale.

There are two main components in the Gardener integration with OpenKCM:
- **Machine Controller Manager (MCM)**: This component is responsible for managing the lifecycle of machines in a Kubernetes cluster. It uses the `metal-operator` API types to provision and manage bare metal servers.
- **Gardener Extension Provider**: This component provides the necessary integration points for Gardener to manage bare metal clusters.

## Machine Controller Manager (MCM)

The [machine-controller-manager-provider-OpenKCM](https://github.com/openkcm/machine-controller-manager-provider-OpenKCM-metal)
is responsible for managing the lifecycle of `Nodes` in a Kubernetes cluster. Here the MCM in essence is translating
Gardener `Machine` resource to `ServerClaims` and wrapping the `user-data` coming from the Gardner OS extensions into
an Ignition `Secret`.

## Gardener Extension Provider

The [`gardener-extension-provider-OpenKCM-metal`](https://github.com/openkcm/gardener-extension-provider-OpenKCM-metal)
is responsible for providing the necessary integration points for Gardener to manage bare metal clusters.

Those integration points include:
- Configure the [Cloud Controller Manager](/baremetal/kubernetes/cloud-controller-manager) to handle the `Node` lifecycle
and topology information.
- Configure the [metal-load-balancer-controller](/baremetal/kubernetes/metal-loadbalancer-controller) to handle `Service` of type `LoadBalancer`.
- Configure the [Machine Controller Manager (MCM)](#machine-controller-manager-mcm) to manage the creation of `Nodes` in the cluster.
