# Tuya API Endpoints Reference

This document lists all Tuya API endpoints used in the Smart Door Lock system.

## Overview

The system integrates with Tuya IoT Cloud Platform using:
- **IoT Core APIs (v2.0)** - Thing Model for device control
- **Standard Instruction Set (v1.0/iot-03)** - Device status and commands
- **Smart Lock APIs** - Door lock specific operations

## Authentication

All API requests require authentication using HMAC-SHA256 signature.

### Endpoints Used:
- `POST /v1.0/token?grant_type=1` - Get access token
- `POST /v1.0/token/{refresh_token}` - Refresh access token

## Device Information & Status

### IoT Core v2.0 APIs

| Method | Endpoint | Purpose | Used In |
|--------|----------|---------|---------|
| GET | `/v1.0/iot-03/devices/{device_id}` | Get device details | `devices.controller.js` |
| GET | `/v1.0/iot-03/devices/{device_id}/status` | Get device state | `devices.controller.js` |
| GET | `/v1.0/iot-03/devices/{device_id}/specification` | Get device specification | `tuya.service.js` |
| GET | `/v1.0/iot-03/devices/{device_id}/functions` | Get device functions | `tuya.service.js` |
| POST | `/v1.0/iot-03/devices/{device_id}/commands` | Send commands to device | `tuya.service.js` |

### Standard Instruction Set v1.0

| Method | Endpoint | Purpose | Used In |
|--------|----------|---------|---------|
| GET | `/v1.0/iot-03/devices/{device_id}/status` | Get device status | `devices.controller.js` |
| GET | `/v1.0/devices/{device_id}` | Get device info (legacy) | `devices.controller.js`, `enrollment.service.js` |

## Smart Lock Operations

### Remote Unlock

| Method | Endpoint | Purpose | Used In |
|--------|----------|---------|---------|
| POST | `/v1.0/devices/{device_id}/door-lock/open-door` | Remote unlock with password | `access.controller.js`, `scheduler.service.js` |
| POST | `/v1.0/devices/{device_id}/door-lock/password-free/open-door` | Remote unlock without password | `access.controller.js`, `scheduler.service.js` |
| GET | `/v1.0/devices/{device_id}/door-lock/remote-unlocks` | Get remote unlock methods | `tuya.service.js` |

### Password Management

| Method | Endpoint | Purpose | Used In |
|--------|----------|---------|---------|
| GET | `/v1.0/devices/{device_id}/door-lock/dynamic-password` | Get dynamic password (5 min) | `access.controller.js` |
| POST | `/v1.0/devices/{device_id}/door-lock/temp-password` | Create temporary password | `access.controller.js`, `enrollment.controller.js` |
| GET | `/v1.0/devices/{device_id}/door-lock/temp-passwords` | Get temporary passwords list | `tuya.service.js` |
| DELETE | `/v1.0/devices/{device_id}/door-lock/temp-passwords/{password_id}` | Delete temporary password | `enrollment.controller.js`, `tuya-integration.service.js` |
| POST | `/v1.0/devices/{device_id}/door-lock/password-ticket` | Get password encryption ticket | `tuya.service.js` |

## User Management & Enrollments

### Unlocking Methods

| Method | Endpoint | Purpose | Used In |
|--------|----------|---------|---------|
| GET | `/v1.0/smart-lock/devices/{device_id}/opmodes` | Get unlocking methods | `tuya.service.js` |
| POST | `/v1.0/smart-lock/devices/{device_id}/opmodes/actions/sync` | Sync unlocking methods | `enrollment.controller.js`, `tuya-integration.service.js` |
| GET | `/v1.0/devices/{device_id}/door-lock/unassigned-keys` | Get unassigned unlock keys | `tuya-integration.service.js` |
| POST | `/v1.0/devices/{device_id}/door-lock/opmodes/actions/allocate` | Assign unlocking method to user | `tuya-integration.service.js` |
| PUT | `/v1.0/devices/{device_id}/door-lock/opmodes/{unlock_sn}` | Update unlock method name | `tuya.service.js` |
| DELETE | `/v1.0/devices/{device_id}/door-lock/user-types/{user_type}/users/{user_id}/unlock-types/{unlock_type}/keys/{unlock_no}` | Delete unlock method | `tuya-integration.service.js` |

### Device Users

| Method | Endpoint | Purpose | Used In |
|--------|----------|---------|---------|
| GET | `/v1.0/devices/{device_id}/users` | Get device users | `tuya.service.js` |

## Logs & Records

### Unlock Records

| Method | Endpoint | Purpose | Used In |
|--------|----------|---------|---------|
| GET | `/v1.0/devices/{device_id}/door-lock/records` | Get unlock records | `tuya-integration.service.js`, `scheduler.service.js` |
| GET | `/v1.0/devices/{device_id}/door-lock/open-logs` | Get detailed unlock logs | `tuya.service.js` |
| GET | `/v1.0/devices/{device_id}/door-lock/alarm-logs` | Get alarm logs | `tuya.service.js` |

### IoT Core Logs

| Method | Endpoint | Purpose | Used In |
|--------|----------|---------|---------|
| GET | `/v1.0/iot-03/devices/{device_id}/logs` | Get device logs | `tuya.service.js` |
| GET | `/v1.0/iot-03/devices/{device_id}/report-logs` | Get report logs | `tuya.service.js` |

## Device Control (IoT Core v2.0)

| Method | Endpoint | Purpose | Used In |
|--------|----------|---------|---------|
| GET | `/v1.0/iot-03/devices/{device_id}/properties` | Get device properties | `tuya.service.js` |
| POST | `/v1.0/iot-03/devices/{device_id}/properties` | Set device properties | `tuya.service.js` |
| POST | `/v1.0/iot-03/devices/{device_id}/properties/issue` | Issue device properties | `tuya.service.js` |
| POST | `/v1.0/iot-03/devices/{device_id}/actions` | Send device actions | `tuya.service.js` |

## Webhook

### Webhook Endpoint (Our System)

| Method | Endpoint | Purpose | Used In |
|--------|----------|---------|---------|
| POST | `/api/tuya/webhook` | Receive Tuya device events | `tuya-webhook.routes.js` |

**Webhook Events Handled:**
- `doorUnlock` / `unlock` / `door_lock_unlock` - Door unlock event
- `doorLock` / `lock` / `door_lock_lock` - Door lock event
- `alarm` / `door_lock_alarm` - Alarm event
- `enrollment` / `fingerprint_added` / `rfid_added` - Enrollment event

## Utility Methods

### Signature & Parsing

| Method | Purpose | Used In |
|--------|---------|---------|
| `verifyWebhookSignature()` | Verify webhook signature | `tuya-webhook.routes.js` |
| `parseUnlockEvent()` | Parse unlock event data | `tuya-webhook.routes.js`, `tuya-integration.service.js` |

## Endpoint Categories Summary

### By Usage Frequency

**High Frequency (Used in multiple controllers):**
- `getDeviceStatus()` - Device health checks
- `getUnlockRecords()` - Log synchronization
- `createTempPassword()` - User enrollment
- `remoteUnlock()` / `remoteUnlockNoPassword()` - Access control

**Medium Frequency (Used in specific features):**
- `getUnassignedKeys()` - Enrollment management
- `assignUnlockingMethod()` - Enrollment sync
- `syncUnlockingMethods()` - Enrollment sync
- `getDynamicPassword()` - Temporary access

**Low Frequency (Used occasionally):**
- `getDeviceInfo()` - Device information
- `getDeviceUsers()` - User management
- `deleteTempPassword()` - Cleanup
- `deleteUnlockMethod()` - Enrollment deletion

## Testing

Run the comprehensive test suite:

```bash
node scripts/test-tuya-endpoints.js
```

This will test all endpoints and provide a detailed report of:
- ✅ Working endpoints
- ❌ Failed endpoints (with error details)
- ⏭️ Skipped endpoints (safe operations like unlock)

## References

- [Tuya Smart Door Lock API](https://developer.tuya.com/en/docs/cloud/smart-door-lock?id=K9jgsgd4cgysr)
- [Tuya IoT Core API](https://developer.tuya.com/en/docs/cloud/device-connection-service?id=Kb0b8geg6o761)
- [Tuya Authentication](https://developer.tuya.com/en/docs/iot/authentication-method?id=Ka49gbaxjygox)
- [Tuya User Package](https://developer.tuya.com/en/docs/iot/authentication-user-package?id=Kdjhfzvkrkkm3)

