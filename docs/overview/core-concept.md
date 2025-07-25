# Core concepts

### Data Encryption

Using strong encryption keys

- 🛡️ Protect data at rest
- 🛡️ Protect data at store

Protecting data at rest requires encryption keys to encrypt the data and a means to securely store these keys.

Encryption keys can be stored securely in a Hardware Security Module (HSM). It is a specific piece of hardware that
provides means to prevent, detect, or respond to (physical) tampering of the device and usually contains dedicated
processors for cryptographic operations.

### Keychain (key hierarchy)

Not all encryption keys are stored directly in an HSM. Instead, encryption keys usually form a hierarchy of keys,
also called keychain, where an encryption key is wrapped (i.e. encrypted) by a higher-level encryption key.
This process is repeated along the keychain until an encryption key is wrapped by a key that is protected by an HSM.
This mechanism allows to store a small number of encryption keys in the HSM while other encryption keys along
the keychain can be stored in a regular storage as a wrapped key (i.e. encrypted).

**OpenKCM** uses a hierarchical key management architecture, which is a layered, structured approach to managing cryptographic keys.
It uses a tree-like structure where higher-level keys protect (or "wrap") lower-level keys, and only the lowest level keys are used to encrypt actual data.
We use 4 levels of encryption for data to ensure top-level security for users' data.


- **Level1 keys (L1)**: master keys managed directly by customers. These keys are used to encrypt level 2 keys and assigned to customer service. They can be managed globally.
- **Level 2 keys (L2)**: intermediate keys. L2 keys are encrypted by L1 keys and are used to encrypt the L3 keys. These are intermediate, internal tenant-specific (environment-specific) keys. ()
- **Level 3 Keys (L3)**: encrypted by L2 keys these keys are application/service specific for each tenant.
- **Level 4 Keys (L3)**: used directly for encrypting actual data (DEK). These keys are client side and are encrypted by L3 and L2 keys.


### BYOK (Bring Your OWN Key)

Our KMS uses the BYOK security model. Bring Your Own Key allows you to generate and manage your own encryption keys
outside of the service provider's infrastructure and then import those keys into the provider’s Key Management System (KMS).
You generate your encryption key externally, typically using hyperscalers like AWS or you may use an on-prem HSM to ensure full ownership.

### HYOK (Hold Your OWN Key)
To be Done.

---

## 🔧 Example Use Cases

- Encrypting customer PII stored in multi-region object storage
- Managing keys for distributed applications with BYOK
- Enforcing HYOK for data sovereignty in sensitive sectors (e.g., healthcare, finance)
- Creating revocable encryption access for SaaS tenant data
