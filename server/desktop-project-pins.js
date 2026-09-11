import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Desktop stores project pins outside the App Server project catalog. Only
// project identities from this one preference are projected into Relay replies.
export class DesktopProjectPins {
  #file;
  #codexHome;
  #positions = new Map();
  #pathPositions = new Map();

  constructor({ codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex") } = {}) {
    this.#codexHome = path.resolve(codexHome);
    this.#file = path.join(this.#codexHome, ".codex-global-state.json");
  }

  async enrich(result) {
    if (!Array.isArray(result?.data)) return result;
    try {
      const state = JSON.parse(await fs.readFile(this.#file, "utf8"));
      if (state && typeof state === "object" && !Array.isArray(state)) {
        const ids = state["pinned-project-ids"] ?? [];
        if (Array.isArray(ids) && ids.every((id) => typeof id === "string" && id.trim())) {
          const positions = [...new Set(ids)].map((id, index) => [id, index]);
          const mappings = state["app-server-project-id-by-legacy-project-id-by-host"];
          const hostMapping = mappings?.[`local:${this.#codexHome}`];
          const resolved = positions.map(([legacyId, index]) => [
            typeof hostMapping?.[legacyId] === "string" ? hostMapping[legacyId] : legacyId,
            index,
          ]);
          this.#positions = new Map([...positions, ...resolved]);

          const localProjects = state["local-projects"];
          this.#pathPositions = new Map(positions.flatMap(([legacyId, index]) => {
            const roots = localProjects?.[legacyId]?.rootPaths;
            return Array.isArray(roots)
              ? roots.filter((root) => typeof root === "string" && root.trim())
                  .map((root) => [path.resolve(root), index])
              : [];
          }));
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
        let pinnedPosition = this.#positions.get(project.id);
        if (pinnedPosition === undefined) {
          const roots = Array.isArray(project.roots) ? project.roots : [];
          const candidates = project.path ? [project.path, ...roots] : roots;
          for (const root of candidates) {
            const projectPath = typeof root === "string" ? root : root?.path;
            if (typeof projectPath !== "string" || !projectPath.trim()) continue;
            pinnedPosition = this.#pathPositions.get(path.resolve(projectPath));
            if (pinnedPosition !== undefined) break;
          }
        }
        return { ...project, isPinned: pinnedPosition !== undefined, pinnedPosition: pinnedPosition ?? null };
      }),
    };
  }
}
