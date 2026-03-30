import * as vscode from "vscode";
import * as cp from "child_process";
import * as path from "path";
import * as fs from "fs";

/**
 * Resolve the main .hu entry point for compilation.
 * Priority: hubullu.mainFile setting → main.hu in workspace root
 *         → active editor .hu file → file picker dialog.
 */
async function resolveMainFile(workspaceRoot: string): Promise<string | undefined> {
  const config = vscode.workspace.getConfiguration("hubullu");
  const configured = config.get<string>("mainFile", "");

  if (configured) {
    const abs = path.isAbsolute(configured)
      ? configured
      : path.join(workspaceRoot, configured);
    if (fs.existsSync(abs)) return abs;
  }

  const mainHu = path.join(workspaceRoot, "main.hu");
  if (fs.existsSync(mainHu)) return mainHu;

  // Try the currently active editor
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri?.scheme === "file" && activeUri.fsPath.endsWith(".hu")) {
    const use = await vscode.window.showInformationMessage(
      `No main.hu found. Use the current file as entry point?`,
      { detail: path.basename(activeUri.fsPath), modal: false },
      "Use Current File",
      "Choose File…"
    );
    if (use === "Use Current File") return activeUri.fsPath;
    if (use === "Choose File…") return pickHuFile(workspaceRoot);
    return undefined; // dismissed
  }

  // No active .hu file — open file picker
  return pickHuFile(workspaceRoot);
}

async function pickHuFile(workspaceRoot: string): Promise<string | undefined> {
  const uris = await vscode.window.showOpenDialog({
    defaultUri: vscode.Uri.file(workspaceRoot),
    canSelectMany: false,
    filters: { "Hubullu files": ["hu"] },
    title: "Select entry point .hu file",
  });
  return uris?.[0]?.fsPath;
}

function getOutputPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".hubullu", "dictionary.sqlite");
}

export function getDefaultDbPath(): string | undefined {
  const ws = vscode.workspace.workspaceFolders?.[0];
  if (!ws) return undefined;
  return getOutputPath(ws.uri.fsPath);
}

export async function compileDictionary(): Promise<string | undefined> {
  const ws = vscode.workspace.workspaceFolders?.[0];
  if (!ws) {
    vscode.window.showErrorMessage("No workspace folder open.");
    return undefined;
  }

  const workspaceRoot = ws.uri.fsPath;
  const mainFile = await resolveMainFile(workspaceRoot);
  if (!mainFile) return undefined;

  const outputPath = getOutputPath(workspaceRoot);
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const config = vscode.workspace.getConfiguration("hubullu");
  const serverPath = config.get<string>("serverPath", "hubullu");

  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Compiling dictionary…",
      cancellable: false,
    },
    () =>
      new Promise<string | undefined>((resolve) => {
        const proc = cp.spawn(serverPath, ["compile", mainFile, "-o", outputPath], {
          cwd: workspaceRoot,
        });

        let stderr = "";
        proc.stderr?.on("data", (data: Buffer) => {
          stderr += data.toString();
        });

        proc.on("close", (code) => {
          if (code === 0) {
            vscode.window
              .showInformationMessage(
                "Dictionary compiled successfully.",
                "Open Dictionary"
              )
              .then((choice) => {
                if (choice === "Open Dictionary") {
                  vscode.commands.executeCommand("hubullu.openDictionary");
                }
              });
            resolve(outputPath);
          } else {
            vscode.window.showErrorMessage(
              `Dictionary compilation failed (exit ${code}):\n${stderr.trim()}`
            );
            resolve(undefined);
          }
        });

        proc.on("error", (err) => {
          vscode.window.showErrorMessage(
            `Failed to start hubullu: ${err.message}`
          );
          resolve(undefined);
        });
      })
  );
}
