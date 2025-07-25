# Storage Resources
OpenKCM storage resources are `Volumes`, their associated `Volumeclasses` and `VolumePools` that allow you to define, provision, and manage Block devices in the OpenKCM infrastructure. This guide explains the core storage resource types and how to use them.

## Volume

The `Volume` resource represents a block device in the OpenKCM API.

### Example Volume Resource

An example of how to define a `Volume` resource in OpenKCM:

```yaml
apiVersion: storage.OpenKCM.dev/v1alpha1
kind: Volume
metadata:
  name: volume-sample
spec:
  volumeClassRef:
    name: volumeclass-sample
  # volumePoolRef:
  #   name: volumepool-sample
  resources:
    storage: 100Gi
```

### Key Fields:

- `volumeClassRef` (`string`): `volumeClassRef` refers to the name of an OpenKCM `volumeClass`( for eg: `slow`, `fast`, `super-fast` etc.) to create a volume,
- `volumePoolRef` (`string`): `VolumePoolRef` indicates which VolumePool to use for a volume. If unset, the scheduler will figure out a suitable `VolumePoolRef`.
- `resources`: `Resources` is a description of the volume's resources and capacity.

## VolumeClass

The `VolumeClass` in OpenKCM defines the characteristics and capabilities of storage `Volume` like TPS and IOPs. 

### Example VolumeClass Resource

An example of how to define a `VolumeClass` resource in OpenKCM:

```yaml
apiVersion: storage.OpenKCM.dev/v1alpha1
kind: VolumeClass
metadata:
  name: volumeclass-sample
capabilities:
  tps: 100Mi
  iops: 100
```

### Key Fields:
- `capabilities`: Capabilities has tps and iops fields that need to be specified, it's a mandatory field,
    - `tps` (`string`): The `tps` represents transactions per second.
    - `iops` (`string`): `iops` is the number of input/output operations a storage device can complete per second.

### Usage

- **VolumeClass Definition**: Create a `VolumeClass` to set storage properties based on resource capabilities.
- **Associate with Volume**: Link a `VolumeClass` to a `Volume` using a reference in the Volume resource.

## VolumePool

A `VolumePool` is a resource in `OpenKCM` that represents a pool of storage volume managed collectively. It defines 
the infrastructure's storage configuration used to provision and manage volumes, ensuring resource availability and 
compatibility with associated `VolumeClasses`.

### Example VolumePool Resource

An example of how to define a `VolumePool` resource in OpenKCM:

```yaml
apiVersion: storage.OpenKCM.dev/v1alpha1
kind: VolumePool
metadata:
  name: volumepool-sample
spec:
  providerID: OpenKCM://shared
```

### Key Fields:
- `providerID` (`string`): The `providerId` helps the controller identify and communicate with the correct storage system within the specific backened storage provider.

## Bucket

A `Bucket` in OpenKCM refers to an object storage resource that organizes and manages data, similar to the concept of buckets
in other cloud storage services. Buckets are containers for storing objects, such as files or data blobs.

### Example Bucket Resource

An example of how to define a `Bucket` resource in OpenKCM:

```yaml
apiVersion: storage.OpenKCM.dev/v1alpha1
kind: Bucket
metadata:
  name: bucket-sample
spec:
  bucketClassRef:
    name: bucketclass-sample
#  bucketPoolRef:
#    name: bucketpool-sample
```

### Key Fields:
- `bucketClassRef` (`string`):
    - Mandatory field
    - `BucketClassRef` is the `BucketClass` of a bucket

- `bucketPoolRef` (`string`):
    - Optional field
    - `bucketPoolRef` indicates which `BucketPool` to use for the `Bucket`, if not specified the controller itself picks the available `BucketPool`


### Usage
- **Data Storage**: Use `Buckets` to store and organize data blobs, files, or any object-based data.
- **Multi-Tenant Workloads**: Leverage buckets for isolated and secure data storage in multi-tenant environments by using separate BucketClass or BucketPool references.
- **Secure Access**: Buckets store a reference to the `Secret` securely in their status, and the `Secret` has the access credentials, which applications can retrieve access details from the `Secret`.

## BucketClass

A `BucketClass` is a concept used to define and manage different types of storage buckets, typically based on resource 
capabilities. It is conceptually similar to Kubernetes `StorageClass`, enabling users to specify the desired properties 
for an OpenKCM `Bucket` resource creation.

### Example BucketClass Resource

An example of how to define a `BucketClass` resource in OpenKCM:

```yaml
apiVersion: storage.OpenKCM.dev/v1alpha1
kind: BucketClass
metadata:
  name: bucketclass-sample
capabilities:
  tps: 100Mi
  iops: 100
```

### Key Fields:

- `capabilities`: Capabilities has `tps` and `iops` fields which need to be specified, it's a mandatory field,
  - `tps` (`string`): The `tps` represents transactions per second.
  - `iops` (`string`): `iops` is the number of input/output operations a storage device can complete per second.

### Usage

- **BucketClass Definition**: Create a `BucketClass` to set storage properties based on resource capabilities.
- **Associate with buckets**: Link a `BucketClass` to a `Bucket` using a reference in the Bucket resource.
- **Dynamic configuration**: Update the `BucketClass` to modify storage properties for all its Buckets.

## BucketPool

A `BucketPool` is a resource in `OpenKCM` that represents a pool of storage buckets managed collectively. It defines
the infrastructure's storage configuration used to provision and manage buckets, ensuring resource availability and 
compatibility with associated `BucketClasses`.

### Example BucketPool Resource

An example of how to define a `BucketPool` resource in OpenKCM:

```yaml
apiVersion: storage.OpenKCM.dev/v1alpha1
kind: BucketPool
metadata:
  name: bucketpool-sample
spec:
  providerID: OpenKCM://shared
```

### Key Fields:

- `ProviderID` (`string`): The `providerId` helps the controller identify and communicate with the correct storage system within the specific backened storage provider.
