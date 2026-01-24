# Tuya Endpoints Testing Guide

## Quick Start

Run the comprehensive Tuya endpoints test suite:

```bash
# From backend directory
npm run test:tuya

# Or directly
node scripts/test-tuya-endpoints.js
```

## What Gets Tested

The test script validates all Tuya API endpoints used in the Smart Door Lock system:

### 1. Authentication & Token Management
- ✅ Connection test
- ✅ Token retrieval
- ✅ Token refresh

### 2. Device Information & Status
- ✅ Device details (IoT Core v2.0)
- ✅ Device state
- ✅ Device status (Standard v1.0)
- ✅ Device info (Legacy)
- ✅ Device specification
- ✅ Device functions
- ✅ Device model

### 3. Smart Lock Operations
- ✅ Dynamic password generation
- ✅ Remote unlock methods
- ⏭️ Remote unlock (skipped - would unlock door)
- ✅ Password ticket
- ✅ Create temporary password
- ✅ Delete temporary password
- ✅ Get temporary passwords list

### 4. User Management & Enrollments
- ✅ Get unlocking methods
- ✅ Sync unlocking methods
- ✅ Get unassigned keys
- ✅ Get device users
- ⏭️ Assign/delete unlock methods (requires valid IDs)

### 5. Logs & Records
- ✅ Get unlock records
- ✅ Get open logs
- ✅ Get alarm logs
- ✅ Get device logs (IoT Core)
- ✅ Get report logs (IoT Core)

### 6. Device Control
- ✅ Get device properties
- ⏭️ Set/issue properties (skipped - would modify device)
- ⏭️ Send commands (skipped - would modify device)

### 7. Webhook Utilities
- ✅ Webhook signature verification
- ✅ Parse unlock event

## Test Output

The script provides:
- ✅ **Pass** - Endpoint working correctly
- ❌ **Fail** - Endpoint failed (with error details)
- ⏭️ **Skip** - Endpoint skipped (safe operations or requires valid data)

### Example Output

```
================================================================================
  Test Summary
================================================================================
Total Tests: 45
  ✅ Passed:  38
  ❌ Failed:  2
  ⏭️  Skipped: 5
  📊 Pass Rate: 84.4%
```

## Troubleshooting

### Common Issues

1. **"sign invalid" Error**
   - Check `TUYA_CLIENT_ID` and `TUYA_CLIENT_SECRET` are correct
   - Verify data center endpoint matches your project region
   - Ensure system clock is synchronized

2. **"Device not found" Error**
   - Verify `TUYA_DEVICE_ID` is correct
   - Check device is linked to your Tuya project
   - Ensure device is online

3. **"API not subscribed" Error**
   - Go to Tuya IoT Platform > Cloud > API Explorer
   - Subscribe to required APIs:
     - Smart Lock APIs
     - IoT Core APIs
     - Device Management APIs

4. **Token Expired**
   - The script automatically refreshes tokens
   - If persistent, check credentials are valid

### Required Environment Variables

```env
TUYA_CLIENT_ID=your_client_id
TUYA_CLIENT_SECRET=your_client_secret
TUYA_DEVICE_ID=your_device_id (optional for basic tests)
TUYA_API_ENDPOINT=https://openapi-sg.iotbing.com (optional, defaults to Singapore)
```

## Safe vs Unsafe Operations

The test script automatically skips operations that would:
- **Unlock the door** (`remoteUnlock`, `remoteUnlockNoPassword`)
- **Modify device settings** (`setDeviceProperties`, `sendCommands`)
- **Require valid unlock IDs** (assign/delete operations)

To test these operations manually:
1. Ensure device is in a safe test environment
2. Comment out the skip logic in the test script
3. Run specific test functions individually

## Continuous Testing

For CI/CD integration, the script exits with:
- **Exit code 0** - All tests passed
- **Exit code 1** - One or more tests failed

Example CI script:
```bash
npm run test:tuya || exit 1
```

## Next Steps

After running tests:
1. Review failed tests and fix configuration issues
2. Check Tuya IoT Platform for API subscription status
3. Verify device is online and connected
4. Update endpoint implementations if needed based on test results

## Related Documentation

- [Tuya Endpoints Reference](./TUYA_ENDPOINTS.md) - Complete list of all endpoints
- [Tuya API Documentation](https://developer.tuya.com/en/docs/cloud/smart-door-lock?id=K9jgsgd4cgysr)

