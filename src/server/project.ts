import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Searches common directories where a project with LEARNING.md might be located
 */
export function findFallbackProjectDir(currentDir: string): string | null {
  const candidates: string[] = [];

  // Check CWD or active dir first
  if (currentDir) {
    candidates.push(currentDir);
  }

  // User Profile and Desktop locations
  const userHome = os.homedir();
  const desktopDir = path.join(userHome, "Desktop");
  candidates.push(path.join(desktopDir, "pruebaAgente"));

  // Check if desktop folder has subdirectories containing LEARNING.md
  try {
    if (fs.existsSync(desktopDir)) {
      const entries = fs.readdirSync(desktopDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          candidates.push(path.join(desktopDir, entry.name));
        }
      }
    }
  } catch {
    // Ignore read errors
  }

  // Also check direct subdirectories of cwd or parent
  try {
    const parentDir = path.dirname(currentDir);
    if (fs.existsSync(parentDir)) {
      const entries = fs.readdirSync(parentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          candidates.push(path.join(parentDir, entry.name));
        }
      }
    }
  } catch {
    // Ignore read errors
  }

  for (const candidate of candidates) {
    try {
      const file = path.join(candidate, "LEARNING.md");
      if (fs.existsSync(file)) {
        return candidate;
      }
    } catch {
      // Ignore
    }
  }

  return null;
}
