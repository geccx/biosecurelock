const express = require("express");
const router = express.Router();
const tuyaService = require("../services/tuya.service");
const tuyaIntegration = require("../services/tuya-integration.service");
const fabricService = require("../services/fabric.service");
const db = require("../models/mysql.models");
const logger = require("../utils/logger");

/**
 * Tuya Webhook Routes
 * Receives events from Tuya Smart Lock devices
 *
 * Reference: https://developer.tuya.com/en/docs/cloud/smart-door-lock?id=K9jgsgd4cgysr
 */

/**
 * Webhook endpoint for Tuya device events
 * POST /api/tuya/webhook
 */
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const signature = req.headers["sign"];
      const timestamp = req.headers["t"];
      const bodyString = req.body.toString();

      // Verify webhook signature
      const isValid = tuyaService.verifyWebhookSignature(
        signature,
        bodyString,
        timestamp
      );

      if (!isValid) {
        logger.warn("Invalid Tuya webhook signature");
        return res.status(401).json({
          success: false,
          error: "Invalid signature",
        });
      }

      const eventData = JSON.parse(bodyString);

      logger.info("Tuya webhook received", {
        eventType: eventData.bizCode || eventData.eventType,
        deviceId: eventData.devId,
      });

      // Handle different event types
      switch (eventData.bizCode || eventData.eventType) {
        case "doorUnlock":
        case "unlock":
        case "door_lock_unlock":
          await handleUnlockEvent(eventData);
          break;

        case "doorLock":
        case "lock":
        case "door_lock_lock":
          await handleLockEvent(eventData);
          break;

        case "alarm":
        case "door_lock_alarm":
          await handleAlarmEvent(eventData);
          break;

        case "enrollment":
        case "fingerprint_added":
        case "rfid_added":
          await handleEnrollmentEvent(eventData);
          break;

        default:
          logger.info("Unhandled Tuya event type", {
            eventType: eventData.bizCode || eventData.eventType,
          });
      }

      res.json({
        success: true,
        message: "Webhook processed",
      });
    } catch (error) {
      logger.error("Error processing Tuya webhook:", error);
      res.status(500).json({
        success: false,
        error: "Failed to process webhook",
      });
    }
  }
);

/**
 * Handle unlock event from Tuya
 */
async function handleUnlockEvent(eventData) {
  try {
    const parsedEvent = tuyaService.parseUnlockEvent(eventData);

    // Process unlock event through integration service
    const result = await tuyaIntegration.processUnlockEvent(eventData);

    if (result.success) {
      // Log to blockchain
      try {
        await fabricService.logAccess(
          parsedEvent.timestamp || Date.now(),
          result.userId,
          parsedEvent.unlockMethod,
          "unlock",
          true,
          {
            deviceId: parsedEvent.deviceId,
            unlockId: parsedEvent.unlockId,
            source: "tuya_webhook",
          }
        );
      } catch (fabricError) {
        logger.error("Error logging to blockchain:", fabricError);
      }
    }

    logger.info("Unlock event processed", {
      userId: result.userId,
      method: parsedEvent.unlockMethod,
      success: result.success,
    });
  } catch (error) {
    logger.error("Error handling unlock event:", error);
  }
}

/**
 * Handle lock event from Tuya
 */
async function handleLockEvent(eventData) {
  try {
    logger.info("Lock event received", { deviceId: eventData.devId });

    // Log system activity
    await db.query(
      `INSERT INTO system_logs (event_type, event_description, metadata, timestamp)
       VALUES (?, ?, ?, NOW())`,
      [
        "door_locked",
        "Door locked via Tuya device",
        JSON.stringify({ deviceId: eventData.devId, eventData }),
      ]
    );
  } catch (error) {
    logger.error("Error handling lock event:", error);
  }
}

/**
 * Handle alarm event from Tuya
 */
async function handleAlarmEvent(eventData) {
  try {
    logger.warn("Alarm event received", {
      deviceId: eventData.devId,
      eventData,
    });

    // Log alarm
    await db.query(
      `INSERT INTO system_logs (event_type, event_description, metadata, timestamp)
       VALUES (?, ?, ?, NOW())`,
      [
        "door_alarm",
        "Door alarm triggered",
        JSON.stringify({ deviceId: eventData.devId, eventData }),
      ]
    );
  } catch (error) {
    logger.error("Error handling alarm event:", error);
  }
}

/**
 * Handle enrollment event from Tuya (fingerprint/RFID added)
 */
async function handleEnrollmentEvent(eventData) {
  try {
    logger.info("Enrollment event received", { deviceId: eventData.devId });

    // This would typically trigger a sync of unlocking methods
    // Determine code based on event type
    let syncCode = "unlock_fingerprint"; // default
    if (
      eventData.bizCode === "rfid_added" ||
      eventData.eventType === "rfid_added"
    ) {
      syncCode = "unlock_card";
    } else if (
      eventData.bizCode === "fingerprint_added" ||
      eventData.eventType === "fingerprint_added"
    ) {
      syncCode = "unlock_fingerprint";
    }
    await tuyaService.syncUnlockingMethods(syncCode);

    // Log system activity
    await db.query(
      `INSERT INTO system_logs (event_type, event_description, metadata, timestamp)
       VALUES (?, ?, ?, NOW())`,
      [
        "enrollment_detected",
        "New enrollment detected on Tuya device",
        JSON.stringify({ deviceId: eventData.devId, eventData }),
      ]
    );
  } catch (error) {
    logger.error("Error handling enrollment event:", error);
  }
}

module.exports = router;
