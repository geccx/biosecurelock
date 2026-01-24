# Tuya Signature Algorithm Fix

## Issue
Error code 1004 (signature invalid) was occurring when making Tuya API requests.

## Root Cause
The signature algorithm implementation didn't exactly match Tuya's official documentation requirements.

## Solution
Updated the signature calculation to strictly follow the [Tuya Signature Documentation](https://developer.tuya.com/en/docs/iot/new-singnature?id=Kbw0q34cs2e5g).

## Changes Made

### 1. String to Sign Calculation

**Before:**
```javascript
const contentHash = crypto.createHash("sha256").update(bodyStr).digest("hex");
```

**After:**
```javascript
const bodyBytes = Buffer.from(bodyStr, "utf8");
const contentHash = crypto.createHash("sha256").update(bodyBytes).digest("hex");
```

**Why:** Ensures the body is hashed as UTF-8 bytes, as required by Tuya's documentation.

### 2. String to Sign Structure

**Structure (per documentation):**
```
HTTPMethod + "\n" +
Content-SHA256 + "\n" +
Optional_Signature_key + "\n" +
URL
```

**Implementation:**
```javascript
return `${httpMethod}\n${contentHash}\n${optionalSignatureKey}\n${url}`;
```

**Note:** `Optional_Signature_key` is empty for basic requests (no custom headers like `area_id:call_id`).

### 3. Signature String Concatenation

**For Token Management API (no access_token):**
```
str = client_id + t + nonce + stringToSign
sign = HMAC-SHA256(str, secret).toUpperCase()
```

**For General Business API (with access_token):**
```
str = client_id + access_token + t + nonce + stringToSign
sign = HMAC-SHA256(str, secret).toUpperCase()
```

**Implementation:**
```javascript
let signStr;
if (accessToken) {
  signStr = clientId + accessToken + timestamp + nonce + stringToSign;
} else {
  signStr = clientId + timestamp + nonce + stringToSign;
}

return crypto
  .createHmac("sha256", secret)
  .update(signStr, "utf8")
  .digest("hex")
  .toUpperCase();
```

## Files Updated

1. **`backend/services/tuya.service.js`**
   - Updated `_calcStringToSign()` method
   - Updated `_calcSign()` method
   - Added explicit UTF-8 encoding

2. **`backend/scripts/test-tuya.js`**
   - Updated `calcStringToSign()` function
   - Updated `calcSign()` function
   - Added debug logging option

## Testing

Run the test script to verify the signature fix:

```bash
# Basic connection test
npm run test:tuya:basic

# Comprehensive endpoints test
npm run test:tuya
```

## Debug Mode

To see detailed signature calculation, set environment variable:

```bash
DEBUG_SIGNATURE=true npm run test:tuya:basic
```

This will show:
- The exact `stringToSign` being used
- The signature string length
- First 100 characters of the signature string

## Empty Body Hash

According to Tuya documentation, an empty body should hash to:
```
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

This is automatically handled when body is empty string or null.

## Verification

After the fix, you should see:
- ✅ Token requests succeed
- ✅ Device API calls succeed
- ✅ No more error code 1004

## References

- [Tuya Signature Documentation](https://developer.tuya.com/en/docs/iot/new-singnature?id=Kbw0q34cs2e5g)
- [Tuya Authentication Method](https://developer.tuya.com/en/docs/iot/authentication-method?id=Ka49gbaxjygox)

