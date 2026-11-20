/**
 * The open document in other formats (convert.js), and the document written anew: Format,
 * Minify and Sort keys (one undo step each), and the tidied code of a document a page hands
 * over with ?tidy=1 (sync.js).
 *
 * A number that would change when written anew (too large for JavaScript, or more digits than
 * it keeps) stops formatting and converting with a message, so no data changes unseen.
 */

import { parse, importYamlLibrary, getModelValue, getIndentUnit, runForEachNode } from './datatree.js?v=12';
import { convertToJson, getSortedCopy, convertToYaml, formatYaml, convertToCsv, convertToXml, convertToJsonl, getTreeText } from './convert.js?v=13';
import { openConfirmation } from './dialogs.js?v=5';
import {
    state, areas, EDITOR, IS_YAML_EDITOR, FIX_SYNTAX_ERROR, NO_DATA, JSON_INDENT, YAML_INDENT, MAX_QUOTED_LENGTH, hasData, showToast, translate,
} from './state.js?v=3';
import { setCode } from './history.js?v=3';


/**
 * A conversion's result.
 * @typedef {object} ConversionResult
 * @property {string} [text] - the converted text.
 * @property {string} [note] - a note on the result.
 * @property {string} [error] - why there is no result.
 */

/**
 * Returns a number of the code that would change when written anew (too large for JavaScript,
 * or more digits than it keeps); hexadecimal numbers of YAML are left out.
 * @returns {string|null} its text, null when there is none (always null in the YAML editor).
 */
function getLossyNumber() {
    if (IS_YAML_EDITOR || !state.model) return null;
    let found = null;
    runForEachNode(state.model, node => { if (!found && isLossyNumber(node)) found = node.raw; });
    return found;
}

/**
 * Tells whether a value is a number that would change when written anew: too large for
 * JavaScript, or an integer with more digits than it keeps; hexadecimal numbers are left out.
 * @param {object} node - a value of the model.
 * @returns {boolean} true for such a number.
 */
function isLossyNumber(node) {
    if (node.type !== 'number' || !node.raw || /^[+-]?0x/i.test(node.raw)) return false;
    const value = Number(node.raw);
    if (!Number.isFinite(value)) return true;
    return /^-?\d+$/.test(node.raw) && !Number.isSafeInteger(value) && BigInt(node.raw) !== BigInt(value);
}

/**
 * Returns the message for a number that cannot be written exactly.
 * @param {string} raw - the number as written.
 * @returns {string} the message.
 */
function getLossyNumberMessage(raw) {
    return `The number ${raw.length > MAX_QUOTED_LENGTH ? raw.slice(0, MAX_QUOTED_LENGTH) + '…' : raw} cannot be written exactly - write it as a string ("…") first`;
}

/**
 * Returns why the open document cannot be converted or written anew.
 * @returns {string|null} the message, null when it can.
 */
function getConversionBlocker() {
    if (!hasData()) return NO_DATA;
    if (state.model.broken) return FIX_SYNTAX_ERROR;
    const lossy = getLossyNumber();
    if (lossy) return getLossyNumberMessage(lossy);
    const brokenLine = state.model.jsonl && state.model.docs.find(doc => doc.broken);
    if (brokenLine) return `${brokenLine.label} has a syntax error - fix it first (see above the code)`;
    return null;
}

/**
 * Returns the open document's data in another format.
 * @param {string} kind - "json", "jsonmin", "jsonl", "yaml", "csv", "xml" or "txt" (the tree as text).
 * @param {number|string} [indent] - the indentation: a number of spaces or "\t".
 * @param {boolean} [guard] - CSV: protect cells a spreadsheet would run as formulas.
 * @returns {Promise<ConversionResult>} the text (and a note), or the error.
 */
export async function getConvertedText(kind, indent = JSON_INDENT, guard = false) {
    const blocker = getConversionBlocker();
    if (blocker) return { error: blocker };
    const value = getModelValue(state.model);
    if (kind === 'jsonl') return getJsonLines(value);
    if (kind === 'json') return { text: convertToJson(value, indent === '\t' ? '\t' : indent), note: IS_YAML_EDITOR && state.model.docs.length > 1 ? 'The file has several documents - they become one JSON array.' : '' };
    if (kind === 'jsonmin') return { text: convertToJson(value, 0) };
    if (kind === 'yaml') { await importYamlLibrary(); return { text: convertToYaml(value, typeof indent === 'number' ? indent : YAML_INDENT) }; }
    if (kind === 'csv') return convertToCsv(value, ',', guard);
    if (kind === 'xml') return { text: convertToXml(value) };
    if (kind === 'txt') return { text: getTreeText(state.model, translate) };
    return { error: 'unknown format' };
}

/**
 * Returns the data as JSON Lines. JSON: the array, one line per entry (a JSON Lines document as
 * it is); YAML: one line per document, or per entry of the root sequence.
 * @param {*} value - the document's data.
 * @returns {ConversionResult} the text, or the error.
 */
function getJsonLines(value) {
    const rows = IS_YAML_EDITOR ? (state.model.docs.length > 1 ? value : Array.isArray(value) ? value : [value]) : value;
    return state.model.jsonl ? { text: state.code } : convertToJsonl(rows);
}

/**
 * Writes the whole document anew (one undo step): Format, Minify or Sort keys. Plain JSON has
 * no comments, so the user is asked before comments are removed.
 * @param {string} kind - "format", "minify" or "sort".
 * @param {number|string} [indent] - the indentation: a number of spaces or the unit.
 * @returns {Promise<void>} settles when the document is written or left as it is.
 */
export async function formatDocument(kind, indent = getIndentUnit(state.code)) {
    if (!state.model || state.model.broken) { showToast(FIX_SYNTAX_ERROR); return; }
    if (!hasData()) { showToast(NO_DATA); return; }
    const lossy = getLossyNumber();
    if (lossy) { showToast(getLossyNumberMessage(lossy)); return; }
    if (IS_YAML_EDITOR) await importYamlLibrary();
    const formatted = getFormattedCode(kind, indent);
    if (formatted.error) { showToast(formatted.error); return; }
    if (formatted.code === state.code) { showToast(kind === 'sort' ? 'The keys are sorted already' : kind === 'minify' ? 'The document is minified already' : 'The document is formatted already'); return; }
    const forId = state.fileId, forCode = state.code;
    if (!IS_YAML_EDITOR && state.model.comments && !await openCommentRemovalQuestion()) return;
    if (state.fileId !== forId || state.code !== forCode) return;      // another document (or text) arrived while the question was open
    const selected = areas.tree.getSelectedPlace();
    setCode(formatted.code);
    if (selected) areas.tree.select(selected);
    showToast(kind === 'sort' ? 'Keys sorted' : kind === 'minify' ? 'Minified' : 'Formatted');
}

/**
 * Returns the document written anew (the YAML package is loaded in the YAML editor).
 * @param {string} kind - "format", "minify" or "sort".
 * @param {number|string} indent - the indentation.
 * @returns {{code?: string, error?: string}} the new code, or why it cannot be written.
 */
function getFormattedCode(kind, indent) {
    if (IS_YAML_EDITOR) {
        try { return { code: formatYaml(state.code, typeof indent === 'number' ? indent : indent === '\t' ? YAML_INDENT : indent.length || YAML_INDENT) }; } catch (e) { return { error: e.message }; }
    }
    if (state.model.jsonl) {
        const brokenLine = state.model.docs.find(doc => doc.broken);
        if (brokenLine) return { error: `${brokenLine.label} has a syntax error - fix it first (see above the code)` };
        // every line written anew as compact JSON (sorted keys on request)
        return { code: convertToJsonl(getModelValue(state.model).map(value => (kind === 'sort' ? getSortedCopy(value) : value))).text };
    }
    const value = getModelValue(state.model);
    return { code: kind === 'minify' ? convertToJson(value, 0) + '\n' : convertToJson(kind === 'sort' ? getSortedCopy(value) : value, indent) };
}

/**
 * Asks whether the comments may be removed.
 * @returns {Promise<boolean>} true when the user agrees.
 */
function openCommentRemovalQuestion() {
    const comments = state.model.comments;
    return openConfirmation({ title: 'Remove the comments?', text: `Plain JSON has no comments: the ${comments} ${comments === 1 ? 'comment is' : 'comments are'} removed. "Undo" brings ${comments === 1 ? 'it' : 'them'} back.`, ok: 'Write plain JSON' });
}

/**
 * Returns a document's code as Format writes it, for a document the page hands over with
 * ?tidy=1 (sync.js); code with a syntax error, several JSON lines or JSON comments comes back
 * as it is.
 * @param {string} code - the code.
 * @returns {Promise<string>} the tidied code.
 */
export async function formatCodeAsStep(code) {
    const model = parse(EDITOR.editor, code, { jsonl: false });
    if (model.broken || !model.docs.some(doc => doc.root)) return code;
    if (IS_YAML_EDITOR) { await importYamlLibrary(); return formatYaml(code, YAML_INDENT); }
    return model.comments ? code : convertToJson(getModelValue(model), getIndentUnit(code));
}
