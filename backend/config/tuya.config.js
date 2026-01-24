/**
 * Tuya IoT Cloud API Configuration
 *
 * Documentation:
 * - IoT Core: https://developer.tuya.com/en/docs/cloud/device-connection-service?id=Kb0b8geg6o761
 * - Authentication: https://developer.tuya.com/en/docs/iot/authentication-method?id=Ka49gbaxjygox
 *
 * Required Environment Variables:
 * - TUYA_CLIENT_ID: Access ID from your Cloud Project
 * - TUYA_CLIENT_SECRET: Access Secret from your Cloud Project
 * - TUYA_DEVICE_ID: Your smart lock device ID
 * - TUYA_API_ENDPOINT: Regional API endpoint (defaults to Singapore)
 *
 * Getting Credentials:
 * 1. Go to https://iot.tuya.com
 * 2. Create/Open Cloud Project
 * 3. Get credentials from: Overview > Authorization Key
 * 4. Link device: Devices > Link Tuya App Account
 * 5. Subscribe to APIs: Cloud > API Explorer
 */

module.exports = {
  clientId: process.env.TUYA_CLIENT_ID,
  clientSecret: process.env.TUYA_CLIENT_SECRET,
  deviceId: process.env.TUYA_DEVICE_ID,
  gatewayId: process.env.TUYA_GATEWAY_ID,

  // Default to Singapore datacenter
  apiEndpoint:
    process.env.TUYA_API_ENDPOINT || "https://openapi-sg.iotbing.com",

  // Tuya Regional Data Centers
  // Must match your Cloud Project's data center
  dataCenters: {
    cn: "https://openapi.tuyacn.com", // China
    us: "https://openapi.tuyaus.com", // Americas (Western)
    eu: "https://openapi.tuyaeu.com", // Europe
    in: "https://openapi.tuyain.com", // India
    sg: "https://openapi.tuyasg.com", // Singapore (Southeast Asia)
    we: "https://openapi-weaz.tuyaus.com", // Americas (Eastern)
  },

  // API Categories
  apiCategories: {
    // IoT Core APIs (v2.0) - Thing Model
    iotCore: {
      deviceDetails: "/v2.0/cloud/thing/{device_id}",
      deviceState: "/v2.0/cloud/thing/{device_id}/state",
      deviceLogs: "/v2.0/cloud/thing/{device_id}/logs",
      deviceModel: "/v2.0/cloud/thing/{device_id}/model",
      properties: "/v2.0/cloud/thing/{device_id}/shadow/properties",
      actions: "/v2.0/cloud/thing/{device_id}/shadow/actions",
    },
    // Standard Instruction Set (v1.0/iot-03)
    standard: {
      status: "/v1.0/iot-03/devices/{device_id}/status",
      specification: "/v1.0/iot-03/devices/{device_id}/specification",
      functions: "/v1.0/iot-03/devices/{device_id}/functions",
      commands: "/v1.0/iot-03/devices/{device_id}/commands",
    },
    // Smart Lock Specific APIs
    smartLock: {
      info: "/v1.0/devices/{device_id}",
      tempPassword: "/v1.0/devices/{device_id}/door-lock/temp-password",
      dynamicPassword: "/v1.0/devices/{device_id}/door-lock/dynamic-password",
      remoteUnlock: "/v1.0/devices/{device_id}/door-lock/open-door",
      records: "/v1.0/devices/{device_id}/door-lock/records",
      opmodes: "/v1.0/smart-lock/devices/{device_id}/opmodes",
    },
  },

  // Device capabilities
  capabilities: {
    remoteUnlock: true,
    dynamicPassword: true,
    temporaryPassword: true,
    fingerprint: true,
    rfid: true,
    schedules: true,
    logs: true,
  },
};
