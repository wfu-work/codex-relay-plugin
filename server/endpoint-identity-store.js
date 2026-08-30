import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export class EndpointIdentityStore {
  constructor(configDir) {
    this.configDir = configDir;
    this.file = path.join(configDir, "endpoint-identity.json");
    this.identity = null;
  }

  async get() {
    if (this.identity) return { ...this.identity };
    try {
      this.identity = this.#validate(JSON.parse(await fs.readFile(this.file, "utf8")));
      await fs.chmod(this.file, 0o600);
      return { ...this.identity };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const pair = crypto.generateKeyPairSync("ed25519");
    const publicDer = pair.publicKey.export({ format: "der", type: "spki" });
    const privateDer = pair.privateKey.export({ format: "der", type: "pkcs8" });
    const identity = {
      schemaVersion: 1,
      publicKey: Buffer.from(publicDer).subarray(-32).toString("base64url"),
      privateKey: Buffer.from(privateDer).toString("base64url"),
    };
    await fs.mkdir(this.configDir, { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(identity, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(temporary, this.file);
    await fs.chmod(this.file, 0o600);
    this.identity = identity;
    return { ...identity };
  }

  #validate(value) {
    if (!value || value.schemaVersion !== 1) throw new Error("Endpoint identity schema is invalid");
    const publicBytes = Buffer.from(value.publicKey || "", "base64url");
    const privateBytes = Buffer.from(value.privateKey || "", "base64url");
    if (
      publicBytes.length !== 32 ||
      publicBytes.toString("base64url") !== value.publicKey ||
      privateBytes.length < 32 ||
      privateBytes.toString("base64url") !== value.privateKey
    ) {
      throw new Error("Endpoint identity key material is invalid");
    }
    return { schemaVersion: 1, publicKey: value.publicKey, privateKey: value.privateKey };
  }
}
