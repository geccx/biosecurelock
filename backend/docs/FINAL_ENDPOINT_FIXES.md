# Final Tuya Endpoint Fixes

## Summary

All endpoints have been updated based on official Tuya documentation and sample requests.

## Critical Fixes

### 1. createTempPassword()
**Issue:** Parameter format didn't match API requirements (1109 error)

**Fixed:**
- Updated to match sample request format from documentation
- Supports `password_type: "ticket"` (with `ticket_id`) for encrypted passwords
- Supports `password_type: "period"` or `"once"` for plain passwords
- Proper field names: `effective_time`, `invalid_time` (not `startTime`, `endTime`)
- Reference: https://developer.tuya.com/en/docs/archived-documents/6fcd8256c2?id=Katuf6m81zmz2

**Sample Request Body:**
```json
{
  "password": "956FAD7****09C68E168B77",
  "password_type": "ticket",
  "ticket_id": "****",
  "effective_time": 1579156726,
  "invalid_time": 1579243126,
  "name": "test",
  "phone": 11233213,
  "time_zone": "",
  "schedule_list": [...]
}
```

### 2. getUnlockingMethods()
**Issue:** Wrong endpoint path (1108 error)

**Fixed:**
- Changed from `/v1.0/devices/{device_id}/door-lock/opmodes`
- To: `/v1.0/smart-lock/devices/{device_id}/opmodes/{user_id}`
- Now requires `userId` parameter
- Requires query parameters: `codes`, `unlock_name`, `page_no`, `page_size`
- Reference: https://developer.tuya.com/en/docs/archived-documents/c3455ca455?id=Kbaif4lf8a2oo

**Usage:**
```javascript
await tuyaService.getUnlockingMethods(userId, {
  codes: "unlock_fingerprint,unlock_password,unlock_card",
  unlock_name: "",
  page_no: 1,
  page_size: 20,
});
```

### 3. getRemoteUnlockMethods()
**Issue:** No endpoint exists (2329 error)

**Fixed:**
- Replaced with alternative approach using `getDeviceFunctions()`
- Checks device functions for unlock-related capabilities
- Returns supported methods based on available device functions
- Falls back to assuming support if device functions unavailable

### 4. Log Endpoints (1104 Signature Errors)

**Fixed:**
- Query parameters now sorted alphabetically for consistency
- Proper URL encoding using `encodeURIComponent()`
- Parameters converted to strings before encoding
- Query string built manually (not using URLSearchParams)

**Updated Endpoints:**
- `getUnlockRecords()` - https://developer.tuya.com/en/docs/archived-documents/b4b28d67c0?id=Katuf23ipl5ii
- `getOpenLogs()` - https://developer.tuya.com/en/docs/archived-documents/837c818f18?id=Katuevseqfpdg
- `getAlarmLogs()` - https://developer.tuya.com/en/docs/cloud/bdc1e6f858?id=Kcp2l3tqdozts
- `getDeviceLogs()` - https://developer.tuya.com/en/docs/cloud/f06dc21023?id=Kcp2l1a9zj0i3
- `getReportLogs()` - https://developer.tuya.com/en/docs/cloud/f06dc21023?id=Kcp2l1a9zj0i3

## Query Parameter Handling

All log endpoints now:
1. Build query object with string values
2. Sort keys alphabetically
3. Encode values with `encodeURIComponent()`
4. Join with `&` separator
5. Include in path for signature calculation

This ensures the signature matches exactly what's sent in the request.

## Testing

Run with debug mode to see signature details:
```bash
$env:DEBUG_SIGNATURE="true"; npm run test:tuya
```

## Remaining Issues

If log endpoints still return 1104 errors:
1. Enable debug mode to see exact signature being calculated
2. Compare with Tuya's expected signature format
3. Check if query parameters need to be in a specific order (currently sorted alphabetically)
4. Verify if empty/null parameters need special handling

## Updated Method Signatures

- `getUnlockingMethods(userId, params)` - Now requires userId
- `createTempPassword(passwordData)` - Updated parameter structure
- `getRemoteUnlockMethods()` - Returns device capability info instead of API call

