/**
 * Changes from the tree and the side panel: a key, a value, a type, an entry added, duplicated,
 * moved or removed. Each one is written into the code by datatree.js editCode() as one undo
 * step and keeps the rest of the code as it is; then the changed entry is selected.
 * JSON Lines: a whole line is added, duplicated, moved or removed.
 */

import { editCode, getDocIndex, getAliasTarget } from './datatree.js?v=12';
import {
    state, areas, EDITOR, IS_YAML_EDITOR, SYNTAX_ERROR_FIRST, CHOOSE_VALUE, ROOT_IS_VALUE, MAX_QUOTED_LENGTH, hasData, showToast,
} from './state.js?v=3';
import { setCode, addPendingHistoryStep } from './history.js?v=3';
import { showCodePosition } from './code-view.js?v=3';
import { renderNode } from './node-panel.js?v=3';

/** A number as typed into the tree: digits with an optional sign, point and exponent. */
const NUMBER_TEXT = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
/** The first key of an empty document. */
const FIRST_KEY_CODE = IS_YAML_EDITOR ? 'key: ""\n' : '{\n  "key": ""\n}\n';
/** The line a JSON Lines document gets added. */
const NEW_LINE_VALUE = '{}';

/**
 * A change of the data, as datatree.js editCode() takes it.
 * @typedef {object} DataChange
 * @property {string} kind - "key", "value", "type", "add", "duplicate", "move" or "remove".
 * @property {object} [node] - the value that changes.
 * @property {object} [entry] - the entry (key and value) that changes.
 * @property {object} [box] - the object or array an entry is added to.
 * @property {*} [value] - the new value.
 * @property {string} [raw] - the new value as written (a number as typed).
 * @property {string} [key] - the new key.
 * @property {string} [type] - the new type.
 * @property {number} [at] - where the entry is added.
 * @property {number} [by] - how far the entry moves (-1 up, 1 down).
 */

/**
 * What was typed into a value, as a value of the value's type.
 * @typedef {object} TypedValue
 * @property {*} [value] - the value.
 * @property {string} [raw] - a number as written.
 * @property {boolean} [same] - true when nothing changes (null stays null).
 * @property {string} [error] - why the text is no value of the type.
 */

/**
 * Returns what was typed into a value in the tree as a value of the same type.
 * @param {object} node - the value's node.
 * @param {string} text - the typed text.
 * @returns {TypedValue} the value, or the reason it is none.
 */
export function getTypedValue(node, text) {
    const trimmed = text.trim();
    switch (node.type) {
        case 'string': return { value: text };
        case 'number':
            if (NUMBER_TEXT.test(trimmed) && Number.isFinite(Number(trimmed))) return { value: Number(trimmed), raw: trimmed.replace(/^\+/, '') };
            return { error: `"${text.slice(0, MAX_QUOTED_LENGTH)}" is not a number - choose another type above the tree to change the type` };
        case 'boolean':
            if (/^(true|false)$/i.test(trimmed)) return { value: trimmed.toLowerCase() === 'true' };
            return { error: 'A boolean is true or false - choose another type above the tree to change the type' };
        case 'null':
            if (!trimmed || trimmed === 'null') return { same: true };
            return { error: 'null has no value - choose another type above the tree to change the type' };
        default: return { error: 'This value is changed in the code' };
    }
}

/**
 * Writes one change of the data into the code as one undo step and selects the changed entry.
 * Returns whether it took place, as the tree and the tools need to know.
 * @param {DataChange} change - the change.
 * @param {object} [options] - doc: the index of the document (JSON Lines: the line with data).
 * @returns {true|string} true, or the reason the change did not take place.
 */
export function editData(change, { doc } = {}) {
    const docIndex = doc ?? getChangeDocIndex(change);
    if (state.model.broken || state.model.docs[docIndex]?.broken) { showToast(SYNTAX_ERROR_FIRST); return 'broken'; }
    let result;
    try { result = editCode(state.model.jsonl ? 'jsonl' : EDITOR.editor, state.code, change); } catch (e) { showToast(e.message); return e.message; }
    addPendingHistoryStep();
    setCode(result.code);
    areas.tree.select({ doc: docIndex, path: result.path });
    showSelectedEntry();
    renderNode();
    return true;
}

/**
 * Returns the index of the document a change belongs to.
 * @param {DataChange} change - the change.
 * @returns {number} the index in the model's documents.
 */
function getChangeDocIndex(change) {
    if (change.node) return getDocIndex(state.model, change.node);
    if (change.entry) return getDocIndex(state.model, change.entry.node);
    if (change.box) return getDocIndex(state.model, change.box);
    return 0;
}

/**
 * Selects the entry selected in the tree in the code (without focusing the code).
 * @returns {void}
 */
function showSelectedEntry() {
    const info = areas.tree.getSelectedInfo();
    if (!info) return;
    const start = info.entry ? info.entry.start : info.node.start;
    showCodePosition(start, false, Math.max(start, info.node.end));
}

/**
 * Tells whether a node is an object or an array.
 * @param {object|null} node - the node.
 * @returns {boolean} true for an object or an array.
 */
function isContainer(node) {
    return !!node && (node.type === 'object' || node.type === 'array');
}

/**
 * Runs a button above the tree or the Delete key on the selected entry: add, dup, up, down or
 * remove. An empty document gets its first key.
 * @param {string} action - "add", "dup", "up", "down" or "remove".
 * @param {object|null} [info] - the selected entry (createTree().getSelectedInfo()).
 * @returns {void}
 */
export function runEntryAction(action, info = areas.tree.getSelectedInfo()) {
    if (action === 'add' && state.model && !state.model.broken && !hasData()) { addFirstKey(); return; }
    if (!info || !info.node) { showToast(CHOOSE_VALUE); return; }
    if (action === 'add') { addEntryAfter(info); return; }
    const { entry } = info;
    if (!entry && state.model.jsonl) { runLineAction(action, info.doc); return; }
    if (!entry) { showToast(action === 'remove' ? 'The root cannot be removed - "Start this document over" in the New menu empties it' : 'The root has no place to move to'); return; }
    if (action === 'dup') editData({ kind: 'duplicate', entry });
    else if (action === 'up' || action === 'down') editData({ kind: 'move', entry, by: action === 'up' ? -1 : 1 });
    else if (action === 'remove') editData({ kind: 'remove', entry });
}

/**
 * Gives an empty document its first key and opens the key for typing.
 * @returns {void}
 */
function addFirstKey() {
    setCode(FIRST_KEY_CODE);
    areas.tree.select({ doc: 0, path: ['key'] });
    areas.tree.edit('key');
}

/**
 * Adds an empty entry into the selected object or array, or after the selected entry; a key
 * of an object opens for typing. JSON Lines: a line after the selected line.
 * @param {object} info - the selected entry.
 * @returns {void}
 */
function addEntryAfter(info) {
    const { node, entry } = info;
    if (!entry && state.model.jsonl && !isContainer(node)) { runLineAction('add', info.doc); return; }
    const resolved = getAliasTarget(node);
    const box = resolved.type === 'object' || resolved.type === 'array' ? node : entry ? entry.parent : null;
    if (!box || box.type === 'alias') { showToast(ROOT_IS_VALUE); return; }
    const at = box === node ? box.entries.length : entry.index + 1;
    if (editData({ kind: 'add', box, at, value: '' }) === true && box.type === 'object') areas.tree.edit('key');
}

/**
 * JSON Lines: adds a line after a line, duplicates, moves or removes it (one undo step) and
 * selects the line it leads to.
 * @param {string} action - "add", "dup", "up", "down" or "remove".
 * @param {number} docIndex - the index of the line with data.
 * @returns {void}
 */
function runLineAction(action, docIndex) {
    const doc = state.model.docs[docIndex];
    if (!doc) return;
    const lineEdit = getLineEdit(action, docIndex);
    if (lineEdit.error) { showToast(lineEdit.error); return; }
    addPendingHistoryStep();
    setCode(lineEdit.code);
    areas.tree.select({ doc: lineEdit.target, path: [] });
    const info = areas.tree.getSelectedInfo();
    if (info) showCodePosition(info.node.start, false, info.node.end);
    renderNode();
}

/**
 * Returns the code after a change of whole lines and the line to select.
 * @param {string} action - "add", "dup", "up", "down" or "remove".
 * @param {number} docIndex - the index of the line with data.
 * @returns {{code?: string, target?: number, error?: string}} the new code and the index to
 *   select, or why the change is not possible.
 */
function getLineEdit(action, docIndex) {
    if (action === 'add' || action === 'dup') return getAddedLine(action, docIndex);
    if (action === 'remove') return getRemovedLine(docIndex);
    return getMovedLine(action, docIndex);
}

/**
 * Returns where a line ends in the code, after its carriage return, and whether a line break follows.
 * @param {object} doc - the line's document in the model.
 * @returns {{lineEnd: number, hasBreak: boolean}} the end of the line and whether "\n" follows.
 */
function getLineEnd(doc) {
    const code = state.code;
    return { lineEnd: doc.end + (code[doc.end] === '\r' ? 1 : 0), hasBreak: code.indexOf('\n', doc.end) >= 0 };
}

/**
 * Returns the code with an empty object or a copy of a line after that line.
 * @param {string} action - "add" for an empty object, "dup" for a copy.
 * @param {number} docIndex - the index of the line.
 * @returns {{code: string, target: number}} the new code and the index of the new line.
 */
function getAddedLine(action, docIndex) {
    const code = state.code, doc = state.model.docs[docIndex];
    const { lineEnd, hasBreak } = getLineEnd(doc);
    const added = action === 'dup' ? code.slice(doc.start, doc.end) : NEW_LINE_VALUE;
    return { code: code.slice(0, lineEnd) + (hasBreak ? '\n' + added : '\n' + added + '\n') + code.slice(lineEnd), target: docIndex + 1 };
}

/**
 * Returns the code without a line; the only line is not removed.
 * @param {number} docIndex - the index of the line.
 * @returns {{code?: string, target?: number, error?: string}} the new code and the line to select, or why not.
 */
function getRemovedLine(docIndex) {
    const code = state.code, docs = state.model.docs, doc = docs[docIndex];
    if (docs.length === 1) return { error: 'This is the only line - "Start this document over" in the New menu empties it' };
    const { lineEnd, hasBreak } = getLineEnd(doc);
    return { code: code.slice(0, doc.start) + code.slice(lineEnd + (hasBreak ? 1 : 0)), target: Math.min(docIndex, docs.length - 2) };
}

/**
 * Returns the code with a line swapped with the line above or below it.
 * @param {string} action - "up" or "down".
 * @param {number} docIndex - the index of the line.
 * @returns {{code?: string, target?: number, error?: string}} the new code and the line's new index, or why not.
 */
function getMovedLine(action, docIndex) {
    const code = state.code, docs = state.model.docs;
    const otherIndex = docIndex + (action === 'up' ? -1 : 1);
    if (otherIndex < 0 || otherIndex >= docs.length) return { error: action === 'up' ? 'This line is the first already' : 'This line is the last already' };
    const [first, second] = otherIndex < docIndex ? [docs[otherIndex], docs[docIndex]] : [docs[docIndex], docs[otherIndex]];
    const swapped = code.slice(0, first.start) + code.slice(second.start, second.end) + code.slice(first.end, second.start) + code.slice(first.start, first.end) + code.slice(second.end);
    return { code: swapped, target: otherIndex };
}
