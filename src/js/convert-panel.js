/**
 * The side panel's "Convert" tab: Format, Minify and Sort keys with a chosen indentation, and
 * the document converted to another format, to copy, download, open as a new document (JSON
 * Lines <-> JSON array) or open in the sister editor (YAML).
 */

import { getIndentUnit } from './datatree.js?v=12';
import { saveFile, getSafeName } from './util.js?v=3';
import { state, ui, EDITOR, IS_YAML_EDITOR, YAML_INDENT, getElement, showToast } from './state.js?v=3';
import { getConvertedText, formatDocument } from './conversion.js?v=3';
import { createDocument, setDocumentKind, openDocument } from './documents.js?v=3';

/** The file extension of each conversion. */
const CONVERT_EXTENSIONS = { yaml: 'yaml', csv: 'csv', xml: 'xml', txt: 'txt', json: 'json', jsonl: 'jsonl' };
/** The media type of each conversion's download. */
const CONVERT_TYPES = { xml: 'application/xml', csv: 'text/csv', yaml: 'application/yaml', json: 'application/json', jsonl: 'application/x-ndjson' };
/** The note under the format menu for each conversion without a note of its own. */
const CONVERT_NOTES = {
    csv: 'Each object is a row, its keys are the columns. Texts that look like numbers are in quotes.',
    xml: 'The data is inside <root>; the items of an array are <item> elements.',
};
/** btoa() takes at most this many characters at a time here. */
const BASE64_CHUNK = 0x8000;

/**
 * Draws the "Convert" tab with the document's indentation chosen, and the conversion.
 * @returns {void}
 */
export function renderConvert() {
    ui.convert.innerHTML = `
        <h3>This document</h3>
        <label class="field"><span>Indentation</span><select id="cv-indent"><option value="2">2 spaces</option><option value="4">4 spaces</option><option value="tab">Tabs</option></select></label>
        <div class="button-row">${IS_YAML_EDITOR ? `
            <button type="button" class="button" data-cv="format" title="The same indentation everywhere; comments stay">Format</button>` : `
            <button type="button" class="button" data-cv="format" title="Plain JSON with neat indentation">Format</button>
            <button type="button" class="button" data-cv="minify" title="All on one line, without spaces">Minify</button>
            <button type="button" class="button" data-cv="sort" title="The keys of every object in alphabetical order">Sort keys</button>`}
        </div>
        <h3>Convert to</h3>
        <label class="field"><span>Format</span><select id="cv-to">${IS_YAML_EDITOR ? '<option value="json">JSON text</option><option value="jsonl">JSON Lines</option>' : `<option value="yaml">YAML text</option>${state.model && state.model.jsonl ? '<option value="json">JSON array</option>' : '<option value="jsonl">JSON Lines</option>'}`}<option value="csv">CSV (an array of objects)</option><option value="xml">XML text</option><option value="txt">The tree as plain text</option></select></label>
        <p class="hint" id="cv-note"></p>
        <textarea id="cv-out" readonly spellcheck="false" aria-label="Result"></textarea>
        <div class="button-row two">
            <button type="button" class="button" id="cv-copy">Copy</button>
            <button type="button" class="button" id="cv-dl">Download</button>
            <button type="button" class="button" id="cv-new" title="Opens the result as a new document in this editor">Open as a new document</button>
            <button type="button" class="button" id="cv-other" title="Opens the result as a new document in the ${EDITOR.other.name} (in a new tab)">Open in the ${EDITOR.other.name}</button>
        </div>`;
    const unit = getIndentUnit(state.code);
    getElement('#cv-indent').value = unit === '\t' ? 'tab' : unit.length === 4 ? '4' : '2';
    renderConvertResult();
}

/**
 * Returns the indentation chosen in the tab.
 * @returns {number|string} a number of spaces, or "\t".
 */
function getIndentChoice() {
    const choice = getElement('#cv-indent')?.value || '2';
    return choice === 'tab' ? '\t' : +choice;
}

/**
 * Draws the conversion into the tab (when the tab is drawn), with its note and buttons.
 * @returns {Promise<void>} settles when the result is shown.
 */
export async function renderConvertResult() {
    const output = getElement('#cv-out');
    if (!output) return;
    const kind = getElement('#cv-to').value;
    const result = await getConvertedText(kind, getIndentChoice());
    output.value = result.text ?? '';
    getElement('#cv-note').textContent = result.error || result.note || CONVERT_NOTES[kind] || '';
    getElement('#cv-other').hidden = kind !== EDITOR.other.kind;
    getElement('#cv-new').hidden = IS_YAML_EDITOR || !(kind === 'jsonl' || (kind === 'json' && state.model && state.model.jsonl));
}

/**
 * Connects the "Convert" tab (the menus redraw the result, the buttons format, copy, download
 * and open it) and the Format button above the code.
 * @returns {void}
 */
export function startConvertPanel() {
    ui.convert.addEventListener('change', event => { if (event.target.id === 'cv-to' || event.target.id === 'cv-indent') renderConvertResult(); });
    ui.convert.addEventListener('click', runConvertButton);
    getElement('#btn-format').addEventListener('click', () => formatDocument('format', IS_YAML_EDITOR ? YAML_INDENT : getIndentUnit(state.code)));
    getElement('#btn-minify')?.addEventListener('click', () => formatDocument('minify'));
}

/**
 * Runs a button of the "Convert" tab (a click handler).
 * @param {MouseEvent} event - the click.
 * @returns {Promise<void>} settles when the button's work is done.
 */
async function runConvertButton(event) {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.cv) { await formatDocument(button.dataset.cv, getIndentChoice()); return; }
    const kind = getElement('#cv-to').value;
    const result = await getConvertedText(kind, getIndentChoice());
    if (result.error) { showToast(result.error); return; }
    if (button.id === 'cv-copy') await copyResult(result.text);
    if (button.id === 'cv-dl') { saveFile(result.text, `${getSafeName(state.name)}.${CONVERT_EXTENSIONS[kind]}`, CONVERT_TYPES[kind] || 'text/plain'); showToast('Downloaded'); }
    if (button.id === 'cv-other') openInOtherEditor(result.text);
    if (button.id === 'cv-new') openAsNewDocument(kind, result.text);
}

/**
 * Copies the conversion; the copy command on the result field where the clipboard is not allowed.
 * @param {string} text - the converted text.
 * @returns {Promise<void>} settles when it is copied.
 */
async function copyResult(text) {
    try { await navigator.clipboard.writeText(text); } catch (err) { getElement('#cv-out').select(); document.execCommand('copy'); }
    showToast('Copied to the clipboard');
}

/**
 * Opens the conversion as a new document in the sister editor, in a new tab (a #b64= link).
 * @param {string} text - the converted text.
 * @returns {void}
 */
function openInOtherEditor(text) {
    window.open(`${EDITOR.other.site}#b64=${convertToBase64Url(text)}&file=new&name=${encodeURIComponent(state.name)}`, '_blank', 'noopener');
}

/**
 * Returns text as base64url of its UTF-8 bytes, without padding.
 * @param {string} text - the text.
 * @returns {string} the base64url text.
 */
function convertToBase64Url(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (let i = 0; i < bytes.length; i += BASE64_CHUNK) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + BASE64_CHUNK));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Opens the conversion as a new document of this editor (JSON Lines <-> JSON array).
 * @param {string} kind - "jsonl" or "json".
 * @param {string} text - the converted text.
 * @returns {void}
 */
function openAsNewDocument(kind, text) {
    const id = createDocument(state.name + (kind === 'jsonl' ? ' lines' : ' array'), text);
    if (!id) return;
    setDocumentKind(id, kind === 'jsonl' ? 'jsonl' : null);
    openDocument(id);
    showToast(`New document "${state.name}"`);
}
