# Getting started with Infrastructure as a Service

This section provides a comprehensive guide to getting started with OpenKCM's Infrastructure as a Service (IaaS) layer. 
It covers the prerequisites, local setup, and how to create and manage resources such as virtual machines, storage, 
and networking.

Before you are using OpenKCM IaaS, please make yourself familiar with the core concepts of OpenKCM as described in the
[architecture overview section](/iaas/architecture/).

## Local Setup

The fastest way to get started with OpenKCM IaaS is to run it locally inside a `kind` cluster. Therefore, you can use
[`openkcm-in-a-box`](https://github.com/openkcm/openkcm-in-a-box) which is a project tailored to run OpenKCM IaaS locally. 

![openkcm-in-a-box](/openkcm-in-a-box.png)

### Prerequisites

- curl
- make 
- go
- docker

### Installation

To do that clone the `OpenKCM-in-a-box` repository and run the provided script:

```bash
git clone github.com/openkcm/OpenKCM-in-a-box.git
```

To start the OpenKCM stack you simply run:

```bash
make up
```

Inside the `OpenKCM-in-a-box` directory. This will create a `kind` cluster and deploy all necessary parts to run 
OpenKCM IaaS.

For Linux users, everything should work out of the box. Please consult the project [README](https://github.com/openkcm/OpenKCM-in-a-box/blob/main/README.md) 
for more details on how to run the stack on macOS or Windows.

### Usage

Once all OpenKCM components are up and running, you can start using the IaaS layer. `OpenKCM-in-a-box` provides a 
conclusive example on how to create a `Machine` and all necessary resources to run a virtual machine [here](https://github.com/openkcm/OpenKCM-in-a-box/blob/main/examples/machine/machine.yaml).

```bash
kubectl apply -f https://raw.githubusercontent.com/openkcm/openkcm.github.io/refs/heads/main/examples/machine/machine.yaml
```

More examples can be found in the [Usage Guides](/iaas/usage-guides/) section, which provides detailed instructions on 
how to create and manage various resources.
