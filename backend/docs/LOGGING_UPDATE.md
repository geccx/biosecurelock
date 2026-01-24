# Logging Update - User Level Information

## Overview
All logging in the project has been updated to include user level information according to Hyperledger Fabric best practices. This ensures proper audit trails and accountability.

## Changes Made

### 1. Chaincode Updates (`backend/fabric/chaincode/doorlock-contract.js`)
- Updated `logAccess()` function to include:
  - Caller MSP ID (`ctx.clientIdentity.getMSPID()`)
  - Caller ID (`ctx.clientIdentity.getID()`)
  - Caller role (from certificate attributes or user record)
  - X.509 certificate information (subject, issuer, serial number, validity)
  - Transaction creator information
  - Transaction ID

### 2. Logging Utility (`backend/utils/logging.utils.js`)
Created a new utility module with:
- `getUserLevelInfo()` - Extracts user level information (userId, username, role, email, userLevel)
- `createSystemLog()` - Creates system logs with user level information automatically included
- `createAccessLog()` - Creates access logs with user level information

### 3. Updated Controllers
All controllers now use the logging utility to ensure user level information is included:
- `enrollment.controller.js` - All enrollment-related logs
- `access.controller.js` - All access-related logs
- `labSchedules.controller.js` - Schedule creation logs
- Other controllers as needed

## User Level Information Included

Every log entry now includes:
- **userId**: The ID of the user performing the action
- **username**: The username of the user
- **role**: The role of the user (admin, teacher, techsupport, user, visitor)
- **email**: The email of the user (if available)
- **userLevel**: The user's role/level for easy filtering

## Hyperledger Fabric Best Practices

According to Hyperledger Fabric documentation, the following information is captured:

1. **Transaction Creator Identity**:
   - MSP ID (Membership Service Provider ID)
   - Certificate information
   - User attributes (role, etc.)

2. **Transaction Metadata**:
   - Transaction ID
   - Timestamp
   - Channel name
   - Chaincode name

3. **Event Emission**:
   - Events include user level information
   - Events are queryable for audit purposes

## Usage Example

```javascript
const { createSystemLog } = require("../utils/logging.utils");

// Simple usage
await createSystemLog("schedule_created", req.user, {
  details: { scheduleId: 123, labName: "Lab 1" }
});

// With Fabric transaction ID
await createSystemLog("enrollment_approved", req.user, {
  eventDescription: "Enrollment approved",
  details: { enrollmentId: 456 },
  fabricTxId: "tx123456",
  connection: dbConnection // For transactions
});
```

## Database Schema

The `system_logs` table stores:
- `event_type`: Type of event
- `user_id`: ID of the user (foreign key to users table)
- `details`: JSON field containing all user level information and event details
- `event_description`: Human-readable description (if using extended format)
- `metadata`: JSON field with additional metadata (if using extended format)
- `fabric_tx_id`: Hyperledger Fabric transaction ID (if available)
- `timestamp`: When the event occurred

## Benefits

1. **Complete Audit Trail**: Every action is logged with who performed it
2. **Accountability**: User level information makes it easy to track actions by role
3. **Compliance**: Meets audit requirements with complete user context
4. **Debugging**: Easier to trace issues when user context is available
5. **Security**: Helps identify suspicious activities by user level

## Migration Notes

- Existing logs will continue to work
- New logs automatically include user level information
- The logging utility handles both standard and extended column formats
- No database migration required (uses existing columns)

