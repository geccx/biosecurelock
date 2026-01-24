# Smart Door Lock System - Complete Implementation

## Architecture Overview

```
React Frontend → Node.js Backend → Hyperledger Fabric (Permissions) → Tuya Cloud API → Gateway → Smart Lock
                                  ↓
                                MySQL (Logging & State)
```

## Project Structure

```
smart-door-lock-system/
├── backend/
│   ├── config/
│   │   ├── tuya.config.js
│   │   ├── fabric.config.js
│   │   └── database.config.js
│   ├── fabric/
│   │   ├── chaincode/
│   │   │   └── doorlock-contract.js
│   │   ├── network.js
│   │   └── wallet.js
│   ├── services/
│   │   ├── tuya.service.js
│   │   ├── fabric.service.js
│   │   ├── enrollment.service.js
│   │   └── scheduler.service.js
│   ├── controllers/
│   │   ├── enrollment.controller.js
│   │   ├── access.controller.js
│   │   └── logs.controller.js
│   ├── middleware/
│   │   ├── auth.middleware.js
│   │   └── fabricAuth.middleware.js
│   ├── routes/
│   │   ├── enrollment.routes.js
│   │   ├── access.routes.js
│   │   └── logs.routes.js
│   ├── models/
│   │   └── mysql.models.js
│   ├── utils/
│   │   ├── crypto.utils.js
│   │   └── logger.js
│   └── server.js
├── frontend/
│   └── (Your React + Vite app)
└── package.json
```

## Quick Start Guide

### 1. Prerequisites

- Node.js 16+ and npm
- MySQL 8.0+
- Hyperledger Fabric 2.2+ network (with test-network or production setup)
- Tuya IoT Platform account with API access
- Tuya B02-TUYABT smart lock paired with Tuya Gateway

### 2. Installation & Dependencies

#### Backend Dependencies

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "mysql2": "^3.6.0",
    "axios": "^1.5.0",
    "crypto-js": "^4.1.1",
    "node-cron": "^3.0.2",
    "dotenv": "^16.3.1",
    "cors": "^2.8.5",
    "fabric-network": "^2.2.20",
    "fabric-ca-client": "^2.2.20",
    "jsonwebtoken": "^9.0.2",
    "bcryptjs": "^2.4.3",
    "express-validator": "^7.0.1"
  }
}
```

```env
# Tuya Configuration
TUYA_CLIENT_ID=your_client_id
TUYA_CLIENT_SECRET=your_client_secret
TUYA_DEVICE_ID=your_device_id
TUYA_GATEWAY_ID=your_gateway_id
TUYA_API_ENDPOINT=https://openapi.tuyaus.com

# MySQL Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=yourpassword
DB_NAME=smart_lock_db

# Hyperledger Fabric Configuration
FABRIC_CHANNEL_NAME=doorchannel
FABRIC_CHAINCODE_NAME=doorlockcc
FABRIC_MSP_ID=Org1MSP
FABRIC_CONNECTION_PROFILE=./fabric/connection-profile.json
FABRIC_WALLET_PATH=./fabric/wallet

# Server Configuration
PORT=3000
JWT_SECRET=your_jwt_secret
NODE_ENV=development
LOG_LEVEL=info
FRONTEND_URL=http://localhost:5173
```

### 3. Setup Instructions

#### A. Database Setup

```bash
# Create database
mysql -u root -p
CREATE DATABASE smart_lock_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE smart_lock_db;

# Run the SQL schema from the guide
# (Copy the SQL from section 1. MySQL Database Schema)
```

#### B. Hyperledger Fabric Setup

**Option 1: Test Network (Development)**

```bash
# Navigate to fabric-samples
cd fabric-samples/test-network

# Start the network
./network.sh up createChannel -c doorchannel -ca

# Deploy chaincode
./network.sh deployCC -c doorchannel -ccn doorlockcc -ccp /path/to/backend/fabric/chaincode -ccl javascript
```

**Option 2: Production Network**

- Set up your production Fabric network with required organizations
- Deploy the doorlock-contract.js chaincode to your channel
- Configure connection profile JSON with peer and orderer endpoints

#### C. Tuya IoT Platform Setup

1. **Create Cloud Project**

   - Login to [Tuya IoT Platform](https://iot.tuya.com)
   - Navigate to Cloud → Projects
   - Click "Create Cloud Project"
   - Select Industry: "Smart Home"
   - Data Center: Choose your region (US, EU, etc.)

2. **Subscribe to APIs**

   - Go to your project → API Products
   - Subscribe to:
     - Authorization
     - Smart Home Devices Management
     - Industry Basic Service

3. **Link Devices**

   - Add your Tuya Smart Gateway and Door Lock
   - Note the Device IDs
   - Configure OAuth if needed

4. **Get Credentials**

   - Go to project Overview
   - Copy Client ID and Client Secret
   - Use these in your .env file

5. **Configure Webhooks (Optional)**
   - Go to Cloud → Development
   - Add webhook URL: `https://your-domain.com/api/webhooks/tuya`
   - Subscribe to device status events

#### D. Backend Setup

```bash
# Clone or create project structure
cd backend

# Install dependencies
npm install

# Install additional dependencies
npm install winston  # For logging

# Create required directories
mkdir -p logs fabric/wallet

# Copy Fabric connection profile
# Place your connection-org1.json in backend/fabric/connection-profile.json

# Run database migrations (if using migration tool)
# Or execute SQL schema manually

# Start server
npm start

# For development with auto-reload
npm install -D nodemon
npm run dev
```

#### E. Initial User Setup

```bash
# Register first admin user via API
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "admin@example.com",
    "password": "SecurePassword123!",
    "role": "admin"
  }'
```

---

## 4. Feature Implementation Details

### A. User Enrollment Workflow

**Scenario 1: PIN Enrollment (Fully Remote)**

1. User requests PIN enrollment via frontend
2. Request goes through Fabric permission check
3. Admin approves via dashboard
4. System creates temporary password in Tuya
5. PIN is immediately active on the lock
6. User can unlock using PIN

**Scenario 2: Fingerprint/RFID Enrollment (Hybrid)**

1. User requests enrollment via frontend
2. Admin approves the request
3. **Physical Step**: Admin goes to lock location
4. Admin enrolls fingerprint/RFID card physically at device
5. Admin syncs enrollment via mobile app or backend API
6. System maps Tuya unlock ID to user in database
7. User can now unlock using fingerprint/RFID

### B. Scheduling Features

**Create Schedule Example:**

```javascript
POST /api/access/schedules
{
  "name": "Weekday Morning Access",
  "daysOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  "startTime": "08:00",
  "endTime": "17:00",
  "autoUnlock": true  // Automatically unlock during this period
}
```

The scheduler checks every minute and auto-unlocks if:

- Current time is within schedule window
- User has active permission on Fabric
- Auto-unlock is enabled

### C. Monitoring & Logs

**Access Log Structure:**

- Captures: User, Method (fingerprint/PIN/RFID/remote), Success/Failure
- Stored in: MySQL (fast queries) + Hyperledger Fabric (immutable audit)
- Synced from Tuya every 5 minutes
- Real-time logs via webhook (optional)

**System Log Structure:**

- Tracks all system events: enrollments, approvals, permission changes
- Links to Fabric transaction IDs for verification
- Queryable by date, event type, user

### D. Permission Model (Hyperledger Fabric)

```javascript
// Default permissions by role
admin: {
  canUnlock: true,
  canLock: true,
  canRemoteUnlock: true,
  canApproveEnrollment: true,
  canManageSchedules: true,
  canViewLogs: true,
  canManageUsers: true
}

user: {
  canUnlock: true,
  canLock: true,
  canRemoteUnlock: false,  // Requires admin approval
  canApproveEnrollment: false,
  canManageSchedules: false,
  canViewLogs: false,      // Can only see own logs
  canManageUsers: false
}

visitor: {
  canUnlock: true,         // Limited to scheduled times
  canLock: false,
  canRemoteUnlock: false,
  // All other permissions: false
}
```

---

## 5. API Endpoints Reference

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and get JWT token

### Enrollments

- `POST /api/enrollments` - Request enrollment
- `GET /api/enrollments/pending` - Get pending enrollments (admin)
- `GET /api/enrollments/user/:userId` - Get user's enrollments
- `POST /api/enrollments/:enrollmentId/approve` - Approve enrollment
- `POST /api/enrollments/:enrollmentId/reject` - Reject enrollment
- `POST /api/enrollments/:enrollmentId/sync` - Sync physical enrollment
- `DELETE /api/enrollments/:enrollmentId` - Delete enrollment

### Access Control

- `POST /api/access/unlock` - Remote unlock door
- `GET /api/access/dynamic-password` - Get 5-minute dynamic password
- `POST /api/access/temp-password` - Create temporary password (admin)
- `GET /api/access/logs` - Get access logs
- `GET /api/access/system-logs` - Get system logs (admin)
- `GET /api/access/stats` - Get access statistics

### Schedules

- `POST /api/access/schedules` - Create schedule
- `GET /api/access/schedules/:userId?` - Get schedules
- `PUT /api/access/schedules/:scheduleId` - Update schedule
- `DELETE /api/access/schedules/:scheduleId` - Delete schedule

### Users

- `GET /api/users/me` - Get current user
- `GET /api/users` - Get all users (admin)
- `PUT /api/users/:userId/permissions` - Update permissions (admin)

---

## 6. Limitations & Workarounds (Free Tier)

### Limitation 1: Physical Enrollment Required

**Issue**: Fingerprint and RFID cannot be enrolled remotely via Tuya API

**Workaround**:

1. Implement approval workflow in your system
2. After approval, guide admin to lock location
3. Admin performs physical enrollment
4. System syncs the newly created unlock method
5. Map unlock ID to user in database

### Limitation 2: API Rate Limits

**Free Tier**: 1,000 calls/day, ~10 req/sec

**Workarounds**:

- Cache device status in MySQL (5-minute refresh)
- Batch operations where possible
- Use webhooks instead of polling for real-time events
- Implement request queuing

### Limitation 3: Bluetooth-Only Lock

**Issue**: Lock only supports Bluetooth, requires gateway for WiFi

**Requirements**:

- Gateway must be powered and within Bluetooth range (~10m)
- Gateway needs stable WiFi connection
- All commands route through gateway
- Gateway offline = no remote control

**Mitigation**:

- Monitor gateway status
- Alert admins if gateway goes offline
- Implement fallback: dynamic passwords for physical entry

### Limitation 4: No Advanced Features

**Not Available on Free Tier**:

- Custom firmware
- Advanced scene automation
- Direct Bluetooth control from your app
- Video streaming (for video locks)

**Alternative Approaches**:

- Build scheduling in your backend (already implemented)
- Use Fabric for custom permission logic
- Implement your own automation rules

---

## 7. Testing

### Unit Tests Example

```javascript
// test/services/tuya.service.test.js
const tuyaService = require("../services/tuya.service");

describe("Tuya Service", () => {
  test("should get device info", async () => {
    const info = await tuyaService.getDeviceInfo();
    expect(info).toHaveProperty("id");
  });

  test("should create temp password", async () => {
    const result = await tuyaService.createTempPassword({
      password: "123456",
      name: "Test",
      type: "once",
      startTime: Date.now() / 1000,
      endTime: Date.now() / 1000 + 3600,
    });
    expect(result).toHaveProperty("password_id");
  });
});
```

### Integration Test

```javascript
// test/integration/enrollment.test.js
const request = require("supertest");
const app = require("../server");

describe("Enrollment Flow", () => {
  let adminToken;
  let userId;

  beforeAll(async () => {
    // Login as admin
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@test.com", password: "password" });

    adminToken = res.body.data.token;
  });

  test("should request PIN enrollment", async () => {
    const res = await request(app)
      .post("/api/enrollments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        userId: 1,
        enrollmentType: "pin",
        enrollmentData: { pin: "123456" },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});
```

---

## 8. Deployment

### Production Checklist

- [ ] Set strong JWT_SECRET
- [ ] Use production database with backups
- [ ] Configure SSL/TLS for API endpoints
- [ ] Set up Fabric production network
- [ ] Configure Tuya webhook with HTTPS
- [ ] Implement rate limiting middleware
- [ ] Set up monitoring (Prometheus + Grafana)
- [ ] Configure log rotation
- [ ] Set up automated backups
- [ ] Implement health check endpoint monitoring
- [ ] Use environment-specific configs
- [ ] Enable CORS only for trusted domains

### Docker Deployment (Optional)

```dockerfile
# Dockerfile
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

```yaml
# docker-compose.yml
version: "3.8"
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env
    depends_on:
      - mysql
    volumes:
      - ./logs:/app/logs
      - ./fabric/wallet:/app/fabric/wallet

  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_PASSWORD}
      MYSQL_DATABASE: ${DB_NAME}
    volumes:
      - mysql-data:/var/lib/mysql

volumes:
  mysql-data:
```

---

## 9. Frontend Integration Example (React)

```javascript
// src/services/api.js
import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:3000/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const auth = {
  register: (data) => api.post("/auth/register", data),
  login: (data) => api.post("/auth/login", data),
};

export const enrollments = {
  request: (data) => api.post("/enrollments", data),
  getPending: () => api.get("/enrollments/pending"),
  approve: (id) => api.post(`/enrollments/${id}/approve`),
  reject: (id, reason) => api.post(`/enrollments/${id}/reject`, { reason }),
};

export const access = {
  unlock: (method, password) =>
    api.post("/access/unlock", { method, password }),
  getDynamicPassword: () => api.get("/access/dynamic-password"),
  getLogs: (params) => api.get("/access/logs", { params }),
  getStats: (params) => api.get("/access/stats", { params }),
};

export const schedules = {
  create: (data) => api.post("/access/schedules", data),
  getAll: () => api.get("/access/schedules"),
  update: (id, data) => api.put(`/access/schedules/${id}`, data),
  delete: (id) => api.delete(`/access/schedules/${id}`),
};

export default api;
```

---

## 10. Troubleshooting

### Issue: Tuya API returns "token expired"

**Solution**: The service auto-refreshes tokens. If persisting, check:

```javascript
// Manually refresh
await tuyaService._getToken();
```

### Issue: Fabric transaction fails

**Solution**: Check:

1. Is Fabric network running?
2. Is chaincode installed and instantiated?
3. Are wallet identities valid?

```bash
# Check network status
cd fabric-samples/test-network
./network.sh status

# Check chaincode
docker ps | grep dev-peer
```

### Issue: Gateway offline, no remote control

**Solution**:

1. Check gateway power and WiFi
2. Use dynamic password as fallback
3. Implement gateway status monitoring:

```javascript
const checkGatewayStatus = async () => {
  const status = await tuyaService.getDeviceStatus();
  if (!status.online) {
    // Send alert to admin
    logger.error("Gateway offline!");
  }
};
```

### Issue: MySQL connection pool exhausted

**Solution**: Increase pool size in config:

```javascript
connectionLimit: 20; // Increase from 10
```

---

## 11. Security Best Practices

1. **JWT Tokens**: Set short expiration (7 days max), implement refresh tokens
2. **Password Hashing**: Using bcrypt with salt rounds ≥ 10
3. **Fabric Private Keys**: Never expose wallet directory
4. **Tuya Credentials**: Store in environment variables, never commit
5. **API Rate Limiting**: Implement express-rate-limit
6. **Input Validation**: Using express-validator for all endpoints
7. **SQL Injection**: Using parameterized queries (mysql2)
8. **CORS**: Restrict to known frontend domains
9. **Logging**: Sanitize logs, don't log passwords or tokens
10. **Blockchain**: All sensitive operations require Fabric verification

---

## Conclusion

This system provides a complete smart door lock management solution with:

- ✅ Hyperledger Fabric for immutable permission and audit trails
- ✅ Tuya Cloud API for device control (with free tier limitations)
- ✅ MySQL for fast queries and application state
- ✅ Complete approval workflow for enrollments
- ✅ Automated scheduling with time-based access control
- ✅ Comprehensive monitoring and logging
- ✅ Workarounds for physical enrollment limitations

**Next Steps**:

1. Clone the repository structure
2. Set up Hyperledger Fabric test network
3. Configure Tuya IoT Platform credentials
4. Deploy database schema
5. Deploy chaincode
6. Start backend server
7. Build React frontend using the API
8. Test enrollment and access workflows

For production deployment, ensure all security measures are in place and consider upgrading to Tuya's paid tier for advanced features.

```env
# Tuya Configuration
TUYA_CLIENT_ID=your_client_id
TUYA_CLIENT_SECRET=your_client_secret
TUYA_DEVICE_ID=your_device_id
TUYA_GATEWAY_ID=your_gateway_id
TUYA_API_ENDPOINT=https://openapi.tuyaus.com

# MySQL Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=yourpassword
DB_NAME=smart_lock_db

# Hyperledger Fabric Configuration
FABRIC_CHANNEL_NAME=doorchannel
FABRIC_CHAINCODE_NAME=doorlockcc
FABRIC_MSP_ID=Org1MSP
FABRIC_CONNECTION_PROFILE=./fabric/connection-profile.json
FABRIC_WALLET_PATH=./fabric/wallet

# Server Configuration
PORT=3000
JWT_SECRET=your_jwt_secret
NODE_ENV=development
```

---

## 1. MySQL Database Schema

```sql
-- Users Table
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'user', 'visitor') DEFAULT 'user',
    fabric_identity VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Enrollment Requests Table
CREATE TABLE enrollment_requests (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    enrollment_type ENUM('fingerprint', 'rfid', 'pin') NOT NULL,
    enrollment_data JSON,
    status ENUM('pending', 'approved', 'rejected', 'enrolled') DEFAULT 'pending',
    approved_by INT,
    approved_at TIMESTAMP NULL,
    enrolled_at TIMESTAMP NULL,
    tuya_user_id VARCHAR(50),
    tuya_unlock_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_status (status),
    INDEX idx_user_id (user_id)
);

-- Access Schedules Table
CREATE TABLE access_schedules (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    schedule_name VARCHAR(100) NOT NULL,
    days_of_week JSON, -- ["Monday", "Tuesday", ...]
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    auto_unlock BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_active (is_active),
    INDEX idx_user_id (user_id)
);

-- Access Logs Table
CREATE TABLE access_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    enrollment_id INT,
    access_method ENUM('fingerprint', 'rfid', 'pin', 'remote', 'auto_schedule'),
    access_type ENUM('unlock', 'lock', 'attempt_failed'),
    tuya_unlock_id VARCHAR(50),
    success BOOLEAN NOT NULL,
    ip_address VARCHAR(45),
    location JSON,
    fabric_tx_id VARCHAR(255),
    device_response JSON,
    accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (enrollment_id) REFERENCES enrollment_requests(id) ON DELETE SET NULL,
    INDEX idx_accessed_at (accessed_at),
    INDEX idx_user_id (user_id),
    INDEX idx_success (success)
);

-- System Activity Logs Table
CREATE TABLE system_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    event_type VARCHAR(50) NOT NULL,
    event_description TEXT,
    user_id INT,
    metadata JSON,
    fabric_tx_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_event_type (event_type),
    INDEX idx_created_at (created_at)
);

-- Temporary Passwords Table
CREATE TABLE temporary_passwords (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    tuya_password_id VARCHAR(50),
    password_value VARCHAR(255),
    valid_from TIMESTAMP NOT NULL,
    valid_until TIMESTAMP NOT NULL,
    usage_count INT DEFAULT 0,
    max_usage INT DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_valid_period (valid_from, valid_until),
    INDEX idx_active (is_active)
);
```

---

## 2. Hyperledger Fabric Chaincode (Smart Contract)

This chaincode manages permissions and authentication on the blockchain.
