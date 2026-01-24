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
