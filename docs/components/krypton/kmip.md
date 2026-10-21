# KMIP

Workloads get their keys from Krypton over KMIP, the OASIS Key Management
Interoperability Protocol. The root node runs an optional KMIP server that
returns the key material of active keys to clients that prove, with their
certificate, that they belong to the key's tenant.

::: info Keys need key material
KMIP returns key material, which Krypton creates when a key is activated. The
processing of activations is not implemented yet (see
[Key lifecycle](/components/krypton/key-lifecycle#activate-a-key)), so there are
no keys to fetch in a deployment of the current version yet.
:::

## Enable the KMIP server

Add `kmip` to the root node's configuration:

```yaml
kmip:
  bind_addr: 0.0.0.0
  port: 5696
  tls:
    cert_path: /etc/krypton/kmip/tls.crt   # certificate of the KMIP server
    key_path: /etc/krypton/kmip/tls.key
    ca_path: /etc/krypton/kmip/ca.crt      # CA of the client certificates
```

`port` is required; 5696 is the port registered for KMIP. Mount the files from a
Secret and publish the port, as the
[Helm chart](https://github.com/openkcm/krypton/tree/main/charts/root) shows in
its values (`ports`, `service.ports`, `extraVolumes`). Restrict the clients with
the chart's `networkPolicy.kmip.from`.

## Connect

The server requires TLS 1.3 and a client certificate signed by the CA of
`tls.ca_path`. It speaks KMIP 1.0 to 1.4 over TCP.

The client certificate's subject common name (CN) must be the ID of the tenant
whose keys the client reads. Issue each workload a certificate with the ID of its
tenant as common name, from a CA that you use only for KMIP clients.

## Operations

| Operation | Result |
| --- | --- |
| `Get` | The key material as a symmetric key: raw format, AES, 256 bits |
| `GetAttributes` | `State` (active), `CryptographicAlgorithm` (AES), `CryptographicLength` (256), `ObjectType` (symmetric key). Other requested attributes are left out |

Other operations are answered with `OperationNotSupported`.

A key is addressed by its unique identifier:

```
<tenant ID>:<key ID>:<version>
```

Version `0` means the latest usable version of the key. Krypton returns:

| Case | Result |
| --- | --- |
| The common name of the client certificate is not the tenant ID | `PermissionDenied` |
| The key is not `active` | `PermissionDenied`, key not active |
| The key or version does not exist | `ItemNotFound` |

The material exists in the server's memory only while the connection is open;
Krypton overwrites it when the connection closes.

## See also

- [Security](/components/krypton/security)
- [Configuration reference](/components/krypton/configuration#kmip)
- [OASIS KMIP specifications](https://www.oasis-open.org/committees/tc_home.php?wg_abbrev=kmip)
