# Debug Mode for Tuya Signature Testing

## How to Enable Debug Mode

Debug mode shows detailed signature calculation information to help troubleshoot error code 1004 (signature invalid).

### Method 1: Windows PowerShell

```powershell
# Set environment variable and run test
$env:DEBUG_SIGNATURE="true"; node scripts/test-tuya.js
```

### Method 2: Windows Command Prompt (CMD)

```cmd
set DEBUG_SIGNATURE=true && node scripts/test-tuya.js
```

### Method 3: Linux/Mac/Git Bash

```bash
DEBUG_SIGNATURE=true node scripts/test-tuya.js
```

### Method 4: Using npm script (recommended)

Add to `package.json`:
```json
"scripts": {
  "test:tuya:debug": "cross-env DEBUG_SIGNATURE=true node scripts/test-tuya.js"
}
```

Then run:
```bash
npm run test:tuya:debug
```

**Note:** You'll need to install `cross-env` first:
```bash
npm install --save-dev cross-env
```

## What Debug Mode Shows

When enabled, debug mode displays:

1. **StringToSign (escaped)**: The exact string being signed, with newlines shown as `\n`
2. **Sign String Length**: Total length of the concatenated signature string
3. **Sign String (first 100 chars)**: Preview of the signature string being hashed

### Example Output

```
   [DEBUG] Signature Calculation:
   StringToSign (escaped): "GET\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n\n/v1.0/token?grant_type=1"
   Sign String Length: 234
   Sign String (first 100 chars): 1KAD46OrT9HafiKdsXeg15889257780005138cc3a9033d69856923fd07b491173GET\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n\n/v1.0/token?grant_type=1...
```

## Troubleshooting with Debug Output

### Check StringToSign Structure

The `StringToSign` should have exactly 4 parts separated by `\n`:
1. HTTP Method (GET, POST, etc.)
2. Content-SHA256 (hash of request body)
3. Optional_Signature_key (empty for basic requests)
4. URL path (with query string if present)

### Verify Signature String Concatenation

For token requests (no access_token):
```
client_id + t + nonce + stringToSign
```

For API requests (with access_token):
```
client_id + access_token + t + nonce + stringToSign
```

### Common Issues

1. **Missing newlines**: StringToSign should contain `\n` characters
2. **Wrong order**: Signature string must be in exact order shown above
3. **Empty body hash**: Should be `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` for empty body

## Adding Debug to Comprehensive Test Script

To add debug mode to the comprehensive test script, you can modify it to check the environment variable and log signature details for failed requests.

## Quick Test

Run this to test debug mode:

```bash
# Windows PowerShell
$env:DEBUG_SIGNATURE="true"; npm run test:tuya:basic

# Linux/Mac
DEBUG_SIGNATURE=true npm run test:tuya:basic
```

