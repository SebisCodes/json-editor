/**
 * Opening files and pasting documents. Every file opened with "Open" or dropped on the page
 * becomes a new document; YAML, CSV and XML are converted, JSON Lines stays as it is and is
 * marked as such. A whole document pasted outside the code replaces the open one (one undo step).
 */

import { parse, importYamlLibrary, getModelValue } from './datatree.js?v=12';
import { convertToJson, convertToYaml, convertFromYaml, convertFromCsv, convertFromXml, convertFromJsonl } from './convert.js?v=13';
import { store } from './files.js?v=8';
import { EDITOR, IS_YAML_EDITOR, DEFAULT_NAME, JSON_INDENT, TYPING_FIELDS, getElement, showToast } from './state.js?v=3';
import { setCode } from './history.js?v=3';
import { createDocument, setDocumentKind, openDocument } from './documents.js?v=3';

/** The largest file the editor opens, in bytes. */
const MAX_FILE_SIZE = 8 * 1024 * 1024;
/** The file names the editor opens. */
const OPENABLE_NAME = /\.(json|jsonc|json5|geojson|jsonl|ndjson|txt|yaml|yml|csv|tsv|xml)$/i;
/** The media types the editor opens. */
const OPENABLE_TYPE = /json|text|xml|yaml|csv/;
/** The start of a document that pasting replaces the open one with. */
const DOCUMENT_START = IS_YAML_EDITOR ? /^\s*(---|%YAML)/ : /^\s*[{[]/;
/** AI links are taken by ai.js. */
const AI_LINK = /#(b64|z|json|yaml)=/;

const fileInput = getElement('#file');
let dragDepth = 0;

/**
 * A file's text as this editor's code.
 * @typedef {object} ImportedCode
 * @property {string} code - the code.
 * @property {string} from - the format it was converted from, "" when it was not converted.
 * @property {string} [kind] - "jsonl" for a JSON Lines document.
 */

/**
 * Lets the user choose files to open.
 * @returns {void}
 */
export function openFilePicker() {
    fileInput.click();
}

/**
 * Connects "Open", dropping files on the page and pasting a whole document.
 * @returns {void}
 */
export function startFileImport() {
    getElement('#btn-open').addEventListener('click', openFilePicker);
    fileInput.addEventListener('change', async () => { await importFiles([...fileInput.files]); fileInput.value = ''; });
    window.addEventListener('dragenter', event => { if (event.dataTransfer.types.includes('Files')) { dragDepth++; document.body.classList.add('drop'); event.preventDefault(); } });
    window.addEventListener('dragover', event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); });
    window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('drop'); } });
    window.addEventListener('drop', importDroppedFiles);
    window.addEventListener('paste', importPastedDocument);
}

/**
 * Opens the files dropped on the page (a drop handler).
 * @param {DragEvent} event - the drop.
 * @returns {void}
 */
function importDroppedFiles(event) {
    dragDepth = 0;
    document.body.classList.remove('drop');
    const files = [...event.dataTransfer.files];
    if (!files.length) return;
    event.preventDefault();
    importFiles(files);
}

/**
 * Replaces the open document with a whole document pasted outside the code (a paste handler).
 * Text that is not a readable document, and AI links, are left to the others.
 * @param {ClipboardEvent} event - the paste.
 * @returns {void}
 */
function importPastedDocument(event) {
    const active = document.activeElement;
    if (active && active.matches(TYPING_FIELDS)) return;
    const text = event.clipboardData.getData('text');
    if (!DOCUMENT_START.test(text) || AI_LINK.test(text)) return;
    const model = parse(EDITOR.editor, text);
    if (model.broken || (model.jsonl && model.docs.some(doc => doc.broken))) return;
    event.preventDefault();
    setCode(text);
    showToast(`${EDITOR.name} pasted from the clipboard - "Undo" brings the old data back`);
}

/**
 * Returns a file's text as this editor's code, converted from the format its name says.
 * @param {string} text - the file's text.
 * @param {string} fileName - the file's name.
 * @returns {Promise<ImportedCode>} the code.
 * @throws {Error} when the text cannot be read in its format.
 */
async function getImportedCode(text, fileName) {
    const ext = (/\.([a-z0-9]+)$/i.exec(fileName) || [])[1]?.toLowerCase() || '';
    await importYamlLibrary();
    /**
     * Writes data as this editor's code.
     * @param {*} value - the data.
     * @returns {string} YAML in the YAML editor, else JSON.
     */
    const writeCode = value => (IS_YAML_EDITOR ? convertToYaml(value) : convertToJson(value, JSON_INDENT));
    if (/^(jsonl|ndjson)$/.test(ext)) return IS_YAML_EDITOR ? { code: writeCode(convertFromJsonl(text)), from: 'JSON Lines' } : { code: text, from: '', kind: 'jsonl' };
    if (IS_YAML_EDITOR && /^(json|jsonc|json5|geojson)$/.test(ext)) {
        const model = parse('json', text);
        if (model.broken) throw new Error(model.problems.find(problem => problem.kind === 'error').msg);
        return { code: writeCode(getModelValue(model)), from: 'JSON' };
    }
    if (!IS_YAML_EDITOR && (ext === 'yaml' || ext === 'yml')) return { code: writeCode(convertFromYaml(text)), from: 'YAML' };
    if (ext === 'csv' || ext === 'tsv') return { code: writeCode(convertFromCsv(text)), from: 'CSV' };
    if (ext === 'xml') return { code: writeCode(convertFromXml(text)), from: 'XML' };
    return { code: text, from: '' };
}

/**
 * Opens every file as a new document; files of other types or over 8 MB are refused with a message.
 * @param {File[]} files - the files.
 * @returns {Promise<void>} settles when every file is opened or refused.
 */
async function importFiles(files) {
    for (const file of files) {
        if (!OPENABLE_NAME.test(file.name) && !OPENABLE_TYPE.test(file.type)) { showToast(`"${file.name}" is not a file the editor can open`); continue; }
        if (file.size > MAX_FILE_SIZE) { showToast('The file is larger than 8 MB'); continue; }
        try { await importFile(file); } catch (e) { showToast(`"${file.name}" could not be opened: ${e.message}`); }
    }
}

/**
 * Opens one file as a new document.
 * @param {File} file - the file.
 * @returns {Promise<void>} settles when the document is open.
 * @throws {Error} when the file cannot be read in its format.
 */
async function importFile(file) {
    const imported = await getImportedCode(await file.text(), file.name);
    const name = file.name.replace(/\.[^.]+$/, '') || DEFAULT_NAME;
    if (imported.kind) {
        const id = store.create(name, imported.code);
        setDocumentKind(id, imported.kind);
        openDocument(id);
        showToast(`Opened "${file.name}" - it is now in "My documents"`);
        return;
    }
    if (createDocument(name, imported.code)) showToast(imported.from ? `Opened "${file.name}" - converted from ${imported.from}` : `Opened "${file.name}" - it is now in "My documents"`);
}
