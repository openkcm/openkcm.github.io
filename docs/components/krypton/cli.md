# The kr CLI

`kr` is the command-line client of the Krypton root node. It manages tenants and
keys through the root node's [gRPC API](/components/krypton/api), with or
without mutual TLS.

## Install

Build it from the [Krypton repository](https://github.com/openkcm/krypton). The
target builds `kr` with `GOEXPERIMENT=runtimesecret` and moves it to
`$(go env GOPATH)/bin`:

```sh
make cli
```

## Connect and sign in

Every command takes the address of the root node with `--server`
(default `localhost:8080`). Sign in once; `kr` keeps the credentials for the
following commands.

| Command | Use |
| --- | --- |
| `kr login no-auth` | Plaintext connection, for a root node without `auth` (development) |
| `kr login mtls --cert <file> --key <file> --ca <file>` | Mutual TLS with a client certificate whose URI is listed in the root node's `auth.identity`. `kr` checks that the certificate is signed by the CA and is valid for client authentication, and stores the file paths, not the files |

With mutual TLS, `kr` checks the certificate again before every command and
connects with TLS 1.3, trusting only the given CA.

`kr` keeps its state in `~/.krypton`:

| File | Content |
| --- | --- |
| `token.json` | How to sign in: no authentication, or the paths of the certificate files (mode 0600) |
| `state.lock` | The selected tenant |

To sign out, delete `~/.krypton/token.json`.

## Tenants

| Command | Purpose |
| --- | --- |
| `kr create tenant --name <name> [--label key=value]…` | Create a tenant. Krypton assigns its ID |
| `kr get tenants` | List all tenants |
| `kr get tenant <id>` | Show one tenant |
| `kr select tenant <id>` | Select the tenant for the key commands. `-i` chooses it from a list |

## Keys

The key commands work on the selected tenant. Commands with `--tenant-id` can
also name another tenant.

| Command | Purpose |
| --- | --- |
| `kr announce key --kind <kind> --name <name> [--parent <id>] [--target-name <agent>] [--label key=value]…` | Announce a key. Omit `--parent` for a key of the `root` kind; `--target-name` names the agent that manages the key (default: the root node) |
| `kr activate key --key-id <id> [--tenant-id <id>]` | Activate a key. Prints the status `true` when the request was accepted |
| `kr get key --key-id <id> [--tenant-id <id>]` | Show a key with its lifecycle state and processing status |
| `kr get parent-keys --key-id <id> [--tenant-id <id>]` | Show the chain from the root key down to the key |
| `kr get descendant-keys --key-id <id> [--tenant-id <id>]` | Show the key and all keys below it, layer by layer |
| `kr get keys [filters]` | List keys, see below |

`kr get keys` takes these filters:

| Flag | Filter |
| --- | --- |
| `--tenant-id <id>` | Another tenant than the selected one |
| `--name <text>` | Name contains the text, ignoring case |
| `--kind <kind>` | Kind, for example `K2` |
| `--lifecycle-state <state>` | Lifecycle state, for example `active` |
| `--managed-by <node>` | `root` or an agent's name |
| `--labels key=value` | Keys that have all these labels |
| `--order asc` | Oldest first (default: newest first) |
| `--limit <n>` and `--cursor <cursor>` | Page through the results. The server returns at most 50 keys per page when no limit is given |

## Actions

| Command | Purpose |
| --- | --- |
| `kr action status --action-id <id> [--target-info]` | Show the status of an action. `--target-info` also shows the key it concerns |

## Output

All commands except `select tenant` print a table, or JSON with `--json`.

## See also

- [Getting started](/components/krypton/getting-started): a walkthrough with
  these commands
- [gRPC API](/components/krypton/api)
- [Key lifecycle](/components/krypton/key-lifecycle)
