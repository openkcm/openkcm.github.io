# Install the Registry

The Registry is the first service you install: it runs once, in the central
deployment, and every regional CMK deployment connects to it. This page installs
it with its Helm chart and checks that it works. Read
[Deployment planning](/components/cmk/deployment) first: you need to know your
CMK regions before you configure the Registry.

## Before you start

You need:

- A Kubernetes cluster for the central deployment, `kubectl`, and Helm 3.8 or
  later (for charts from OCI registries).
- A PostgreSQL database for the Registry, and a user that may create tables. The
  Registry creates and updates its tables at startup.
- An AMQP 1.0 broker, for example RabbitMQ 4, with two queues per CMK region:
  one for the tenant jobs that the Registry sends to the region's CMK, one for
  CMK's answers. The examples use `cmk.emea.tenants` and
  `cmk.emea.tenants.replies`. Create the queues before you install: the services
  do not create them.
- A client certificate for the Registry at the broker, its key, and the CA
  certificate of the broker. The broker must authenticate clients by their
  certificate (SASL `EXTERNAL`); in RabbitMQ, enable the
  `rabbitmq_auth_mechanism_ssl` plugin.

The examples use the namespace `services` and one CMK region, `emea`, and
install the central and the regional deployment in the same cluster, the
simplest setup. With separate clusters, the regional services reach the Registry
through its external address, with mutual TLS.

## Step 1: Create the Secrets

Keep every credential in a Secret. The Registry reads them as files:

```bash
kubectl -n services create secret generic registry-database \
  --from-literal=username=registry --from-literal=password='<password>' \
  --from-file=ca.crt=postgres-ca.crt
kubectl -n services create secret generic registry-broker-certs \
  --from-file=tls.crt --from-file=tls.key --from-file=ca.crt
```

`--from-literal` writes no trailing newline. Create every credential file that
way, or without a trailing newline, so that it holds exactly the value.

## Step 2: Write the values

Create `registry-values.yaml`. This example connects to PostgreSQL with TLS and
to the broker with mutual TLS, and allows only the region `emea`:

```yaml
replicaCount: 2

extraVolumes:
  - name: db-credentials
    secret: { secretName: registry-database, defaultMode: 0440 }
  - name: broker-certs
    secret: { secretName: registry-broker-certs, defaultMode: 0440 }
extraVolumeMounts:
  - { name: db-credentials, mountPath: /etc/credentials/database, readOnly: true }
  - { name: broker-certs, mountPath: /etc/credentials/broker, readOnly: true }
extraEnvs:
  - { name: PGSSLMODE, value: verify-full }
  - { name: PGSSLROOTCERT, value: /etc/credentials/database/ca.crt }

networkPolicy:
  enabled: true
  grpc:
    from:
      # Every CMK process: the tenant manager, event reconciler and others.
      - podSelector: { matchLabels: { app.kubernetes.io/part-of: cmk } }

config:
  database:
    host: postgresql.services.svc.cluster.local
    user:
      source: file
      file: { path: /etc/credentials/database/username, format: binary }
    password:
      source: file
      file: { path: /etc/credentials/database/password, format: binary }
  orbital:
    targets:
      - region: emea
        connection:
          type: amqp
          amqp:
            url: amqps://rabbitmq.services.svc.cluster.local:5671
            target: /queues/cmk.emea.tenants          # CMK tenantManager.amqp.source
            source: /queues/cmk.emea.tenants.replies  # CMK tenantManager.amqp.target
          auth:
            type: mtls
            mtls:
              certFile: /etc/credentials/broker/tls.crt
              keyFile: /etc/credentials/broker/tls.key
              caFile: /etc/credentials/broker/ca.crt
  # This list replaces the chart's default validations (Helm replaces lists), so it
  # repeats the four default rules and adds Tenant.Region.
  validations:
    - id: Auth.Type
      constraints: [{ type: list, spec: { allowList: ["oidc"] } }]
    - id: Auth.Properties
      constraints:
        - type: map-keys
          spec:
            keys: [{ name: issuer, required: true, constraints: [{ type: non-empty }] }]
    - id: Tenant.UserGroups
      constraints:
        - type: regex
          spec: { pattern: "^KMS_(TenantAdministrator|TenantAuditor)_[A-Za-z0-9-]+$" }
    - id: System.Type
      constraints: [{ type: list, spec: { allowList: ["system", "subaccount"] } }]
    - id: Tenant.Region
      constraints: [{ type: list, spec: { allowList: ["emea"] } }]
```

Adjust it to your setup:

- **One `orbital.targets` entry per CMK region, with its own pair of queues.**
  Its `target` is the address the Registry sends to; it must equal the `source`
  of that region's CMK tenant manager, and the other way round. The Registry
  connects to every target at startup and does not start if one cannot be
  reached.
- **`Tenant.Region`** lists the regions that tenants may be registered with.
- **The network policy** allows the gRPC API only from CMK. Add every other
  caller: the CMK-2-Krypton Bridge, your tenant onboarding tooling and the
  cloud services that register systems. Callers in other clusters cannot be
  selected with pod selectors; allow them with your service mesh's
  authorization policies, and use mutual TLS between the clusters.

The chart's [values.yaml][values] documents every setting with examples, and
the [Registry configuration reference](/components/cmk/security/registry-config)
explains each section.

## Step 3: Install the chart

```bash
helm upgrade --install registry oci://ghcr.io/openkcm/charts/registry \
  --version 1.4.0 --namespace services -f registry-values.yaml
```

The image tag defaults to the Registry version that the chart release was made
for; set `image.tag` only to deploy another version. The release notes list
warnings for settings that are not production-ready, for example a disabled
network policy or a plain-text broker connection.

## Step 4: Check the installation

```bash
kubectl -n services get pods -l app.kubernetes.io/name=registry
kubectl -n services port-forward service/registry 8888:http-status
curl -s http://localhost:8888/probe/readiness
```

The pods become ready when the Registry reaches its database and its gRPC
health service answers. If a pod restarts, its log names the cause:

| Log message | Cause |
| --- | --- |
| `has invalid keys` | A key under `config` is not a Registry setting |
| `… must be greater than zero` | A required `config.orbital` value is missing |
| An AMQP or certificate error | A broker in `orbital.targets` cannot be reached, or the client certificate files are missing or invalid |

## Next steps

1. [Install a regional deployment](/components/cmk/security/configuration) for
   each CMK region, with the CMK tenant manager on the addresses of the
   region's `orbital.targets` entry.
1. [Register the first tenant](/components/cmk/tenant-integration) with one of
   these regions.

## See also

- [Registry](/components/cmk/registry): what the Registry holds and does
- [Registry configuration reference](/components/cmk/security/registry-config)
- The chart's [README][readme], with upgrade notes and troubleshooting

[values]: https://github.com/openkcm/registry/blob/main/charts/registry/values.yaml
[readme]: https://github.com/openkcm/registry/blob/main/charts/registry/README.md
