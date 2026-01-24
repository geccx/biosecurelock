/**
 * Test a single Tuya endpoint with full debug output
 * Usage: node scripts/test-tuya-single.js [method] [path] [body_json]
 * Example: node scripts/test-tuya-single.js GET /v1.0/iot-03/devices/{device_id}/status
 */

require("dotenv").config();
const tuyaService = require("../services/tuya.service");

const method = process.argv[2] || "GET";
const path = process.argv[3] || "/v1.0/iot-03/devices/" + process.env.TUYA_DEVICE_ID + "/status";
const bodyJson = process.argv[4] ? JSON.parse(process.argv[4]) : null;

// Enable debug mode
process.env.DEBUG_SIGNATURE = "true";

console.log("Testing Tuya Endpoint:");
console.log(`Method: ${method}`);
console.log(`Path: ${path}`);
console.log(`Body: ${bodyJson ? JSON.stringify(bodyJson) : "(empty)"}`);
console.log("");

async function test() {
  try {
    // Call a public method that uses _makeRequest internally
    // For GET requests, use getDeviceStatus as an example
    if (method === "GET" && path.includes("/status")) {
      const result = await tuyaService.getDeviceStatus();
      console.log("\n✅ SUCCESS!");
      console.log("Result:", JSON.stringify(result, null, 2));
    } else {
      // For other methods, we need to call _makeRequest directly
      // But it's private, so let's use a workaround
      console.log("Note: This script needs to be updated to test specific endpoints");
      console.log("For now, use the comprehensive test script: npm run test:tuya");
    }
  } catch (error) {
    console.log("\n❌ FAILED!");
    if (error.response) {
      console.log("Response:", JSON.stringify(error.response.data, null, 2));
    } else {
      console.log("Error:", error.message);
    }
    process.exit(1);
  }
}

test();

