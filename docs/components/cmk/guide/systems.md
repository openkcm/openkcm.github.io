# Systems

A system is a part of your cloud service that encrypts your data, for example a
database or a storage service of your tenant in one region. You connect each
system to a key configuration; the system then uses that configuration's
primary key, and CMK informs it of every change.

## Where systems come from

You do not create systems in CMK. When your provider creates a service for your
tenant, the service registers itself, and it appears under **Systems**
automatically. Systems that are removed from the service disappear from CMK in
the same way.

Each system is shown with its name, identifier, type and region, and the key
configuration it uses.

## System states

| State | Meaning |
| --- | --- |
| `DISCONNECTED` | The system is not connected to a key configuration |
| `PROCESSING` | CMK has asked the system to connect, disconnect or change keys and waits for its answer |
| `CONNECTED` | The system uses the primary key of its key configuration |
| `FAILED` | The system could not carry out the last change. The system's details show an error code and message |

## Connect a system

The key configuration must have an enabled primary key.

1. Go to **Systems**, or to **Connected Systems** in the key configuration.
1. Select **Connect** on the system and choose the key configuration.
1. If your tenant requires approvals, select **Send for Approval**; the system
   is connected after the approval. See [Approvals](/components/cmk/guide/approvals).

The system goes to **Processing**. CMK sends the key to the system in its
region; when the system confirms, it becomes **Connected**.

Through the API:

```http
PATCH /cmk/v1/acme/systems/<system ID>/link
Content-Type: application/merge-patch+json

{ "keyConfigurationID": "<key configuration ID>" }
```

## Disconnect a system

Select **Disconnect** on the system. The system stops using the key and becomes
**Disconnected** once it confirms. If your tenant requires approvals, this goes
through an approval first.

## Move a system to another key configuration

A system is moved when you link it to a different key configuration, through
the API (`PATCH .../systems/<system ID>/link` with the new configuration) or
through an approval request. The system is switched to the primary key of the
new configuration.

Systems also switch keys when you change the
[primary key](/components/cmk/guide/key-configurations#add-keys-and-choose-the-primary-key)
of their key configuration.

## When a change fails

If a system cannot carry out a change, it goes to **Failed**, and its details
show the error. A system that does not answer at all is marked failed after
about one day of retries.

On the system's details page:

- **Retry** sends the last change to the system again, for example after the
  service fixed the problem. Retry is offered to the key administrators of the
  key configuration concerned.
- **Cancel** abandons the change and restores the previous state.

## Find systems

Filter the list by **Region**, **Type** and **Key Configuration**, or search by
name, identifier or region. Through the API, `GET .../systems` supports
`$filter` on `keyConfigurationID`, `region`, `type` and `status`, and `$search`.

## Troubleshooting

| You see | What to do |
| --- | --- |
| A system you expect is missing | The service has not registered it for your tenant yet. Ask your provider |
| **Connect** is not possible | The key configuration has no enabled primary key, the system is already processing a change, or the system limit is reached |
| `ACTION_REQUIRE_WORKFLOW` | Your tenant requires approval for this change. Send it for approval |
| A system is **Failed** with `UNCONFIGURED_REGION` or `UNSUPPORTED_REGION` | The region of the system is not set up for your key. Ask your provider |
| A system stays **Processing** for a long time | The system has not answered yet. CMK keeps retrying; contact your provider if it lasts more than a few hours |

## See also

- [Key configurations](/components/cmk/guide/key-configurations)
- [Approvals](/components/cmk/guide/approvals)
- [Connect a regional system](/components/cmk/system-integration): for the teams
  who build the services
