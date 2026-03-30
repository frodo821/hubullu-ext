import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";

interface SurfaceFormItem {
  range: vscode.Range;
  surfaceForm: string;
  tooltip?: string;
}

interface LspSurfaceFormItem {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  surfaceForm: string;
  tooltip?: string;
}

interface SurfaceFormsResult {
  items: LspSurfaceFormItem[];
}

export class SurfaceFormOverlayManager implements vscode.Disposable {
  private decorationType: vscode.TextEditorDecorationType;
  private cache = new Map<string, SurfaceFormItem[]>();
  private enabled = false;
  private disposables: vscode.Disposable[] = [];

  constructor(private client: LanguageClient) {
    this.decorationType = vscode.window.createTextEditorDecorationType({
      color: "transparent",
      letterSpacing: "-9999px",
    });

    this.disposables.push(
      this.decorationType,
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (this.enabled) {
          this.applyDecorations(e.textEditor);
        }
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (this.enabled && editor) {
          this.refreshEditor(editor);
        }
      })
    );
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (enabled) {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        this.refreshEditor(editor);
      }
    } else {
      this.clearAll();
    }
  }

  async refresh(): Promise<void> {
    if (!this.enabled) return;
    this.cache.clear();
    for (const editor of vscode.window.visibleTextEditors) {
      if (this.isRelevantEditor(editor)) {
        await this.refreshEditor(editor);
      }
    }
  }

  private async refreshEditor(editor: vscode.TextEditor): Promise<void> {
    if (!this.isRelevantEditor(editor)) return;
    const uri = editor.document.uri.toString();
    const items = await this.requestSurfaceForms(uri);
    this.cache.set(uri, items);
    this.applyDecorations(editor);
  }

  private async requestSurfaceForms(uri: string): Promise<SurfaceFormItem[]> {
    try {
      const result = await this.client.sendRequest<SurfaceFormsResult>(
        "hubullu/surfaceForms",
        { textDocument: { uri } }
      );
      return result.items.map((item) => ({
        range: new vscode.Range(
          item.range.start.line,
          item.range.start.character,
          item.range.end.line,
          item.range.end.character
        ),
        surfaceForm: item.surfaceForm,
        tooltip: item.tooltip,
      }));
    } catch {
      return [];
    }
  }

  private applyDecorations(editor: vscode.TextEditor): void {
    const uri = editor.document.uri.toString();
    const items = this.cache.get(uri);
    if (!items || items.length === 0) {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    const cursorPositions = editor.selections.map((s) => s.active);

    const decorations: vscode.DecorationOptions[] = [];
    for (const item of items) {
      const cursorInRange = cursorPositions.some((pos) =>
        item.range.contains(pos)
      );
      if (cursorInRange) continue;

      decorations.push({
        range: item.range,
        hoverMessage: item.tooltip,
        renderOptions: {
          before: {
            contentText: item.surfaceForm,
            color: new vscode.ThemeColor("editor.foreground"),
            fontStyle: "italic",
          },
        },
      });
    }

    editor.setDecorations(this.decorationType, decorations);
  }

  private clearAll(): void {
    this.cache.clear();
    for (const editor of vscode.window.visibleTextEditors) {
      editor.setDecorations(this.decorationType, []);
    }
  }

  private isRelevantEditor(editor: vscode.TextEditor): boolean {
    return (
      editor.document.languageId === "hubullu" ||
      editor.document.languageId === "hubullu-text"
    );
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
