const crypto = require("crypto");

class CryptoUtils {
  // Encrypt data using AES-256-CBC
  static encrypt(text, key) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      "aes-256-cbc",
      Buffer.from(key, "hex"),
      iv
    );

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    return iv.toString("hex") + ":" + encrypted;
  }

  // Decrypt data using AES-256-CBC
  static decrypt(encryptedData, key) {
    const parts = encryptedData.split(":");
    const iv = Buffer.from(parts.shift(), "hex");
    const encrypted = parts.join(":");

    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      Buffer.from(key, "hex"),
      iv
    );

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  // Generate random key
  static generateKey() {
    return crypto.randomBytes(32).toString("hex");
  }

  // Hash password using SHA-256
  static hash(data) {
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  // Generate random string
  static generateRandomString(length = 32) {
    return crypto
      .randomBytes(Math.ceil(length / 2))
      .toString("hex")
      .slice(0, length);
  }
}

module.exports = CryptoUtils;
