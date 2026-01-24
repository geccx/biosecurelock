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

