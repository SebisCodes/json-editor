/**
 * The side panel's "Insert" tab: empty values added to the selected object or array (through
 * the tree, one undo step), and snippets written at the cursor in the code.
 */

import { escapeHtml, getAliasTarget, getIndentUnit } from './datatree.js?v=12';
import { state, areas, ui, IS_YAML_EDITOR, CHOOSE_VALUE, ROOT_IS_VALUE, showToast } from './state.js?v=3';
import { editData } from './tree-edit.js?v=3';
import { writeCodeRange } from './code-input.js?v=3';
import { addHistoryStep } from './history.js?v=3';

/** The empty value of each type the tab adds. */
const ADD_VALUES = { string: '', number: 0, boolean: true, null: null, object: {}, array: [] };
/** The length of a date as YYYY-MM-DD. */
const DATE_LENGTH = 10;
/** Where the cursor goes in a snippet. */
const CURSOR_MARK = '|';

/**
 * Returns today's date as YYYY-MM-DD with the cursor mark after it.
 * @returns {string} the snippet.
 */
function getDateSnippet() {
    return `${new Date().toISOString().slice(0, DATE_LENGTH)}|`;
}

/**
 * Returns today's date in quotes, with the cursor mark before the closing quote.
 * @returns {string} the snippet.
 */
function getQuotedDateSnippet() {
    return `"${new Date().toISOString().slice(0, DATE_LENGTH)}|"`;
}

/**
 * Returns the date and time now (ISO 8601, UTC, without milliseconds) in quotes, with the
 * cursor mark before the closing quote.
 * @returns {string} the snippet.
 */
function getQuotedDateTimeSnippet() {
    return `"${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}|"`;
}

/** The snippets: the text ("|" marks the cursor, a function gives it when used) and whether it is a block. */
const SNIPPETS = IS_YAML_EDITOR ? {
    map: ['|key: value', true],
    nested: ['|key:\n  child: value', true],
    item: ['- |item', true],
    items: ['|list:\n  - one\n  - two', true],
    block: ['|text: |\n  first line\n  second line', true],
    folded: ['|text: >\n  a long text that is\n  joined into one line', true],
    anchor: ['|defaults: &defaults\n  key: value\nuse:\n  <<: *defaults', true],
    doc: ['---\n|', true],
    comment: ['# |', false],
    date: [getDateSnippet, false],
    null: ['null|', false], true: ['true|', false], false: ['false|', false],
} : {
    object: ['{\n  "|key": "value"\n}', true],
    array: ['[\n  |\n]', true],
    entry: ['"|key": "value",', true],
    rows: ['[\n  { "|id": 1, "name": "" },\n  { "id": 2, "name": "" }\n]', true],
    text: ['"|"', false],
    date: [getQuotedDateSnippet, false],
    datetime: [getQuotedDateTimeSnippet, false],
    true: ['true|', false], false: ['false|', false], null: ['null|', false],
};

/**
 * Returns a button that adds an empty value.
 * @param {string} type - the key in ADD_VALUES.
 * @param {string} label - the button's text.
 * @param {string} title - its tooltip.
 * @returns {string} the HTML of the button.
 */
function renderAddButton(type, label, title) {
    return `<button type="button" class="button" data-add="${type}" title="${escapeHtml(title)}">${label}</button>`;
}

/**
 * Returns a button that writes a snippet at the cursor.
 * @param {string} snippet - the key in SNIPPETS.
 * @param {string} label - the button's text.
 * @param {string} title - its tooltip.
 * @returns {string} the HTML of the button.
 */
function renderSnippetButton(snippet, label, title) {
    return `<button type="button" class="button" data-ins="${snippet}" title="${escapeHtml(title)}">${label}</button>`;
}

/**
 * Draws the "Insert" tab.
 * @returns {void}
 */
export function renderInsert() {
    const b = renderAddButton, s = renderSnippetButton;
    ui.insert.innerHTML = `
        <div class="insert-group"><h3>Add to the selected value</h3>
            <p class="hint">Into the selected object or array, otherwise after the selected entry. One step for Undo.</p>
            <div class="insert-grid">
            ${b('string', 'Text', 'A new string')}${b('number', 'Number', 'A new number')}${b('boolean', 'True / false', 'A new boolean')}${b('null', 'Empty (null)', 'A new null')}
            ${b('object', 'Object { }', 'A new empty object')}${b('array', 'Array [ ]', 'A new empty array')}
        </div></div>
        <div class="insert-group"><h3>At the cursor in the code</h3><div class="insert-grid">
            ${IS_YAML_EDITOR ? `${s('map', 'Key and value', 'One entry of a mapping')}${s('nested', 'Nested mapping', 'A key with keys below it')}
            ${s('item', 'List item', 'One item of a sequence')}${s('items', 'List', 'A key with a list below it')}
            ${s('block', 'Text block (|)', 'Several lines, kept as they are')}${s('folded', 'Folded text (>)', 'Several lines, joined into one')}
            ${s('anchor', 'Anchor and alias', 'Values defined once (&) and used again (*, <<)')}${s('doc', 'Next document (---)', 'A further document in the same file')}
            ${s('comment', 'Comment (#)', 'A comment')}${s('date', 'Today\'s date', 'The date as YYYY-MM-DD')}
            ${s('null', 'null', 'An empty value')}${s('true', 'true', 'The boolean true')}` : `${s('object', 'Object', 'An object with one key')}${s('array', 'Array', 'An empty array')}
            ${s('entry', 'Key and value', 'One entry of an object')}${s('rows', 'Table (rows)', 'An array of objects - converts to CSV')}
            ${s('text', 'Text in quotes', 'A string')}${s('date', 'Today\'s date', 'The date as YYYY-MM-DD')}
            ${s('datetime', 'Date and time', 'The date and time (ISO 8601, UTC)')}${s('null', 'null', 'An empty value')}
            ${s('true', 'true', 'The boolean true')}${s('false', 'false', 'The boolean false')}`}
        </div></div>`;
}

/**
 * Connects the "Insert" tab; a snippet button keeps the focus in the code.
 * @returns {void}
 */
export function startInsertPanel() {
    ui.insert.addEventListener('mousedown', event => { if (event.target.closest('[data-ins]')) event.preventDefault(); });
    ui.insert.addEventListener('click', addFromInsertTab);
}

/**
 * Adds the empty value or the snippet of the clicked button of the Insert tab.
 * @param {MouseEvent} event - the click in the Insert tab.
 * @returns {void}
 */
function addFromInsertTab(event) {
    const addButton = event.target.closest('[data-add]');
    if (addButton) { addEmptyValue(addButton.dataset.add); return; }
    const snippetButton = event.target.closest('[data-ins]');
    if (snippetButton) addSnippet(...SNIPPETS[snippetButton.dataset.ins]);
}

/**
 * Adds an empty value of a type into the selected object or array, or after the selected
 * entry; a new key of an object opens for typing.
 * @param {string} type - the key in ADD_VALUES.
 * @returns {void}
 */
function addEmptyValue(type) {
    const info = areas.tree.getSelectedInfo();
    if (!info) { showToast(CHOOSE_VALUE); return; }
    const resolved = getAliasTarget(info.node);
    const box = resolved && (resolved.type === 'object' || resolved.type === 'array') ? info.node : info.entry ? info.entry.parent : null;
    if (!box) { showToast(ROOT_IS_VALUE); return; }
    const at = box === info.node ? box.entries.length : info.entry.index + 1;
    const value = ADD_VALUES[type];
    if (editData({ kind: 'add', box, at, value: value && typeof value === 'object' ? (Array.isArray(value) ? [] : {}) : value }) === true && box.type === 'object') areas.tree.edit('key');
}

/**
 * Writes a snippet at the cursor: "|" marks where the cursor goes; a block snippet gets the
 * line's indentation and the document's indentation unit. One undo step.
 * @param {string|function(): string} snippet - the text, or a function that gives it.
 * @param {boolean} isBlock - true for a snippet of several lines.
 * @returns {void}
 */
function addSnippet(snippet, isBlock) {
    const ta = ui.ta;
    const start = ta.selectionStart, end = ta.selectionEnd;
    let text = typeof snippet === 'function' ? snippet() : snippet;
    const lineStart = state.code.lastIndexOf('\n', start - 1) + 1;
    const indent = /^[ \t]*/.exec(state.code.slice(lineStart))[0];
    const unit = getIndentUnit(state.code);
    if (isBlock) text = text.replace(/\n {2}/g, '\n' + unit).split('\n').map((line, index) => (index ? indent + line : line)).join('\n');
    let cursor = text.indexOf(CURSOR_MARK);
    text = text.replace(CURSOR_MARK, '');
    if (cursor < 0) cursor = text.length;
    writeCodeRange(start, end, text, start + cursor);
    addHistoryStep();
}
