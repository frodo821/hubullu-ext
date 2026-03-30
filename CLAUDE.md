# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a VS Code extension for **Hubullu (LexDSL)**, a domain-specific language for constructing artificial natural language dictionaries. The extension provides editor support by connecting to the LSP server built into the `hubullu` CLI (sibling repo at `../hubullu`).

**File extensions:** `.hu` (source files), `.hut` (template/render files)

## Hubullu Language (LexDSL)

Hubullu compiles `.hu` files into SQLite databases containing dictionary entries, inflected forms, inter-entry links, and FTS5 search indexes. Key language constructs:

- `tagaxis` — grammatical category definitions (e.g., tense, number)
- `@extend` — add values to a tag axis
- `inflection` — paradigm rules that generate inflected forms
- `entry` — dictionary entries with headword, stems, meaning, inflection class
- `@use` / `@reference` — multi-file imports (declarations vs entries)
- `phon_rule` — phonological transformation rules
- `@render` — template rendering configuration

The compiler pipeline: Lex/Parse → Phase 1 (file loading, symbol registration) → Phase 2 (resolution, paradigm expansion) → SQLite emission.

## LSP Server

The LSP is built into the `hubullu` CLI binary and started with `hubullu lsp` (communicates via stdin/stdout). It provides:

- Diagnostics (parse errors on change, project-level errors on save)
- Semantic tokens (syntax highlighting)
- Go-to-definition (cross-file, qualified names, import paths)
- Hover (symbol kind, file location, formatted item info)
- Code completion (trigger characters: `@`, `.`, `:`, `[`, `=`)
- Full document sync mode

Project discovery: looks for `main.hu` in workspace root, falls back to single `.hu` file.

## Extension Architecture

This is a **language client** extension — it does not implement language features itself. Its responsibilities:

1. Register `.hu` and `.hut` file associations and TextMate grammar for basic syntax highlighting
2. Spawn and manage the `hubullu lsp` process as a language server
3. Wire VS Code's language client to the LSP server (diagnostics, completion, hover, definition, semantic tokens)
4. Provide extension settings (path to `hubullu` binary, feature toggles)

Use `vscode-languageclient` (npm package) to implement the LSP client. The extension activates when a `.hu` or `.hut` file is opened.

## Build & Development Commands

```bash
npm install              # Install dependencies
npm run compile          # Build the extension (esbuild → dist/extension.js)
npm run watch            # Watch mode with sourcemaps for development
npm run lint             # Type-check with tsc --noEmit
npm run package          # Bundle VSIX with vsce for distribution
```

Press **F5** in VS Code to launch the Extension Development Host for testing.

## Sibling Repository

The compiler and LSP server live in `../hubullu` (Rust, built with `cargo build --release`). The compiled binary is at `../hubullu/target/release/hubullu`. Reference its source (especially `src/lsp/`) when implementing features that depend on understanding LSP capabilities.

Compiler docs: `../hubullu/docs/` (9 guides), formal spec: `../hubullu/spec.md` (Japanese).
