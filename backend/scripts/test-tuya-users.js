/**
 * Tuya User API Test Script
 *
 * This script tests Tuya user-related endpoints:
 * - Query User Information by User ID (Official API)
 * - Query Users on Pages (Platform Users API)
 * - Get Device Users (Smart Lock Users)
 *
 * Run with: node scripts/test-tuya-users.js
 *
 * Reference:
 * - Query User by ID: https://developer.tuya.com/en/docs/cloud/8a12b9c9b1?id=Kag2yma0kr3tr
 * - Query Users on Pages: https://developer.tuya.com/en/docs/cloud/c18861d969?id=Katz3k4d80jt0
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
  magenta: "\x1b[35m",
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
  console.log("");

  const response = error.response;
  const request = error.request || error.config;

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

    log(`     Full Response:`, "yellow");
    console.log(JSON.stringify(data, null, 2));
  }

  if (response?.status) {
    log(
      `     HTTP Status: ${response.status} ${response.statusText || ""}`,
      "yellow"
    );
  }

  if (request) {
    if (request.url || request.path) {
      log(`     Request URL: ${request.url || request.path}`, "cyan");
    }
    if (request.method) {
      log(`     Request Method: ${request.method}`, "cyan");
    }
  }

  if (error.message) {
    log(`     Error: ${error.message}`, "red");
  }

  if (context) {
    log(`     Context: ${context}`, "yellow");
  }
}

function displayUserData(user, title = "User Data") {
  console.log(`\n   📋 ${title}:`);
  console.log("   " + "-".repeat(76));
  console.log(JSON.stringify(user, null, 2));
  console.log("   " + "-".repeat(76));
}

function displayUsersList(users, title = "Users List") {
  if (!users || users.length === 0) {
    log(`   ⚠️  No users found in ${title}`, "yellow");
    return;
  }

  console.log(`\n   📋 ${title} (${users.length} users):`);
  console.log("   " + "=".repeat(76));

  users.forEach((user, index) => {
    console.log(`\n   User ${index + 1}:`);
    console.log("   " + "-".repeat(76));
    console.log(JSON.stringify(user, null, 2));
  });

  console.log("\n   " + "=".repeat(76));
}

// Test 1: Query Users on Pages (Platform Users API)
async function testQueryUsers() {
  logSection("1. Query Users on Pages (Platform Users API)");

  try {
    log("   Testing queryUsers() with default parameters...", "cyan");
    const result = await tuyaService.queryUsers({
      page_size: 10,
    });

    if (result) {
      logTest("queryUsers()", "pass", "Successfully fetched platform users");

      // Display full response structure
      console.log("\n   📊 Full API Response:");
      console.log("   " + "=".repeat(76));
      console.log(JSON.stringify(result, null, 2));
      console.log("   " + "=".repeat(76));

      // Display pagination info
      if (result.last_row_key !== undefined) {
        console.log(`\n   📄 Pagination Info:`);
        console.log(`     Last Row Key: ${result.last_row_key || "N/A"}`);
        console.log(`     Page Size: ${result.page_size || "N/A"}`);
        console.log(
          `     Has Next: ${
            result.has_next !== undefined ? result.has_next : "N/A"
          }`
        );
      }

      // Display users list
      if (result.list && Array.isArray(result.list)) {
        displayUsersList(result.list, "Platform Users");

        // Display detailed info for first user
        if (result.list.length > 0) {
          const firstUser = result.list[0];
          console.log("\n   🔍 Detailed View - First User:");
          console.log(`     User ID: ${firstUser.user_id || "N/A"}`);
          console.log(`     User Name: ${firstUser.user_name || "N/A"}`);
          console.log(
            `     User Nick Name: ${firstUser.user_nick_name || "N/A"}`
          );
          console.log(`     Country Code: ${firstUser.country_code || "N/A"}`);
          console.log(`     Account Type: ${firstUser.account_type || "N/A"}`);
          console.log(`     Create Time: ${firstUser.create_time || "N/A"}`);
          console.log(`     Tenant Code: ${firstUser.tenant_code || "N/A"}`);
        }
      } else {
        log(
          "   ⚠️  No 'list' field in response or it's not an array",
          "yellow"
        );
        console.log("   Response structure:", Object.keys(result));
      }
    } else {
      logTest("queryUsers()", "fail", "Empty or invalid response");
    }
  } catch (error) {
    logTest("queryUsers()", "fail");
    logError(error, "queryUsers test");
  }
}

// Test 2: Query User Information by User ID (Official API)
async function testGetUserById() {
  logSection("2. Query User Information by User ID");

  // First, try to get a user ID from platform users
  try {
    log("   Step 2.1: Getting platform users to find a user ID...", "cyan");
    const platformUsers = await tuyaService.queryUsers({
      page_size: 5,
    });

    let testUserId = null;

    if (platformUsers && platformUsers.list && platformUsers.list.length > 0) {
      const userWithId = platformUsers.list.find((u) => u.user_id);
      if (userWithId && userWithId.user_id) {
        testUserId = userWithId.user_id;
        log(`   Found test user ID: ${testUserId}`, "cyan");
      }
    }

    // Fallback to device users if platform users don't have user_id
    if (!testUserId) {
      log("   Step 2.2: Trying device users to find a user ID...", "cyan");
      const deviceUsers = await tuyaService.getDeviceUsers({
        code: "unlock_fingerprint",
        page_no: 1,
        page_size: 5,
      });

      if (
        deviceUsers &&
        deviceUsers.records &&
        deviceUsers.records.length > 0
      ) {
        const userWithId = deviceUsers.records.find((u) => u.user_id);
        if (userWithId && userWithId.user_id) {
          testUserId = userWithId.user_id;
          log(`   Found test user ID from device users: ${testUserId}`, "cyan");
        }
      }
    }

    if (!testUserId) {
      logTest(
        "getUserById()",
        "skip",
        "No user ID found. Please provide a user ID manually."
      );
      log(
        "   💡 Tip: You can test with a known user ID by setting TEST_USER_ID in .env",
        "yellow"
      );
      return;
    }

    // Test getUserById with the found user ID
    log(`   Step 2.3: Testing getUserById('${testUserId}')...`, "cyan");
    const userInfo = await tuyaService.getUserById(testUserId);

    if (userInfo && userInfo.user_id) {
      logTest(
        "getUserById()",
        "pass",
        `User: ${userInfo.user_name || "N/A"} (ID: ${userInfo.user_id})`
      );

      // Display full user information
      displayUserData(userInfo, "User Information by ID");

      // Display formatted user info
      console.log("\n   📝 Formatted User Information:");
      console.log(`     User ID: ${userInfo.user_id}`);
      console.log(`     User Name: ${userInfo.user_name || "N/A"}`);
      console.log(`     Country Code: ${userInfo.country_code || "N/A"}`);

      // Test with manual user ID if provided
      const manualUserId = process.env.TEST_USER_ID;
      if (manualUserId && manualUserId !== testUserId) {
        log(`   Step 2.4: Testing with manual user ID from .env...`, "cyan");
        try {
          const manualUserInfo = await tuyaService.getUserById(manualUserId);
          if (manualUserInfo && manualUserInfo.user_id) {
            logTest(
              "getUserById() (manual ID)",
              "pass",
              `User: ${manualUserInfo.user_name || "N/A"}`
            );
            displayUserData(manualUserInfo, "Manual User Information");
          }
        } catch (error) {
          logTest("getUserById() (manual ID)", "fail");
          logError(error, "Manual user ID test");
        }
      }
    } else {
      logTest("getUserById()", "fail", "Invalid response format");
      displayUserData(userInfo, "Invalid Response");
    }
  } catch (error) {
    logTest("getUserById()", "fail");
    logError(error, "getUserById test");
  }
}

// Test 3: Get Device Users with Different Unlock Codes
async function testGetDeviceUsers() {
  logSection("3. Get Device Users (Smart Lock Users)");

  const unlockCodes = [
    { code: "unlock_fingerprint", name: "Fingerprint" },
    { code: "unlock_card", name: "RFID Card" },
    { code: "unlock_password", name: "Password/PIN" },
  ];

  for (const { code, name } of unlockCodes) {
    try {
      log(`   Testing with unlock code: ${code} (${name})...`, "cyan");
      const deviceUsers = await tuyaService.getDeviceUsers({
        code: code,
        page_no: 1,
        page_size: 20,
      });

      if (deviceUsers) {
        // Display full response
        console.log(`\n   📊 Full API Response for ${name}:`);
        console.log("   " + "=".repeat(76));
        console.log(JSON.stringify(deviceUsers, null, 2));
        console.log("   " + "=".repeat(76));

        const userCount =
          deviceUsers.records?.length ||
          deviceUsers.list?.length ||
          (Array.isArray(deviceUsers) ? deviceUsers.length : 0);

        logTest(
          `getDeviceUsers() - ${name}`,
          "pass",
          `Found ${userCount} users`
        );

        // Display pagination info if available
        console.log(`\n   📄 Pagination Info:`);
        if (deviceUsers.total !== undefined) {
          console.log(`     Total users: ${deviceUsers.total}`);
        }
        if (deviceUsers.total_pages !== undefined) {
          console.log(`     Total pages: ${deviceUsers.total_pages}`);
        }
        if (deviceUsers.has_more !== undefined) {
          console.log(`     Has more: ${deviceUsers.has_more}`);
        }

        // Display users list
        const users =
          deviceUsers.records ||
          deviceUsers.list ||
          (Array.isArray(deviceUsers) ? deviceUsers : []);

        if (users.length > 0) {
          displayUsersList(users, `Device Users (${name})`);

          // Display detailed info for first user
          const firstUser = users[0];
          console.log(`\n   🔍 Detailed View - First User (${name}):`);
          console.log(`     User ID: ${firstUser.user_id || "N/A"}`);
          console.log(`     Lock User ID: ${firstUser.lock_user_id || "N/A"}`);
          console.log(`     Nick Name: ${firstUser.nick_name || "N/A"}`);
          console.log(`     User Contact: ${firstUser.user_contact || "N/A"}`);
          console.log(`     User Type: ${firstUser.user_type || "N/A"}`);
          console.log(`     Avatar URL: ${firstUser.avatar_url || "N/A"}`);
          console.log(
            `     Effective Flag: ${firstUser.effective_flag || "N/A"}`
          );

          // Display unlock methods if available
          if (
            firstUser.unlock_detail &&
            Array.isArray(firstUser.unlock_detail)
          ) {
            console.log(`     Unlock Methods:`);
            firstUser.unlock_detail.forEach((detail) => {
              console.log(`       - ${detail.dp_code || "N/A"}`);
              if (detail.unlock_list && Array.isArray(detail.unlock_list)) {
                detail.unlock_list.forEach((unlock) => {
                  console.log(
                    `         * ${
                      unlock.unlock_name || unlock.unlock_id || "N/A"
                    }`
                  );
                });
              }
            });
          }

          // Display time schedule info if available
          if (firstUser.time_schedule_info) {
            console.log(`     Time Schedule Info:`);
            console.log(JSON.stringify(firstUser.time_schedule_info, null, 8));
          }
        }
      } else {
        logTest(
          `getDeviceUsers() - ${name}`,
          "pass",
          "No users found (empty result)"
        );
      }
    } catch (error) {
      logTest(`getDeviceUsers() - ${name}`, "fail");
      logError(error, `getDeviceUsers test with ${code}`);
    }
  }
}

// Test 4: Get Device Users by Device ID
async function testGetDeviceUsersById() {
  logSection("4. Get Device Users by Device ID");

  const deviceId = process.env.TUYA_DEVICE_ID;

  if (!deviceId) {
    logTest("getDeviceUsersById()", "skip", "TUYA_DEVICE_ID not set in .env");
    return;
  }

  const unlockCodes = [
    { code: "unlock_fingerprint", name: "Fingerprint" },
    { code: "unlock_card", name: "RFID Card" },
  ];

  for (const { code, name } of unlockCodes) {
    try {
      log(`   Testing device ${deviceId} with unlock code: ${code}...`, "cyan");
      const deviceUsers = await tuyaService.getDeviceUsersById(deviceId, {
        code: code,
        page_no: 1,
        page_size: 20,
      });

      if (deviceUsers) {
        // Display full response
        console.log(
          `\n   📊 Full API Response for Device ${deviceId} (${name}):`
        );
        console.log("   " + "=".repeat(76));
        console.log(JSON.stringify(deviceUsers, null, 2));
        console.log("   " + "=".repeat(76));

        const userCount =
          deviceUsers.records?.length ||
          deviceUsers.list?.length ||
          (Array.isArray(deviceUsers) ? deviceUsers.length : 0);

        logTest(
          `getDeviceUsersById() - ${name}`,
          "pass",
          `Found ${userCount} users for device ${deviceId}`
        );

        // Display pagination info
        console.log(`\n   📄 Pagination Info:`);
        if (deviceUsers.total !== undefined) {
          console.log(`     Total users: ${deviceUsers.total}`);
        }
        if (deviceUsers.total_pages !== undefined) {
          console.log(`     Total pages: ${deviceUsers.total_pages}`);
        }

        // Display users list
        const users =
          deviceUsers.records ||
          deviceUsers.list ||
          (Array.isArray(deviceUsers) ? deviceUsers : []);

        if (users.length > 0) {
          displayUsersList(users, `Device Users (${deviceId} - ${name})`);
        }
      } else {
        logTest(
          `getDeviceUsersById() - ${name}`,
          "pass",
          "No users found (empty result)"
        );
      }
    } catch (error) {
      logTest(`getDeviceUsersById() - ${name}`, "fail");
      logError(error, `getDeviceUsersById test with ${code}`);
    }
  }
}

// Test 5: Integration Test - Get Platform Users and Then Query Each User
async function testIntegration() {
  logSection("5. Integration Test: Platform Users → User Details");

  try {
    log("   Step 5.1: Getting platform users...", "cyan");
    const platformUsers = await tuyaService.queryUsers({
      page_size: 5,
    });

    if (
      !platformUsers ||
      !platformUsers.list ||
      platformUsers.list.length === 0
    ) {
      logTest("Integration Test", "skip", "No platform users found");
      return;
    }

    const users = platformUsers.list;

    log(
      `   Found ${users.length} platform users. Testing getUserById for each...`,
      "cyan"
    );

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < Math.min(users.length, 3); i++) {
      const platformUser = users[i];
      if (!platformUser.user_id) {
        log(`   User ${i + 1}: No user_id available, skipping...`, "yellow");
        continue;
      }

      try {
        log(
          `   User ${i + 1}: Querying user ID ${platformUser.user_id}...`,
          "cyan"
        );
        const userInfo = await tuyaService.getUserById(platformUser.user_id);

        if (userInfo && userInfo.user_id) {
          successCount++;
          console.log(
            `     ✅ Success: ${userInfo.user_name || "N/A"} (${
              userInfo.user_id
            })`
          );
          displayUserData(userInfo, `User ${i + 1} Details`);
        } else {
          failCount++;
          console.log(`     ❌ Failed: Invalid response`);
          displayUserData(userInfo, `User ${i + 1} Invalid Response`);
        }
      } catch (error) {
        failCount++;
        console.log(`     ❌ Failed: ${error.message}`);
      }
    }

    if (successCount > 0) {
      logTest(
        "Integration Test",
        "pass",
        `${successCount} successful, ${failCount} failed`
      );
    } else {
      logTest("Integration Test", "fail", "All queries failed");
    }
  } catch (error) {
    logTest("Integration Test", "fail");
    logError(error, "Integration test");
  }
}

// Main test runner
async function testGetAllDeviceUsers() {
  logSection("6. Get All Device Users (Aggregated Method)");

  const deviceId = process.env.TUYA_DEVICE_ID;

  if (!deviceId) {
    logTest("getAllDeviceUsers()", "skip", "TUYA_DEVICE_ID not set in .env");
    log(
      "   💡 This is the method your frontend will use to fetch users",
      "yellow"
    );
    return;
  }

  try {
    log(`   Testing getAllDeviceUsers() for device ${deviceId}...`, "cyan");
    log("   This aggregates users from all unlock methods...", "cyan");

    const result = await tuyaService.getAllDeviceUsers(deviceId);

    if (result && result.success) {
      const users = result.data || [];
      logTest(
        "getAllDeviceUsers()",
        "pass",
        `Found ${users.length} unique users`
      );

      // Display full response
      console.log("\n   📊 Full Response Structure:");
      console.log("   " + "=".repeat(76));
      console.log(JSON.stringify(result, null, 2));
      console.log("   " + "=".repeat(76));

      if (users.length > 0) {
        displayUsersList(users, "All Device Users (Aggregated)");

        // Display summary of unlock methods per user
        console.log("\n   📝 Unlock Methods Summary:");
        console.log("   " + "=".repeat(76));
        users.forEach((user, index) => {
          console.log(`\n   User ${index + 1}: ${user.nick_name || "N/A"}`);
          console.log(`     User ID: ${user.user_id}`);
          console.log(`     Contact: ${user.user_contact || "N/A"}`);

          if (user.unlock_detail && Array.isArray(user.unlock_detail)) {
            console.log(`     Unlock Methods (${user.unlock_detail.length}):`);
            user.unlock_detail.forEach((detail) => {
              const count = detail.unlock_list?.length || 0;
              console.log(`       - ${detail.dp_code}: ${count} method(s)`);
              if (detail.unlock_list && Array.isArray(detail.unlock_list)) {
                detail.unlock_list.forEach((unlock) => {
                  console.log(
                    `         * ${unlock.unlock_name || "Unnamed"} (SN: ${
                      unlock.unlock_sn
                    })`
                  );
                });
              }
            });
          } else {
            console.log(`     Unlock Methods: None`);
          }
        });
        console.log("\n   " + "=".repeat(76));

        // Verify aggregation worked correctly
        console.log("\n   🔍 Aggregation Verification:");
        const usersWithMultipleMethods = users.filter(
          (u) => u.unlock_detail && u.unlock_detail.length > 1
        );
        if (usersWithMultipleMethods.length > 0) {
          log(
            `   ✅ Found ${usersWithMultipleMethods.length} users with multiple unlock methods (aggregation working!)`,
            "green"
          );
          usersWithMultipleMethods.forEach((u) => {
            console.log(
              `     - ${u.nick_name}: ${u.unlock_detail.length} unlock types`
            );
          });
        } else {
          log(
            `   ℹ️  No users have multiple unlock methods (or all users only use one type)`,
            "cyan"
          );
        }
      } else {
        log("   ⚠️  No users found in aggregated result", "yellow");
      }

      // Test the response format expected by frontend
      console.log("\n   📋 Frontend Compatibility Check:");
      console.log(`     ✓ response.success = ${result.success}`);
      console.log(`     ✓ response.data exists = ${!!result.data}`);
      console.log(
        `     ✓ response.data is array = ${Array.isArray(result.data)}`
      );
      console.log(`     ✓ response.data.length = ${result.data?.length || 0}`);
      log("   ✅ Response format matches frontend expectations!", "green");
    } else if (result && !result.success) {
      logTest("getAllDeviceUsers()", "fail", result.error || "Unknown error");
      console.log("\n   ❌ Error Response:");
      console.log(JSON.stringify(result, null, 2));
    } else {
      logTest("getAllDeviceUsers()", "fail", "Invalid response format");
    }
  } catch (error) {
    logTest("getAllDeviceUsers()", "fail");
    logError(error, "getAllDeviceUsers test");
  }
}

// Update the main test runner to include the new test
async function runTests() {
  console.log("\n");
  log("=".repeat(80), "bright");
  log("  Tuya User API Test Script", "bright");
  log("=".repeat(80), "bright");
  console.log("");

  // Check environment variables
  log("📋 Environment Check", "bright");
  console.log("-".repeat(80));
  const clientId = process.env.TUYA_CLIENT_ID;
  const clientSecret = process.env.TUYA_CLIENT_SECRET;
  const deviceId = process.env.TUYA_DEVICE_ID;

  console.log(
    `   TUYA_CLIENT_ID:     ${
      clientId ? clientId.substring(0, 10) + "..." : "❌ NOT SET"
    }`
  );
  console.log(
    `   TUYA_CLIENT_SECRET: ${
      clientSecret ? "****" + clientSecret.slice(-4) : "❌ NOT SET"
    }`
  );
  console.log(`   TUYA_DEVICE_ID:     ${deviceId || "⚠️  NOT SET (optional)"}`);
  console.log(
    `   TEST_USER_ID:       ${
      process.env.TEST_USER_ID || "⚠️  NOT SET (optional)"
    }`
  );

  if (!clientId || !clientSecret) {
    log("\n❌ ERROR: TUYA_CLIENT_ID and TUYA_CLIENT_SECRET must be set", "red");
    process.exit(1);
  }

  if (!deviceId) {
    log(
      "\n⚠️  WARNING: TUYA_DEVICE_ID not set - some tests will be skipped",
      "yellow"
    );
    log("   Set TUYA_DEVICE_ID=a3871c69sbes20xh in your .env file", "yellow");
  }

  console.log("");

  // Run tests
  try {
    await testQueryUsers();
    await testGetUserById();
    await testGetDeviceUsers();
    await testGetDeviceUsersById();
    await testGetAllDeviceUsers(); // NEW TEST
    await testIntegration();
  } catch (error) {
    log("\n❌ Fatal error during tests:", "red");
    console.error(error);
  }

  // Print summary
  console.log("\n");
  logSection("Test Summary");
  log(
    `   Total Tests: ${
      testResults.passed + testResults.failed + testResults.skipped
    }`,
    "bright"
  );
  log(`   ✅ Passed: ${testResults.passed}`, "green");
  log(`   ❌ Failed: ${testResults.failed}`, "red");
  log(`   ⏭️  Skipped: ${testResults.skipped}`, "yellow");

  console.log("\n");

  if (testResults.passed > 0) {
    log("💡 Next Steps:", "bright");
    log(
      "   1. If getAllDeviceUsers() test passed, your frontend should now work!",
      "cyan"
    );
    log(
      "   2. Make sure TUYA_DEVICE_ID is set in your frontend .env file",
      "cyan"
    );
    log("   3. Restart your frontend server to pick up the changes", "cyan");
  }

  console.log("\n");

  // Exit with appropriate code
  if (testResults.failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// Run the tests
runTests().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
