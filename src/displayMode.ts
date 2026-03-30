import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";

export type EntryRefDisplayMode = "inlayHint" | "overlay" | "off";

const MODE_LABELS: Record<EntryRefDisplayMode, string> = {
  inlayHint: "$(eye) Inlay Hints",
  overlay: "$(replace) Overlay",
  off: "$(eye-closed) Off",
};

const MODE_CYCLE: EntryRefDisplayMode[] = ["inlayHint", "overlay", "off"];

const DOCUMENT_SELECTOR = [
  { language: "hubullu" },
  { language: "hubullu-text" },
];

export class DisplayModeManager implements vscode.Disposable {
  private mode: EntryRefDisplayMode = "inlayHint";
  private statusBarItem: vscode.StatusBarItem;
  private disposables: vscode.Disposable[] = [];
  private readonly _onDidChangeMode =
    new vscode.EventEmitter<EntryRefDisplayMode>();
  readonly onDidChangeMode = this._onDidChangeMode.event;

  // Fires to force VS Code to re-request inlay hints from all providers.
  private readonly inlayHintRefresh = new vscode.EventEmitter<void>();

  constructor(private client: LanguageClient) {
    // Read persisted mode from settings.
    const saved = vscode.workspace
      .getConfiguration("hubullu")
      .get<EntryRefDisplayMode>("entryRefDisplayMode");
    if (saved) {
      this.mode = saved;
    }

    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = "hubullu.entryRefDisplay.cycle";
    this.updateStatusBar();

    // Register a dummy InlayHintsProvider whose sole purpose is to own an
    // onDidChangeInlayHints event.  Firing it causes VS Code to re-request
    // inlay hints from ALL providers (including the LanguageClient's), which
    // lets our middleware suppress them when the mode is not "inlayHint".
    const dummyProvider: vscode.InlayHintsProvider = {
      onDidChangeInlayHints: this.inlayHintRefresh.event,
      provideInlayHints: () => [],
    };

    this.disposables.push(
      this.statusBarItem,
      this._onDidChangeMode,
      this.inlayHintRefresh,
      vscode.languages.registerInlayHintsProvider(
        DOCUMENT_SELECTOR,
        dummyProvider
      ),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        this.updateStatusBarVisibility(editor);
      }),
      vscode.commands.registerCommand(
        "hubullu.entryRefDisplay.inlayHint",
        () => this.setMode("inlayHint")
      ),
      vscode.commands.registerCommand(
        "hubullu.entryRefDisplay.overlay",
        () => this.setMode("overlay")
      ),
      vscode.commands.registerCommand("hubullu.entryRefDisplay.off", () =>
        this.setMode("off")
      ),
      vscode.commands.registerCommand(
        "hubullu.entryRefDisplay.cycle",
        () => this.cycle()
      )
    );

    this.updateStatusBarVisibility(vscode.window.activeTextEditor);
  }

  async init(): Promise<void> {
    // Sync mode to the server (the persisted setting is the source of truth).
    try {
      await this.client.sendRequest("hubullu/setEntryRefDisplayMode", {
        mode: this.mode,
      });
    } catch {
      // Server may not support this yet.
    }
  }

  getMode(): EntryRefDisplayMode {
    return this.mode;
  }

  private async setMode(mode: EntryRefDisplayMode): Promise<void> {
    if (mode === this.mode) return;
    try {
      await this.client.sendRequest("hubullu/setEntryRefDisplayMode", {
        mode,
      });
    } catch {
      return;
    }
    this.mode = mode;
    this.updateStatusBar();
    this.persistMode(mode);
    this._onDidChangeMode.fire(mode);
    // Force VS Code to re-request inlay hints so stale hints are cleared.
    this.inlayHintRefresh.fire();
  }

  private cycle(): void {
    const idx = MODE_CYCLE.indexOf(this.mode);
    const next = MODE_CYCLE[(idx + 1) % MODE_CYCLE.length];
    this.setMode(next);
  }

  private persistMode(mode: EntryRefDisplayMode): void {
    vscode.workspace
      .getConfiguration("hubullu")
      .update(
        "entryRefDisplayMode",
        mode,
        vscode.ConfigurationTarget.Workspace
      );
  }

  private updateStatusBar(): void {
    this.statusBarItem.text = MODE_LABELS[this.mode];
    this.statusBarItem.tooltip = "Entry Reference Display Mode";
  }

  private updateStatusBarVisibility(
    editor: vscode.TextEditor | undefined
  ): void {
    if (
      editor &&
      (editor.document.languageId === "hubullu" ||
        editor.document.languageId === "hubullu-text")
    ) {
      this.statusBarItem.show();
    } else {
      this.statusBarItem.hide();
    }
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
