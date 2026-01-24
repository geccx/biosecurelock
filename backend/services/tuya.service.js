const axios = require("axios");
const crypto = require("crypto");
const logger = require("../utils/logger");

/**
 * Tuya IoT Core API Service
 * Based on official Tuya IoT Core documentation:
 * https://developer.tuya.com/en/docs/cloud/device-connection-service?id=Kb0b8geg6o761
 *
 * Authentication reference:
 * https://developer.tuya.com/en/docs/iot/authentication-method?id=Ka49gbaxjygox
 *
 * Singapore Data Center: https://openapi.tuyasg.com
 */
class TuyaService {
  constructor() {
    this.clientId = process.env.TUYA_CLIENT_ID;
    this.clientSecret = process.env.TUYA_CLIENT_SECRET;
    this.deviceId = process.env.TUYA_DEVICE_ID;
    this.apiEndpoint =
      process.env.TUYA_API_ENDPOINT || "https://openapi-sg.iotbing.com";
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Calculate string to sign
   * Reference: https://developer.tuya.com/en/docs/iot/new-singnature?id=Kbw0q34cs2e5g
   *
   * stringToSign = HTTPMethod + "\n" +
   *                Content-SHA256 + "\n" +
   *                Optional_Signature_key + "\n" +
   *                URL
   *
   * Content-SHA256: SHA256 hash of request body as UTF-8 bytes
   * Empty body hashes to: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
   */
  _calcStringToSign(method, path, headers = {}, body = "") {
    const httpMethod = method.toUpperCase();

    // Convert body to string if it's an object, then hash as UTF-8 bytes
    const bodyStr =
      body && typeof body === "object" ? JSON.stringify(body) : body || "";
    const bodyBytes = Buffer.from(bodyStr, "utf8");
    const contentHash = crypto
      .createHash("sha256")
      .update(bodyBytes)
      .digest("hex");

    // Optional_Signature_key (empty for basic requests, no custom headers)
    // According to Tuya docs: if empty, it's just an empty string (blank line in stringToSign)
    // If custom headers are needed (like area_id:call_id), they would go here
    const optionalSignatureKey = "";

    // URL path (includes query string if present)
    // Must match exactly what's sent in the request
    const url = path;

    // Combine into stringToSign with newlines
    // Format: HTTPMethod + "\n" + Content-SHA256 + "\n" + Optional_Signature_key + "\n" + URL
    // When Optional_Signature_key is empty, we get: HTTPMethod\nContent-SHA256\n\nURL
    const stringToSign = `${httpMethod}\n${contentHash}\n${optionalSignatureKey}\n${url}`;

    return stringToSign;
  }

  /**
   * Calculate signature according to Tuya documentation
   * Reference: https://developer.tuya.com/en/docs/iot/new-singnature?id=Kbw0q34cs2e5g
   *
   * For token management API (no access_token):
   *   str = client_id + t + nonce + stringToSign
   *   sign = HMAC-SHA256(str, secret).toUpperCase()
   *
   * For general business API (with access_token):
   *   str = client_id + access_token + t + nonce + stringToSign
   *   sign = HMAC-SHA256(str, secret).toUpperCase()
   */
  _calcSign(clientId, accessToken, timestamp, nonce, stringToSign, secret) {
    let signStr;
    if (accessToken) {
      // General business API: include access_token
      signStr = clientId + accessToken + timestamp + nonce + stringToSign;
    } else {
      // Token management API: no access_token
      signStr = clientId + timestamp + nonce + stringToSign;
    }

    return crypto
      .createHmac("sha256", secret)
      .update(signStr, "utf8")
      .digest("hex")
      .toUpperCase();
  }

  /**
   * Generate random nonce for request
   */
  _generateNonce() {
    return crypto.randomBytes(16).toString("hex");
  }

  /**
   * Decrypt ticket_key using Access Secret (AES-256-ECB)
   * The ticket_key from getPasswordTicket is encrypted with Access Secret
   * Reference: https://developer.tuya.com/en/docs/cloud/doorlock-api-password?id=Kbe2nztqcoapu#title-4-Get%20a%20temporary%20key%20for%20password%20encryption
   *
   * @param {string} encryptedTicketKey - Encrypted ticket_key (hex format)
   * @returns {string} Decrypted ticket_key (hex format)
   */
  _decryptTicketKey(encryptedTicketKey) {
    try {
      // Convert hex string to buffer
      const encryptedBuffer = Buffer.from(encryptedTicketKey, "hex");

      // Prepare key: Access Secret must be exactly 32 bytes for AES-256
      // If Access Secret is a hex string, decode it; otherwise use UTF-8 and pad/truncate to 32 bytes
      let keyBuffer;
      if (this.clientSecret.length === 64) {
        // Assume it's a hex string (32 bytes when decoded)
        keyBuffer = Buffer.from(this.clientSecret, "hex");
      } else {
        // Use UTF-8 encoding and ensure it's 32 bytes
        const secretBuffer = Buffer.from(this.clientSecret, "utf8");
        if (secretBuffer.length === 32) {
          keyBuffer = secretBuffer;
        } else if (secretBuffer.length < 32) {
          // Pad with zeros if shorter
          keyBuffer = Buffer.concat([
            secretBuffer,
            Buffer.alloc(32 - secretBuffer.length),
          ]);
        } else {
          // Truncate if longer
          keyBuffer = secretBuffer.slice(0, 32);
        }
      }

      // Create decipher using AES-256-ECB
      const decipher = crypto.createDecipheriv(
        "aes-256-ecb",
        keyBuffer,
        null // ECB mode doesn't use IV
      );

      // Set auto padding (PKCS7)
      decipher.setAutoPadding(true);

      // Decrypt
      let decrypted = decipher.update(encryptedBuffer);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      // Return as hex string
      return decrypted.toString("hex");
    } catch (error) {
      throw new Error(`Failed to decrypt ticket_key: ${error.message}`);
    }
  }

  /**
   * Encrypt password using ticket_key (AES-128-ECB with PKCS7Padding)
   * The password must be encrypted with the decrypted ticket_key
   *
   * @param {string} plainPassword - Plain password (6 or 7 digits)
   * @param {string} ticketKey - Decrypted ticket_key (hex format)
   * @returns {string} Encrypted password (hex format)
   */
  _encryptPasswordWithTicket(plainPassword, ticketKey) {
    try {
      // Convert ticket_key from hex to buffer (use first 16 bytes for AES-128)
      const keyBuffer = Buffer.from(ticketKey, "hex").slice(0, 16);

      // Convert plain password to buffer
      const plainBuffer = Buffer.from(plainPassword, "utf8");

      // Create cipher using AES-128-ECB
      const cipher = crypto.createCipheriv(
        "aes-128-ecb",
        keyBuffer,
        null // ECB mode doesn't use IV
      );

      // Set auto padding (PKCS7)
      cipher.setAutoPadding(true);

      // Encrypt
      let encrypted = cipher.update(plainBuffer);
      encrypted = Buffer.concat([encrypted, cipher.final()]);

      // Return as hex string (uppercase as per Tuya documentation)
      return encrypted.toString("hex").toUpperCase();
    } catch (error) {
      throw new Error(`Failed to encrypt password: ${error.message}`);
    }
  }

  /**
   * Make authenticated API request to Tuya Cloud
   */
  async _makeRequest(method, path, queryParams = {}, body = null) {
    try {
      // Ensure we have a valid token
      await this._ensureValidToken();

      const timestamp = Date.now().toString();
      const nonce = this._generateNonce();

      // Stringify body BEFORE calculating signature
      let bodyForSignature = "";
      let bodyForRequest = null;

      if (body !== null && body !== undefined) {
        if (typeof body === "object") {
          if (Object.keys(body).length === 0) {
            bodyForSignature = "";
            bodyForRequest = null;
          } else {
            bodyForSignature = JSON.stringify(body);
            bodyForRequest = body;
          }
        } else {
          bodyForSignature = String(body);
          bodyForRequest = body;
        }
      }

      // Build query string if params exist
      // According to Tuya docs, query parameters should be sorted alphabetically
      // IMPORTANT: The query string in the signature must match EXACTLY what's sent in the request
      // Based on Tuya documentation, commas in query values are safe and should NOT be encoded
      let fullPath = path;
      if (Object.keys(queryParams).length > 0) {
        // Sort keys alphabetically as required by Tuya
        const sortedKeys = Object.keys(queryParams).sort();
        const queryParts = [];

        sortedKeys.forEach((key) => {
          const value = String(queryParams[key]);
          // Custom encoding: encode everything except commas
          // Commas are safe in query parameter values per RFC 3986
          // This matches Tuya's expected format
          let encodedValue = "";
          for (let i = 0; i < value.length; i++) {
            const char = value[i];
            if (char === ",") {
              // Keep commas unencoded
              encodedValue += ",";
            } else {
              // Encode other characters normally
              encodedValue += encodeURIComponent(char);
            }
          }
          queryParts.push(`${key}=${encodedValue}`);
        });

        const queryString = queryParts.join("&");
        fullPath = `${path}?${queryString}`;
      }

      // Calculate string to sign with full path including query params
      const stringToSign = this._calcStringToSign(
        method,
        fullPath, // Use full path with query string
        {},
        bodyForSignature
      );

      // Calculate signature
      const sign = this._calcSign(
        this.clientId,
        this.accessToken,
        timestamp,
        nonce,
        stringToSign,
        this.clientSecret
      );

      const headers = {
        client_id: this.clientId,
        access_token: this.accessToken,
        sign: sign,
        t: timestamp,
        nonce: nonce,
        sign_method: "HMAC-SHA256",
        "Content-Type": "application/json",
      };

      const url = `${this.apiEndpoint}${fullPath}`;

      console.log(`Tuya IoT API Request: ${method} ${fullPath}`);

      if (process.env.DEBUG_SIGNATURE === "true") {
        console.log("\n[DEBUG] Signature Calculation:");
        console.log(`Method: ${method}`);
        console.log(`Path: ${fullPath}`);
        console.log(`Full URL: ${url}`);
        console.log(`Query Params:`, queryParams);
        console.log(`Body (for signature): ${bodyForSignature || "(empty)"}`);
        console.log(`StringToSign (raw):`);
        console.log(stringToSign);
        console.log(`StringToSign (escaped): ${JSON.stringify(stringToSign)}`);
        const signStr =
          this.clientId + this.accessToken + timestamp + nonce + stringToSign;
        console.log(`Sign String: ${signStr.substring(0, 200)}...`);
        console.log(`Sign String Length: ${signStr.length}`);
        console.log(`Client ID: ${this.clientId}`);
        console.log(`Access Token: ${this.accessToken?.substring(0, 20)}...`);
        console.log(`Timestamp: ${timestamp}`);
        console.log(`Nonce: ${nonce}`);
        console.log(`Sign: ${sign}`);
      }

      // Use the manually built URL to ensure signature matches exactly
      const requestConfig = {
        method,
        url,
        headers,
      };

      if (
        bodyForRequest !== null &&
        bodyForRequest !== undefined &&
        method !== "GET"
      ) {
        requestConfig.data = bodyForRequest;
      }

      const response = await axios(requestConfig);

      if (!response.data.success) {
        console.error("Tuya API Error Response:", response.data);
        throw new Error(
          `Tuya API Error: ${
            response.data.msg || response.data.code || "Unknown error"
          }`
        );
      }

      // Log full response for temp-password endpoint
      if (path.includes("/door-lock/temp-password")) {
        console.log("\n" + "=".repeat(80));
        console.log("[_makeRequest] TUYA API RAW RESPONSE");
        console.log("=".repeat(80));
        console.log("Full Response Object:");
        console.log(JSON.stringify(response.data, null, 2));
        console.log("\nResponse Details:");
        console.log("  - success:", response.data.success);
        console.log("  - t (timestamp):", response.data.t);
        if (response.data.result) {
          console.log(
            "  - result:",
            JSON.stringify(response.data.result, null, 2)
          );
          if (response.data.result.id) {
            console.log("  - Password ID:", response.data.result.id);
          }
        }
        if (response.data.code) console.log("  - code:", response.data.code);
        if (response.data.msg) console.log("  - msg:", response.data.msg);
        console.log("=".repeat(80));
      }

      return response.data.result;
    } catch (error) {
      // Enhanced error logging for temp-password endpoint
      if (path.includes("/door-lock/temp-password")) {
        console.log("\n" + "=".repeat(80));
        console.log("[_makeRequest] TUYA API ERROR RESPONSE");
        console.log("=".repeat(80));
        console.error("Error Type:", error.constructor.name);
        console.error("Error Message:", error.message);
        if (error.response) {
          console.error(
            "\nHTTP Response Status:",
            error.response.status,
            error.response.statusText
          );
          console.error(
            "Response Headers:",
            JSON.stringify(error.response.headers, null, 2)
          );
          console.error(
            "Response Data:",
            JSON.stringify(error.response.data, null, 2)
          );
          if (error.response.data?.code) {
            console.error("  - Error Code:", error.response.data.code);
          }
          if (error.response.data?.msg) {
            console.error("  - Error Message:", error.response.data.msg);
          }
        } else if (error.request) {
          console.error("Request was made but no response received");
          console.error(
            "Request Config:",
            JSON.stringify(
              {
                url: error.config?.url,
                method: error.config?.method,
                headers: error.config?.headers
                  ? Object.keys(error.config.headers)
                  : null,
                hasData: !!error.config?.data,
              },
              null,
              2
            )
          );
        }
        console.error("Full Error Object:", error);
        console.log("=".repeat(80));
      } else {
        console.error(
          "Tuya API Request Error:",
          error.response?.data || error.message
        );
      }

      if (
        error.response?.data?.code === 1004 &&
        process.env.DEBUG_SIGNATURE !== "true"
      ) {
        console.error(
          "\n💡 Tip: Run with DEBUG_SIGNATURE=true to see signature details"
        );
      }

      throw error;
    }
  }

  /**
   * Ensure valid access token exists
   */
  async _ensureValidToken() {
    const now = Date.now();

    // If token doesn't exist or is expired (with 5 min buffer), get new token
    if (
      !this.accessToken ||
      !this.tokenExpiry ||
      now >= this.tokenExpiry - 300000
    ) {
      await this._getToken();
    }
  }

  /**
   * Get new access token from Tuya Cloud (Simple Mode)
   * Reference: https://developer.tuya.com/en/docs/iot/authentication-method?id=Ka49gbaxjygox
   */
  async _getToken() {
    try {
      const path = "/v1.0/token?grant_type=1";
      const timestamp = Date.now().toString();
      const nonce = this._generateNonce();

      // Calculate string to sign (no body for GET request)
      const stringToSign = this._calcStringToSign("GET", path, {}, "");

      // Calculate signature WITHOUT access token for token request
      const sign = this._calcSign(
        this.clientId,
        null, // No access token for token request
        timestamp,
        nonce,
        stringToSign,
        this.clientSecret
      );

      const headers = {
        client_id: this.clientId,
        sign: sign,
        t: timestamp,
        nonce: nonce,
        sign_method: "HMAC-SHA256",
      };

      const url = `${this.apiEndpoint}${path}`;
      console.log("Getting Tuya access token...");

      const response = await axios.get(url, { headers });

      if (!response.data.success) {
        console.error("Tuya Token Error:", response.data);
        throw new Error(
          `Failed to get token: ${response.data.msg || response.data.code}`
        );
      }

      this.accessToken = response.data.result.access_token;
      this.refreshToken = response.data.result.refresh_token;
      this.tokenExpiry = Date.now() + response.data.result.expire_time * 1000;

      console.log("Tuya access token obtained successfully");
    } catch (error) {
      console.error(
        "Error getting Tuya token:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken() {
    if (!this.refreshToken) {
      return this._getToken();
    }

    try {
      const path = `/v1.0/token/${this.refreshToken}`;
      const timestamp = Date.now().toString();
      const nonce = this._generateNonce();

      const stringToSign = this._calcStringToSign("GET", path, {}, "");
      const sign = this._calcSign(
        this.clientId,
        null,
        timestamp,
        nonce,
        stringToSign,
        this.clientSecret
      );

      const headers = {
        client_id: this.clientId,
        sign: sign,
        t: timestamp,
        nonce: nonce,
        sign_method: "HMAC-SHA256",
      };

      const response = await axios.get(`${this.apiEndpoint}${path}`, {
        headers,
      });

      if (!response.data.success) {
        return this._getToken();
      }

      this.accessToken = response.data.result.access_token;
      this.refreshToken = response.data.result.refresh_token;
      this.tokenExpiry = Date.now() + response.data.result.expire_time * 1000;

      console.log("Tuya access token refreshed successfully");
    } catch (error) {
      console.error(
        "Error refreshing token, getting new token:",
        error.message
      );
      return this._getToken();
    }
  }

  // ============================================
  // IoT Core - Device Management APIs
  // Reference: https://developer.tuya.com/en/docs/cloud/device-connection-service?id=Kb0b8geg6o761
  // ============================================

  /**
   * Query Device Details (IoT Core)
   * GET /v2.0/cloud/thing/{device_id}
   */
  async getDeviceDetails() {
    return await this._makeRequest("GET", `/v2.0/cloud/thing/${this.deviceId}`);
  }

  /**
   * Query Device State (IoT Core)
   * GET /v2.0/cloud/thing/{device_id}/state
   */
  async getDeviceState() {
    return await this._makeRequest(
      "GET",
      `/v2.0/cloud/thing/${this.deviceId}/state`
    );
  }

  /**
   * Get Device Operation Log (IoT Core)
   * GET /v2.0/cloud/thing/{device_id}/logs
   */
  /**
   * Get Device Logs (IoT Core v2.0)
   * Reference:
   * - https://developer.tuya.com/en/docs/cloud/f06dc21023?id=Kcp2l1a9zj0i3
   * - https://developer.tuya.com/en/docs/cloud/269c6a6b6b?id=Kduvi4xnjhav2
   * GET /v2.0/cloud/thing/{device_id}/logs
   * Query parameters: start_time, end_time, size, last_row_key
   *
   * Note: Timestamps should be in milliseconds (13 digits) for IoT Core v2.0 APIs
   * start_time and end_time are required parameters
   */
  async getDeviceLogs(params = {}) {
    const queryObj = {};

    // Optional: codes (String)
    if (
      params.codes !== undefined &&
      params.codes !== null &&
      params.codes !== ""
    ) {
      queryObj.codes = String(params.codes);
    }

    // Required: type (String)
    queryObj.type =
      params.type !== undefined ? String(params.type) : "1,2,3,4,5,6,7,8,9,10";

    // Optional: start_row_key (String)
    if (
      params.startRowKey !== undefined &&
      params.startRowKey !== null &&
      params.startRowKey !== ""
    ) {
      queryObj.start_row_key = String(params.startRowKey);
    }

    // Required: start_time (Long) - milliseconds for IoT Core API
    const now = Date.now();
    const yesterday = now - 86400000;

    let startTime =
      params.startTime !== undefined ? Number(params.startTime) : yesterday;
    if (startTime < 10000000000) {
      startTime = startTime * 1000;
    }
    queryObj.start_time = startTime;

    // Required: end_time (Long) - milliseconds for IoT Core API
    let endTime = params.endTime !== undefined ? Number(params.endTime) : now;
    if (endTime < 10000000000) {
      endTime = endTime * 1000;
    }
    queryObj.end_time = endTime;

    // Required: query_type (Integer)
    queryObj.query_type =
      params.queryType !== undefined ? Number(params.queryType) : 1;

    // Optional: last_row_key (String)
    if (
      params.lastRowKey !== undefined &&
      params.lastRowKey !== null &&
      params.lastRowKey !== ""
    ) {
      queryObj.last_row_key = String(params.lastRowKey);
    }

    // Optional: last_event_time (Long)
    if (params.lastEventTime !== undefined && params.lastEventTime !== null) {
      let lastEventTime = Number(params.lastEventTime);
      if (lastEventTime < 10000000000) {
        lastEventTime = lastEventTime * 1000;
      }
      queryObj.last_event_time = lastEventTime;
    }

    // Required: size (Integer)
    queryObj.size = Number(params.size) || 20;

    const sortedKeys = Object.keys(queryObj).sort();
    const queryString = sortedKeys
      .map((key) => `${key}=${encodeURIComponent(queryObj[key])}`)
      .join("&");

    const path = `/v2.0/cloud/thing/${this.deviceId}/logs?${queryString}`;

    return await this._makeRequest("GET", path);
  }

  /**
   * Query device log (v1.0 API)
   * Reference: https://developer.tuya.com/en/docs/archived-documents/0a30fc557f?id=Ka7kjybdo0jse
   * GET /v1.0/devices/{device_id}/logs
   *
   * @param {string} deviceId - Device ID (optional, defaults to this.deviceId)
   * @param {object} params - Query parameters
   * @param {string} params.codes - Function points (comma-separated, optional)
   * @param {string} params.type - Event types (comma-separated, required: 1 online, 2 offline, 3 device activation, 4 device reset, 5 instructions Issue, 6 firmware upgrade, 7 data point report, 8 device semaphore, 9 device restart, 10 timing information)
   * @param {number} params.start_time - Start timestamp in milliseconds (13 digits, required)
   * @param {number} params.end_time - End timestamp in milliseconds (13 digits, required)
   * @param {number} params.query_type - Query type (1 free version, 2 paid version, default: 1)
   * @param {string} params.start_row_key - Free version parameter, Hbase row key (optional)
   * @param {string} params.last_row_key - Paid version pagination parameter, row key of last data (optional)
   * @param {number} params.last_event_time - Paid version pagination parameter, event time of last data (optional)
   * @param {number} params.size - Number of logs to query (default: 20)
   */
  async getDeviceLogsV1(deviceId = null, params = {}) {
    const targetDeviceId = deviceId || this.deviceId;
    if (!targetDeviceId) {
      throw new Error("Device ID is required");
    }

    const queryObj = {};

    // Optional: codes (String) - function points, comma-separated
    if (
      params.codes !== undefined &&
      params.codes !== null &&
      params.codes !== ""
    ) {
      queryObj.codes = String(params.codes);
    }

    // Required: type (String) - event types, comma-separated
    // Default to all event types if not provided
    queryObj.type =
      params.type !== undefined && params.type !== null && params.type !== ""
        ? String(params.type)
        : "1,2,3,4,5,6,7,8,9,10";

    // Required: start_time (Long) - 13 digit timestamp in milliseconds
    const now = Date.now();
    const yesterday = now - 86400000; // 24 hours ago

    let startTime =
      params.start_time !== undefined && params.start_time !== null
        ? Number(params.start_time)
        : yesterday;
    // Convert to milliseconds if it's in seconds (less than 13 digits)
    if (startTime < 1000000000000) {
      startTime = startTime * 1000;
    }
    queryObj.start_time = String(startTime);

    // Required: end_time (Long) - 13 digit timestamp in milliseconds
    let endTime =
      params.end_time !== undefined && params.end_time !== null
        ? Number(params.end_time)
        : now;
    // Convert to milliseconds if it's in seconds (less than 13 digits)
    if (endTime < 1000000000000) {
      endTime = endTime * 1000;
    }
    queryObj.end_time = String(endTime);

    // Optional: query_type (Integer) - default is 1 (free version)
    if (params.query_type !== undefined && params.query_type !== null) {
      queryObj.query_type = String(Number(params.query_type));
    } else {
      queryObj.query_type = "1"; // Default to free version
    }

    // Optional: start_row_key (String) - Free version pagination
    if (
      params.start_row_key !== undefined &&
      params.start_row_key !== null &&
      params.start_row_key !== ""
    ) {
      queryObj.start_row_key = String(params.start_row_key);
    }

    // Optional: last_row_key (String) - Paid version pagination
    if (
      params.last_row_key !== undefined &&
      params.last_row_key !== null &&
      params.last_row_key !== ""
    ) {
      queryObj.last_row_key = String(params.last_row_key);
    }

    // Optional: last_event_time (Long) - Paid version pagination
    if (
      params.last_event_time !== undefined &&
      params.last_event_time !== null
    ) {
      let lastEventTime = Number(params.last_event_time);
      // Convert to milliseconds if it's in seconds
      if (lastEventTime < 1000000000000) {
        lastEventTime = lastEventTime * 1000;
      }
      queryObj.last_event_time = String(lastEventTime);
    }

    // Optional: size (Integer) - default is 20
    queryObj.size = String(
      params.size !== undefined && params.size !== null
        ? Number(params.size)
        : 20
    );

    const path = `/v1.0/devices/${targetDeviceId}/logs`;

    return await this._makeRequest("GET", path, queryObj);
  }

  /**
   * Get Status Reporting Log (IoT Core v2.1)
   * Reference: https://developer.tuya.com/en/docs/cloud/269c6a6b6b?id=Kduvi4xnjhav2
   * GET /v2.1/cloud/thing/{device_id}/report-logs
   *
   * Required query parameters:
   * - codes: String - Data point codes (comma-separated). Default: empty
   * - start_time: Long - Start timestamp in milliseconds (required)
   * - end_time: Long - End timestamp in milliseconds (required)
   * - size: Integer - Number of logs to return (required, default: 20, recommended: < 100)
   *
   * Optional query parameters:
   * - last_row_key: String - Row key for pagination (optional, default: empty)
   */
  async getReportLogs(params = {}) {
    const queryObj = {};

    const codes =
      params.codes !== undefined && params.codes !== null
        ? String(params.codes)
        : "";
    queryObj.codes = "unlock_fingerprint";

    if (params.startTime === undefined || params.startTime === null) {
      throw new Error("startTime is required for getReportLogs");
    }
    let startTime = Number(params.startTime);
    if (startTime < 10000000000) {
      startTime = startTime * 1000;
    }
    queryObj.start_time = startTime; // Keep as number

    if (params.endTime === undefined || params.endTime === null) {
      throw new Error("endTime is required for getReportLogs");
    }
    let endTime = Number(params.endTime);
    if (endTime < 10000000000) {
      endTime = endTime * 1000;
    }
    queryObj.end_time = endTime; // Keep as number

    let size = Number(params.size) || 20;
    if (size < 1) size = 20;
    if (size > 100) {
      console.warn("getReportLogs: size > 100 is not recommended. Using 100.");
      size = 100;
    }
    queryObj.size = Math.floor(size); // Keep as number

    if (
      params.lastRowKey !== undefined &&
      params.lastRowKey !== null &&
      params.lastRowKey !== ""
    ) {
      queryObj.last_row_key = String(params.lastRowKey);
    }

    const path = `/v2.1/cloud/thing/${this.deviceId}/report-logs`;

    // Pass query params as third argument, body as fourth
    return await this._makeRequest("GET", path, queryObj, null);
  }

  // ============================================
  // IoT Core - Device Control APIs
  // ============================================

  /**
   * Query Device Properties (IoT Core)
   * GET /v2.0/cloud/thing/{device_id}/shadow/properties
   */
  async getDeviceProperties() {
    return await this._makeRequest(
      "GET",
      `/v2.0/cloud/thing/${this.deviceId}/shadow/properties`
    );
  }

  /**
   * Modify Device Properties (IoT Core)
   * POST /v2.0/cloud/thing/{device_id}/shadow/properties
   */
  async setDeviceProperties(properties) {
    return await this._makeRequest(
      "POST",
      `/v2.0/cloud/thing/${this.deviceId}/shadow/properties`,
      { properties }
    );
  }

  /**
   * Send Property to Device (IoT Core)
   * POST /v2.0/cloud/thing/{device_id}/shadow/properties/issue
   */
  async issueDeviceProperties(properties) {
    return await this._makeRequest(
      "POST",
      `/v2.0/cloud/thing/${this.deviceId}/shadow/properties/issue`,
      { properties }
    );
  }

  /**
   * Send Actions to Device (IoT Core)
   * POST /v2.0/cloud/thing/{device_id}/shadow/actions
   */
  async sendDeviceActions(actions) {
    return await this._makeRequest(
      "POST",
      `/v2.0/cloud/thing/${this.deviceId}/shadow/actions`,
      actions
    );
  }

  /**
   * Query Things Data Model (IoT Core)
   * GET /v2.0/cloud/thing/{device_id}/model
   */
  async getDeviceModel() {
    return await this._makeRequest(
      "GET",
      `/v2.0/cloud/thing/${this.deviceId}/model`
    );
  }

  // ============================================
  // Standard Instruction Set APIs (Device Control)
  // ============================================

  /**
   * Get device status (Standard)
   * GET /v1.0/iot-03/devices/{device_id}/status
   */
  async getDeviceStatus(deviceId = null) {
    const targetDeviceId = deviceId || this.deviceId;
    return await this._makeRequest(
      "GET",
      `/v1.0/iot-03/devices/${targetDeviceId}/status`
    );
  }

  /**
   * Get device status with device ID parameter
   * Helper method to check status of a specific device
   */
  async getDeviceStatusById(deviceId) {
    return await this.getDeviceStatus(deviceId);
  }

  /**
   * Get device details with device ID parameter
   * Helper method to get details of a specific device
   */
  async getDeviceDetailsById(deviceId) {
    return await this._makeRequest("GET", `/v2.0/cloud/thing/${deviceId}`);
  }

  /**
   * Get device specification (Standard)
   * GET /v1.0/iot-03/devices/{device_id}/specification
   */
  async getDeviceSpecification() {
    return await this._makeRequest(
      "GET",
      `/v1.0/iot-03/devices/${this.deviceId}/specification`
    );
  }

  /**
   * Get device functions/instruction set (Standard)
   * GET /v1.0/iot-03/devices/{device_id}/functions
   */
  async getDeviceFunctions() {
    return await this._makeRequest(
      "GET",
      `/v1.0/iot-03/devices/${this.deviceId}/functions`
    );
  }

  /**
   * Send commands to device (Standard)
   * POST /v1.0/iot-03/devices/{device_id}/commands
   */
  async sendCommands(commands) {
    return await this._makeRequest(
      "POST",
      `/v1.0/iot-03/devices/${this.deviceId}/commands`,
      { commands }
    );
  }

  // ============================================
  // Smart Lock Specific APIs
  // ============================================

  /**
   * Get device information (Legacy)
   * GET /v1.0/devices/{device_id}
   * Returns the full response object with success and result
   */
  async getDeviceInfo(deviceId = null) {
    const targetDeviceId = deviceId || this.deviceId;
    try {
      const method = "GET";
      const path = `/v1.0/devices/${targetDeviceId}`;
      
      // Get access token
      await this._ensureValidToken();
      
      // Build request
      const timestamp = Date.now().toString();
      const nonce = crypto.randomBytes(16).toString("hex");
      const bodyForSignature = "";
      const queryParams = {};
      
      const stringToSign = this._calcStringToSign(
        method,
        path,
        queryParams,
        bodyForSignature
      );
      
      const sign = this._calcSign(
        this.clientId,
        this.accessToken,
        timestamp,
        nonce,
        stringToSign,
        this.clientSecret
      );
      
      const headers = {
        client_id: this.clientId,
        access_token: this.accessToken,
        sign: sign,
        t: timestamp,
        nonce: nonce,
        sign_method: "HMAC-SHA256",
        "Content-Type": "application/json",
      };
      
      const url = `${this.apiEndpoint}${path}`;
      
      const response = await axios({
        method,
        url,
        headers,
      });
      
      // Return full response object (not just result)
      return response.data;
    } catch (error) {
      console.error(`Error fetching device info for ${deviceId}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get device info with device ID parameter
   * Helper method to get info of a specific device
   * Returns the full response object with success and result
   */
  async getDeviceInfoById(deviceId) {
    return await this.getDeviceInfo(deviceId);
  }

  /**
   * Create temporary password (PIN)
   * POST /v1.0/devices/{device_id}/door-lock/temp-password
   */
  /**
   * Create temporary password
   * Reference: https://developer.tuya.com/en/docs/cloud/doorlock-api-password?id=Kbe2nztqcoapu#title-5-Create%20a%20temporary%20password
   * POST /v1.0/devices/{device_id}/door-lock/temp-password
   *
   * This function automatically handles the ticket-based encryption flow:
   * 1. Gets a password ticket (ticket_id and encrypted ticket_key)
   * 2. Decrypts ticket_key using Access Secret
   * 3. Encrypts the plain password using the decrypted ticket_key
   * 4. Creates the temporary password with ticket_id and encrypted password
   *
   * Required parameters:
   * - name (String): Password name
   * - password (String): Plain password (6 digits for Zigbee/Bluetooth, 7 digits for Wi-Fi)
   * - effective_time (Long): 10-digit timestamp in seconds
   * - invalid_time (Long): 10-digit timestamp in seconds
   *
   * Optional parameters:
   * - phone (String): Mobile phone number
   * - type (Integer): 1 = once, 0 = multiple uses
   * - time_zone (String): Required if using periodic password
   * - schedule_list (List): Information about periodic passwords
   * - deviceId (String): Device ID (defaults to this.deviceId)
   * - password_type (String): Defaults to "ticket"
   * - ticket_id (String): If provided, skips ticket retrieval (for advanced use)
   * - encryptedPassword (String): If provided, skips encryption (for advanced use)
   */
  async createTempPassword(passwordData) {
    // Validate required parameters
    if (!passwordData.name) {
      throw new Error("name is required for temporary password");
    }
    if (!passwordData.password) {
      throw new Error("password is required for temporary password");
    }
    if (!passwordData.effective_time && !passwordData.startTime) {
      throw new Error("effective_time (or startTime) is required");
    }
    if (!passwordData.invalid_time && !passwordData.endTime) {
      throw new Error("invalid_time (or endTime) is required");
    }

    const deviceId = passwordData.deviceId || this.deviceId;
    if (!deviceId) {
      throw new Error("Device ID is required for createTempPassword");
    }

    // password_type defaults to "ticket" according to documentation
    const password_type = passwordData.password_type || "ticket";

    let ticket_id = passwordData.ticket_id;
    let encryptedPassword =
      passwordData.encryptedPassword || passwordData.password;

    // If using ticket approach and ticket_id/encryptedPassword not provided, get ticket and encrypt
    // Per documentation:
    // 1. Get ticket_key (encrypted with Access Secret using AES-256-ECB)
    // 2. Decrypt ticket_key using Access Secret (AES-256-ECB)
    // 3. Encrypt password using decrypted ticket_key (AES-128-ECB with PKCS7Padding)
    // 4. Output format: hex
    if (
      password_type === "ticket" &&
      !ticket_id &&
      !passwordData.encryptedPassword
    ) {
      try {
        console.log(
          "\n[createTempPassword] Step 1: Getting password ticket..."
        );
        // Step 1: Get password ticket (returns ticket_id and encrypted ticket_key)
        const ticketResult = await this.getPasswordTicket(deviceId);
        console.log("Ticket Result:", JSON.stringify(ticketResult, null, 2));

        if (!ticketResult.ticket_id || !ticketResult.ticket_key) {
          throw new Error(
            "Invalid ticket response: missing ticket_id or ticket_key"
          );
        }

        ticket_id = ticketResult.ticket_id;
        console.log("  - ticket_id:", ticket_id);
        console.log(
          "  - ticket_key (encrypted):",
          ticketResult.ticket_key.substring(0, 20) +
            "..." +
            ticketResult.ticket_key.substring(
              ticketResult.ticket_key.length - 10
            )
        );
        console.log("  - expire_time:", ticketResult.expire_time, "seconds");

        console.log("\n[createTempPassword] Step 2: Decrypting ticket_key...");
        // Step 2: Decrypt ticket_key using Access Secret (AES-256-ECB)
        // The ticket_key from getPasswordTicket is encrypted with Access Secret
        const decryptedTicketKey = this._decryptTicketKey(
          ticketResult.ticket_key
        );
        console.log(
          "  - Decrypted ticket_key (hex):",
          decryptedTicketKey.substring(0, 20) +
            "..." +
            decryptedTicketKey.substring(decryptedTicketKey.length - 10)
        );
        console.log(
          "  - Decrypted ticket_key length:",
          decryptedTicketKey.length,
          "characters (hex)"
        );

        console.log("\n[createTempPassword] Step 3: Encrypting password...");
        console.log("  - Plain password:", passwordData.password);
        console.log(
          "  - Password length:",
          passwordData.password.length,
          "digits"
        );
        // Step 3: Encrypt password using decrypted ticket_key
        // Algorithm: AES-128-ECB with PKCS7Padding
        // Output format: hex (uppercase)
        encryptedPassword = this._encryptPasswordWithTicket(
          passwordData.password,
          decryptedTicketKey
        );
        console.log(
          "  - Encrypted password (hex):",
          encryptedPassword.substring(0, 20) +
            "..." +
            encryptedPassword.substring(encryptedPassword.length - 10)
        );
        console.log(
          "  - Encrypted password length:",
          encryptedPassword.length,
          "characters (hex)"
        );
        console.log("  - Encryption successful ✓");
      } catch (error) {
        console.error(
          "\n[createTempPassword] ERROR in ticket/encryption process:"
        );
        console.error("  - Error:", error.message);
        console.error("  - Stack:", error.stack);
        throw new Error(
          `Failed to get ticket and encrypt password: ${error.message}`
        );
      }
    }

    // Build payload according to documentation sample request format (exact field order):
    // POST /v1.0/devices/{device_id}/door-lock/temp-password
    // {
    //   "password": "956FAD7xxxxxx09C68E168B77",
    //   "password_type": "ticket",
    //   "ticket_id": "xxxxxx",
    //   "effective_time": 1579156726,
    //   "invalid_time": 1579243126,
    //   "name": "test",
    //   "phone": 11233213,
    //   "time_zone": "",
    //   "schedule_list": [{ "effective_time": 720, "invalid_time": 1080, "working_day": 0 }],
    //   "relate_dev_list": ["vdevo153459****"]
    // }
    //
    // Required fields per documentation:
    // - password (String): Encrypted with AES-128-ECB, PKCS7Padding, hex format
    // - password_type (String): "ticket"
    // - ticket_id (String): Required when password_type is "ticket"
    // - effective_time (Long): 10-digit timestamp in seconds
    // - invalid_time (Long): 10-digit timestamp in seconds
    // - name (String): Password name
    const payload = {
      // Required: password (String) - Encrypted password in hex format
      password: String(encryptedPassword),

      // Required: password_type (String) - Must be "ticket"
      password_type: password_type,
    };

    // Required: ticket_id (String) - Required when password_type is "ticket"
    if (password_type === "ticket") {
      if (!ticket_id) {
        throw new Error("ticket_id is required for password_type 'ticket'.");
      }
      payload.ticket_id = String(ticket_id);
    }

    // Required: effective_time (Long) - 10-digit timestamp in seconds
    payload.effective_time =
      passwordData.effective_time ||
      passwordData.startTime ||
      Math.floor(Date.now() / 1000);

    // Required: invalid_time (Long) - 10-digit timestamp in seconds
    payload.invalid_time =
      passwordData.invalid_time ||
      passwordData.endTime ||
      Math.floor(Date.now() / 1000) + 3600;

    // Required: name (String) - Password name
    payload.name = String(passwordData.name);

    // Optional: phone (String) - Mobile phone number
    // Note: Documentation says String, sample shows number - using String per parameter type
    if (
      passwordData.phone !== undefined &&
      passwordData.phone !== null &&
      passwordData.phone !== ""
    ) {
      payload.phone = String(passwordData.phone);
    }

    // Optional: type (Integer) - 1 = once, 0 = multiple uses
    // Required for Zigbee locks per documentation
    if (passwordData.type !== undefined) {
      payload.type = parseInt(passwordData.type);
    }

    // Optional: time_zone (String) - Required if using periodic password feature
    if (passwordData.time_zone !== undefined) {
      payload.time_zone = String(passwordData.time_zone);
    } else if (passwordData.schedule_list || passwordData.scheduleList) {
      // If schedule_list is provided, time_zone should be set (empty string if not provided)
      payload.time_zone = "";
    }

    // Optional: schedule_list (List) - For periodic password feature
    // Format: [{ "effective_time": 720, "invalid_time": 1080, "working_day": 0 }]
    // working_day values: 1=Sunday, 2=Monday, 4=Tuesday, 8=Wednesday, 16=Thursday, 32=Friday, 64=Saturday
    // Multiple days can be combined by adding values (e.g., 3 = Sunday + Monday)
    if (
      passwordData.schedule_list &&
      Array.isArray(passwordData.schedule_list) &&
      passwordData.schedule_list.length > 0
    ) {
      payload.schedule_list = passwordData.schedule_list;
    } else if (
      passwordData.scheduleList &&
      Array.isArray(passwordData.scheduleList) &&
      passwordData.scheduleList.length > 0
    ) {
      payload.schedule_list = passwordData.scheduleList;
    }

    // Optional: relate_dev_list (array) - Only for Bluetooth lock accessories
    // Length is one digit. Only Bluetooth lock accessories are supported.
    // Only include if explicitly provided
    if (
      passwordData.relate_dev_list !== undefined &&
      passwordData.relate_dev_list !== null
    ) {
      payload.relate_dev_list = Array.isArray(passwordData.relate_dev_list)
        ? passwordData.relate_dev_list
        : [passwordData.relate_dev_list];
    }

    // Log the payload being sent (matching sample request format)
    console.log("\n" + "=".repeat(80));
    console.log("[createTempPassword] REQUEST TO TUYA API");
    console.log("=".repeat(80));
    console.log("Device ID:", deviceId);
    console.log(
      "Endpoint: POST /v1.0/devices/" + deviceId + "/door-lock/temp-password"
    );
    console.log("\nRequest Payload:");
    console.log(JSON.stringify(payload, null, 2));
    console.log("\nPayload Details:");
    console.log(
      "  - password (encrypted):",
      payload.password.substring(0, 20) +
        "..." +
        payload.password.substring(payload.password.length - 10)
    );
    console.log("  - password_type:", payload.password_type);
    console.log("  - ticket_id:", payload.ticket_id);
    console.log(
      "  - effective_time:",
      payload.effective_time,
      `(${new Date(payload.effective_time * 1000).toISOString()})`
    );
    console.log(
      "  - invalid_time:",
      payload.invalid_time,
      `(${new Date(payload.invalid_time * 1000).toISOString()})`
    );
    console.log("  - name:", payload.name);
    if (payload.phone) console.log("  - phone:", payload.phone);
    if (payload.type !== undefined)
      console.log(
        "  - type:",
        payload.type,
        payload.type === 1 ? "(once)" : "(multiple)"
      );
    if (payload.time_zone !== undefined)
      console.log("  - time_zone:", payload.time_zone);
    if (payload.schedule_list)
      console.log("  - schedule_list:", JSON.stringify(payload.schedule_list));
    if (payload.relate_dev_list)
      console.log(
        "  - relate_dev_list:",
        JSON.stringify(payload.relate_dev_list)
      );
    console.log("=".repeat(80));

    let result;
    try {
      result = await this._makeRequest(
        "POST",
        `/v1.0/devices/${deviceId}/door-lock/temp-password`,
        {},
        payload
      );

      // Log the result that will be returned
      console.log("\n" + "=".repeat(80));
      console.log("[createTempPassword] RESPONSE FROM TUYA API - SUCCESS");
      console.log("=".repeat(80));
      console.log("Full Response Result:");
      console.log(JSON.stringify(result, null, 2));
      console.log("\nResponse Details:");
      if (result.id) console.log("  - Password ID:", result.id);
      if (result.password_id)
        console.log("  - Password ID (alt):", result.password_id);
      console.log("=".repeat(80));
    } catch (error) {
      console.log("\n" + "=".repeat(80));
      console.log("[createTempPassword] RESPONSE FROM TUYA API - ERROR");
      console.log("=".repeat(80));
      console.error("Error Type:", error.constructor.name);
      console.error("Error Message:", error.message);
      if (error.response) {
        console.error(
          "\nHTTP Response Status:",
          error.response.status,
          error.response.statusText
        );
        console.error(
          "Response Headers:",
          JSON.stringify(error.response.headers, null, 2)
        );
        console.error(
          "Response Data:",
          JSON.stringify(error.response.data, null, 2)
        );
      } else if (error.request) {
        console.error(
          "Request was made but no response received:",
          error.request
        );
      }
      console.error("Full Error Object:", error);
      console.log("=".repeat(80));
      throw error;
    }

    // Return result with request payload for debugging
    return {
      ...result,
      _debug: {
        requestPayload: payload,
        deviceId: deviceId,
      },
    };
  }

  /**
   * Get a temporary key for password encryption
   * Reference: https://developer.tuya.com/en/docs/cloud/doorlock-api-password?id=Kbe2nztqcoapu#title-4-Get%20a%20temporary%20key%20for%20password%20encryption
   * POST /v1.0/devices/{device_id}/door-lock/password-ticket
   *
   * Applicable lock types:
   * - Wi-Fi lock
   * - Zigbee lock
   * - Bluetooth lock
   * - Zigbee lock for hotel use
   * - Wi-Fi lock with video talk
   *
   * @param {string} deviceId - Device ID (optional, defaults to this.deviceId)
   * @returns {Promise<object>} Returns { ticket_id, ticket_key, expire_time }
   *   - ticket_id: The ID of a specified temporary key
   *   - ticket_key: The temporary key (encrypted with Access Secret using AES-256-ECB)
   *   - expire_time: The remaining validity period in seconds
   */
  async getPasswordTicket(deviceId = null) {
    const targetDeviceId = deviceId || this.deviceId;
    if (!targetDeviceId) {
      throw new Error("Device ID is required for getPasswordTicket");
    }

    const path = `/v1.0/devices/${targetDeviceId}/door-lock/password-ticket`;
    return await this._makeRequest("POST", path, {}, null);
  }

  /**
   * Get temporary passwords list
   * Reference: https://developer.tuya.com/en/docs/archived-documents/6fcd8256c2?id=Katuf6m81zmz2
   * GET /v1.0/devices/{device_id}/door-lock/temp-passwords
   * Query parameter: valid (Boolean) - indicates whether the password is valid
   */
  async getTempPasswords(params = {}) {
    const queryParams = [];
    if (params.valid !== undefined) {
      queryParams.push(
        `valid=${params.valid === true || params.valid === "true"}`
      );
    }

    const queryString = queryParams.length > 0 ? queryParams.join("&") : "";
    const path = `/v1.0/devices/${this.deviceId}/door-lock/temp-passwords${
      queryString ? "?" + queryString : ""
    }`;

    return await this._makeRequest("GET", path);
  }

  /**
   * Get a single temporary password by password_id
   * GET /v1.0/devices/{device_id}/door-lock/temp-password/{password_id}
   */
  async getTempPassword(passwordId, deviceId = null) {
    const targetDeviceId = deviceId || this.deviceId;
    return await this._makeRequest(
      "GET",
      `/v1.0/devices/${targetDeviceId}/door-lock/temp-password/${passwordId}`
    );
  }

  /**
   * Delete temporary password
   * DELETE /v1.0/devices/{device_id}/door-lock/temp-passwords/{password_id}
   */
  async deleteTempPassword(passwordId, deviceId = null) {
    const targetDeviceId = deviceId || this.deviceId;
    return await this._makeRequest(
      "DELETE",
      `/v1.0/devices/${targetDeviceId}/door-lock/temp-passwords/${passwordId}`
    );
  }

  /**
   * Get dynamic password
   * Reference: Smart Door Lock API documentation
   * GET /v1.0/devices/{device_id}/door-lock/dynamic-password
   *
   * Note: Error 2009 means "not support this device" - the device doesn't support dynamic passwords.
   * According to Matter Product Feature List, Door Lock is device type 0x000A.
   * However, not all door locks support dynamic password feature - it depends on device capabilities.
   *
   * This method verifies the device is a door lock and handles the 2009 error gracefully.
   */
  async getDynamicPassword() {
    try {
      // Verify device type - check if it's a door lock device
      // Matter device type 0x000A = Door Lock
      // We can check device functions to verify door lock capabilities
      try {
        const functions = await this.getDeviceFunctions();
        const isDoorLock = functions.some(
          (func) =>
            func.code &&
            (func.code.includes("door") ||
              func.code.includes("lock") ||
              func.code.includes("unlock") ||
              func.code.includes("password"))
        );

        if (!isDoorLock) {
          console.warn(
            "Device may not be a door lock or may not support door lock features"
          );
        }
      } catch (checkError) {
        // If we can't check device functions, proceed anyway
        console.warn("Could not verify device type, proceeding with request");
      }

      return await this._makeRequest(
        "GET",
        `/v1.0/devices/${this.deviceId}/door-lock/dynamic-password`
      );
    } catch (error) {
      // Handle error 2009 (device not supported) with clear message
      const errorCode = error.response?.data?.code || error.code;
      const errorMsg = error.response?.data?.msg || error.message || "";

      if (
        errorCode === 2009 ||
        errorMsg.includes("2009") ||
        errorMsg.includes("not support")
      ) {
        // Device type: Door Lock (Matter device type 0x000A)
        // Reference: https://developer.tuya.com/en/docs/iot/Matter_Product_Feature_List?id=Kd5al450rf4nn
        throw new Error(
          `Dynamic password is not supported by this Door Lock device (Matter type: 0x000A). ` +
            `Error code: 2009. This feature requires device firmware and hardware support. ` +
            `Please verify that your door lock model supports dynamic password functionality.`
        );
      }
      throw error;
    }
  }

  /**
   * Remote unlock with password
   * POST /v1.0/devices/{device_id}/door-lock/open-door
   */
  async remoteUnlock(password) {
    return await this._makeRequest(
      "POST",
      `/v1.0/devices/${this.deviceId}/door-lock/open-door`,
      { password }
    );
  }

  /**
   * Remote unlock without password
   * Reference: Lock or unlock a door remotely without a password
   * POST /v1.0/smart-lock/devices/{device_id}/password-free/door-operate
   *
   * @param {string} deviceId - Device ID (optional, defaults to this.deviceId)
   * @param {string} ticketId - Ticket ID (optional, will be generated if not provided)
   * @returns {Promise<object>} Returns { result: true, success: true, t: timestamp }
   */
  async remoteUnlockNoPassword(deviceId = null, ticketId = null) {
    const targetDeviceId = deviceId || this.deviceId;
    if (!targetDeviceId) {
      throw new Error("Device ID is required for remoteUnlockNoPassword");
    }

    // Get ticket_id if not provided
    let ticket_id = ticketId;
    if (!ticket_id) {
      try {
        const ticketResult = await this.getPasswordTicket(targetDeviceId);
        if (!ticketResult.ticket_id) {
          throw new Error("Failed to get ticket_id from getPasswordTicket");
        }
        ticket_id = ticketResult.ticket_id;
        logger.info("Got ticket_id for password-free unlock", {
          deviceId: targetDeviceId,
          ticket_id: ticket_id.substring(0, 10) + "...",
          expire_time: ticketResult.expire_time,
        });
      } catch (error) {
        throw new Error(
          `Failed to get password ticket for unlock: ${error.message}`
        );
      }
    }

    // Call door-operate endpoint with ticket_id and open=true in body
    const body = {
      ticket_id: ticket_id,
      open: true, // true = unlock/open door
    };

    return await this._makeRequest(
      "POST",
      `/v1.0/smart-lock/devices/${targetDeviceId}/password-free/door-operate`,
      {},
      body
    );
  }

  /**
   * Remote lock (close door without password)
   * Reference: Lock or unlock a door remotely without a password
   * POST /v1.0/smart-lock/devices/{device_id}/password-free/door-operate
   *
   * @param {string} deviceId - Device ID (optional, defaults to this.deviceId)
   * @param {string} ticketId - Ticket ID (optional, will be generated if not provided)
   * @returns {Promise<object>} Returns { result: true, success: true, t: timestamp }
   */
  async remoteLock(deviceId = null, ticketId = null) {
    const targetDeviceId = deviceId || this.deviceId;
    if (!targetDeviceId) {
      throw new Error("Device ID is required for remoteLock");
    }

    // Get ticket_id if not provided
    let ticket_id = ticketId;
    if (!ticket_id) {
      try {
        const ticketResult = await this.getPasswordTicket(targetDeviceId);
        if (!ticketResult.ticket_id) {
          throw new Error("Failed to get ticket_id from getPasswordTicket");
        }
        ticket_id = ticketResult.ticket_id;
        logger.info("Got ticket_id for password-free lock", {
          deviceId: targetDeviceId,
          ticket_id: ticket_id.substring(0, 10) + "...",
          expire_time: ticketResult.expire_time,
        });
      } catch (error) {
        throw new Error(
          `Failed to get password ticket for lock: ${error.message}`
        );
      }
    }

    // Call door-operate endpoint with ticket_id and open=false in body
    const body = {
      ticket_id: ticket_id,
      open: false, // false = lock/close door
    };

    return await this._makeRequest(
      "POST",
      `/v1.0/smart-lock/devices/${targetDeviceId}/password-free/door-operate`,
      {},
      body
    );
  }

  /**
   * Get unlock records
   * Reference: https://developer.tuya.com/en/docs/archived-documents/b4b28d67c0?id=Katuf23ipl5ii
   * GET /v1.0/devices/{device_id}/door-lock/records
   * Query parameters: offset, limit, start_time, end_time
   */
  async getUnlockRecords(params = {}) {
    const queryObj = {};

    // Required: target_standard_dp_codes (String)
    if (
      params.dpCodes === undefined ||
      params.dpCodes === null ||
      params.dpCodes === ""
    ) {
      queryObj.target_standard_dp_codes =
        "unlock_password,unlock_card,unlock_fingerprint,unlock_key,unlock_temporary,unlock_dynamic,unlock_offline_pd";
    } else {
      queryObj.target_standard_dp_codes = String(params.dpCodes);
    }

    // Required: start_time (Long)
    if (params.startTime !== undefined && params.startTime !== null) {
      let startTime = Number(params.startTime);
      if (startTime > 10000000000) {
        startTime = Math.floor(startTime / 1000);
      }
      queryObj.start_time = startTime;
    } else {
      queryObj.start_time = 0;
    }

    // Required: end_time (Long)
    if (params.endTime !== undefined && params.endTime !== null) {
      let endTime = Number(params.endTime);
      if (endTime > 10000000000) {
        endTime = Math.floor(endTime / 1000);
      }
      queryObj.end_time = endTime;
    } else {
      queryObj.end_time = 0;
    }

    // Required: page_no (Integer) - starting from 1
    queryObj.page_no = Number(params.pageNo) || 1;

    // Required: page_size (Integer)
    queryObj.page_size = Number(params.pageSize) || 20;

    // Build query string with sorted keys
    const sortedKeys = Object.keys(queryObj).sort();
    const queryString = sortedKeys
      .map((key) => `${key}=${encodeURIComponent(queryObj[key])}`)
      .join("&");

    const path = `/v1.0/devices/${this.deviceId}/door-lock/records?${queryString}`;

    return await this._makeRequest("GET", path);
  }

  /**
   * Get open logs (detailed unlock history) - Legacy v1.0
   * Reference: https://developer.tuya.com/en/docs/archived-documents/837c818f18?id=Katuevseqfpdg
   * GET /v1.0/devices/{device_id}/door-lock/open-logs
   * Query parameters: offset, limit
   */
  async getOpenLogs(params = {}) {
    const queryObj = {};

    // Required: page_no (Integer)
    queryObj.page_no = Number(params.pageNo) || 1;

    // Required: page_size (Integer)
    queryObj.page_size = Number(params.pageSize) || 20;

    // Required: start_time (Long) - in seconds for door-lock API
    const now = Math.floor(Date.now() / 1000);
    const yesterday = now - 86400;

    let startTime =
      params.startTime !== undefined ? Number(params.startTime) : yesterday;
    if (startTime > 10000000000) {
      startTime = Math.floor(startTime / 1000);
    }
    queryObj.start_time = startTime;

    // Required: end_time (Long) - in seconds for door-lock API
    let endTime = params.endTime !== undefined ? Number(params.endTime) : now;
    if (endTime > 10000000000) {
      endTime = Math.floor(endTime / 1000);
    }
    queryObj.end_time = endTime;

    const sortedKeys = Object.keys(queryObj).sort();
    const queryString = sortedKeys
      .map((key) => `${key}=${encodeURIComponent(queryObj[key])}`)
      .join("&");

    const path = `/v1.0/devices/${this.deviceId}/door-lock/open-logs?${queryString}`;

    return await this._makeRequest("GET", path);
  }

  /**
   * Query unlocking history (new) - v1.1
   * Reference: https://developer.tuya.com/en/docs/cloud/doorlock-api-record?id=Kbe2o4dci8roa#title-1-Query%20unlocking%20history%20(new)
   * GET /v1.1/devices/{device_id}/door-lock/open-logs
   *
   * Applicable lock types: Wi-Fi lock, Zigbee lock for hotel use, Bluetooth lock, Wi-Fi lock with video talk
   *
   * @param {string} deviceId - The device ID (optional, defaults to this.deviceId)
   * @param {object} params - Query parameters
   * @param {number} params.page_no - The page number (required)
   * @param {number} params.page_size - The maximum number of items returned on each page (required)
   * @param {number} params.start_time - The start time in milliseconds (required)
   * @param {number} params.end_time - The end time in milliseconds (required)
   * @param {boolean} params.showMediaInfo - Indicates whether to display image information (optional)
   * @returns {Promise<object>} Response with logs array containing unlocking history
   */
  async getUnlockingHistory(deviceId = null, params = {}) {
    const targetDeviceId = deviceId || this.deviceId;

    if (!targetDeviceId) {
      throw new Error("Device ID is required");
    }

    const queryObj = {};

    // Required: page_no (Integer)
    queryObj.page_no = Number(params.page_no) || 1;

    // Required: page_size (Integer)
    queryObj.page_size = Number(params.page_size) || 20;

    // Required: start_time (Long) - in milliseconds for v1.1 API
    const now = Date.now();
    const yesterday = now - 86400000; // 24 hours in milliseconds

    let startTime =
      params.start_time !== undefined ? Number(params.start_time) : yesterday;
    // If provided in seconds, convert to milliseconds
    if (startTime < 10000000000) {
      startTime = startTime * 1000;
    }
    queryObj.start_time = startTime;

    // Required: end_time (Long) - in milliseconds for v1.1 API
    let endTime = params.end_time !== undefined ? Number(params.end_time) : now;
    // If provided in seconds, convert to milliseconds
    if (endTime < 10000000000) {
      endTime = endTime * 1000;
    }
    queryObj.end_time = endTime;

    // Optional: showMediaInfo (Boolean) - Note: API uses show_media_info in query string
    if (
      params.showMediaInfo !== undefined ||
      params.show_media_info !== undefined
    ) {
      queryObj.show_media_info =
        params.showMediaInfo || params.show_media_info || false;
    }

    const sortedKeys = Object.keys(queryObj).sort();
    const queryString = sortedKeys
      .map((key) => `${key}=${encodeURIComponent(queryObj[key])}`)
      .join("&");

    const path = `/v1.1/devices/${targetDeviceId}/door-lock/open-logs?${queryString}`;

    return await this._makeRequest("GET", path);
  }

  /**
   * Get alarm logs
   * Reference: https://developer.tuya.com/en/docs/cloud/bdc1e6f858?id=Kcp2l3tqdozts
   * GET /v1.0/devices/{device_id}/door-lock/alarm-logs
   * Query parameters: offset, limit
   */
  async getAlarmLogs(params = {}) {
    const queryObj = {};

    // Required: page_no (Integer)
    queryObj.page_no = Number(params.pageNo) || 1;

    // Required: page_size (Integer)
    queryObj.page_size = Number(params.pageSize) || 20;

    // Optional: codes (String) - comma-separated DP codes
    if (
      params.codes !== undefined &&
      params.codes !== null &&
      params.codes !== ""
    ) {
      queryObj.codes = String(params.codes);
    }

    const sortedKeys = Object.keys(queryObj).sort();
    const queryString = sortedKeys
      .map((key) => `${key}=${encodeURIComponent(queryObj[key])}`)
      .join("&");

    const path = `/v1.0/devices/${this.deviceId}/door-lock/alarm-logs?${queryString}`;

    return await this._makeRequest("GET", path);
  }

  /**
   * Get unlocking methods (opmodes) for a specific user
   * Reference: https://developer.tuya.com/en/docs/archived-documents/c3455ca455?id=Kbaif4lf8a2oo
   * GET /v1.0/smart-lock/devices/{device_id}/opmodes/{user_id}
   *
   * @param {string|number} userId - User ID
   * @param {object} params - Parameters
   * @param {string} params.code - Single unlock code (e.g., "unlock_fingerprint", "unlock_card", "unlock_password")
   *                                If not provided, defaults to "unlock_fingerprint"
   * @param {string} params.unlock_name - Names of target unlocking methods (can be empty string)
   * @param {number} params.page_no - Page number (starting from 1)
   * @param {number} params.page_size - Number of entries per page
   */
  async getUnlockingMethods(userId, params = {}) {
    if (!userId) {
      throw new Error("userId is required for getUnlockingMethods");
    }

    const queryObj = {};
    // Use single code - default to unlock_fingerprint
    queryObj.codes = String(params.code || "unlock_fingerprint");

    if (
      params.unlock_name !== undefined &&
      params.unlock_name !== null &&
      params.unlock_name !== ""
    ) {
      queryObj.unlock_name = String(params.unlock_name);
    }
    queryObj.page_no = String(params.page_no || 1);
    queryObj.page_size = String(params.page_size || 20);

    const sortedKeys = Object.keys(queryObj).sort();
    const queryParams = sortedKeys.map((key) => {
      const value = queryObj[key];
      return `${key}=${encodeURIComponent(value)}`;
    });

    const queryString = queryParams.join("&");
    const path = `/v1.0/smart-lock/devices/${this.deviceId}/opmodes/${userId}?${queryString}`;

    return await this._makeRequest("GET", path);
  }

  /**
   * Sync unlocking methods
   * Reference: https://developer.tuya.com/en/docs/archived-documents/ff17c723f4?id=Kau1o148h0ykl
   * POST /v1.0/smart-lock/devices/{device_id}/opmodes/actions/sync
   * Body: { "codes": "unlock_fingerprint" }
   *
   * @param {string} code - Single unlock code (e.g., "unlock_fingerprint", "unlock_card", "unlock_password")
   *                        If not provided, defaults to "unlock_fingerprint"
   */
  async syncUnlockingMethods(code = "unlock_fingerprint") {
    return await this._makeRequest(
      "POST",
      `/v1.0/smart-lock/devices/${this.deviceId}/opmodes/actions/sync`,
      null, // No query params
      { codes: String(code) } // Single code in body
    );
  }

  /**
   * Get unassigned unlock keys
   * GET /v1.0/devices/{device_id}/door-lock/unassigned-keys
   */
  async getUnassignedKeys() {
    return await this._makeRequest(
      "GET",
      `/v1.0/devices/${this.deviceId}/door-lock/unassigned-keys`
    );
  }

  /**
   * Assign unlocking method to user
   * Reference: https://developer.tuya.com/en/docs/archived-documents/d5fd527f7f?id=Kb07l1tsrjoyj
   * POST /v1.0/devices/{device_id}/door-lock/opmodes/actions/allocate
   * Body: { "user_id": "...", "unlock_list": [{ "dp_code": "...", "unlock_sn": ... }] }
   */
  async assignUnlockingMethod(userId, unlockType, unlockSn) {
    // Map unlock type to dp_code
    const dpCodeMap = {
      fingerprint: "unlock_fingerprint",
      rfid: "unlock_card",
      pin: "unlock_password",
      password: "unlock_password",
      card: "unlock_card",
    };

    const dpCode = dpCodeMap[unlockType] || unlockType;

    return await this._makeRequest(
      "POST",
      `/v1.0/devices/${this.deviceId}/door-lock/opmodes/actions/allocate`,
      {
        user_id: String(userId),
        unlock_list: [
          {
            dp_code: dpCode,
            unlock_sn: parseInt(unlockSn),
          },
        ],
      }
    );
  }

  /**
   * Add an unlocking method to a user (defaults to password)
   * Reference: https://developer.tuya.com/en/docs/cloud/doorlock-api-member?id=Kbe2o84on6zgh#title-14-Assign%20a%20password%20to%20a%20device%20user
   * POST /v1.0/devices/{device_id}/door-lock/opmodes/actions/allocate
   *
   * @param {string|number} userId - Target user ID on the lock
   * @param {number|string} unlockSn - Serial number of the unlocking method
   * @param {object} [options]
   * @param {string} [options.type="password"] - Friendly type alias (password/pin/fingerprint/card/rfid)
   * @param {string} [options.dpCode] - Override dp_code; defaults to unlock_password
   */
  async addUserUnlockingMethod(userId, unlockSn, options = {}) {
    if (!userId) {
      throw new Error("userId is required for addUserUnlockingMethod");
    }
    if (unlockSn === undefined || unlockSn === null) {
      throw new Error("unlockSn is required for addUserUnlockingMethod");
    }

    const type = options.type || "password";
    const dpCodeMap = {
      password: "unlock_password",
      pin: "unlock_password",
      fingerprint: "unlock_fingerprint",
      card: "unlock_card",
      rfid: "unlock_card",
    };

    const dpCode =
      options.dpCode || dpCodeMap[type] || type || "unlock_password";
    const parsedUnlockSn = Number.parseInt(unlockSn, 10);
    if (!Number.isFinite(parsedUnlockSn)) {
      throw new Error("unlockSn must be a number");
    }

    const body = {
      user_id: String(userId),
      unlock_list: [
        {
          dp_code: dpCode,
          unlock_sn: parsedUnlockSn,
        },
      ],
    };

    return await this._makeRequest(
      "POST",
      `/v1.0/devices/${this.deviceId}/door-lock/opmodes/actions/allocate`,
      {},
      body
    );
  }

  /**
   * Allocate unlocking method to device user (Tuya doc /device-lock/users/{user_id}/allocate)
   * POST /v1.0/devices/{device_id}/device-lock/users/{user_id}/allocate
   *
   * @param {string|number} userId - Device user ID
   * @param {string|number} no - Serial number on the lock
   * @param {"fingerprint"|"password"|"card"} type - Unlocking type
   */
  async allocateDeviceLockUserMethod(userId, no, type = "password") {
    if (!userId)
      throw new Error("userId is required for allocateDeviceLockUserMethod");
    if (no === undefined || no === null)
      throw new Error("no is required for allocateDeviceLockUserMethod");
    if (!type)
      throw new Error("type is required for allocateDeviceLockUserMethod");

    const parsedNo = Number.parseInt(no, 10);
    if (!Number.isFinite(parsedNo)) {
      throw new Error("no must be a number");
    }

    const body = {
      no: String(parsedNo),
      type: String(type),
    };

    return await this._makeRequest(
      "POST",
      `/v1.0/devices/${this.deviceId}/device-lock/users/${userId}/allocate`,
      {},
      body
    );
  }

  /**
   * Update unlocking method name
   * PUT /v1.0/devices/{device_id}/door-lock/opmodes/{unlock_sn}
   */
  async updateUnlockMethodName(unlockSn, name) {
    return await this._makeRequest(
      "PUT",
      `/v1.0/devices/${this.deviceId}/door-lock/opmodes/${unlockSn}`,
      { name }
    );
  }

  /**
   * Delete unlocking method
   */
  async deleteUnlockMethod(
    unlockType,
    unlockNo,
    userType = "home_user",
    userId
  ) {
    return await this._makeRequest(
      "DELETE",
      `/v1.0/devices/${this.deviceId}/door-lock/user-types/${userType}/users/${userId}/unlock-types/${unlockType}/keys/${unlockNo}`
    );
  }

  /**
   * Get device users
   * GET /v1.0/devices/{device_id}/users
   */
  /**
   * Get user information from smart lock device
   * Reference: https://developer.tuya.com/en/docs/archived-documents/61db76ae2f?id=Kau1o372dire1
   * GET /v1.0/smart-lock/devices/{device_id}/users
   *
   * @param {object} params - Parameters
   * @param {string} params.code - Single unlock code (e.g., "unlock_fingerprint", "unlock_card", "unlock_password")
   *                                If not provided, defaults to "unlock_fingerprint"
   * @param {number} params.page_no - Page number (starting from 1)
   * @param {number} params.page_size - Number of entries per page
   */
  async getDeviceUsers(params = {}) {
    const deviceId = process.env.TUYA_DEVICE_ID;

    if (!deviceId) {
      throw new Error("TUYA_DEVICE_ID not set in environment");
    }

    return this.getDeviceUsersById(deviceId, params);
  }

  /**
   * Get device users with device ID parameter
   * Reference: https://developer.tuya.com/en/docs/cloud/doorlock-api-member?id=Kbe2o84on6zgh#title-13-Query%20user%20list%20by%20device%20ID%20(v1.1)
   * GET /v1.1/devices/{device_id}/users
   *
   * Required parameters:
   * - keyword (String): The query keyword. Empty string means no filtering
   * - role (String): The role. Empty string means no filtering (values: "admin" or "normal")
   * - page_no (Integer): The current page number, starting from 1
   * - page_size (Integer): The number of records returned per page
   */
  async getDeviceUsersById(deviceId, params = {}) {
    const path = `/v1.1/devices/${deviceId}/users`;

    const queryParams = {
      keyword: String(params.keyword || ""), // Required: empty string means no filtering
      role: String(params.role || ""), // Required: empty string means no filtering (values: "admin" or "normal")
      page_no: String(parseInt(params.page_no) || 1),
      page_size: String(parseInt(params.page_size) || 50),
    };

    const result = await this._makeRequest("GET", path, queryParams, null);

    return result;
  }

  /**
   * Query device user information (v1.0)
   * Reference: https://developer.tuya.com/en/docs/cloud/doorlock-api-member?id=Kbe2o84on6zgh#title-11-Query%20device%20user%20information%20(v1.1)
   * GET /v1.0/smart-lock/devices/{device_id}/users
   *
   * Required parameters:
   * - codes (String): The unlocking methods, separated with commas (,).
   *   Valid values: unlock_fingerprint, unlock_card, unlock_password, unlock_face, unlock_hand, unlock_finger_vein
   * - page_no (Integer): The current page number, starting from 1
   * - page_size (Integer): The number of records returned per page
   *
   * @param {string} deviceId - Device ID
   * @param {object} params - Parameters
   * @param {string|array} params.codes - Unlocking methods (comma-separated string or array)
   * @param {number} params.page_no - Page number (starting from 1)
   * @param {number} params.page_size - Number of records per page
   * @returns {Promise<object>} User information with unlock details
   */
  async getDeviceUserInfo(deviceId, params = {}) {
    const path = `/v1.0/smart-lock/devices/${deviceId}/users`;

    // Handle codes parameter - can be array or comma-separated string
    let codesStr = "";
    if (params.codes) {
      if (Array.isArray(params.codes)) {
        codesStr = params.codes.join(",");
      } else {
        codesStr = String(params.codes);
      }
    } else {
      // Default to all common unlock methods if not specified
      codesStr = "unlock_fingerprint,unlock_card,unlock_password";
    }

    const queryParams = {
      codes: codesStr,
      page_no: String(parseInt(params.page_no) || 1),
      page_size: String(parseInt(params.page_size) || 100),
    };

    const result = await this._makeRequest("GET", path, queryParams, null);

    return result;
  }

  /**
   * Query device user information
   * GET /v1.0/devices/{device_id}/users/{user_id}
   * Reference: https://developer.tuya.com/en/docs/cloud/doorlock-api-member?id=Kbe2o84on6zgh#title-8-Query%20device%20user%20information
   *
   * Applicable lock types: Wi-Fi lock, Zigbee lock, Bluetooth lock
   * Note: You cannot query the information about administrators.
   *
   * @param {string} deviceId - The device ID
   * @param {string} userId - The user ID (device user ID, not platform uid)
   * @returns {Promise<object>} User information with fields: device_id, nick_name, sex, birthday, height, weight, contact
   */
  async getDeviceUserById(deviceId, userId) {
    const path = `/v1.0/devices/${deviceId}/users/${userId}`;
    const result = await this._makeRequest("GET", path, {}, null);
    return result;
  }

  /**
 * Get all device users aggregated from all unlock methods
 * This method fetches users from fingerprint, card, and password unlock methods
 * and deduplicates them by user_id
 *
 * @param {string} deviceId - Device ID (optional, defaults to TUYA_DEVICE_ID from env)
 * @param {object} params - Additional parameters
 * @param {number} params.page_no - Page number
 * @param {number} params.page_size - Page size
 * @returns {Promise<object>} Returns aggregated users in format: { success: true, data: [...], total: ... }
 */
async getAllDeviceUsers(deviceId = null, params = {}) {
  try {
    const targetDeviceId = deviceId || process.env.TUYA_DEVICE_ID;

    if (!targetDeviceId) {
      throw new Error(
        "Device ID is required. Set TUYA_DEVICE_ID in environment."
      );
    }

    console.log(
      `[getAllDeviceUsers] Fetching users for device: ${targetDeviceId}`
    );

    // ✅ Use v1.0 API which properly filters by unlock method
    // GET /v1.0/smart-lock/devices/{device_id}/users
    const unlockCodes = [
      "unlock_fingerprint",
      "unlock_card",
      "unlock_password",
    ];
    const allUsersMap = new Map(); // Deduplicate by user_id

    for (const code of unlockCodes) {
      try {
        console.log(
          `[getAllDeviceUsers] Fetching users with unlock code: ${code}`
        );

        // ✅ FIX: Use getDeviceUserInfo (v1.0) instead of getDeviceUsersById (v1.1)
        const result = await this.getDeviceUserInfo(targetDeviceId, {
          codes: code, // v1.0 API properly filters by this
          page_no: params.page_no || 1,
          page_size: params.page_size || 100,
        });

        // ✅ FIX: v1.0 API returns 'list', not 'records'
        if (result && result.list && Array.isArray(result.list)) {
          console.log(
            `[getAllDeviceUsers] Found ${result.list.length} users for ${code}`
          );

          // Add/merge users
          result.list.forEach((user) => {
            const userId = user.user_id || user.lock_user_id;

            if (allUsersMap.has(userId)) {
              // User exists, merge unlock_detail
              const existingUser = allUsersMap.get(userId);
              if (user.unlock_detail && Array.isArray(user.unlock_detail)) {
                existingUser.unlock_detail = [
                  ...(existingUser.unlock_detail || []),
                  ...user.unlock_detail,
                ];
              }
            } else {
              // New user
              allUsersMap.set(userId, { ...user });
            }
          });
        } else {
          console.log(`[getAllDeviceUsers] No users found for ${code}`);
        }
      } catch (error) {
        console.warn(
          `[getAllDeviceUsers] Failed to fetch ${code}:`,
          error.message
        );
        // Continue with other codes
      }
    }

    const allUsers = Array.from(allUsersMap.values());
    console.log(`[getAllDeviceUsers] Total unique users: ${allUsers.length}`);

    return {
      success: true,
      data: allUsers,
      total: allUsers.length,
    };
  } catch (error) {
    console.error(`[getAllDeviceUsers] Error:`, error);
    return {
      success: false,
      data: [],
      error: error.message || "Failed to fetch device users",
    };
  }
}

  /**
   * Query User Information on Pages
   * Reference: https://developer.tuya.com/en/docs/cloud/c18861d969?id=Katz3k4d80jt0
   * GET /v1.1/iot-02/users
   *
   * @param {object} params - Query parameters
   * @param {string} params.user_nick_name - The nickname of a specified user (optional)
   * @param {string} params.user_ids - The list of user IDs (comma-separated) (optional)
   * @param {string} params.user_names - The list of account names (comma-separated) (optional)
   * @param {string} params.last_row_key - The row key of the last entry on each page (optional)
   * @param {number} params.page_size - The number of items to be returned per page (optional, default: 20)
   * @returns {Promise<object>} Returns list of users with pagination info
   */
  async queryUsers(params = {}) {
    try {
      const queryObj = {};

      queryObj.page_size =
        params.page_size !== undefined ? Number(params.page_size) : 20;

      if (params.last_row_key) {
        queryObj.last_row_key = String(params.last_row_key);
      }

      const hasSearchCriteria =
        params.user_nick_name || params.user_ids || params.user_names;

      if (hasSearchCriteria) {
        const queryUserRequest = {};
        if (params.user_nick_name) {
          queryUserRequest.user_nick_name = String(params.user_nick_name);
        }
        if (params.user_ids) {
          queryUserRequest.user_ids = String(params.user_ids);
        }
        if (params.user_names) {
          queryUserRequest.user_names = String(params.user_names);
        }
        queryObj.query_user_request = JSON.stringify(queryUserRequest);
      }

      const path = `/v1.1/iot-02/users`;
      console.log(`[queryUsers] Path: ${path}, Query:`, queryObj);

      const result = await this._makeRequest("GET", path, queryObj, null);
      console.log(
        `[queryUsers] Raw response:`,
        JSON.stringify(result, null, 2)
      );

      // Return raw response to match test script expectations
      // The response structure is: { list: [...], last_row_key: "...", page_size: 20, has_next: true }
      return result;
    } catch (error) {
      console.error(`[queryUsers] Error:`, error);
      throw error; // Let the route handle the error
    }
  }

  /**
   * Check remote unlock support
   * Note: There's no direct endpoint for this, so we check device functions
   * to see if remote unlock commands are available
   */
  async getRemoteUnlockMethods() {
    try {
      // Get device functions to check for remote unlock capabilities
      const functions = await this.getDeviceFunctions();

      // Check for unlock-related functions
      const unlockFunctions = functions.filter(
        (func) =>
          func.code &&
          (func.code.includes("unlock") ||
            func.code.includes("open") ||
            func.code.includes("door"))
      );

      return {
        supported: unlockFunctions.length > 0,
        methods: unlockFunctions.map((f) => ({
          code: f.code,
          name: f.name || f.code,
          type: f.type,
        })),
      };
    } catch (error) {
      // If device functions fail, return basic info
      return {
        supported: true, // Assume supported if we can't check
        methods: ["remote_unlock", "password_free_unlock"],
        note: "Could not verify from device functions",
      };
    }
  }

  // ============================================
  // Webhook & Utilities
  // ============================================

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(signature, body, timestamp) {
    const stringToSign = this.clientId + timestamp + body;
    const calculatedSign = crypto
      .createHmac("sha256", this.clientSecret)
      .update(stringToSign)
      .digest("hex")
      .toUpperCase();

    return signature === calculatedSign;
  }

  /**
   * Parse unlock event from webhook
   */
  parseUnlockEvent(eventData) {
    return {
      deviceId: eventData.devId,
      unlockMethod: this._parseUnlockMethod(eventData.dpCode),
      unlockId: eventData.value,
      timestamp: eventData.ts,
      success: eventData.success !== false,
    };
  }

  _parseUnlockMethod(dpCode) {
    const methodMap = {
      unlock_fingerprint: "fingerprint",
      unlock_password: "pin",
      unlock_card: "rfid",
      unlock_key: "key",
      unlock_app: "remote",
      unlock_temporary: "temporary_password",
      unlock_dynamic: "dynamic_password",
    };
    return methodMap[dpCode] || "unknown";
  }

  /**
   * Encrypt password for temp password creation - REMOVED
   * This method has been removed. Please handle encryption externally.
   */
  async encryptPasswordForTempPassword(plainPassword) {
    throw new Error(
      "encryptPasswordForTempPassword has been removed. Please handle encryption externally."
    );
  }

  /**
   * Test connection
   */
  async testConnection() {
    try {
      await this._getToken();
      console.log("Tuya IoT connection test: SUCCESS");
      return { success: true, message: "Connected to Tuya IoT Cloud" };
    } catch (error) {
      console.error("Tuya IoT connection test: FAILED", error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * Map enrollment type to Tuya unlock code
   * @param {string} enrollmentType - 'fingerprint', 'rfid', 'pin', etc.
   * @returns {string} Tuya unlock code
   */
  _mapEnrollmentTypeToCode(enrollmentType) {
    const codeMap = {
      fingerprint: "unlock_fingerprint",
      rfid: "unlock_card",
      card: "unlock_card",
      pin: "unlock_password",
      password: "unlock_password",
      temporary: "unlock_temporary",
      dynamic: "unlock_dynamic",
    };
    return codeMap[enrollmentType?.toLowerCase()] || "unlock_fingerprint";
  }

  /**
   * Map project role to Tuya user_type
   * @param {string} role - 'admin', 'teacher', 'techsupport', 'user', 'visitor'
   * @returns {number} Tuya user_type: 10=administrator, 20=common user, 50=home owner
   */
  mapRoleToUserType(role) {
    const roleMap = {
      admin: 10, // Administrator
      teacher: 20, // Common user
      techsupport: 20, // Common user (can be changed to 10 if they need admin privileges)
      user: 20, // Common user
      visitor: 20, // Common user
    };
    return roleMap[role?.toLowerCase()] || 20; // Default to common user
  }

  /**
   * Query User Information by User ID
   * Reference: https://developer.tuya.com/en/docs/cloud/8a12b9c9b1?id=Kag2yma0kr3tr
   * GET /v1.0/iot-02/users/{user_id}
   *
   * @param {string} userId - The Tuya user ID
   * @returns {Promise<object>} User information with user_id, user_name, country_code
   */
  async getUserById(userId) {
    const path = `/v1.0/users/${userId}`;
    console.log(`[getUserById] Calling path: ${path}`);

    const result = await this._makeRequest("GET", path, {}, null);

    return result;
  }

  /**
   * Register User
   * Reference: https://developer.tuya.com/en/docs/cloud/f5d1a4bffd?id=Kag2yly4dmbew
   * POST /v1.0/iot-02/users
   *
   * @param {object} userData - User registration data
   * @param {string} userData.username - The username (required)
   * @param {string} userData.password - The password, encrypted with SHA256 and converted to lower case (required)
   * @param {string} userData.country_code - The country code (required)
   * @param {string} userData.creator - The creator (optional)
   * @param {string} userData.user_nick_name - The nickname of a specified user (optional)
   * @returns {Promise<object>} Returns user_id
   */
  async registerUser(userData) {
    if (!userData.username) {
      throw new Error("username is required for registerUser");
    }
    if (!userData.password) {
      throw new Error("password is required for registerUser");
    }
    if (!userData.country_code) {
      throw new Error("country_code is required for registerUser");
    }

    // Password must be SHA256 hashed and converted to lowercase
    const crypto = require("crypto");
    const hashedPassword = crypto
      .createHash("sha256")
      .update(userData.password)
      .digest("hex")
      .toLowerCase();

    const body = {
      username: userData.username,
      password: hashedPassword,
      country_code: userData.country_code,
    };

    // Optional fields
    if (userData.creator) {
      body.creator = userData.creator;
    }
    if (userData.user_nick_name) {
      body.user_nick_name = userData.user_nick_name;
    }

    const path = `/v1.0/iot-02/users`;
    return await this._makeRequest("POST", path, {}, body);
  }

  /**
   * Add a device user
   * Reference: https://developer.tuya.com/en/docs/cloud/doorlock-api-member?id=Kbe2o84on6zgh#title-6-Add%20a%20device%20user
   * POST /v1.0/devices/{device_id}/users
   *
   * Applicable lock types:
   * - Keepalive Wi-Fi lock
   * - Wi-Fi lock with video talk
   *
   * @param {string} deviceId - Device ID
   * @param {object} userData - User data
   * @param {string} userData.uid - The user ID (UID) from Tuya platform (required)
   * @param {string} userData.nick_name - Nickname (optional)
   * @param {string} userData.user_contact - Contact information (email or phone) (optional)
   * @param {number} userData.user_type - User type: 10=administrator, 20=common user, 50=home owner (required)
   * @param {number} userData.sex - Gender: 1=male, 2=female (optional, but recommended)
   * @param {number} userData.birthday - Date of birth timestamp in seconds (optional)
   * @param {number} userData.height - Height in cm (optional)
   * @param {number} userData.weight - Weight in g (optional)
   * @param {number} userData.back_home_notify_attr - Enable notifications: 1=yes, 0=no (optional, default: 0)
   * @returns {Promise<object>} Returns user_id (lock_user_id) and other user information
   */
  async addDeviceUser(deviceId, userData) {
    if (!deviceId) {
      throw new Error("deviceId is required for addDeviceUser");
    }
    if (!userData.uid) {
      throw new Error(
        "uid is required for addDeviceUser. User must be registered in Tuya platform first."
      );
    }
    if (userData.user_type === undefined || userData.user_type === null) {
      throw new Error(
        "user_type is required for addDeviceUser (10=admin, 20=common user, 50=home owner)"
      );
    }

    // Build request body according to documentation
    const body = {};

    // Optional fields - only include if provided
    if (
      userData.nick_name !== undefined &&
      userData.nick_name !== null &&
      userData.nick_name !== ""
    ) {
      body.nick_name = String(userData.nick_name);
    }
    if (
      userData.user_contact !== undefined &&
      userData.user_contact !== null &&
      userData.user_contact !== ""
    ) {
      body.user_contact = String(userData.user_contact);
    }
    if (userData.sex !== undefined && userData.sex !== null) {
      body.sex = Number(userData.sex);
    }
    if (userData.birthday !== undefined && userData.birthday !== null) {
      body.birthday = Number(userData.birthday);
    }
    if (userData.height !== undefined && userData.height !== null) {
      body.height = Number(userData.height);
    }
    if (userData.weight !== undefined && userData.weight !== null) {
      body.weight = Number(userData.weight);
    }
    if (
      userData.back_home_notify_attr !== undefined &&
      userData.back_home_notify_attr !== null
    ) {
      body.back_home_notify_attr = Number(userData.back_home_notify_attr);
    }

    // Use devices endpoint according to documentation
    const path = `/v1.0/devices/${deviceId}/user`;
    console.log(`[addDeviceUser] Path: ${path}, Body:`, body);

    const result = await this._makeRequest("POST", path, {}, body);
    return result;
  }

  /**
   * Modify a device user
   * Reference: https://developer.tuya.com/en/docs/cloud/doorlock-api-member?id=Kbe2o84on6zgh#title-7-Modify%20a%20device%20user
   * PUT /v1.0/smart-lock/devices/{device_id}/users/{user_id}
   *
   * Applicable lock types:
   * - Keepalive Wi-Fi lock
   * - Wi-Fi lock with video talk
   *
   * @param {string} deviceId - Device ID
   * @param {string} userId - User ID (lock_user_id or user_id)
   * @param {object} userData - Update data
   * @param {string} userData.nick_name - Nickname (optional)
   * @param {number} userData.sex - Gender: 1=male, 2=female (required)
   * @param {number} userData.birthday - Date of birth timestamp in seconds (optional)
   * @param {number} userData.height - Height in cm (optional)
   * @param {number} userData.weight - Weight in g (optional)
   * @returns {Promise<object>} Returns { result: true, success: true }
   */
  async updateDeviceUser(deviceId, userId, userData) {
    if (!deviceId) {
      throw new Error("deviceId is required for updateDeviceUser");
    }
    if (!userId) {
      throw new Error("userId is required for updateDeviceUser");
    }
    if (userData.sex === undefined || userData.sex === null) {
      throw new Error("sex is required for updateDeviceUser");
    }

    // Build request body according to documentation
    const body = {
      sex: Number(userData.sex),
    };

    // Optional fields - only include if provided
    if (
      userData.nick_name !== undefined &&
      userData.nick_name !== null &&
      userData.nick_name !== ""
    ) {
      body.nick_name = String(userData.nick_name);
    }
    if (userData.birthday !== undefined && userData.birthday !== null) {
      body.birthday = Number(userData.birthday);
    }
    if (userData.height !== undefined && userData.height !== null) {
      body.height = Number(userData.height);
    }
    if (userData.weight !== undefined && userData.weight !== null) {
      body.weight = Number(userData.weight);
    }

    // Use smart-lock endpoint according to documentation
    const path = `/v1.0/devices/${deviceId}/users/${userId}`;
    console.log(`[updateDeviceUser] Path: ${path}, Body:`, body);

    const result = await this._makeRequest("PUT", path, {}, body);
    return result;
  }

  /**
   * Delete device user
   * Reference: https://developer.tuya.com/en/docs/archived-documents/f6852cd575?id=Kayexbozlpmqn
   * DELETE /v1.0/devices/{device_id}/users/{user_id}
   *
   * @param {string} deviceId - Device ID
   * @param {string} userId - User ID (lock_user_id or user_id)
   * @returns {Promise<object>} Returns { result: true, success: true }
   */
  async deleteDeviceUser(deviceId, userId) {
    if (!deviceId) {
      throw new Error("deviceId is required for deleteDeviceUser");
    }
    if (!userId) {
      throw new Error("userId is required for deleteDeviceUser");
    }

    const path = `/v1.0/devices/${deviceId}/users/${userId}`;
    console.log(`[deleteDeviceUser] Path: ${path}`);

    const result = await this._makeRequest("DELETE", path, {}, null);
    return result;
  }

  /**
   * Query User Information on Pages
   * Reference: https://developer.tuya.com/en/docs/cloud/c18861d969?id=Katz3k4d80jt0
   * GET /v1.1/iot-02/users
   *
   * @param {object} params - Query parameters
   * @param {string} params.user_nick_name - The nickname of a specified user (optional)
   * @param {string} params.user_ids - The list of user IDs (comma-separated) (optional)
   * @param {string} params.user_names - The list of account names (comma-separated) (optional)
   * @param {string} params.last_row_key - The row key of the last entry on each page (optional)
   * @param {number} params.page_size - The number of items to be returned per page (optional, default: 20)
   * @returns {Promise<object>} Returns list of users with pagination info
   */
  async queryUsers(params = {}) {
    try {
      const queryObj = {};

      queryObj.page_size =
        params.page_size !== undefined ? Number(params.page_size) : 20;

      if (params.last_row_key) {
        queryObj.last_row_key = String(params.last_row_key);
      }

      const hasSearchCriteria =
        params.user_nick_name || params.user_ids || params.user_names;

      if (hasSearchCriteria) {
        const queryUserRequest = {};
        if (params.user_nick_name) {
          queryUserRequest.user_nick_name = String(params.user_nick_name);
        }
        if (params.user_ids) {
          queryUserRequest.user_ids = String(params.user_ids);
        }
        if (params.user_names) {
          queryUserRequest.user_names = String(params.user_names);
        }
        queryObj.query_user_request = JSON.stringify(queryUserRequest);
      }

      const path = `/v1.1/iot-02/users`;
      console.log(`[queryUsers] Path: ${path}, Query:`, queryObj);

      const result = await this._makeRequest("GET", path, queryObj, null);
      console.log(
        `[queryUsers] Raw response:`,
        JSON.stringify(result, null, 2)
      );

      // Return raw response to match test script expectations
      // The response structure is: { list: [...], last_row_key: "...", page_size: 20, has_next: true }
      return result;
    } catch (error) {
      console.error(`[queryUsers] Error:`, error);
      throw error; // Let the route handle the error
    }
  }
}

module.exports = new TuyaService();
