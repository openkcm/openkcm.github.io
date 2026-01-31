# Core Concepts

OpenKCM is designed around a single, non-negotiable principle: **Separation of Duties.**
To guarantee sovereignty in the cloud, we architecturally separate the **Ownership of Keys** (Governance) from the **Usage of Keys** (Execution).

This page defines the core cryptographic structures that make this separation possible.

## The Recursive Trust Hierarchy (L1 → L4)

In a Sovereign Cloud, trust cannot be flat. If a single key protects everything, you cannot revoke access granularly. OpenKCM utilizes a **4-Layer Recursive Envelope** architecture.

This hierarchy ensures that "Access to Data" (L4) is mathematically impossible without the active permission of the "Root" (L1).

### The Layers Defined

| Layer | Name | Scope | Ownership | Storage & Location |
| :--- | :--- | :--- | :--- | :--- |
| **L1** | **Hardware Root** | **Global** | **Customer (External)** | Resides in your **External KMS** (AWS, Azure, HSM). OpenKCM never sees this key; we only hold a *reference* to it. Revoking this key triggers a global "Kill Switch." |
| **L2** | **Tenant Root** | **Tenant** | **OpenKCM Core** | The "Sovereign Link." Encrypted by your L1. It is loaded into the **Regional Core's Secure Memory** only when the tenant is active. It isolates Tenant A from Tenant B. |
| **L3** | **Service Key** | **Service** | **OpenKCM Core** | The "Workhorse." Specific to a logical domain (e.g., "Payments," "Audit"). It stays locked inside the **Regional Core** and is used to wrap/unwrap millions of data keys. |
| **L4** | **Data Key (DEK)** | **Record** | **Gateway / App** | The "Payload." Generated locally by the **Gateway** for high-speed encryption. It is stored alongside your data, wrapped (encrypted) by the L3. |

## Customer Managed Key: Ownership Models

OpenKCM CMK(Customer Managed Key) supports two distinct models for asserting sovereignty, depending on your regulatory requirements.

### BYOK (Bring Your Own Key) -> "Link Your Own Key"
We redefine "Bring Your Own Key" to mean **"Link Your Own Key."** You do not upload key material to us; you simply authorize us to use it remotely.

* **Mechanism:** You generate an L1 Key in your trusted cloud provider (e.g., AWS KMS, Azure Key Vault, GCP KMS).
* **The Handshake:** You grant the OpenKCM Service Account permission to call `kms:Decrypt`.
* **The Control:** You retain full lifecycle control. If you disable the key in your AWS Console, OpenKCM immediately loses the ability to unwrap the L2, rendering all downstream data unreadable.

### HYOK (Hold Your Own Key) -> "The Anchor"
For ultra-sensitive workloads (Banking, Defense, Healthcare), trusting a public cloud KMS may not be enough. HYOK anchors the trust chain in a physical device you control.

* **Mechanism:** The L1 Root is generated on a physical **Hardware Security Module (HSM)** (e.g., Thales Luna, Entrust nShield) located in your private data center or colocation facility.
* **The Anchor:** OpenKCM must make a network call to your on-premise HSM to boot the tenant.
* **The Guarantee:** Even if a subpoena or compromise affects the cloud provider, they physically cannot decrypt your data without network access to your private hardware.

## Crypto:  The Split-Execution Model

To achieve **Sovereignty at Scale**, OpenKCM splits the cryptographic workload into two physical planes.

* **The Core (The Vault):**
    * **Role:** Holds the **L2/L3 Keys**.
    * **Priority:** Security. It is the only component allowed to "Unseal" data.
* **The Gateway (The Factory):**
    * **Role:** Manages the **L4 Keys**.
    * **Priority:** Speed. It runs next to your apps, handling millions of operations per second by caching *encrypted* blobs, but it must ask the Core to open them.

---

## 🔧 Strategic Use Cases

* **Sovereign SaaS:** A B2B software vendor uses OpenKCM to let their enterprise customers "Link" their own corporate AWS Keys to the SaaS platform, guaranteeing that the customer can "unplug" their data if they leave.
* **Geo-Fenced Compliance:** Using distinct **L3 Service Keys** for different regions (e.g., `L3_EU_Germany` vs `L3_US_East`) ensures that a legal order in the US cannot technically decrypt data stored in Europe.
* **Crypto-Shredding:** To comply with "Right to Be Forgotten" (GDPR), an application deletes the specific **L4 Key** for a single user ID, rendering that user's history permanently unrecoverable without scrubbing backups.