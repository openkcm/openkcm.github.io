# Getting started with Krypton

Run a Krypton root node and an agent on your machine, create a tenant with the
`kr` CLI, and announce a key hierarchy whose lower part an agent manages. The
setup uses the example configuration of the repository and keeps all key
material in memory, so it is for trying Krypton out, not for real keys.

## Prerequisites

- Go (the version in the repository's `go.mod`), Docker, `make` and `openssl`.
- A clone of [openkcm/krypton](https://github.com/openkcm/krypton).
- Free ports: 5432 (PostgreSQL), 8080 (root node) and 8081 (agent).

Building Krypton requires the Go experiment `runtimesecret`. The Makefile sets
`GOEXPERIMENT=runtimesecret`; set it yourself when you run `go` directly.

## Start the root node and an agent

The configuration `examples/root.config.yaml` defines a hierarchy of four kinds
(`K0` root, `K1` key encryption key, `K2` transfer key, `K3` data encryption
key). The root node manages `K0` and `K1`; the agent `agent-k1` manages `K2`
and `K3`.

1. Start PostgreSQL in Docker and the root node. `make dev` creates a container
   `krypton-postgres` with the databases `krypton` and `krypton_agent`, and
   starts the root node on port 8080 with a new random root key:

   ```sh
   make dev
   ```

   The root node logs `gRPC server listening on :8080`.

2. In a second terminal, start the agent. It registers with the root node and
   listens on port 8081:

   ```sh
   make agent
   ```

   The agent logs `Registering agent agent-k1 with ID …` and
   `agent key service listening on :8081`.

3. In a third terminal, build the CLI into `$(go env GOPATH)/bin` and sign in
   without authentication, which the example configuration allows:

   ```sh
   make cli
   kr login no-auth
   ```

## Create a tenant

```sh
kr create tenant --name acme --label env=dev
```

```
ID                                    Name  Labels   CreatedAt                  UpdatedAt
5789600f-da4f-411d-b479-5401db613c7c  acme  env=dev  2026-10-21T18:48:51+02:00  2026-10-21T18:48:51+02:00
```

Select the tenant. The key commands then work on it:

```sh
kr select tenant 5789600f-da4f-411d-b479-5401db613c7c
```

## Announce a key hierarchy

Announce the tenant's root key (kind `K0`), then a key encryption key (`K1`)
below it. Both are managed by the root node:

```sh
kr announce key --kind K0 --name acme-root
kr announce key --kind K1 --name acme-kek --parent <ID of acme-root>
```

```
ID                                    Kind  Name       ParentID  ManagedBy  Labels  Status   JobID
d1eefbf2-a55e-4926-a3fb-8b2776eb8824  K0    acme-root            root               pending
```

Announce a transfer key (`K2`) for the agent. `--target-name` names the agent
that manages it:

```sh
kr announce key --kind K2 --name acme-tek --parent <ID of acme-kek> \
  --target-name agent-k1 --label cloud=aws
```

The root node records the key and sends the tenant and the key to the agent in
the background. When the agent has stored them, the key's status changes from
`pending` to `completed`:

```sh
kr get keys
```

```
Kind  ID                                    Name       ParentID                              LifeCycleState  Status     ManagedBy  …
K2    dc5be2d6-eaff-4ddc-a1ec-8de50e7293ae  acme-tek   2e045770-af8c-40dc-9c06-5fe26c51a22b  pre-activation  completed  agent-k1   …
K1    2e045770-af8c-40dc-9c06-5fe26c51a22b  acme-kek   d1eefbf2-a55e-4926-a3fb-8b2776eb8824  pre-activation  completed  root       …
K0    d1eefbf2-a55e-4926-a3fb-8b2776eb8824  acme-root                                        pre-activation  completed  root       …
```

Walk the hierarchy from the root key down, or from a key up:

```sh
kr get descendant-keys --key-id <ID of acme-root>
kr get parent-keys --key-id <ID of acme-tek>
```

## Activate a key

```sh
kr activate key --key-id <ID of acme-root>
kr get key --key-id <ID of acme-root>
```

The key moves to `active` with the status `pending`. The processing of
activations, which creates the key material, is not implemented yet, so the key
stays `pending`, and activating `acme-kek` is refused until its parent is
`completed`. See [Key lifecycle](/components/krypton/key-lifecycle#activate-a-key).

## Clean up

Stop the agent and the root node with `Ctrl+C`; the agent deregisters from the
root node. Then remove the database container:

```sh
make postgres-stop
```

`make dev` creates a new root key each time, and the example vaults keep key
material in memory only: nothing survives a restart.

## What's next

- [Concepts](/components/krypton/concepts): what the hierarchy, segments and key
  bindings of `examples/root.config.yaml` mean.
- [The kr CLI](/components/krypton/cli): all commands.
- [Install the root node](/components/krypton/install) in Kubernetes.
