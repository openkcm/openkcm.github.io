# Networking

## Overview

OpenKCM's virtual networking architecture provides an end-to-end virtual networking solution for provisioned `Machine`s running in data centers, regardless they are bare metal machines or virtual machines. It is designed to enable robust, flexible and performing networking control plane and data plane.

- **Robust**: OpenKCM's virtual networking control plane is mainly implemented using Kubernetes controller model. Thus, it is able to survive component's failure and recover the running states by retrieving the desired networking configuration.
- **Flexible**: Thanks to the modular and layered architecture design, OpenKCM's virtual networking solution allows developers to implement and interchange components from the most top-level data center management system built upon defined OpenKCM APIs, to lowest-level packet processing engines depending on the used hardware.
- **Performing**: The data plane of OpenKCM's virtual networking solution is built with the packet processing framework [DPDK](https://www.dpdk.org), and currently utilizes the hardware offloading features of [Nvidia's Mellanox SmartNic serials](https://www.nvidia.com/en-us/networking/ethernet-adapters/) to speedup packet processing. With the DPDK's run-to-completion model, OpenKCM's networking data plane can achieve high performance even in the environment where hardware offloading capability is limited or disabled.

OpenKCM's virtual networking architecture is illustrated with the following figure. It consists of several components that work together to ensure network out and inbound connectivity and isolation for `Machine` instances.

![OpenKCM Virtual Networking](/openkcm-net-overview.png)

The main elements involved in OpenKCM's networking are:
- TO be defined
