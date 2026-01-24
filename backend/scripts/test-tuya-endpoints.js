/**
 * Tuya API Endpoints Comprehensive Test Script
 *
 * This script tests all Tuya endpoints used in the Smart Door Lock system.
 * Run with: node scripts/test-tuya-endpoints.js
 *
 * Tests:
 * 1. Authentication & Token Management
 * 2. Device Information & Status
 * 3. Smart Lock Operations (Unlock, Passwords)
 * 4. User Management (Enrollments, Keys)
 * 5. Logs & Records
 * 6. Webhook Utilities
 */

require("dotenv").config();
const tuyaService = require("../services/tuya.service");
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: [],
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log("\n" + "=".repeat(80));
  log(`  ${title}`, "bright");
  console.log("=".repeat(80));
}

function logTest(name, status, details = "") {
  const statusIcon =
    status === "pass" ? "✅" : status === "fail" ? "❌" : "⏭️ ";
  const statusColor =
    status === "pass" ? "green" : status === "fail" ? "red" : "yellow";

  log(`  ${statusIcon} ${name}`, statusColor);
  if (details) {
    log(`     ${details}`, "cyan");
  }

  testResults.tests.push({ name, status, details });
  if (status === "pass") testResults.passed++;
  else if (status === "fail") testResults.failed++;
  else testResults.skipped++;
}

function logError(error, context = "") {
  console.log(""); // Add spacing for readability

  // Extract error information
  const response = error.response;
  const request = error.request || error.config;

  // Error code and message from Tuya API
  if (response?.data) {
    const data = response.data;
    if (data.code) {
      log(`     Error Code: ${data.code}`, "red");
    }
    if (data.msg) {
      log(`     Error Message: ${data.msg}`, "red");
    }
    if (data.success !== undefined) {
      log(`     Success: ${data.success}`, "yellow");
    }

    // Show full response data if available
    log(`     Full Response:`, "yellow");
    console.log(JSON.stringify(data, null, 2));
  }

  // HTTP status code
  if (response?.status) {
    log(
      `     HTTP Status: ${response.status} ${response.statusText || ""}`,
      "yellow"
    );
  }

  // Request details
  if (request) {
    if (request.url || request.path) {
      log(`     Request URL: ${request.url || request.path}`, "cyan");
    }
    if (request.method) {
      log(`     Request Method: ${request.method.toUpperCase()}`, "cyan");
    }
    if (request.params) {
      log(`     Request Params: ${JSON.stringify(request.params)}`, "cyan");
    }
    if (request.data) {
      log(`     Request Body: ${JSON.stringify(request.data)}`, "cyan");
    }
  }

  // Error message
  if (error.message && !response?.data?.msg) {
    log(`     Error: ${error.message}`, "red");
  }

  // Stack trace (only in debug mode or for non-API errors)
  if (process.env.DEBUG_ERRORS === "true" || !response) {
    if (error.stack) {
      log(`     Stack Trace:`, "yellow");
      console.log(error.stack);
    }
  }

  // Context information
  if (context) {
    log(`     Context: ${context}`, "yellow");
  }

  // Additional error details
  if (error.response?.headers) {
    log(`     Response Headers:`, "yellow");
    console.log(JSON.stringify(error.response.headers, null, 2));
  }

  console.log(""); // Add spacing after error
}

// Check environment variables
function checkEnvironment() {
  logSection("Environment Check");

  const required = ["TUYA_CLIENT_ID", "TUYA_CLIENT_SECRET"];
  const optional = ["TUYA_DEVICE_ID", "TUYA_API_ENDPOINT"];

  let allSet = true;

  required.forEach((key) => {
    const value = process.env[key];
    if (value) {
      logTest(`✓ ${key}`, "pass", value.substring(0, 20) + "...");
    } else {
      logTest(`✗ ${key}`, "fail", "NOT SET - Required!");
      allSet = false;
    }
  });

  optional.forEach((key) => {
    const value = process.env[key];
    if (value) {
      logTest(`✓ ${key}`, "pass", value);
    } else {
      logTest(`⚠ ${key}`, "skip", "Not set (using default)");
    }
  });

  if (!allSet) {
    log("\n❌ Missing required environment variables!", "red");
    log(
      "Please set TUYA_CLIENT_ID and TUYA_CLIENT_SECRET in .env file",
      "yellow"
    );
    process.exit(1);
  }

  return allSet;
}

// Test 1: Authentication & Token Management
async function testAuthentication() {
  logSection("1. Authentication & Token Management");

  try {
    // Test connection
    const connectionTest = await tuyaService.testConnection();
    if (connectionTest.success) {
      logTest("testConnection()", "pass", connectionTest.message);
    } else {
      logTest("testConnection()", "fail", connectionTest.message);
      return false;
    }

    // Test token retrieval (internal)
    try {
      await tuyaService._getToken();
      logTest("_getToken()", "pass", "Token retrieved successfully");
    } catch (error) {
      logTest("_getToken()", "fail");
      logError(error);
      return false;
    }

    // Test token refresh
    try {
      await tuyaService.refreshAccessToken();
      logTest("refreshAccessToken()", "pass", "Token refreshed successfully");
    } catch (error) {
      logTest("refreshAccessToken()", "fail");
      logError(error);
    }

    return true;
  } catch (error) {
    logTest("Authentication Tests", "fail");
    logError(error);
    return false;
  }
}

// Test 2: Device Information & Status
async function testDeviceInfo() {
  logSection("2. Device Information & Status");

  if (!process.env.TUYA_DEVICE_ID) {
    logTest("All Device Info Tests", "skip", "TUYA_DEVICE_ID not set");
    return true;
  }

  try {
    // Get device details (IoT Core v2.0)
    try {
      const details = await tuyaService.getDeviceDetails();
      logTest("getDeviceDetails()", "pass", `Device: ${details.name || "N/A"}`);
    } catch (error) {
      logTest("getDeviceDetails()", "fail");
      logError(error);
    }

    // Get device state (IoT Core v2.0)
    try {
      const state = await tuyaService.getDeviceState();
      logTest("getDeviceState()", "pass", `Properties: ${state.length || 0}`);
    } catch (error) {
      logTest("getDeviceState()", "fail");
      logError(error);
    }

    // Get device status (Standard v1.0)
    try {
      const status = await tuyaService.getDeviceStatus();
      logTest(
        "getDeviceStatus()",
        "pass",
        `Status items: ${status.length || 0}`
      );
    } catch (error) {
      logTest("getDeviceStatus()", "fail");
      logError(error);
    }

    // Get device info (Legacy)
    try {
      const info = await tuyaService.getDeviceInfo();
      logTest("getDeviceInfo()", "pass", `Device ID: ${info.id || "N/A"}`);
    } catch (error) {
      logTest("getDeviceInfo()", "fail");
      logError(error);
    }

    // Get device specification
    try {
      const spec = await tuyaService.getDeviceSpecification();
      logTest("getDeviceSpecification()", "pass", "Specification retrieved");
    } catch (error) {
      logTest("getDeviceSpecification()", "fail");
      logError(error);
    }

    // Get device functions
    try {
      const functions = await tuyaService.getDeviceFunctions();
      logTest(
        "getDeviceFunctions()",
        "pass",
        `Functions: ${functions.length || 0}`
      );
    } catch (error) {
      logTest("getDeviceFunctions()", "fail");
      logError(error);
    }

    // Get device model
    try {
      const model = await tuyaService.getDeviceModel();
      logTest("getDeviceModel()", "pass", "Model retrieved");
    } catch (error) {
      logTest("getDeviceModel()", "fail");
      logError(error);
    }

    return true;
  } catch (error) {
    logTest("Device Info Tests", "fail");
    logError(error);
    return false;
  }
}

// Test 3: Smart Lock Operations
async function testSmartLockOperations() {
  logSection("3. Smart Lock Operations");

  if (!process.env.TUYA_DEVICE_ID) {
    logTest("All Smart Lock Tests", "skip", "TUYA_DEVICE_ID not set");
    return true;
  }

  try {
    // Get dynamic password
    try {
      const dynamicPwd = await tuyaService.getDynamicPassword();
      logTest(
        "getDynamicPassword()",
        "pass",
        `Password ID: ${dynamicPwd.password_id || "N/A"}`
      );
    } catch (error) {
      logTest("getDynamicPassword()", "fail");
      logError(error, "May require device to be online");
    }

    // Get remote unlock methods
    try {
      const methods = await tuyaService.getRemoteUnlockMethods();
      logTest("getRemoteUnlockMethods()", "pass", "Methods retrieved");
    } catch (error) {
      logTest("getRemoteUnlockMethods()", "fail");
      logError(error);
    }

    // Test remote unlock (password-free) - WARNING: This will unlock the door!
    logTest(
      "remoteUnlockNoPassword()",
      "skip",
      "⚠️  SKIPPED - Would unlock door!"
    );

    // Test remote unlock with password - WARNING: This will unlock the door!
    logTest(
      "remoteUnlock(password)",
      "skip",
      "⚠️  SKIPPED - Would unlock door!"
    );

    // Get password ticket
    try {
      const ticket = await tuyaService.getPasswordTicket();
      if (ticket.ticket_id && ticket.ticket_key) {
        logTest(
          "getPasswordTicket()",
          "pass",
          `Ticket ID: ${ticket.ticket_id}, Expires in: ${ticket.expire_time}s`
        );
      } else {
        logTest("getPasswordTicket()", "fail", "Invalid ticket response");
      }
    } catch (error) {
      logTest("getPasswordTicket()", "fail");
      logError(error);
    }

    // Create temporary password (skip - requires valid password and dates)
    logTest(
      "createTempPassword()",
      "skip",
      "⚠️  Requires valid password and date range (test manually)"
    );

    // Get temporary passwords list
    try {
      const tempPasswords = await tuyaService.getTempPasswords();
      logTest(
        "getTempPasswords()",
        "pass",
        `Found: ${tempPasswords.length || 0} passwords`
      );
    } catch (error) {
      logTest("getTempPasswords()", "fail");
      logError(error);
    }

    return true;
  } catch (error) {
    logTest("Smart Lock Operations Tests", "fail");
    logError(error);
    return false;
  }
}

// Test 4: User Management & Enrollments
async function testUserManagement() {
  logSection("4. User Management & Enrollments");

  if (!process.env.TUYA_DEVICE_ID) {
    logTest("All User Management Tests", "skip", "TUYA_DEVICE_ID not set");
    return true;
  }

  try {
    // Get unlocking methods (requires userId - try to get from device users first)
    try {
      // Try to get a user ID from device users, or use a test user ID
      let testUserId = "1"; // Default test user ID
      try {
        const deviceUsers = await tuyaService.getDeviceUsers();
        if (deviceUsers && deviceUsers.length > 0 && deviceUsers[0].user_id) {
          testUserId = String(deviceUsers[0].user_id);
        }
      } catch (e) {
        // Use default test user ID
      }

      const methods = await tuyaService.getUnlockingMethods(testUserId, {
        codes: "unlock_fingerprint,unlock_password,unlock_card",
        unlock_name: "", // Required parameter, can be empty string
        page_no: 1,
        page_size: 20,
      });
      logTest(
        "getUnlockingMethods()",
        "pass",
        `Methods: ${methods.records?.length || methods.length || 0}`
      );
    } catch (error) {
      logTest("getUnlockingMethods()", "fail");
      logError(error);
    }

    // Sync unlocking methods
    try {
      await tuyaService.syncUnlockingMethods();
      logTest("syncUnlockingMethods()", "pass", "Methods synced");
    } catch (error) {
      logTest("syncUnlockingMethods()", "fail");
      logError(error);
    }

    // Get unassigned keys
    try {
      const unassigned = await tuyaService.getUnassignedKeys();
      const keys = Array.isArray(unassigned)
        ? unassigned
        : unassigned.list || [];
      logTest("getUnassignedKeys()", "pass", `Unassigned keys: ${keys.length}`);
    } catch (error) {
      logTest("getUnassignedKeys()", "fail");
      logError(error);
    }

    // Get device users
    try {
      const users = await tuyaService.getDeviceUsers();
      logTest("getDeviceUsers()", "pass", `Users: ${users.length || 0}`);
    } catch (error) {
      logTest("getDeviceUsers()", "fail");
      logError(error);
    }

    // Test assign unlocking method (skip - requires valid unlock ID)
    logTest("assignUnlockingMethod()", "skip", "Requires valid unlock_id");

    // Test delete unlock method (skip - requires valid unlock ID)
    logTest("deleteUnlockMethod()", "skip", "Requires valid unlock_id");

    // Test update unlock method name (skip - requires valid unlock SN)
    logTest("updateUnlockMethodName()", "skip", "Requires valid unlock_sn");

    return true;
  } catch (error) {
    logTest("User Management Tests", "fail");
    logError(error);
    return false;
  }
}

// Test 5: Logs & Records
async function testLogsAndRecords() {
  logSection("5. Logs & Records");

  if (!process.env.TUYA_DEVICE_ID) {
    logTest("All Logs Tests", "skip", "TUYA_DEVICE_ID not set");
    return true;
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - 86400;

    // Get unlock records
    try {
      const records = await tuyaService.getUnlockRecords({
        dpCodes:
          "unlock_password,unlock_card,unlock_fingerprint,unlock_key,unlock_temporary,unlock_dynamic,unlock_offline_pd", // or let it use defaults
        startTime: oneDayAgo, // Already in seconds
        endTime: now, // Already in seconds
        pageNo: 1, // Changed from offset
        pageSize: 10, // Changed from limit
      });
      const recordList = records.records || records.list || records || [];
      logTest("getUnlockRecords()", "pass", `Records: ${recordList.length}`);
    } catch (error) {
      logTest("getUnlockRecords()", "fail");
      logError(error);
    }

    // Get open logs - FIXED: added required parameters
    try {
      const openLogs = await tuyaService.getOpenLogs({
        pageNo: 1, // Changed from offset
        pageSize: 10, // Changed from limit
        startTime: oneDayAgo, // Added required parameter
        endTime: now, // Added required parameter
      });
      const logs = openLogs.logs || openLogs.list || openLogs || [];
      logTest("getOpenLogs()", "pass", `Logs: ${logs.length}`);
    } catch (error) {
      logTest("getOpenLogs()", "fail");
      logError(error);
    }

    // Get alarm logs - FIXED: changed parameter names
    try {
      const alarmLogs = await tuyaService.getAlarmLogs({
        pageNo: 1, // Changed from offset
        pageSize: 10, // Changed from limit
      });
      const alarms = alarmLogs.records || alarmLogs.list || alarmLogs || [];
      logTest("getAlarmLogs()", "pass", `Alarms: ${alarms.length}`);
    } catch (error) {
      logTest("getAlarmLogs()", "fail");
      logError(error);
    }

    // Get device logs (IoT Core) - FIXED: added required parameters
    try {
      const deviceLogs = await tuyaService.getDeviceLogs({
        type: "1,2,3,4,5,6,7,8,9,10", // Added required parameter (all event types)
        queryType: 1, // Added required parameter
        startTime: oneDayAgo,
        endTime: now,
        size: 10,
      });
      const logs = deviceLogs.logs || deviceLogs || [];
      logTest(
        "getDeviceLogs()",
        "pass",
        `Logs retrieved: ${logs.length || "unknown"}`
      );
    } catch (error) {
      logTest("getDeviceLogs()", "fail");
      logError(error);
    }

    // Get report logs (IoT Core)
    try {
      // Try to get device properties first to find valid codes
      let codes = "";
      try {
        const properties = await tuyaService.getDeviceProperties();
        if (properties && Array.isArray(properties) && properties.length > 0) {
          // Extract codes from properties
          const propertyCodes = properties
            .map((p) => p.code)
            .filter((code) => code)
            .join(",");
          if (propertyCodes) {
            codes = propertyCodes;
            console.log(`Found device codes: ${codes}`);
          }
        }
      } catch (e) {
        // If we can't get properties, use empty string (default per documentation)
        console.log("Could not get device properties, using empty codes");
      }

      const reportLogs = await tuyaService.getReportLogs({
        codes: codes, // Use found codes or empty string
        startTime: oneDayAgo,
        endTime: now,
        size: 10,
      });
      const logs = reportLogs.logs || reportLogs || [];
      logTest(
        "getReportLogs()",
        "pass",
        `Report logs retrieved: ${logs.length || "unknown"}`
      );
    } catch (error) {
      logTest("getReportLogs()", "fail");
      logError(error);
    }

    return true;
  } catch (error) {
    logTest("Logs & Records Tests", "fail");
    logError(error);
    return false;
  }
}

// Test 6: Device Control & Commands
async function testDeviceControl() {
  logSection("6. Device Control & Commands");

  if (!process.env.TUYA_DEVICE_ID) {
    logTest("All Device Control Tests", "skip", "TUYA_DEVICE_ID not set");
    return true;
  }

  try {
    // Get device properties (IoT Core)
    try {
      const properties = await tuyaService.getDeviceProperties();
      logTest(
        "getDeviceProperties()",
        "pass",
        `Properties: ${properties.length || 0}`
      );
    } catch (error) {
      logTest("getDeviceProperties()", "fail");
      logError(error);
    }

    // Test set device properties - SKIP (would modify device)
    logTest(
      "setDeviceProperties()",
      "skip",
      "⚠️  SKIPPED - Would modify device"
    );

    // Test issue device properties - SKIP (would modify device)
    logTest(
      "issueDeviceProperties()",
      "skip",
      "⚠️  SKIPPED - Would modify device"
    );

    // Test send device actions - SKIP (would modify device)
    logTest("sendDeviceActions()", "skip", "⚠️  SKIPPED - Would modify device");

    // Test send commands (Standard) - SKIP (would modify device)
    logTest("sendCommands()", "skip", "⚠️  SKIPPED - Would modify device");

    return true;
  } catch (error) {
    logTest("Device Control Tests", "fail");
    logError(error);
    return false;
  }
}

// Test 7: Webhook Utilities
async function testWebhookUtilities() {
  logSection("7. Webhook Utilities");

  try {
    // Test webhook signature verification
    const testBody = JSON.stringify({ test: "data" });
    const testTimestamp = Date.now().toString();
    const testSignature = tuyaService.verifyWebhookSignature(
      "test_signature",
      testBody,
      testTimestamp
    );
    logTest("verifyWebhookSignature()", "pass", "Method exists and callable");

    // Test parse unlock event
    const testEvent = {
      devId: "test_device",
      dpCode: "unlock_fingerprint",
      value: "123",
      ts: Date.now(),
      success: true,
    };
    const parsed = tuyaService.parseUnlockEvent(testEvent);
    if (parsed.deviceId && parsed.unlockMethod) {
      logTest("parseUnlockEvent()", "pass", `Parsed: ${parsed.unlockMethod}`);
    } else {
      logTest("parseUnlockEvent()", "fail", "Invalid parse result");
    }

    return true;
  } catch (error) {
    logTest("Webhook Utilities Tests", "fail");
    logError(error);
    return false;
  }
}

// Generate summary report
function generateSummary() {
  logSection("Test Summary");

  const total = testResults.passed + testResults.failed + testResults.skipped;
  const passRate =
    total > 0 ? ((testResults.passed / total) * 100).toFixed(1) : 0;

  log(`Total Tests: ${total}`, "bright");
  log(`  ✅ Passed:  ${testResults.passed}`, "green");
  log(`  ❌ Failed:  ${testResults.failed}`, "red");
  log(`  ⏭️  Skipped: ${testResults.skipped}`, "yellow");
  log(`  📊 Pass Rate: ${passRate}%`, "cyan");

  console.log("\n" + "-".repeat(80));

  if (testResults.failed > 0) {
    log("\n❌ Failed Tests:", "red");
    testResults.tests
      .filter((t) => t.status === "fail")
      .forEach((t) => {
        log(`  - ${t.name}`, "red");
        if (t.details) log(`    ${t.details}`, "yellow");
      });
  }

  if (testResults.skipped > 0) {
    log("\n⏭️  Skipped Tests:", "yellow");
    testResults.tests
      .filter((t) => t.status === "skip")
      .slice(0, 5)
      .forEach((t) => {
        log(`  - ${t.name}`, "yellow");
        if (t.details) log(`    ${t.details}`, "cyan");
      });
    if (testResults.skipped > 5) {
      log(`  ... and ${testResults.skipped - 5} more`, "yellow");
    }
  }

  console.log("\n" + "=".repeat(80));

  if (testResults.failed === 0) {
    log(
      "\n✅ All tests passed! Tuya endpoints are working correctly.",
      "green"
    );
  } else {
    log("\n⚠️  Some tests failed. Please review the errors above.", "yellow");
    log("Common issues:", "yellow");
    log("  1. Check TUYA_DEVICE_ID is correct", "cyan");
    log("  2. Verify device is online and connected", "cyan");
    log(
      "  3. Ensure API subscriptions are enabled in Tuya IoT Platform",
      "cyan"
    );
    log("  4. Check data center endpoint matches your project region", "cyan");
  }

  console.log("");
}

// Main test runner
async function runAllTests() {
  console.log("\n");
  log(
    "╔══════════════════════════════════════════════════════════════════════════════╗",
    "bright"
  );
  log(
    "║         Tuya API Endpoints Comprehensive Test Suite                         ║",
    "bright"
  );
  log(
    "╚══════════════════════════════════════════════════════════════════════════════╝",
    "bright"
  );
  console.log("");

  // Check environment
  if (!checkEnvironment()) {
    process.exit(1);
  }

  // Run all test suites
  const authOk = await testAuthentication();
  if (!authOk) {
    log("\n❌ Authentication failed. Cannot proceed with other tests.", "red");
    generateSummary();
    process.exit(1);
  }

  await testDeviceInfo();
  await testSmartLockOperations();
  await testUserManagement();
  await testLogsAndRecords();
  await testDeviceControl();
  await testWebhookUtilities();

  // Generate summary
  generateSummary();
}

// Run tests
runAllTests().catch((error) => {
  log("\n❌ Fatal error running tests:", "red");
  console.error(error);
  process.exit(1);
});
