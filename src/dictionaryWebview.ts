export function getDictionaryWebviewHtml(): string {
  return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    height: 100vh;
    display: flex;
    flex-direction: column;
  }

  /* Search bar */
  .search-bar {
    display: flex;
    gap: 4px;
    padding: 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
  }
  .search-bar input {
    flex: 1;
    padding: 4px 8px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    outline: none;
    font-size: inherit;
    font-family: inherit;
  }
  .search-bar input:focus {
    border-color: var(--vscode-focusBorder);
  }
  .search-bar input::placeholder {
    color: var(--vscode-input-placeholderForeground);
  }

  /* Main layout */
  .main {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  /* Results list */
  .results {
    width: 260px;
    min-width: 180px;
    border-right: 1px solid var(--vscode-panel-border);
    overflow-y: auto;
    flex-shrink: 0;
  }
  .results .empty {
    padding: 16px;
    color: var(--vscode-descriptionForeground);
    text-align: center;
  }
  .result-item {
    padding: 6px 10px;
    cursor: pointer;
    border-bottom: 1px solid var(--vscode-panel-border);
  }
  .result-item:hover {
    background: var(--vscode-list-hoverBackground);
  }
  .result-item.selected {
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }
  .result-item .headword {
    font-weight: bold;
  }
  .result-item .meaning {
    font-size: 0.9em;
    color: var(--vscode-descriptionForeground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .result-item.selected .meaning {
    color: var(--vscode-list-activeSelectionForeground);
    opacity: 0.8;
  }

  /* Detail pane */
  .detail {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px;
  }
  .detail .placeholder {
    color: var(--vscode-descriptionForeground);
    padding: 16px;
    text-align: center;
  }
  .detail h2 {
    font-size: 1.3em;
    margin-bottom: 4px;
  }
  .detail .entry-name {
    color: var(--vscode-descriptionForeground);
    margin-bottom: 12px;
    font-size: 0.9em;
  }
  .detail section {
    margin-bottom: 14px;
  }
  .detail section h3 {
    font-size: 0.85em;
    text-transform: uppercase;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 4px;
    letter-spacing: 0.5px;
  }
  .detail table {
    width: 100%;
    border-collapse: collapse;
  }
  .detail th, .detail td {
    text-align: left;
    padding: 3px 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
    font-size: 0.95em;
  }
  .detail th {
    color: var(--vscode-descriptionForeground);
    font-weight: 600;
  }
  .tag {
    display: inline-block;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 0.85em;
    margin: 1px 2px;
  }
  .link-item {
    padding: 2px 0;
  }
  .link-type {
    color: var(--vscode-descriptionForeground);
    font-size: 0.85em;
  }
</style>
</head>
<body>

<div class="search-bar">
  <input id="searchInput" type="text" placeholder="Search entries…" />
</div>

<div class="main">
  <div class="results" id="resultsList">
    <div class="empty">Enter a search query</div>
  </div>
  <div class="detail" id="detailPane">
    <div class="placeholder">Select an entry to view details</div>
  </div>
</div>

<script>
  const vscode = acquireVsCodeApi();
  const searchInput = document.getElementById('searchInput');
  const resultsList = document.getElementById('resultsList');
  const detailPane = document.getElementById('detailPane');

  let selectedId = null;

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();
    if (query) {
      vscode.postMessage({ type: 'search', query });
    } else {
      resultsList.innerHTML = '<div class="empty">Enter a search query</div>';
      detailPane.innerHTML = '<div class="placeholder">Select an entry to view details</div>';
      selectedId = null;
    }
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'searchResults':
        renderResults(msg.entries);
        break;
      case 'entryDetail':
        renderDetail(msg.entry);
        break;
      case 'dbReady':
        searchInput.focus();
        break;
    }
  });

  function renderResults(entries) {
    if (!entries.length) {
      resultsList.innerHTML = '<div class="empty">No results</div>';
      return;
    }
    resultsList.innerHTML = entries.map(e =>
      '<div class="result-item' + (e.id === selectedId ? ' selected' : '') + '" data-id="' + e.id + '">' +
        '<div class="headword">' + esc(e.headword || e.name) + '</div>' +
        '<div class="meaning">' + esc(e.meaning || '') + '</div>' +
      '</div>'
    ).join('');

    resultsList.querySelectorAll('.result-item').forEach(el => {
      el.addEventListener('click', () => {
        selectedId = parseInt(el.dataset.id, 10);
        resultsList.querySelectorAll('.result-item').forEach(i => i.classList.remove('selected'));
        el.classList.add('selected');
        vscode.postMessage({ type: 'selectEntry', id: selectedId });
      });
    });
  }

  function renderDetail(entry) {
    let html = '<h2>' + esc(entry.headword) + '</h2>';
    html += '<div class="entry-name">' + esc(entry.name) + '</div>';

    // Scripts
    if (entry.scripts.length) {
      html += '<section><h3>Scripts</h3><table>';
      entry.scripts.forEach(s => {
        html += '<tr><th>' + esc(s.scriptName) + '</th><td>' + esc(s.scriptValue) + '</td></tr>';
      });
      html += '</table></section>';
    }

    // Meanings
    if (entry.meaning || entry.meanings.length) {
      html += '<section><h3>Meanings</h3>';
      if (entry.meanings.length) {
        html += '<table>';
        entry.meanings.forEach(m => {
          html += '<tr><th>' + esc(m.meaningId) + '</th><td>' + esc(m.text) + '</td></tr>';
        });
        html += '</table>';
      } else {
        html += '<p>' + esc(entry.meaning) + '</p>';
      }
      html += '</section>';
    }

    // Tags
    if (entry.tags.length) {
      html += '<section><h3>Tags</h3><div>';
      entry.tags.forEach(t => {
        html += '<span class="tag">' + esc(t.axis) + ':' + esc(t.value) + '</span>';
      });
      html += '</div></section>';
    }

    // Forms
    if (entry.forms.length) {
      html += '<section><h3>Forms</h3><table>';
      html += '<tr><th>Form</th><th>Tags</th></tr>';
      entry.forms.forEach(f => {
        html += '<tr><td>' + esc(f.formStr) + '</td><td>' + esc(f.tags) + '</td></tr>';
      });
      html += '</table></section>';
    }

    // Links
    if (entry.links.length) {
      html += '<section><h3>Links</h3>';
      entry.links.forEach(l => {
        html += '<div class="link-item">' +
          esc(l.targetHeadword || l.targetName) +
          ' <span class="link-type">(' + esc(l.linkType) + ')</span></div>';
      });
      html += '</section>';
    }

    detailPane.innerHTML = html;
  }

  function esc(s) {
    if (!s) return '';
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
</script>
</body>
</html>`;
}
