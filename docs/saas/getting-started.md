# Getting started with Software as a Service

This section provides a comprehensive guide to getting started with OpenKCM's Software as a Service (SaaS) layer. 
It covers the prerequisites, local setup, and how to create and manage resources such as virtual machines, storage, 
and networking.

Before you are using OpenKCM SaaS, please make yourself familiar with the core concepts of OpenKCM as described in the
[architecture overview section](./architecture/).

## Local Setup

The fastest way to get started with OpenKCM SaaS is to run it locally inside a `kind` cluster. Therefore, you can use
[`openkcm.github.io`](https://github.com/openkcm/openkcm.github.io) which is a project tailored to run OpenKCM SaaS locally. 


### Prerequisites

- curl
- make 
- go
- docker

### Installation

To do that clone the `openkcm.github.io` repository and run the provided script:

```bash
git clone github.com/openkcm/openkcm.github.io.git
```

To start the OpenKCM stack you simply run:

```bash
make up
```

Inside the `openkcm.github.io` directory. This will create a `kind` cluster and deploy all necessary parts to run 
OpenKCM SaaS.

For Linux users, everything should work out of the box. Please consult the project [README](https://github.com/openkcm/openkcm.github.io/blob/main/README.md) 
for more details on how to run the stack on macOS or Windows.

### Usage

Once all OpenKCM components are up and running, you can start using the SaaS layer. `openkcm.github.io` provides a 
conclusive example on how to create a `Machine` and all necessary resources to run a virtual machine [here](https://github.com/openkcm/openkcm.github.io/blob/main/examples/machine/machine.yaml).

```bash
kubectl apply -f https://raw.githubusercontent.com/openkcm/openkcm.github.io/refs/heads/main/examples/machine/machine.yaml
```

More examples can be found in the [Usage Guides](/saas/usage-guides/) section, which provides detailed instructions on 
how to create and manage various resources.
