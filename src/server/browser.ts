import { execFile } from "node:child_process";

/**
 * Cross-platform helper to open a URL in the default web browser.
 *
 * If `command` is provided, it is used as the executable to launch instead of
 * the platform default.
 */
export function openBrowser(url: string, command?: string): void {
  // Validate that url is a safe local HTTP URL
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      console.warn(`[mentor-plugin] URL no permitida: ${url}`);
      return;
    }
  } catch {
    console.warn(`[mentor-plugin] URL inválida: ${url}`);
    return;
  }

  const onError = (err: Error) => {
    console.warn(`[mentor-plugin] No se pudo abrir automáticamente el navegador: ${err.message}`);
  };

  if (command) {
    execFile(command, [url], (err) => {
      if (err) onError(err);
    });
    return;
  }

  const platform = process.platform;

  if (platform === "win32") {
    execFile("cmd.exe", ["/c", "start", "", url], (err) => {
      if (err) onError(err);
    });
  } else if (platform === "darwin") {
    execFile("open", [url], (err) => {
      if (err) onError(err);
    });
  } else {
    execFile("xdg-open", [url], (err) => {
      if (err) onError(err);
    });
  }
}
