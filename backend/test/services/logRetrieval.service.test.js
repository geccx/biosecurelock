/**
 * Unit tests for Log Retrieval Service (event hash, timestamp validation, normalization).
 * Does not require database for hash and validation tests.
 */
const logRetrieval = require("../../services/logRetrieval.service");

describe("Log Retrieval Service", () => {
  describe("eventHash", () => {
    test("produces deterministic hash from payload", () => {
      const payload = {
        timestamp: "1700000000000",
        tuya_device_id: "dev1",
        user_id: 1,
        tuya_unlock_id: "u1",
        success: true,
        external_event_id: "e1",
      };
      const h1 = logRetrieval.eventHash(payload);
      const h2 = logRetrieval.eventHash(payload);
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^[a-f0-9]{64}$/);
    });

    test("different payloads produce different hashes", () => {
      const a = logRetrieval.eventHash({
        timestamp: "1",
        tuya_device_id: "d1",
        user_id: 1,
        success: true,
      });
      const b = logRetrieval.eventHash({
        timestamp: "2",
        tuya_device_id: "d1",
        user_id: 1,
        success: true,
      });
      expect(a).not.toBe(b);
    });

    test("success vs failed produces different hash", () => {
      const base = { timestamp: "1", tuya_device_id: "d1", user_id: 1 };
      const success = logRetrieval.eventHash({ ...base, success: true });
      const failed = logRetrieval.eventHash({ ...base, success: false });
      expect(success).not.toBe(failed);
    });
  });

  describe("isTimestampValid", () => {
    test("accepts timestamp within default drift", () => {
      const now = Date.now();
      expect(logRetrieval.isTimestampValid(now)).toBe(true);
      expect(logRetrieval.isTimestampValid(now - 60 * 1000)).toBe(true);
    });

    test("rejects timestamp outside drift when specified", () => {
      const now = Date.now();
      const old = now - 400 * 1000; // 400 seconds ago
      expect(logRetrieval.isTimestampValid(old, 300)).toBe(false);
    });

    test("accepts timestamp within custom drift", () => {
      const now = Date.now();
      expect(logRetrieval.isTimestampValid(now - 100 * 1000, 300)).toBe(true);
    });
  });

  describe("normalizeTuyaLogItem", () => {
    test("maps Tuya unlock type to access method", () => {
      const item = {
        timestamp: Date.now(),
        unlock_type: "unlock_fingerprint",
        user_id: "1",
        success: true,
      };
      const row = logRetrieval.normalizeTuyaLogItem(item, "dev1", 1, false);
      expect(row.access_method).toBe("fingerprint");
      expect(row.success).toBe(true);
      expect(row.event_hash).toBeDefined();
      expect(row.retrieval_status).toBe("realtime");
    });

    test("sets offline_flag and retrieval_status when wasOffline true", () => {
      const item = {
        timestamp: Date.now(),
        unlock_type: "unlock_password",
        user_id: "2",
        success: true,
      };
      const row = logRetrieval.normalizeTuyaLogItem(item, "dev1", 1, true);
      expect(row.offline_flag).toBe(true);
      expect(row.retrieval_status).toBe("buffered");
    });
  });
});
