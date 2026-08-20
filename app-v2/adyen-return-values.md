# Adyen Return Values — EasyOB Test Run (2026-08-19)

All values below are real, from the completed end-to-end test onboarding of
application `prospect_1787098151325` ("bob") on aioeasyob.vercel.app (Adyen test env).

## 1. Returned when the customer submits the application form

`createLegalEntityAndGetOnboardingUrl()` returns:

```json
{
  "legalEntityId": "LE329CL22322825PTL7572T4V",
  "accountHolderId": "AH32CSG22322CC5PTL757CL9Q",
  "balanceAccountId": "BA32CL822322CC5PTL758FVZ5",
  "businessLineId": "SE329CL22322825PTL7582T7G",
  "onboardingUrl": "https://balanceplatform-test.adyen.com/balanceplatform/uo/form/… (single-use, expires ~4 min)"
}
```

## 2. Returned by the webhook after the customer completes hosted onboarding

Adyen POSTs `balancePlatform.accountHolder.updated` events to
`/api/adyen/webhook` (HMAC-signed). The `data.accountHolder` payload after this
test's KYC completed:

```json
{
  "balancePlatform": "AIOAPPINC",
  "description": "bob",
  "legalEntityId": "LE329CL22322825PTL7572T4V",
  "reference": "prospect_1787098151325",
  "timeZone": "America/Los_Angeles",
  "id": "AH32CSG22322CC5PTL757CL9Q",
  "primaryBalanceAccount": "BA32CL822322CC5PTL758FVZ5",
  "status": "active",
  "capabilities": {
    "receiveFromPlatformPayments": { "enabled": true, "requested": true, "allowed": true, "verificationStatus": "valid" },
    "receiveFromBalanceAccount":   { "enabled": true, "requested": true, "allowed": true, "verificationStatus": "valid" },
    "sendToBalanceAccount":        { "enabled": true, "requested": true, "allowed": true, "verificationStatus": "valid" },
    "receivePayments":             { "enabled": true, "requested": true, "allowed": true, "verificationStatus": "valid" },
    "receiveFromTransferInstrument": {
      "enabled": true, "requested": true, "allowed": true, "verificationStatus": "valid",
      "transferInstruments": [ { "id": "SE3295W22322825PTL7ZR7HCH", "enabled": true, "requested": true, "allowed": true, "verificationStatus": "valid" } ]
    },
    "sendToTransferInstrument": {
      "enabled": true, "requested": true, "allowed": true, "verificationStatus": "valid",
      "transferInstruments": [ { "id": "SE3295W22322825PTL7ZR7HCH", "enabled": true, "requested": true, "allowed": true, "verificationStatus": "valid" } ]
    }
  }
}
```

The fields the app consumes:

| Field | Value | Used for |
|---|---|---|
| `data.accountHolder.legalEntityId` | `LE329CL22322825PTL7572T4V` | Look up the application row (`adyen_ids->>'legalEntityId'`) |
| `data.accountHolder.reference` | `prospect_1787098151325` | Starts as the app id; later PATCHed to the AIO **tenant number** |
| `capabilities.receiveFromPlatformPayments.allowed` | `true` | Stage → `adyen_approved` |
| `capabilities.…verificationStatus` | `valid` / `rejected` / pending | `adyen_kyc_complete` / `closed_lost` / no change |

Result in this run: the webhook auto-advanced the deal
`adyen_kyc_pending → adyen_approved` at 17:35:44 UTC. 58 webhook deliveries
received, all HMAC-verified, all acknowledged with `202 {"status":"received"}`.

## 3. Not yet set (tenant-linkage step, pending)

```json
{ "tenantNumber": null, "storeId": null, "merchantAccountId": null }
```

These are populated by the tenant-number assignment step: it PATCHes the
account-holder `reference` to the tenant number and creates the
`prod-{tenant}` store under the shared POS merchant account.
