# Networking

## Overview

OpenKCM's virtual networking architecture provides an end-to-end virtual networking solution for provisioned `Machine`s running in data centers, regardless they are bare metal machines or virtual machines. It is designed to enable robust, flexible and performing networking control plane and data plane.

- **Robust**: OpenKCM's virtual networking control plane is mainly implemented using Kubernetes controller model. Thus, it is able to survive component's failure and recover the running states by retrieving the desired networking configuration.
- **Flexible**: Thanks to the modular and layered architecture design, OpenKCM's virtual networking solution allows developers to implement and interchange components from the most top-level data center management system built upon defined OpenKCM APIs, to lowest-level packet processing engines depending on the used hardware.
- **Performing**: The data plane of OpenKCM's virtual networking solution is built with the packet processing framework [DPDK](https://www.dpdk.org), and currently utilizes the hardware offloading features of [Nvidia's Mellanox SmartNic serials](https://www.nvidia.com/en-us/networking/ethernet-adapters/) to speedup packet processing. With the DPDK's run-to-completion model, OpenKCM's networking data plane can achieve high performance even in the environment where hardware offloading capability is limited or disabled.

OpenKCM's virtual networking architecture is illustrated with the following figure. It consists of several components that work together to ensure network out and inbound connectivity and isolation for `Machine` instances.

![OpenKCM Virtual Networking](/OpenKCM-net-overview.png)

The main elements involved in OpenKCM's networking are:
- [**OpenKCM**](https://github.com/openkcm/openkcm.github.io): Core networking component that manages network resources and configurations. For more details, see the 
[Networking usage guide](/saas/usage-guides/networking).
- [**OpenKCM-net**](https://github.com/openkcm/openkcm.github.io-net): Global coordination service that manages network resource in an OpenKCM instance.
- [**metalnet**](https://github.com/OpenKCM-dev/metalnet): A service that provides cluster-level networking capabilities for `Machines`.
- [**dpservice**](https://github.com/OpenKCM-dev/dpservice): A service that manages data plane operations, including network traffic routing and policies.
- [**metalbond**](https://github.com/OpenKCM-dev/metalbond): A component that handles route announcements in an OpenKCM instance, ensuring that networking routes are
correctly propagated across the OpenKCM installation.

## `OpenKCM` and `OpenKCM-net`

`OpenKCM-net` is a global coordination service within an OpenKCM installation. Therefore, it is a single instance and 
the place where all network related decisions like reservation of unique IP addresses, allocation of unique network IDs, etc. are made.

`OpenKCM-net` has apart from its [own API](https://github.com/openkcm/openkcm.github.io-net/tree/main/api/core/v1alpha1) two main components:
- **apinetlet**: This component is responsible from translating the user-facing API objects from the `networking` resource group into the internal representation used by `OpenKCM-net`. 
- **metalnetlet**: This component is interfacing with the `metalnet` API to manage cluster-level networking resources like `NetworkInterface` which are requested globally in the `OpenKCM-net` API but are implemented by `metalnet` on a hypervisor level.

### Example `apinetlet` flow

When a user creates a `VirtualIP` resource in OpenKCM:

```yaml
apiVersion: networking.OpenKCM.dev/v1alpha1
kind: VirtualIP
metadata:
  name: virtualip-sample
spec:
  type: Public
  ipFamily: IPv4
```

The `apinetlet` will reconcile this `VirtualIP` by performing the following steps:
1. Create an `IP` object in the `OpenKCM-net` API, which reserves a unique IP address.
2. Update the `VirtualIP` status with the allocated IP address.

The `OpenKCM` API server is agnostic on how the underlying global IP address is allocated and delegates this responsibility 
to `OpenKCM-net`.

A similar flow happens for `Network`, `LoadBalancer` and `NatGateway` resources, where the `apinetlet` is responsible
for translating and allocating the necessary resources in `OpenKCM-net` to ensure that the networking requirements are met.

### `metalnetlet` and `metalnet`

`metalnetlet` and `metalnet` work together to provide the necessary networking capabilities for `Machines` in an OpenKCM on 
a hypervisor host. In a compute cluster, the `metalnetlet` will create for each `Node` in the cluster a corresponding
`Node` object in the `OpenKCM-net` API. This `Node` object represents the hypervisor host and is used to manage the networking resources
which should be available on this host.

The image below illustrates the relationship between `metalnetlet` and `metalnet`:

![Provider Level Networking](/provider-networking.png)

The `NetworkInterface` creation flow will look like this:
1. A provider (in this case `libvirt-provider`) will create a virtual machine against the libvirt daemon on a hypervisor host.
In case a `NetworkInterface` should be attached to this virtual machine, the `machinepoollet` will call the corresponding
`AttachNetworkInterface` method on the [`MachineRuntime`](/saas/architecture/runtime-interface#machineruntime-interface) 
interface implemented by the `libvirt-provider`. The `libvirt-provider` itself then has a plugin into the `OpenKCM-net` 
API to create a `NetworkInterface` resource in the `OpenKCM-net` API.
2. The `metalnetlet` will then watch for changes to the `NetworkInterface` resource and create the corresponding `NetworkInterface` 
object in the `metalnet` API using the `NodeName` of the hypervisor host where the virtual machine is running.
3. Once `metalnet` has created the virtual network interface on the hypervisor host, it will propagate the PCI address of this
virtual network interface back to the `OpenKCM-net` API by updating the status of the `NetworkInterface` resource.
4. The `libvirt-provider` will poll the `OpenKCM-net` API to get the updated status of the `NetworkInterface` and will 
use the PCI address in the status to attach the virtual network interface to the virtual machine instance.

`LoadBalancer` and `NATGateways` resources follow a similar flow. Here, however, the compute provider is not involved. 
The `apinetlet` will translate the `OpenKCM` `LoadBalancer` or `NATGateway` resource into the corresponding `OpenKCM-net`
objects. Those will be scheduled on `OpenKCM-net` `Nodes`. Onces this is done, the `metalnetlet` will watch those resources
and create the corresponding `LoadBalancer` or `NATGateway` objects in the `metalnet` API.

### `metalnet`, `dpservice` and `metalbond`

As mentioned above, `metalnet` is responsible for cluster-level networking capabilities. It provides the necessary API
to manage `Networks`, `NetworkInterfaces`, and other networking resources that are required for `Machines` on a hypervisor host. `dpservice` receives configurations, such as an activated interface with configured IP address or networking policies, via gRPC interfaces from `metalnet`. Meanwhile, `metalbond` is responsible for distributing encapsulation routes among instances of `metalnet`. 

The following figure depicts the basic working flow of creating two interfaces for the same virtual private network. 

![Metalnet Dpservice Metalbond](/metalnet-dpservice-metalbond.png)

`metalnet` controllers watch the metalnet objects such as `Network` and `NetworkInterface`. Upon arriving of a new `NetworkInterface`, `metalnet` communicates with `dpservice` to obtain a newly generated underlying IPv6 address for a corresponding interface's overlay IP address. For example, on `Server-A`, `metalnet` obtains an underlying IPv6 address, `2001:db8::1`, for `interface-A` with a private IP `10.0.0.1`. This encapsulation routing information is announced by `metalnet`'s embedded `metalbond-client` to `metalbond-server` running on a region router, and further synchronised by other `metalbond` instances. For instance, `metalbond` on `Server-B` shall receive this `10.0.0.1@2001:db8::1` information and push it into its local `dpservice` via gRPC. `dpservice` uses these routing information to perform overlay packet encapsulation and decapsulation to achieve communication among VMs running on different servers. Meanwhile, `metalnet` also picks a pci addresss of a VF, such as `0000:3b:00.2`, and attach it as part of `NetworkInterface` status, which is further utilised by `OpenKCM-net` and `vm-provider`/`libvirt-provider` to create a VM.
