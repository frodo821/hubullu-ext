import * as vscode from "vscode";
import * as cp from "child_process";
import { resolveMainFile } from "./dictionaryCompile";

export async function lintFix(): Promise<void> {
  const ws = vscode.workspace.workspaceFolders?.[0];
  if (!ws) {
    vscode.window.showErrorMessage("No workspace folder open.");
    return;
  }

  const workspaceRoot = ws.uri.fsPath;
  const mainFile = await resolveMainFile(workspaceRoot);
  if (!mainFile) return;

  const config = vscode.workspace.getConfiguration("hubullu");
  const serverPath = config.get<string>("serverPath", "hubullu");

  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Running hubullu lint --fix…",
      cancellable: false,
    },
    () =>
      new Promise<void>((resolve) => {
        const proc = cp.spawn(serverPath, ["lint", mainFile, "--fix"], {
          cwd: workspaceRoot,
        });

        let stdout = "";
        let stderr = "";
        proc.stdout?.on("data", (data: Buffer) => {
          stdout += data.toString();
        });
        proc.stderr?.on("data", (data: Buffer) => {
          stderr += data.toString();
        });

        proc.on("close", (code) => {
          const output = (stdout + stderr).trim();
          if (code === 0) {
            vscode.window.showInformationMessage(
              output || "Lint fix completed — no issues found."
            );
          } else {
            vscode.window.showWarningMessage(
              output || `hubullu lint --fix exited with code ${code}.`
            );
          }
          resolve();
        });

        proc.on("error", (err) => {
          vscode.window.showErrorMessage(
            `Failed to start hubullu: ${err.message}`
          );
          resolve();
        });
      })
  );
}
