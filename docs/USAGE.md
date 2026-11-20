# Using the JSON Editor

The JSON Editor shows your JSON next to a foldable tree of the data. You can change keys and
values right in the tree, see problems with line and column, check the data against a JSON
Schema and convert it to YAML, CSV or XML.

Open it at https://json.giit.ch/. It is free, needs no sign-up, and runs in your browser:
your documents stay there unless you send them somewhere yourself.

## What it can do

- A tree of the data: objects and arrays fold, every value shows its type (string, number,
  boolean, null, object, array), and `{3}` / `[5]` count the entries.
- Editing in the tree: keys and values, the type of a value, entries added, duplicated,
  moved and removed, while the rest of the code keeps its formatting.
- Problems with line and column: syntax errors, duplicate keys, notes for comments and
  JSON5, and what does not fit a chosen JSON Schema.
- Reads plain JSON, JSON with comments and JSON5 (with a note); **Format** writes plain
  JSON.
- JSON Lines (`.jsonl`, `.ndjson`): one entry per line in the tree, each editable in place;
  files with 100 000 lines stay usable.
- Format, minify, sort keys; convert to YAML, JSON Lines, CSV (an array of objects is a
  table) and XML; YAML, CSV and XML files open as JSON.
- Templates: settings, package.json, table, JSON Schema, JSON Lines (an event log), GeoJSON.

## Getting started

1. **Start**: choose a template under **New**, open a file or paste JSON.
2. **Edit**: type in the code, or change keys and values in the tree.
3. **Export**: save JSON, minified JSON, JSON Lines, YAML, CSV or text.

## Editing in the tree

Click a key or a value in the tree to change it right there. **Enter** or a click elsewhere
writes the change into the code at exactly that place, **Escape** cancels. The buttons above
the tree add, duplicate, move and remove entries and change the type of a value. Each change
is a small edit of the code that keeps the rest of its formatting and comments, and one step
for Undo.

A click in the tree puts the code's cursor on that value; the cursor in the code marks its
value in the tree. The path of the selected value (`$.items[3].name`) is shown below the
tree, and you can search keys and values.

The right side panel has **Value** (the selected key and value), **Insert** (entries and
pieces of code), **Convert** and **Schema**: choose a JSON Schema from your documents and
every place that does not fit is listed as a problem (type, required, properties, enum,
pattern, format, minimum and maximum, items, allOf / anyOf / oneOf, if / then / else, `$ref`
inside the schema and more). A `$schema` address is never fetched.

## JSON Lines

A JSON Lines file (one complete JSON value per line) is recognized by its extension
(`.jsonl`, `.ndjson`) or its content. The tree shows one entry per line ("Line 1", "Line 2"
…); every change is written into its own line only, and lines are added, duplicated, moved
and removed as whole lines. Problems name their line, and a note says when the lines do not
all have the same keys. **Convert** turns JSON Lines into a JSON array and back, and into
CSV (one row per line), YAML and XML.

## Your documents

Your documents are kept only in your browser (in `localStorage`), not on a server, and stay
there after you close the page. **My documents** (the folder button at the top left) lists
every document of this browser: open, rename, duplicate, download (`.json`) and delete them.

Clearing the browser's site data removes them, so download the ones you want to keep, or let
the editor send them to your own server: **Save to server** (the cloud button) sets up a
webhook, an address that gets every saved version (see [EMBEDDING.md](EMBEDDING.md#webhook)
for what it receives). Nothing is sent until you enter an address there.

**Opening files:** Open `.json`, `.jsonl` and `.ndjson` files with the button, by drop or by
paste; YAML, CSV and XML files open as JSON.

## Export

**Export** saves the `.json` as it is, minified `.json`, `.jsonl` (JSON Lines), YAML, CSV,
the tree as plain text, or all of them as one ZIP.

**Export > Open in another editor** converts the document in the browser to YAML, TOML,
SHLS, XML or CSV and opens the result as a new document in that editor. Anything the other
format cannot hold is listed first.

## AI Assistant

Any AI can work with you: ChatGPT, Claude, Gemini, Copilot or the AI in your coding tool.
Nothing to install and no key needed. Click **AI Assistant**, then **Copy prompt**, paste it
into your AI and say what it should do. The prompt holds the instructions and the current
document.

For JSON Lines, the AI adds `&format=jsonl` when the document is new or has only one line.

The AI answers with a link that carries the document after the `#`; click it and the
document appears in your editor. **Undo** takes every change back. The links look like this:

- `https://json.giit.ch/#b64=<base64url of the UTF-8 text>`
- `https://json.giit.ch/#json=<URL-encoded text>`
- `https://json.giit.ch/#z=<base64url of the zlib-compressed text>` (shortest)
- `&mode=add` merges into the open document: the keys of an object go into the root object
  (existing keys get the new values), the items of an array are added to the root array;
  only the changed places of the code change.
- `&file=new&name=<name>` makes a new document next to your others, `&file=<name>` changes
  that one; without `&file=` the open document changes.
- `&part=N&of=M&id=<name>` sends a long document in several links; the editor collects the
  parts.

A tab opened with such a link hands the document to the editor tab you used last. You can
also paste the AI's whole answer into the editor (Ctrl+V outside the code); links that a
terminal broke over several lines are joined. When the editor is embedded in another
website, links cannot reach it, so paste the answer there.

**Browser agents (WebMCP):** in browsers that offer WebMCP, the page registers tools for AI
agents that run in the page itself: `get_document`, `get_problems`, `get_value` and
`set_value` (by a path such as `$.a.b[0]` or a JSON Pointer), `set_document`,
`replace_text`, `show_line`, `undo`, and `list_files`, `open_file`, `new_file` for your
other documents. Every change is one step for Undo.

## Languages

The editor speaks English at `/`, German `/de/`, French `/fr/`, Italian `/it/`, Spanish
`/es/`, Portuguese `/pt/`, Dutch `/nl/`, Polish `/pl/`, Turkish `/tr/`, Russian `/ru/`,
Ukrainian `/uk/`, Chinese `/zh/`, Japanese `/ja/` and Korean `/ko/`. Opening
`https://json.giit.ch/` leads to the language you picked before in a language menu, or else
to your browser's language. A language picked in the menu holds for every giit.ch site. The
prompt for the AI is always in English.

## Color theme

Light, dark or automatic (following your system): the theme switch in the bar sets it, and
the editor remembers your choice.

## Keyboard shortcuts

On macOS use Cmd instead of Ctrl. The **Help** dialog in the editor lists them as well.

| Keys | Action |
|---|---|
| ↑ ↓ ← → | In the tree: go up and down, fold and unfold |
| Enter | In the tree: change the value (F2: the key) |
| Delete | In the tree: remove the entry |
| Alt + ↑ / ↓ | In the tree: move the entry up / down |
| Ctrl + F | Search keys and values in the tree |
| Ctrl + Shift + F | Format the document |
| Tab / Shift + Tab | Indent / outdent in the code |
| Ctrl + Z / Y | Undo / redo |
| Ctrl + S | Save (download, or to your server) |
| Ctrl + E | Export |
| Ctrl + O | My documents |

Quotes and brackets close by themselves around a selection; Enter after `{` or `[` indents
the next line.

## On your own website

The editor can be embedded in other websites with an iframe, opened in a window of its own
or used as a read-only viewer. See [EMBEDDING.md](EMBEDDING.md).
