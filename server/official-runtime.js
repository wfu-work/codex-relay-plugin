import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
export const officialNode = app => path.join(app, "Contents/Resources/cua_node/bin/node");

export async function verifyOfficialRuntime(app) {
  const runtime = officialNode(app);
  await exec("/usr/bin/codesign", ["--verify", "--strict", "-R=identifier \"node\" and anchor apple generic and certificate leaf[subject.OU] = \"2DC432GLL2\"", runtime], { timeout: 5000, maxBuffer: 4096 });
  return { verified: true, teamId: "2DC432GLL2", identifier: "node" };
}
