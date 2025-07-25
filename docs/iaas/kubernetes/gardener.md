# Gardener Integration with OpenKCM

OpenKCM provides integration with [Gardener](https://gardener.cloud/), a Kubernetes-native project for managing Kubernetes clusters at scale. This integration enables you to use OpenKCM's IaaS capabilities as an infrastructure provider for Gardener-managed Kubernetes clusters.

## Gardener

[Gardener](https://github.com/gardener/gardener) is an open source project for orchestrated Kubernetes cluster provisioning. It supports many different cloud providers, with `OpenKCM` being one of them.

For detailed information about Gardener's architecture, concepts, and terminology, see the [official Gardener documentation](https://gardener.cloud/docs/).

## Integration Components

The Gardener integration with OpenKCM consists of two main components that work together to provide seamless cluster management:

### Gardener Extension Provider for OpenKCM

The [Gardener Extension Provider for OpenKCM](https://github.com/openkcm/gardener-extension-provider-OpenKCM) contains a set of webhooks and controllers for reconciling OpenKCM-specific resources of `type: OpenKCM` that are created by Gardener during the cluster provisioning flow.

The extension primarily reconciles `Infrastructure`, `ControlPlane`, and `Worker` resources, translating Gardener's cluster specifications into OpenKCM API calls for infrastructure management.

### Machine Controller Manager Provider for OpenKCM

The [Machine Controller Manager Provider for OpenKCM](https://github.com/openkcm/machine-controller-manager-provider-OpenKCM) integrates with [Gardener's Machine Controller Manager](https://github.com/gardener/machine-controller-manager) to manage worker nodes through OpenKCM's compute infrastructure.

The provider implements the machine lifecycle management capabilities defined by Gardener's MCM framework, handling machine creation, deletion, scaling, and health monitoring for OpenKCM compute resources.
