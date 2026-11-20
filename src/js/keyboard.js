/**
 * Shortcuts of the whole page: Ctrl+S save, Ctrl+E Export, Ctrl+O My documents, Ctrl+Shift+F
 * Format, Ctrl+F search in the tree, Ctrl+Z / Ctrl+Y undo and redo, ? help. Undo, redo and help
 * pause while typing into a field or while a dialog is open.
 */

import { getIndentUnit } from './datatree.js?v=12';
import { openDialog } from './dialogs.js?v=5';
import { state, areas, ui, IS_YAML_EDITOR, YAML_INDENT, NARROW_SCREEN, TYPING_FIELDS, getElement } from './state.js?v=3';
import { undo, redo } from './history.js?v=3';
import { formatDocument } from './conversion.js?v=3';
import { saveDocument, showExportDialog } from './export-dialog.js?v=3';
import { setNewMenuOpen, isNewMenuOpen } from './documents.js?v=3';
import { showPane } from './layout.js?v=3';
import { selectSearchField } from './tree-view.js?v=3';

/**
 * Connects the shortcuts of the page.
 * @returns {void}
 */
export function startKeyboard() {
    window.addEventListener('keydown', handlePageKey);
}

/**
 * Answers a shortcut of the page (a keydown handler).
 * @param {KeyboardEvent} event - the key.
 * @returns {void}
 */
function handlePageKey(event) {
    const active = document.activeElement;
    const typing = active && active.matches(TYPING_FIELDS);
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key === 's') { event.preventDefault(); saveDocument(); return; }
    if (modifier && event.key === 'e') { event.preventDefault(); showExportDialog(); return; }
    if (modifier && event.key === 'o') { event.preventDefault(); areas.files.open(); return; }
    if (modifier && event.shiftKey && (event.key === 'F' || event.key === 'f')) { event.preventDefault(); formatDocument('format', IS_YAML_EDITOR ? YAML_INDENT : getIndentUnit(state.code)); return; }
    if (modifier && !event.shiftKey && event.key === 'f' && active !== ui.ta) { event.preventDefault(); if (NARROW_SCREEN.matches) showPane('draw'); selectSearchField(); return; }
    if (event.key === 'Escape' && isNewMenuOpen()) { setNewMenuOpen(false); return; }
    if (typing || getElement('dialog[open]')) return;
    if (modifier && (event.key === 'z' || event.key === 'Z')) { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if (modifier && event.key === 'y') { event.preventDefault(); redo(); return; }
    if (modifier) return;
    if (event.key === '?') openDialog(getElement('#help'));
}
