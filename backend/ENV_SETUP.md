# Environment Variables Setup Guide

## How to Create Your .env File

1. **Create a new file** named `.env` in the `backend/` directory
2. **Copy the configuration below** and update the values for your AWS instance

## Required .env Configuration

```env
# Tuya IoT Configuration
TUYA_ACCESS_ID=your_access_id
TUYA_ACCESS_SECRET=your_access_secret
TUYA_GATEWAY_ID=your_gateway_id
TUYA_API_ENDPOINT=https://openapi.tuyaus.com

# MySQL Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=yourpassword
DB_NAME=smart_lock_db

# Hyperledger Fabric Configuration
# IMPORTANT: Update channel name to match your AWS instance
# If your error mentioned "mychannel", use "mychannel"
# If your channel is named "doorchannel", use "doorchannel"
FABRIC_CHANNEL_NAME=mychannel
FABRIC_CHAINCODE_NAME=doorlockcc
FABRIC_MSP_ID=Org1MSP
# Paths are relative to backend/services/ directory (where fabric.service.js is located)
FABRIC_CONNECTION_PROFILE=./fabric/connection-profile.json
FABRIC_WALLET_PATH=./fabric/wallet

# Server Configuration
PORT=3000
JWT_SECRET=your_jwt_secret
NODE_ENV=development
LOG_LEVEL=info
FRONTEND_URL=http://localhost:5173
```

## Key Points for AWS Instance:

1. **FABRIC_CHANNEL_NAME**:
   - Set to `mychannel` if that's what your AWS instance uses
   - Or set to `doorchannel` if that's your channel name
   - Check your Hyperledger Fabric network setup on AWS to confirm

2. **FABRIC_CONNECTION_PROFILE**:
   - Path is `./fabric/connection-profile.json` (relative to `backend/services/`)
   - This file is already configured with your AWS IP: `3.0.146.188`

3. **FABRIC_WALLET_PATH**:
   - Path is `./fabric/wallet` (relative to `backend/services/`)
   - This is where your enrolled identities are stored

## Quick Setup Command (Windows PowerShell):

```powershell
# Navigate to backend directory
cd backend

# Create .env file with the configuration
@"
# Hyperledger Fabric Configuration
FABRIC_CHANNEL_NAME=mychannel
FABRIC_CHAINCODE_NAME=doorlockcc
FABRIC_MSP_ID=Org1MSP
FABRIC_CONNECTION_PROFILE=./fabric/connection-profile.json
FABRIC_WALLET_PATH=./fabric/wallet

# MySQL Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=yourpassword
DB_NAME=smart_lock_db

# Server Configuration
PORT=3000
JWT_SECRET=your_jwt_secret
NODE_ENV=development
"@ | Out-File -FilePath .env -Encoding utf8
```

## Verification:

After creating the `.env` file, verify it exists:

```powershell
Test-Path .env
```

Then check the values are loaded correctly when you run your application.

## Optional: Sync & Local Data Retention (TUYA)

For local data retention and continuous logging (sync/retention feature), you can set:

```env
# Polling interval for log retrieval from devices (ms). Default: 5 min
SYNC_LOG_RETRIEVAL_INTERVAL_MS=300000
# Device status check interval (ms). Default: 2 min
SYNC_DEVICE_STATUS_INTERVAL_MS=120000
# Sync retry interval (ms). Default: 10 min
SYNC_RETRY_INTERVAL_MS=600000
# Max retries for failed sync. Default: 5
SYNC_MAX_RETRIES=5
# TUYA request timeout (ms). Default: 30000
SYNC_TUYA_TIMEOUT_MS=30000
# Alert when device offline for this many minutes. Default: 30
SYNC_OFFLINE_ALERT_MINUTES=30
# Log gap considered unrecoverable (hours). Default: 168 (7 days)
SYNC_LOG_GAP_UNRECOVERABLE_HOURS=168
# Max device clock drift (seconds) for timestamp validation. Default: 300
SYNC_MAX_CLOCK_DRIFT_SECONDS=300
# Log retention: delete access_logs older than N days (0 = keep forever)
SYNC_LOG_RETENTION_DAYS=0
```
