/**
 * Tuya IoT API Connection Test
 * Run with: node scripts/test-tuya.js
 *
 * Tests the Tuya IoT Cloud API authentication and basic calls.
 */

require("dotenv").config();
const crypto = require("crypto");
const axios = require("axios");

const CLIENT_ID = process.env.TUYA_CLIENT_ID;
const CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET;
const DEVICE_ID = process.env.TUYA_DEVICE_ID;
const API_ENDPOINT =
  process.env.TUYA_API_ENDPOINT || "https://openapi-sg.iotbing.com";

console.log("=".repeat(70));
console.log("  Tuya IoT Cloud API Connection Test");
console.log("=".repeat(70));
console.log("");

// Check environment variables
console.log("📋 Step 1: Checking environment variables");
console.log("-".repeat(70));
console.log(
  `   TUYA_CLIENT_ID:     ${
    CLIENT_ID ? CLIENT_ID.substring(0, 10) + "..." : "❌ NOT SET"
  }`
);
console.log(
  `   TUYA_CLIENT_SECRET: ${
    CLIENT_SECRET ? "****" + CLIENT_SECRET.slice(-4) : "❌ NOT SET"
  }`
);
console.log(
  `   TUYA_DEVICE_ID:     ${
    DEVICE_ID ? DEVICE_ID : "⚠️  NOT SET (optional for token test)"
  }`
);
console.log(`   TUYA_API_ENDPOINT:  ${API_ENDPOINT}`);
console.log("");

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "❌ ERROR: TUYA_CLIENT_ID and TUYA_CLIENT_SECRET must be set in .env file"
  );
  console.log("");
  console.log("How to get credentials:");
  console.log("1. Go to https://iot.tuya.com");
  console.log("2. Open your Cloud Project");
  console.log("3. Go to: Overview > Authorization Key");
  console.log("4. Copy Access ID → TUYA_CLIENT_ID");
  console.log("5. Copy Access Secret → TUYA_CLIENT_SECRET");
  process.exit(1);
}

function generateNonce() {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Calculate string to sign according to Tuya documentation
 * Reference: https://developer.tuya.com/en/docs/iot/new-singnature?id=Kbw0q34cs2e5g
 *
 * stringToSign = HTTPMethod + "\n" +
 *                Content-SHA256 + "\n" +
 *                Optional_Signature_key + "\n" +
 *                URL
 */
function calcStringToSign(method, path, body = "") {
  const httpMethod = method.toUpperCase();

  // Calculate SHA256 hash of body as UTF-8 bytes
  // Empty body hashes to: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  const bodyStr = body || "";
  const bodyBytes = Buffer.from(bodyStr, "utf8");
  const contentHash = crypto
    .createHash("sha256")
    .update(bodyBytes)
    .digest("hex");

  // Optional_Signature_key (empty for basic requests, no custom headers)
  const optionalSignatureKey = "";

  // URL path (includes query string if present)
  const url = path;

  // Combine into stringToSign with newlines
  return `${httpMethod}\n${contentHash}\n${optionalSignatureKey}\n${url}`;
}

/**
 * Calculate signature - simplified version
 * Text to encrypt: clientId + timestamp
 * Secret Key: clientSecret
 * Result: HMAC-SHA256, converted to UPPERCASE
 */
function calcSign(
  clientId,
  accessToken,
  timestamp,
  nonce,
  stringToSign,
  secret
) {
  // Simplified: just clientId + timestamp
  const signStr = clientId + timestamp;

  return crypto
    .createHmac("sha256", secret)
    .update(signStr, "utf8")
    .digest("hex")
    .toUpperCase();
}

async function getToken() {
  console.log("🔑 Step 2: Getting access token");
  console.log("-".repeat(70));

  const path = "/v1.0/token?grant_type=1";
  const timestamp = Date.now().toString();
  const nonce = generateNonce();

  const stringToSign = calcStringToSign("GET", path, "");
  const sign = calcSign(
    CLIENT_ID,
    null,
    timestamp,
    nonce,
    stringToSign,
    CLIENT_SECRET
  );

  console.log(`   Path: ${path}`);
  console.log(`   Timestamp: ${timestamp}`);
  console.log(`   Nonce: ${nonce.substring(0, 16)}...`);
  console.log(`   Sign: ${sign.substring(0, 20)}...`);

  // Debug: Show signature calculation details
  if (process.env.DEBUG_SIGNATURE === "true") {
    console.log("\n   [DEBUG] Signature Calculation:");
    const signStr = CLIENT_ID + timestamp;
    console.log(`   Sign String: ${signStr}`);
    console.log(`   Sign String Length: ${signStr.length}`);
    console.log(`   Client ID: ${CLIENT_ID}`);
    console.log(`   Timestamp: ${timestamp}`);
  }

  console.log("");

  const headers = {
    client_id: CLIENT_ID,
    sign: sign,
    t: timestamp,
    nonce: nonce,
    sign_method: "HMAC-SHA256",
  };

  try {
    const response = await axios.get(`${API_ENDPOINT}${path}`, { headers });

    if (response.data.success) {
      console.log("   ✅ Token obtained successfully!");
      console.log(
        `   Access Token: ${response.data.result.access_token.substring(
          0,
          25
        )}...`
      );
      console.log(`   Expires in: ${response.data.result.expire_time} seconds`);
      return response.data.result;
    } else {
      console.log(`   ❌ Token request failed!`);
      console.log(`   Error Code: ${response.data.code}`);
      console.log(`   Error Message: ${response.data.msg}`);

      if (response.data.code === 1004) {
        printSignatureHelp();
      }
      return null;
    }
  } catch (error) {
    console.log(`   ❌ Request failed: ${error.message}`);
    if (error.response) {
      console.log(`   Response: ${JSON.stringify(error.response.data)}`);
    }
    return null;
  }
}

async function testDeviceAPI(accessToken) {
  if (!DEVICE_ID) {
    console.log("");
    console.log("⚠️  Skipping device test (TUYA_DEVICE_ID not set)");
    return;
  }

  console.log("");
  console.log("📱 Step 3: Testing device API");
  console.log("-".repeat(70));

  const path = `/v1.0/iot-03/devices/${DEVICE_ID}/status`;
  const timestamp = Date.now().toString();
  const nonce = generateNonce();

  const stringToSign = calcStringToSign("GET", path, "");
  const sign = calcSign(
    CLIENT_ID,
    accessToken,
    timestamp,
    nonce,
    stringToSign,
    CLIENT_SECRET
  );

  const headers = {
    client_id: CLIENT_ID,
    access_token: accessToken,
    sign: sign,
    t: timestamp,
    nonce: nonce,
    sign_method: "HMAC-SHA256",
    "Content-Type": "application/json",
  };

  console.log(`   Testing: GET ${path}`);

  try {
    const response = await axios.get(`${API_ENDPOINT}${path}`, { headers });

    if (response.data.success) {
      console.log("   ✅ Device API call successful!");
      console.log(
        `   Device Status: ${JSON.stringify(
          response.data.result,
          null,
          2
        ).substring(0, 200)}...`
      );
    } else {
      console.log(`   ❌ Device API failed!`);
      console.log(`   Error Code: ${response.data.code}`);
      console.log(`   Error Message: ${response.data.msg}`);

      if (response.data.code === 1004) {
        console.log("");
        console.log(
          "   💡 Hint: Token is valid but device API signature failed."
        );
        console.log(
          "      Make sure access_token is included in signature for API calls."
        );
      }
    }
  } catch (error) {
    console.log(`   ❌ Request failed: ${error.message}`);
  }
}

function printSignatureHelp() {
  console.log("");
  console.log("=".repeat(70));
  console.log("  🔧 Troubleshooting 'sign invalid' (Error 1004)");
  console.log("=".repeat(70));
  console.log("");
  console.log("1. VERIFY CREDENTIALS TYPE:");
  console.log(
    "   Make sure you're using CLOUD PROJECT credentials, not App SDK."
  );
  console.log(
    "   Location: iot.tuya.com > Your Project > Overview > Authorization Key"
  );
  console.log("");
  console.log("2. VERIFY DATA CENTER:");
  console.log("   Your API endpoint must match your project's data center:");
  console.log("   - Singapore: https://openapi.tuyasg.com");
  console.log("   - China:     https://openapi.tuyacn.com");
  console.log("   - USA:       https://openapi.tuyaus.com");
  console.log("   - Europe:    https://openapi.tuyaeu.com");
  console.log("   - India:     https://openapi.tuyain.com");
  console.log("");
  console.log("3. CHECK SYSTEM TIME:");
  console.log(
    "   Your system clock must be synchronized (within 5 minutes of server)."
  );
  console.log(`   Current timestamp: ${Date.now()}`);
  console.log(`   Current time: ${new Date().toISOString()}`);
  console.log("");
  console.log("4. API SUBSCRIPTION:");
  console.log(
    "   Make sure you've subscribed to required APIs in Cloud > API Explorer"
  );
  console.log("");
}

async function run() {
  const token = await getToken();

  if (token) {
    await testDeviceAPI(token.access_token);

    console.log("");
    console.log("=".repeat(70));
    console.log("  ✅ CONNECTION TEST PASSED!");
    console.log("=".repeat(70));
    console.log("");
    console.log("Your Tuya IoT API is configured correctly.");
    console.log("Restart your backend server to apply changes.");
  } else {
    console.log("");
    console.log("=".repeat(70));
    console.log("  ❌ CONNECTION TEST FAILED!");
    console.log("=".repeat(70));
    printSignatureHelp();
  }
}

run();
