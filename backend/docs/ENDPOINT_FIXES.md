# Tuya Endpoint Fixes Based on Official Documentation

## Summary of Fixes

All endpoints have been updated to match the official Tuya documentation.

## Fixed Endpoints

### 1. syncUnlockingMethods()
**Issue:** Wrong path and missing required parameter  
**Fix:**
- Changed path from `/v1.0/devices/...` to `/v1.0/smart-lock/devices/.../opmodes/actions/sync`
- Added required `codes` parameter in request body
- Reference: https://developer.tuya.com/en/docs/archived-documents/ff17c723f4?id=Kau1o148h0ykl

**Usage:**
```javascript
await tuyaService.syncUnlockingMethods("unlock_fingerprint,unlock_card,unlock_password");
```

### 2. assignUnlockingMethod()
**Issue:** Wrong parameter names in request body  
**Fix:**
- Changed `unlock_mode_list` to `unlock_list`
- Changed `unlock_type`/`unlock_id` to `dp_code`/`unlock_sn`
- Added mapping for unlock types to dp_codes
- Reference: https://developer.tuya.com/en/docs/archived-documents/d5fd527f7f?id=Kb07l1tsrjoyj

**Usage:**
```javascript
await tuyaService.assignUnlockingMethod(userId, "fingerprint", unlockSn);
```

### 3. getUnlockingMethods()
**Issue:** Wrong path (1108 error)  
**Fix:**
- Path is correct: `/v1.0/devices/{device_id}/door-lock/opmodes`
- Reference: https://developer.tuya.com/en/docs/archived-documents/95a5538619?id=Kb07l1klyhys2

### 4. createTempPassword()
**Issue:** Parameter validation and formatting  
**Fix:**
- Added parameter validation
- Ensured all required fields are present
- Proper timestamp handling
- Reference: https://developer.tuya.com/en/docs/archived-documents/6fcd8256c2?id=Katuf6m81zmz2

### 5. getTempPasswords()
**Issue:** Missing query parameter support  
**Fix:**
- Added support for `valid` query parameter (Boolean)
- Reference: https://developer.tuya.com/en/docs/archived-documents/6fcd8256c2?id=Katuf6m81zmz2

**Usage:**
```javascript
await tuyaService.getTempPasswords({ valid: true });
```

### 6. Log Endpoints (1104 Signature Errors Fixed)

All log endpoints now use proper URL encoding for query parameters:

#### getUnlockRecords()
- Reference: https://developer.tuya.com/en/docs/archived-documents/b4b28d67c0?id=Katuf23ipl5ii
- Query parameters: `offset`, `limit`, `start_time`, `end_time`

#### getOpenLogs()
- Reference: https://developer.tuya.com/en/docs/archived-documents/837c818f18?id=Katuevseqfpdg
- Query parameters: `offset`, `limit`

#### getAlarmLogs()
- Reference: https://developer.tuya.com/en/docs/cloud/bdc1e6f858?id=Kcp2l3tqdozts
- Query parameters: `offset`, `limit`

#### getDeviceLogs()
- References:
  - https://developer.tuya.com/en/docs/cloud/f06dc21023?id=Kcp2l1a9zj0i3
  - https://developer.tuya.com/en/docs/cloud/269c6a6b6b?id=Kduvi4xnjhav2
- Query parameters: `start_time`, `end_time`, `size`, `last_row_key`

#### getReportLogs()
- References:
  - https://developer.tuya.com/en/docs/cloud/f06dc21023?id=Kcp2l1a9zj0i3
  - https://developer.tuya.com/en/docs/cloud/269c6a6b6b?id=Kduvi4xnjhav2
- Query parameters: `start_time`, `end_time`, `codes`, `size`, `last_row_key`

## Key Changes

1. **Query Parameter Encoding**: All query parameters now use `encodeURIComponent()` to ensure proper URL encoding
2. **Path Corrections**: Updated paths to match official documentation
3. **Parameter Names**: Fixed parameter names to match API requirements
4. **Request Body Structure**: Updated request bodies to match documentation format

## Testing

Run the comprehensive test suite:
```bash
npm run test:tuya
```

With debug mode:
```bash
$env:DEBUG_SIGNATURE="true"; npm run test:tuya
```

## Remaining Device-Specific Errors

These errors indicate the device doesn't support the feature (not fixable in code):
- `getDynamicPassword()` - Error 2009: Device doesn't support dynamic passwords
- `getRemoteUnlockMethods()` - Error 2329: Device-specific exception

## References

All endpoints now reference official Tuya documentation:
- Archived Documents: https://developer.tuya.com/en/docs/archived-documents
- Cloud Development: https://developer.tuya.com/en/docs/cloud

