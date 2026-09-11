import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Desktop stores project pins outside the App Server project catalog. Only
// project identities from this one preference are projected into Relay replies.
export class DesktopProjectPins {
  #file;
  #positions = new Map();

  constructor({ codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex") } = {}) {
    this.#file = path.join(codexHome, ".codex-global-state.json");
  }

  async enrich(result) {
    if (!Array.isArray(result?.data)) return result;
    try {
      const state = JSON.parse(await fs.readFile(this.#file, "utf8"));
      if (state && typeof state === "object" && !Array.isArray(state)) {
        const ids = state["pinned-project-ids"] ?? [];
        if (Array.isArray(ids) && ids.every((id) => typeof id === "string" && id.trim())) {
          this.#positions = new Map([...new Set(ids)].map((id, index) => [id, index]));
        }
      }
    } catch {
      // Desktop can briefly replace or partially write this file. Keep the
      // last valid snapshot; a valid empty preference still clears every pin.
    }
    return {
      ...result,
      data: result.data.map((project) => {
        if (!project || typeof project !== "object" || Array.isArray(project)) return project;
        const pinnedPosition = this.#positions.get(project.id);
        return { ...project, isPinned: pinnedPosition !== undefined, pinnedPosition: pinnedPosition ?? null };
      }),
    };
  }
}
