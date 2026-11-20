/**
 * The side panel's "Value" tab: the path, key, type and value of the value selected in the
 * tree, its size and place, and the buttons to add, duplicate, move and remove it.
 */

import { escapeHtml, formatPath, getAliasTarget, TYPES } from './datatree.js?v=12';
import { state, areas, ui, getElement, showToast, hasData, formatSize } from './state.js?v=3';
import { getLineIndex, getColumnIndex } from './text-position.js?v=3';
import { getTypedValue, editData, runEntryAction } from './tree-edit.js?v=3';

/** The types the type menu shows for a value. */
const TYPE_LABEL = { string: 'string', number: 'number', boolean: 'boolean', null: 'null', object: 'object', array: 'array', alias: 'alias' };
/** The most rows the value field takes. */
const MAX_VALUE_ROWS = 10;
/** The fewest rows the value field takes. */
const MIN_VALUE_ROWS = 2;

/**
 * Draws the selected value in the side panel and sets the type menu above the tree. Leaves the
 * panel alone while a field in it is being typed into.
 * @returns {void}
 */
export function renderNode() {
    const info = areas.tree.getSelectedInfo();
    const typeMenu = getElement('#node-type');
    typeMenu.value = info && info.node && TYPE_LABEL[info.node.type] && info.node.type !== 'alias' ? info.node.type : '';
    typeMenu.disabled = !info;
    if (ui.node.contains(document.activeElement) && document.activeElement.matches('input, textarea')) return;   // keep what is being typed
    if (!info || !info.node) {
        ui.node.innerHTML = `<p class="hint">${hasData() ? 'Click a key or a value in the tree.' : 'The document has no data yet.'}</p>`;
        return;
    }
    ui.node.innerHTML = renderNodeForm(info);
}

/**
 * Returns the form of a selected value.
 * @param {object} info - the selected entry (node, entry, path).
 * @returns {string} the HTML of the form.
 */
function renderNodeForm(info) {
    const { node, entry } = info;
    const resolved = getAliasTarget(node) || node;
    const isBox = resolved.type === 'object' || resolved.type === 'array';
    const hasKey = entry && entry.parent.type === 'object';
    const options = TYPES.map(type => `<option value="${type}"${type === node.type ? ' selected' : ''}>${type}</option>`).join('');
    const value = !isBox && node.type !== 'alias' ? (node.type === 'string' ? node.value : node.raw || String(node.value)) : '';
    return `<div class="node-form">
        <label class="field"><span>Path</span><code data-no-i18n>${escapeHtml(formatPath(info.path))}</code></label>
        ${hasKey ? `<label class="field"><span>Key</span><input id="n-key" value="${escapeHtml(entry.key)}" spellcheck="false" data-no-i18n></label>` : ''}
        <label class="field"><span>Type</span><select id="n-type"${node.type === 'alias' ? ' disabled' : ''}>${node.type === 'alias' ? '<option>alias</option>' : options}</select></label>
        ${!isBox && node.type !== 'alias' ? `<label class="field"><span>Value</span><textarea id="n-value" rows="${Math.min(MAX_VALUE_ROWS, Math.max(MIN_VALUE_ROWS, value.split('\n').length))}" spellcheck="${node.type === 'string'}" data-no-i18n>${escapeHtml(value)}</textarea></label>
        <div class="button-row"><button type="button" class="button primary" id="n-apply">Apply</button></div>` : ''}
        <div class="node-info">${escapeHtml(getNodeInfo(node, entry, resolved, isBox))}</div>
        ${node.anchor ? `<p class="hint">Anchor: <code data-no-i18n>&amp;${escapeHtml(node.anchor)}</code></p>` : ''}${node.type === 'alias' ? `<p class="hint">Alias of the anchor: <code data-no-i18n>&amp;${escapeHtml(node.value)}</code></p>` : ''}
        <div class="button-row two">
            <button type="button" class="button" data-n="add">${isBox ? 'Add an entry' : 'Add after it'}</button>
            <button type="button" class="button" data-n="dup"${entry ? '' : ' disabled'}>Duplicate</button>
            <button type="button" class="button" data-n="up"${entry && entry.index > 0 ? '' : ' disabled'}>Move up</button>
            <button type="button" class="button" data-n="down"${entry && entry.index < entry.parent.entries.length - 1 ? '' : ' disabled'}>Move down</button>
            <button type="button" class="button danger" data-n="remove"${entry ? '' : ' disabled'}>Remove</button>
        </div></div>`;
}

/**
 * Returns the line below the form: the number of keys or entries, the place and the size.
 * @param {object} node - the value's node.
 * @param {object|null} entry - its entry, null for a root.
 * @param {object} resolved - the node an alias points to, or the node itself.
 * @param {boolean} isBox - true for an object or an array.
 * @returns {string} the text, e.g. "3 keys · line 4, column 3 · 120 B".
 */
function getNodeInfo(node, entry, resolved, isBox) {
    const size = new Blob([state.code.slice(entry ? entry.start : node.start, node.end)]).size;
    const count = isBox ? `${resolved.entries.length} ${resolved.type === 'object' ? (resolved.entries.length === 1 ? 'key' : 'keys') : resolved.entries.length === 1 ? 'entry' : 'entries'} · ` : '';
    return `${count}line ${getLineIndex(node.start) + 1}, column ${getColumnIndex(node.start) + 1} · ${formatSize(size)}`;
}

/**
 * Connects the "Value" tab: its buttons, Apply (Ctrl+Enter in the value), the key (Enter or
 * leaving it) and the type menu; leaving the panel draws it again.
 * @returns {void}
 */
export function startNodePanel() {
    ui.node.addEventListener('click', event => {
        const button = event.target.closest('[data-n]');
        if (button) { runEntryAction(button.dataset.n); return; }
        if (event.target.id === 'n-apply') writeNodeValue();
    });
    ui.node.addEventListener('change', editNodeOnChange);
    ui.node.addEventListener('keydown', event => {
        if (event.target.id === 'n-value' && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); writeNodeValue(); }
        if (event.target.id === 'n-key' && event.key === 'Enter') { event.preventDefault(); event.target.blur(); }
    });
    ui.node.addEventListener('focusout', () => setTimeout(() => { if (!ui.node.contains(document.activeElement)) renderNode(); }, 0));
}

/**
 * Writes a changed type or key of the "Value" tab into the code.
 * @param {Event} event - the change in the tab.
 * @returns {void}
 */
function editNodeOnChange(event) {
    const info = areas.tree.getSelectedInfo();
    if (!info) return;
    if (event.target.id === 'n-type') editData({ kind: 'type', node: info.node, type: event.target.value });
    if (event.target.id === 'n-key' && event.target.value !== String(info.entry.key)) editData({ kind: 'key', entry: info.entry, key: event.target.value });
}

/**
 * Writes the value typed into the "Value" field into the code.
 * @returns {void}
 */
function writeNodeValue() {
    const info = areas.tree.getSelectedInfo(), field = getElement('#n-value');
    if (!info || !field) return;
    const typed = getTypedValue(info.node, field.value);
    if (typed.error) { showToast(typed.error); return; }
    if (!typed.same) editData({ kind: 'value', node: info.node, value: typed.value, raw: typed.raw });
}
