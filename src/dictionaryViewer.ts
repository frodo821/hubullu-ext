import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import initSqlJs, { Database } from "sql.js";
import { getDictionaryWebviewHtml } from "./dictionaryWebview";

// ── Data types ──────────────────────────────────────────────

export interface EntrySearchResult {
  id: number;
  name: string;
  headword: string;
  meaning: string;
}

export interface EntryDetail {
  id: number;
  name: string;
  headword: string;
  meaning: string;
  meanings: { meaningId: string; text: string }[];
  scripts: { scriptName: string; scriptValue: string }[];
  tags: { axis: string; value: string }[];
  forms: { formStr: string; tags: string }[];
  links: { targetName: string; targetHeadword: string; linkType: string }[];
}

// ── Database access ─────────────────────────────────────────

class DictionaryDb {
  private db: Database | null = null;

  async open(dbPath: string, wasmBinary: Buffer): Promise<void> {
    this.close();
    const SQL = await initSqlJs({ wasmBinary });
    const fileBuffer = fs.readFileSync(dbPath);
    this.db = new SQL.Database(fileBuffer);
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  get isOpen(): boolean {
    return this.db !== null;
  }

  search(query: string, limit = 50): EntrySearchResult[] {
    if (!this.db || !query.trim()) return [];

    // Try FTS5 first, fall back to LIKE if query has special chars
    try {
      const ftsQuery = query
        .trim()
        .replace(/['"]/g, "")
        .split(/\s+/)
        .map((t) => `"${t}"*`)
        .join(" ");
      const stmt = this.db.prepare(
        `SELECT e.id, e.name, e.headword, e.meaning
         FROM entries_fts fts
         JOIN entries e ON e.id = fts.rowid
         WHERE entries_fts MATCH :query
         LIMIT :limit`
      );
      stmt.bind({ ":query": ftsQuery, ":limit": limit });

      const results: EntrySearchResult[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        results.push({
          id: row["id"] as number,
          name: (row["name"] as string) ?? "",
          headword: (row["headword"] as string) ?? "",
          meaning: (row["meaning"] as string) ?? "",
        });
      }
      stmt.free();
      return results;
    } catch {
      // FTS5 match failed — fall back to LIKE on headword/name/meaning
      const like = `%${query.trim()}%`;
      const stmt = this.db.prepare(
        `SELECT id, name, headword, meaning FROM entries
         WHERE headword LIKE :like OR name LIKE :like OR meaning LIKE :like
         LIMIT :limit`
      );
      stmt.bind({ ":like": like, ":limit": limit });

      const results: EntrySearchResult[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        results.push({
          id: row["id"] as number,
          name: (row["name"] as string) ?? "",
          headword: (row["headword"] as string) ?? "",
          meaning: (row["meaning"] as string) ?? "",
        });
      }
      stmt.free();
      return results;
    }
  }

  getEntry(id: number): EntryDetail | null {
    if (!this.db) return null;

    // Base entry
    const base = this.db.prepare(
      "SELECT id, name, headword, meaning FROM entries WHERE id = :id"
    );
    base.bind({ ":id": id });
    if (!base.step()) {
      base.free();
      return null;
    }
    const row = base.getAsObject();
    base.free();

    const entry: EntryDetail = {
      id: row["id"] as number,
      name: (row["name"] as string) ?? "",
      headword: (row["headword"] as string) ?? "",
      meaning: (row["meaning"] as string) ?? "",
      meanings: this.query(
        "SELECT meaning_id, meaning_text FROM entry_meanings WHERE entry_id = :id",
        { ":id": id },
        (r) => ({ meaningId: r["meaning_id"] as string, text: r["meaning_text"] as string })
      ),
      scripts: this.query(
        "SELECT script_name, script_value FROM headword_scripts WHERE entry_id = :id",
        { ":id": id },
        (r) => ({ scriptName: r["script_name"] as string, scriptValue: r["script_value"] as string })
      ),
      tags: this.query(
        "SELECT axis, value FROM entry_tags WHERE entry_id = :id",
        { ":id": id },
        (r) => ({ axis: r["axis"] as string, value: r["value"] as string })
      ),
      forms: this.query(
        "SELECT form_str, tags FROM forms WHERE entry_id = :id",
        { ":id": id },
        (r) => ({ formStr: r["form_str"] as string, tags: (r["tags"] as string) ?? "" })
      ),
      links: this.query(
        `SELECT e.name AS target_name, e.headword AS target_headword, l.link_type
         FROM links l JOIN entries e ON e.id = l.dst_entry_id
         WHERE l.src_entry_id = :id`,
        { ":id": id },
        (r) => ({
          targetName: r["target_name"] as string,
          targetHeadword: r["target_headword"] as string,
          linkType: r["link_type"] as string,
        })
      ),
    };
    return entry;
  }

  private query<T>(
    sql: string,
    params: Record<string, number | string>,
    map: (row: Record<string, unknown>) => T
  ): T[] {
    if (!this.db) return [];
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const results: T[] = [];
    while (stmt.step()) {
      results.push(map(stmt.getAsObject() as Record<string, unknown>));
    }
    stmt.free();
    return results;
  }
}

// ── WebView panel ───────────────────────────────────────────

export class DictionaryViewerPanel implements vscode.Disposable {
  private static instance: DictionaryViewerPanel | undefined;

  private panel: vscode.WebviewPanel;
  private db = new DictionaryDb();
  private disposables: vscode.Disposable[] = [];
  private extensionPath: string;

  static get current(): DictionaryViewerPanel | undefined {
    return DictionaryViewerPanel.instance;
  }

  static createOrShow(context: vscode.ExtensionContext): DictionaryViewerPanel {
    if (DictionaryViewerPanel.instance?.panel) {
      DictionaryViewerPanel.instance.panel.reveal();
      return DictionaryViewerPanel.instance;
    }
    const inst = new DictionaryViewerPanel(context);
    DictionaryViewerPanel.instance = inst;
    return inst;
  }

  private constructor(context: vscode.ExtensionContext) {
    this.extensionPath = context.extensionPath;

    this.panel = vscode.window.createWebviewPanel(
      "hubulluDictionary",
      "Hubullu Dictionary",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    this.panel.webview.html = getDictionaryWebviewHtml();

    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      undefined,
      this.disposables
    );

    this.panel.onDidDispose(() => {
      this.db.close();
      this.disposables.forEach((d) => d.dispose());
      DictionaryViewerPanel.instance = undefined;
    });
  }

  async openDatabase(dbPath: string): Promise<void> {
    const wasmPath = path.join(this.extensionPath, "dist", "sql-wasm.wasm");
    const wasmBinary = fs.readFileSync(wasmPath);
    await this.db.open(dbPath, wasmBinary);
    this.panel.webview.postMessage({ type: "dbReady" });
  }

  private handleMessage(msg: { type: string; [key: string]: unknown }): void {
    switch (msg.type) {
      case "search": {
        const results = this.db.search(msg.query as string);
        this.panel.webview.postMessage({ type: "searchResults", entries: results });
        break;
      }
      case "selectEntry": {
        const entry = this.db.getEntry(msg.id as number);
        if (entry) {
          this.panel.webview.postMessage({ type: "entryDetail", entry });
        }
        break;
      }
    }
  }

  dispose(): void {
    this.panel.dispose();
  }
}
