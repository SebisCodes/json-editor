"""Browser test of the JSON editor (Playwright, Google Chrome).

    php -S 127.0.0.1:8101 -t src src/php/router.php          (in the project folder)
    python tests/gui_test.py

Checks the tree (types, counts, folding, path, search), code <-> tree,
problems with line and column, JSON with comments and JSON5, JSON Lines, the JSON
Schema check, format / minify / sort keys, convert, templates, My
documents, opening other formats, AI links, export and the phone layout."""

import base64
import os
import sys
import zlib

from playwright.sync_api import sync_playwright

URL = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8101/')
HOOK = 'jsonEditor'
HERE = os.path.dirname(os.path.abspath(__file__))
failures = []


def check_that(cond, what):
    """Prints one result line and notes a failure.

    Args:
        cond (bool): True when the check holds.
        what (str): what is checked.

    Returns:
        None: the result is printed and a failure is noted.
    """
    print(('ok    ' if cond else 'FAIL  ') + what)
    if not cond:
        failures.append(what)


def set_code(page, text):
    """Sets the editor's text and waits for the tree.

    Args:
        page (Page): the editor page.
        text (str): the JSON text.

    Returns:
        None: the editor holds the text.
    """
    page.evaluate('t => %s.setCode(t)' % HOOK, text)
    page.wait_for_timeout(300)


def get_state(page, expr):
    """Returns a value of the editor state.

    Args:
        page (Page): the editor page.
        expr (str): a JavaScript expression over S, the editor state.

    Returns:
        Any: the value of the expression.
    """
    return page.evaluate(f'() => {{ const S = {HOOK}.state; return {expr}; }}')


def get_code_selection(page):
    """Returns the text selected in the code field.

    Args:
        page (Page): the editor page.

    Returns:
        str: the selected text, empty when nothing is selected.
    """
    return page.evaluate('() => { const t = document.querySelector("#code"); return t.value.slice(t.selectionStart, t.selectionEnd); }')


def get_row(page, key):
    """Returns the first tree row whose key contains a text.

    Args:
        page (Page): the editor page.
        key (str): the text of the key.

    Returns:
        Locator: the row.
    """
    return page.locator('#tree .trow', has=page.locator('.trow-k', has_text=key)).first


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', headless=True)
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
    ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL + '?lang=en', wait_until='networkidle')
    page.wait_for_timeout(800)

    # --- First visit: the welcome example ---
    check_that(get_state(page, 'S.name') == 'Welcome', 'the first visit opens the welcome example')
    check_that(get_state(page, 'S.problems.length') == 0, 'the example has no problems')
    root = page.locator('#tree .trow').first
    check_that('{8}' in root.inner_text() and 'object' in root.inner_text(), 'the root row shows its type and the number of keys')
    check_that('[4]' in get_row(page, 'features').inner_text() and 'array' in get_row(page, 'features').inner_text(), 'an array shows [4]')
    check_that(get_row(page, 'version').locator('.t-number').inner_text() == '1.2' and get_row(page, 'free').locator('.t-boolean').count() == 1 and get_row(page, 'account').locator('.t-null').count() == 1, 'numbers, booleans and null have their own type')

    # --- Folding ---
    n = page.locator('#tree .trow').count()
    get_row(page, 'team').locator('.trow-toggle').click()
    page.wait_for_timeout(150)
    check_that(get_row(page, 'team').get_attribute('aria-expanded') == 'false' and page.locator('#tree .trow').count() == n - 8, 'a click on the arrow folds an array')
    check_that('name, role, since' not in get_row(page, 'team').inner_text() and '{…}' in get_row(page, 'team').inner_text(), 'a folded array shows a preview of its entries')
    page.click('#tree-close')
    page.wait_for_timeout(150)
    check_that(page.locator('#tree .trow').count() == 9, 'Fold everything leaves the root and its keys')
    page.click('#tree-open')
    page.wait_for_timeout(150)
    check_that(page.locator('#tree .trow').count() == n, 'Unfold everything shows every value again')

    # --- Tree -> code, code -> tree, path ---
    get_row(page, 'team').click()
    page.wait_for_timeout(150)
    check_that(get_code_selection(page).startswith('"team": [') and get_code_selection(page).endswith(']'), 'a click in the tree selects that entry in the code')
    check_that(page.inner_text('#path').replace('\n', '') == '$.team', 'the path of the selected value is shown')
    page.evaluate('() => { const t = document.querySelector("#code"); const i = t.value.indexOf("Linus"); t.focus(); t.setSelectionRange(i + 2, i + 2); }')
    page.wait_for_timeout(400)
    check_that(page.locator('#tree .trow.active').inner_text().startswith('name') and 'Linus' in page.locator('#tree .trow.active').inner_text(), 'the code cursor marks its value in the tree')
    check_that(page.inner_text('#path').replace('\n', '') == '$.team[1].name', 'with its path: ' + page.inner_text('#path').replace('\n', ''))
    page.locator('#path [data-depth="1"]').click()
    page.wait_for_timeout(150)
    check_that(page.locator('#tree .trow.active').inner_text().startswith('team'), 'a part of the path selects that value')
    page.click('#path-copy')
    page.wait_for_timeout(150)
    check_that(page.evaluate('navigator.clipboard.readText()') == '$.team', 'Copy path copies it')

    # --- Search ---
    page.fill('#tree-search', 'name')
    page.wait_for_timeout(400)
    check_that(page.inner_text('#tree-hits') == '1 / 2' and page.locator('#tree .trow.hit').count() == 2, 'search finds keys: ' + page.inner_text('#tree-hits'))
    page.press('#tree-search', 'Enter')
    page.wait_for_timeout(200)
    check_that(page.inner_text('#tree-hits') == '2 / 2' and 'Linus' in page.locator('#tree .trow.active').inner_text(), 'Enter goes to the next match')
    page.fill('#tree-search', 'ctrl+e')
    page.wait_for_timeout(400)
    check_that(page.inner_text('#tree-hits') == '1 / 1' and 'export' in page.locator('#tree .trow.active').inner_text(), 'search finds values too (case does not matter)')
    page.fill('#tree-search', '')
    page.wait_for_timeout(300)

    # --- Problems with line and column ---
    set_code(page, '{\n  "a": 1\n  "b": 2\n}\n')
    probs = get_state(page, 'S.problems.map(p => p.kind + ":" + p.msg)')
    check_that(any('comma is missing' in p for p in probs), 'a missing comma is reported: ' + str(probs))
    check_that(page.locator('#code-error li').first.inner_text().startswith('✕\nLine 3, column 3') or 'Line 3, column 3' in page.inner_text('#code-error'), 'with line and column: ' + page.inner_text('#code-error').split('\n')[2:4].__str__())
    page.locator('#code-error [data-prob]').first.click()
    check_that(page.evaluate('document.activeElement.id') == 'code' and page.evaluate('document.querySelector("#code").selectionStart') == 13, 'clicking a problem goes to its place in the code')
    check_that(page.locator('#tree .trow').count() >= 2, 'the tree still shows the data up to the error')
    set_code(page, '{\n  "a": 1,\n  "a": 2\n}\n')
    check_that(any('twice' in p for p in get_state(page, 'S.problems.map(p => p.msg)')) and 'Line 3, column 3' in page.inner_text('#code-error'), 'a duplicate key is reported')
    set_code(page, '{\n  // a comment\n  name: \'x\',\n  "list": [1, 2,],\n}\n')
    probs = get_state(page, 'S.problems.map(p => p.kind + ":" + p.msg)')
    check_that(all(p.startswith('warn:') for p in probs) and len(probs) == 4, 'JSON with comments and JSON5 are read, with notes: ' + str(len(probs)))
    check_that('JSON5' in page.inner_text('#code-status'), 'the status line says JSON5')
    page.click('#btn-format')
    page.wait_for_timeout(300)
    check_that(page.locator('#ask').is_visible() and 'comment' in page.inner_text('#ask'), 'Format asks before it removes comments')
    page.click('#ask-ok')
    page.wait_for_timeout(300)
    check_that(get_state(page, 'S.code') == '{\n  "name": "x",\n  "list": [\n    1,\n    2\n  ]\n}\n', 'Format writes plain JSON')
    page.click('#btn-minify')
    page.wait_for_timeout(200)
    check_that(get_state(page, 'S.code') == '{"name":"x","list":[1,2]}\n', 'Minify writes it on one line')
    page.click('[data-itab=convert]')
    page.click('[data-cv=sort]')
    page.wait_for_timeout(300)
    check_that(get_state(page, 'S.code').startswith('{\n  "list"'), 'Sort keys puts the keys in order')

    # --- Convert ---
    set_code(page, '[\n  {"id": 1, "name": "Apple", "code": "007"},\n  {"id": 2, "name": "Pear, green", "code": "x"}\n]\n')
    page.select_option('#cv-to', 'csv')
    page.wait_for_timeout(300)
    check_that(page.input_value('#cv-out') == 'id,name,code\n1,Apple,007\n2,"Pear, green",x\n', 'Convert to CSV: ' + repr(page.input_value('#cv-out')))
    page.select_option('#cv-to', 'yaml')
    page.wait_for_timeout(300)
    check_that(page.input_value('#cv-out').startswith('- id: 1\n  name: Apple\n  code: "007"'), 'Convert to YAML')
    check_that(page.locator('#cv-other').is_visible(), 'with "Open in the YAML Editor"')
    page.select_option('#cv-to', 'xml')
    page.wait_for_timeout(300)
    check_that('<item>\n    <id>1</id>' in page.input_value('#cv-out') and '<code>007</code>' in page.input_value('#cv-out'), 'Convert to XML')

    # --- JSON Schema ---
    page.click('#btn-new')
    page.click('[data-new=schema]')
    page.wait_for_timeout(300)
    check_that(get_state(page, 'S.name') == 'Schema', 'New > JSON Schema')
    page.click('#btn-new')
    page.click('[data-new=blank]')
    page.wait_for_timeout(300)
    set_code(page, '{\n  "name": "",\n  "email": "not-an-email",\n  "age": -1,\n  "extra": true\n}\n')
    page.click('[data-itab=schema]')
    page.wait_for_timeout(200)
    page.select_option('#sc-doc', label='Schema')
    page.wait_for_timeout(400)
    sp = get_state(page, 'S.problems.filter(p => p.kind === "schema").map(p => p.msg)')
    check_that(any('minLength' in p for p in sp) and any('format' in p for p in sp) and any('minimum' in p for p in sp) and any('additionalProperties' in p for p in sp), 'schema problems are found: ' + str(sp))
    check_that('4 schema problems' in page.inner_text('#code-error') and 'Line 2, column 11' in page.inner_text('#code-error'), 'and listed with line and column')
    check_that('do not fit the schema' in page.inner_text('#schema-wrap'), 'the Schema tab says how many places do not fit')
    set_code(page, '{\n  "name": "Ada",\n  "email": "ada@example.com",\n  "age": 36\n}\n')
    check_that(get_state(page, 'S.problems.length') == 0 and 'fits the schema' in page.inner_text('#schema-wrap'), 'valid data fits the schema')
    page.click('#sc-make')
    page.wait_for_timeout(400)
    check_that(get_state(page, 'S.name').endswith('schema') and '"required"' in get_state(page, 'S.code'), 'Make a schema from this data creates a schema document')
    page.click('[data-itab=node]')

    # --- Templates, My documents ---
    page.click('#btn-new')
    page.click('[data-new=table]')
    check_that(get_state(page, 'S.name') == 'Table', 'New > Table')
    page.click('#btn-files')
    check_that(page.locator('#files-grid .file-card').count() >= 4, 'My documents lists the documents')
    check_that('"Apple"' in page.locator('#files-grid .file-card.current .mini-code').inner_text(), 'a card shows the start of the code')
    page.locator('#files-grid .file-card', has_text='Welcome').locator('.file-open').click()
    check_that(get_state(page, 'S.name') == 'Welcome', 'a document opens from My documents')

    # --- Opening YAML, CSV and XML ---
    import tempfile
    d = tempfile.mkdtemp()
    with open(os.path.join(d, 'people.yaml'), 'w') as f:
        f.write('# people\n- name: Ada\n  born: 1815\n- name: Grace\n  born: 1906\n')
    with open(os.path.join(d, 'prices.csv'), 'w') as f:
        f.write('item;price\nTea;"3.50"\nCake;4.2\n')
    page.set_input_files('#file', [os.path.join(d, 'people.yaml'), os.path.join(d, 'prices.csv')])
    page.wait_for_timeout(1200)
    docs = page.evaluate(f'{HOOK}.store.list().map(f => [f.name, {HOOK}.store.code(f.id)])')
    yaml_doc = next((c for n_, c in docs if n_ == 'people'), '')
    csv_doc = next((c for n_, c in docs if n_ == 'prices'), '')
    check_that('"name": "Ada",\n    "born": 1815' in yaml_doc, 'a YAML file is converted to JSON')
    check_that('"price": "3.50"' in csv_doc and '"price": 4.2' in csv_doc, 'a CSV file too (";" found, quoted fields stay strings)')

    # --- JSON Lines ---
    with open(os.path.join(d, 'events.ndjson'), 'w') as f:
        f.write('{"id": 1, "level": "info"}\n{"id": 2, "level": "warn", "ms": 120}\n{"id": 3 "level": "x"}\n')
    page.set_input_files('#file', os.path.join(d, 'events.ndjson'))
    page.wait_for_timeout(600)
    check_that(get_state(page, 'S.name') == 'events' and get_state(page, 'S.model.jsonl') and 'JSON Lines' in page.inner_text('#code-status'), 'a .ndjson file opens as JSON Lines')
    roots = page.locator('#tree .trow-root').all_inner_texts()
    check_that(roots == ['Line 1', 'Line 2', 'Line 3'], 'the tree has one entry per line: ' + str(roots))
    check_that('Line 3, column 10' in page.inner_text('#code-error') and 'comma is missing' in page.inner_text('#code-error'), 'a problem names its line')
    check_that('Line 2, column 1' in page.inner_text('#code-error') and 'same keys' in page.inner_text('#code-error'), 'a note when the lines have different keys')
    page.locator('#tree .trow', has=page.locator('.trow-k', has_text='ms')).first.locator('.trow-v').click()
    page.locator('#tree .trow-edit').fill('99')
    page.locator('#tree .trow-edit').press('Enter')
    page.wait_for_timeout(300)
    check_that(get_state(page, 'S.code').split('\n')[1] == '{"id": 2, "level": "warn", "ms": 99}', 'a line can be edited while another line has an error')
    check_that(page.inner_text('#btn-download') == 'Download .jsonl', 'the download is a .jsonl file')
    set_code(page, '{"id": 1, "level": "info"}\n{"id": 2, "level": "warn"}\n')
    page.click('[data-itab=convert]')
    page.select_option('#cv-to', 'json')
    page.wait_for_timeout(300)
    check_that(page.input_value('#cv-out') == '[\n  {\n    "id": 1,\n    "level": "info"\n  },\n  {\n    "id": 2,\n    "level": "warn"\n  }\n]\n', 'Convert JSON Lines to a JSON array')
    page.select_option('#cv-to', 'csv')
    page.wait_for_timeout(300)
    check_that(page.input_value('#cv-out') == 'id,level\n1,info\n2,warn\n', 'and to CSV, one row per line')
    page.select_option('#cv-to', 'json')
    page.wait_for_timeout(200)
    page.click('#cv-new')
    page.wait_for_timeout(400)
    check_that(get_state(page, 'S.name') == 'events array' and not get_state(page, 'S.model.jsonl') and get_state(page, 'S.model.docs[0].root.type') == 'array', 'the array opens as a new document')
    page.select_option('#cv-to', 'jsonl')
    page.wait_for_timeout(300)
    check_that(page.input_value('#cv-out') == '{"id":1,"level":"info"}\n{"id":2,"level":"warn"}\n', 'Convert a JSON array to JSON Lines')
    page.click('#cv-new')
    page.wait_for_timeout(400)
    check_that(get_state(page, 'S.model.jsonl') and get_state(page, 'S.model.docs.length') == 2, 'and open it as a JSON Lines document')
    page.click('[data-itab=node]')
    page.click('#btn-new')
    page.click('[data-new=jsonl]')
    page.wait_for_timeout(300)
    check_that(get_state(page, 'S.name') == 'Event log' and get_state(page, 'S.model.jsonl') and get_state(page, 'S.model.docs.length') == 4, 'New > JSON Lines')
    page.click('#btn-export')
    page.select_option('#ex-format', 'jsonl')
    with page.expect_download() as dl:
        page.click('#ex-download')
    check_that(dl.value.suggested_filename == 'Event log.jsonl', 'export: .jsonl')
    page.select_option('#ex-format', 'json')
    page.wait_for_timeout(200)
    check_that(page.input_value('#ex-text').startswith('[\n  {\n    "time"'), 'export: JSON Lines as a JSON array')
    page.keyboard.press('Escape')
    page.goto(URL + '#json=' + '%7B%22a%22%3A1%7D' + '&file=new&name=One%20line&format=jsonl', wait_until='networkidle')
    page.wait_for_timeout(800)
    check_that(get_state(page, 'S.name') == 'One line' and get_state(page, 'S.model.jsonl'), 'an AI link with &format=jsonl makes a JSON Lines document (also with one line)')
    page.evaluate(f'{HOOK}.receive(\'{{"a":2}}\\n{{"a":3}}\', "add", {{ direct: true }})')
    page.wait_for_timeout(300)
    check_that(get_state(page, 'S.code') == '{"a":1}\n{"a":2}\n{"a":3}\n', '&mode=add adds the lines at the end: ' + repr(get_state(page, 'S.code')))
    page.click('#btn-ai')
    page.click('#ai-copy')
    page.wait_for_timeout(300)
    pr = page.evaluate('navigator.clipboard.readText()')
    check_that('JSON Lines, one value per line' in pr and '```jsonl' in pr and '&format=jsonl' in pr, 'the AI prompt says the document is JSON Lines')
    page.keyboard.press('Escape')

    # --- AI link to a new document, mode=add merges ---
    data = '{"from": "the AI", "items": [1, 2]}'
    z = base64.urlsafe_b64encode(zlib.compress(data.encode())).decode().rstrip('=')
    page.goto(URL + '#z=' + z + '&file=new&name=AI%20data', wait_until='networkidle')
    page.wait_for_timeout(800)
    check_that(get_state(page, 'S.name') == 'AI data' and get_state(page, 'S.code') == data, 'an AI link makes a new document')
    link = 'https://json.giit.ch/#b64=' + base64.urlsafe_b64encode('{"from": "the AI, again", "more": true}'.encode()).decode() + '&mode=add'
    answer = 'Here is the link:\n' + link[:40] + '\n' + link[40:] + '\nClick it.'
    page.click('#btn-ai')
    page.fill('#ai-paste', answer)
    page.wait_for_timeout(400)
    check_that(not page.locator('#ask').is_visible(), 'a link changes the document without a question')
    page.wait_for_timeout(400)
    check_that(get_state(page, 'S.code') == '{"from": "the AI, again", "items": [1, 2], "more": true}', 'mode=add merges into the root object, the rest of the code stays: ' + get_state(page, 'S.code'))
    set_code(page, '[1, 2]')
    page.evaluate(f'{HOOK}.receive("[3, 4]", "add", {{ direct: true }})')
    page.wait_for_timeout(300)
    check_that(get_state(page, 'S.code') == '[1, 2, 3, 4]', 'and appends to the root array')

    # --- Export ---
    set_code(page, '{\n  "a": [1, 2],\n  "b": "x"\n}\n')
    page.click('#btn-export')
    page.select_option('#ex-format', 'jsonmin')
    page.wait_for_timeout(200)
    check_that(page.input_value('#ex-text') == '{"a":[1,2],"b":"x"}', 'export: minified JSON')
    with page.expect_download() as dl:
        page.click('#ex-download')
    check_that(dl.value.suggested_filename == 'AI data.min.json', 'export: minified .json download')
    page.select_option('#ex-format', 'yaml')
    page.wait_for_timeout(200)
    check_that(page.input_value('#ex-text') == 'a:\n  - 1\n  - 2\nb: x\n', 'export: YAML')
    page.select_option('#ex-format', 'txt')
    page.wait_for_timeout(200)
    check_that(page.input_value('#ex-text').startswith('$ {2}\n  a: [2]\n    [0]: 1 (number)'), 'export: the tree as plain text')
    page.select_option('#ex-format', 'csv')
    page.wait_for_timeout(200)
    check_that('array of objects' in page.inner_text('#ex-info') and page.locator('#ex-download').is_disabled(), 'export: CSV says when the data is no table')
    with page.expect_download() as dl:
        page.click('#ex-zip')
    check_that(dl.value.suggested_filename.endswith('-all.zip'), 'export: all formats as ZIP')
    page.keyboard.press('Escape')

    # --- Phone ---
    page.set_viewport_size({'width': 390, 'height': 800})
    page.wait_for_timeout(300)
    check_that(page.locator('.views').is_visible(), 'phone: Code / Tree / Value tabs')
    check_that(page.evaluate('document.documentElement.scrollWidth') <= 391, 'phone: no sideways scrolling')
    page.click('[data-pane=code]')
    check_that(page.locator('#code').is_visible(), 'phone: the code view')

    check_that(not errors, 'no script errors' + (': ' + '; '.join(errors) if errors else ''))
    browser.close()

print(f'\n{len(failures)} failed' if failures else '\nall passed')
sys.exit(1 if failures else 0)
