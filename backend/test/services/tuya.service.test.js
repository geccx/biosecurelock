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
