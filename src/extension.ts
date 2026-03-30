import * as vscode from "vscode";
import * as cp from "child_process";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from "vscode-languageclient/node";
import {
  DisplayModeManager,
  EntryRefDisplayMode,
} from "./displayMode";
import { SurfaceFormOverlayManager } from "./surfaceFormOverlay";

let client: LanguageClient | undefined;
let serverProcess: cp.ChildProcess | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration("hubullu");
  const serverPath = config.get<string>("serverPath", "hubullu");

  // Read the persisted mode so the middleware can filter from the very first
  // inlay-hint request, before DisplayModeManager is fully initialised.
  let currentMode: EntryRefDisplayMode =
    config.get<EntryRefDisplayMode>("entryRefDisplayMode") ?? "inlayHint";

  const serverOptions: ServerOptions = () => {
    return new Promise((resolve) => {
      const child = cp.spawn(serverPath, ["lsp"], { stdio: "pipe" });
      serverProcess = child;
      resolve({
        writer: child.stdin!,
        reader: child.stdout!,
      });
    });
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: "file", language: "hubullu" },
      { scheme: "file", language: "hubullu-text" },
    ],
    middleware: {
      provideInlayHints: (document, range, token, next) => {
        if (currentMode !== "inlayHint") return [];
        return next(document, range, token);
      },
    },
  };

  client = new LanguageClient(
    "hubullu",
    "Hubullu Language Server",
    serverOptions,
    clientOptions
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("hubullu.restartServer", async () => {
      if (client) {
        await client.restart();
      }
    })
  );

  client.start().then(() => {
    if (!client) return;

    const displayMode = new DisplayModeManager(client);
    const overlay = new SurfaceFormOverlayManager(client);

    context.subscriptions.push(displayMode, overlay);

    displayMode.onDidChangeMode((mode) => {
      currentMode = mode;
      overlay.setEnabled(mode === "overlay");
    });

    client.onNotification("hubullu/surfaceFormsRefresh", () => {
      overlay.refresh();
    });

    displayMode.init().then(() => {
      currentMode = displayMode.getMode();
      overlay.setEnabled(displayMode.getMode() === "overlay");
    });
  });
}

export function deactivate(): void {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGINT");
    serverProcess = undefined;
  }
  client = undefined;
}
