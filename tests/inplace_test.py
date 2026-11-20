"""Editing in place in the tree: a click on a key or a value opens a field;
Enter writes the change into the code (escaped as JSON needs it, the rest
of the code keeps its formatting and comments, one undo step), Escape
cancels. The buttons above the tree add, duplicate, move and remove
entries and change the type.

    php -S 127.0.0.1:8101 -t src src/php/router.php          (in the project folder)
    python tests/inplace_test.py
"""
import os
import sys

from playwright.sync_api import sync_playwright

EDITOR = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8101/')
HOOK = 'jsonEditor'
CODE = '''{
  // the team
  "name": "Ada",
  "age": 36,
  "active": true,
  "tags": ["a", "b"],
  "team": {
    "lead": "Grace"
  }
}
'''
failed = []


def check_that(ok, text):
    """Prints one result line and notes a failure.

    Args:
        ok (bool): True when the check holds.
        text (str): what is checked.

    Returns:
        None: the result is printed and a failure is noted.
    """
    print(('ok    ' if ok else 'FAIL  ') + text)
    if not ok:
        failed.append(text)


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(EDITOR + '?lang=en', wait_until='networkidle')
    page.wait_for_timeout(800)
    page.evaluate('c => %s.setCode(c)' % HOOK, CODE)
    page.wait_for_timeout(300)
    code = lambda: page.evaluate('%s.state.code' % HOOK)
    history = lambda: page.evaluate('%s.state.history.length' % HOOK)
    field = page.locator('#tree .trow-edit')
    row = lambda text: page.locator('#tree .trow', has=page.locator('.trow-k', has_text=text)).first

    # A value
    row('name').locator('.trow-v').click()
    page.wait_for_timeout(150)
    check_that(field.count() == 1 and field.input_value() == 'Ada', 'a click on a value opens a field with the value (without quotes)')
    sel = page.evaluate('() => { const t = document.querySelector("#code"); return t.value.slice(t.selectionStart, t.selectionEnd); }')
    check_that(sel == '"name": "Ada"', 'the click also selects the entry in the code: ' + repr(sel))
    n = history()
    field.fill('Ada "Lovelace" \\ <1815>')
    field.press('Enter')
    page.wait_for_timeout(300)
    check_that(field.count() == 0, 'Enter closes the field')
    check_that('"name": "Ada \\"Lovelace\\" \\\\ <1815>",' in code(), 'the value is in the code, escaped as JSON: ' + code().split('\n')[2])
    check_that(code().replace('Ada \\"Lovelace\\" \\\\ <1815>', 'Ada') == CODE, 'nothing else in the code changed (comment and formatting kept)')
    check_that(history() == n + 1, 'one undo step')
    page.evaluate('%s.undo()' % HOOK)
    page.wait_for_timeout(200)
    check_that(code() == CODE, 'one Undo brings the old value back')

    # Escape cancels
    row('name').locator('.trow-v').click()
    field.fill('Not this')
    field.press('Escape')
    page.wait_for_timeout(200)
    check_that(field.count() == 0 and code() == CODE, 'Escape cancels')

    # A number keeps its type
    row('age').locator('.trow-v').click()
    field.fill('thirty')
    field.press('Enter')
    page.wait_for_timeout(200)
    check_that(field.count() == 1 and 'not a number' in page.inner_text('#toast'), 'a number field does not take text: ' + page.inner_text('#toast'))
    field.fill('37.50')
    field.press('Enter')
    page.wait_for_timeout(300)
    check_that('"age": 37.50,' in code(), 'a number is written as typed')

    # A key
    row('active').locator('.trow-k').click()
    page.wait_for_timeout(100)
    field.fill('enabled')
    field.press('Enter')
    page.wait_for_timeout(300)
    check_that('"enabled": true,' in code() and '"active"' not in code(), 'a key is renamed in the code')
    row('enabled').locator('.trow-k').click()
    field.fill('name')
    field.press('Enter')
    page.wait_for_timeout(300)
    check_that(field.count() == 1 and 'already a key' in page.inner_text('#toast'), 'a key that exists already is refused')
    field.press('Escape')

    # Leaving the field writes the change too
    row('lead').locator('.trow-v').click()
    field.fill('Hopper')
    page.locator('#code').click(position={'x': 300, 'y': 400})
    page.wait_for_timeout(300)
    check_that('"lead": "Hopper"' in code(), 'leaving the field also writes the value')

    # Leaving the field with a button that changes the code: the change never lands elsewhere
    before = code()
    row('lead').locator('.trow-v').click()
    field.fill('Lovelace')
    page.click('#node-del')
    page.wait_for_timeout(300)
    check_that('lead' not in code() and 'Lovelace' not in code() and page.evaluate('%s.state.code' % HOOK).rstrip().endswith('}'),
          'Remove while a value is open removes the entry, the typed value is not written elsewhere: ' + repr(code()[-60:]))
    page.evaluate('%s.undo()' % HOOK)
    page.wait_for_timeout(300)
    check_that(code() == before, 'one Undo brings the entry back')

    # Type change
    row('enabled').click()
    page.select_option('#node-type', 'string')
    page.wait_for_timeout(300)
    check_that('"enabled": "true",' in code(), 'the type menu turns true into the string "true"')
    page.select_option('#node-type', 'array')
    page.wait_for_timeout(300)
    check_that('"enabled": ["true"],' in code(), 'and the string into an array with it')

    # Add, duplicate, move, remove (each one undo step)
    page.evaluate('c => %s.setCode(c)' % HOOK, CODE)
    page.wait_for_timeout(300)
    row('tags').click()
    n = history()
    page.click('#node-add')
    page.wait_for_timeout(300)
    check_that('"tags": ["a", "b", ""],' in code(), 'Add on an array adds an entry at its end, on the same line: ' + code().split('\n')[5])
    check_that(history() == n + 1, 'adding is one undo step')
    row('team').click()
    page.click('#node-add')
    page.wait_for_timeout(300)
    check_that(field.count() == 1 and field.input_value() == 'key', 'Add on an object adds a key and opens it for typing')
    field.fill('size')
    field.press('Enter')
    page.wait_for_timeout(300)
    check_that('"lead": "Grace",\n    "size": ""\n  }' in code(), 'the new key is in its own line with the indentation of the object')
    row('name').click()
    page.click('#node-dup')
    page.wait_for_timeout(300)
    check_that('"name": "Ada",\n  "name copy": "Ada",\n  "age"' in code(), 'Duplicate copies the entry right after it')
    row('age').click()
    page.click('#node-up')
    page.wait_for_timeout(300)
    check_that('"name": "Ada",\n  "age": 36,\n  "name copy": "Ada",' in code(), 'Move up swaps it with the entry before')
    page.locator('#tree').press('Alt+ArrowDown')
    page.wait_for_timeout(300)
    check_that('"name copy": "Ada",\n  "age": 36,' in code(), 'Alt+Down moves it down again')
    row('name copy').click()
    page.click('#node-del')
    page.wait_for_timeout(300)
    check_that('name copy' not in code() and '"name": "Ada",\n  "age": 36,' in code(), 'Remove takes the entry and its comma away')
    page.locator('#tree').press('Delete')
    page.wait_for_timeout(300)
    check_that(code().count('"age"') == 0, 'the Delete key removes the selected entry')
    check_that('// the team' in code(), 'the comment is still there after all changes')
    for k in range(8):
        page.evaluate('%s.undo()' % HOOK)
    page.wait_for_timeout(300)
    check_that(code() == CODE, 'Undo takes every change back, step by step')

    # JSON Lines: a change stays in its line; whole lines are added, duplicated, moved and removed
    JL = '{"id": 1, "tags": ["a"]}\n{"id": 2, "tags": []}\n{"id": 3, "tags": ["c"]}\n'
    page.evaluate('c => %s.setCode(c)' % HOOK, JL)
    page.wait_for_timeout(300)
    line = lambda k: page.locator('#tree .trow', has=page.locator('.trow-root', has_text='Line %d' % k)).first
    tags = lambda k: page.locator('#tree .trow[aria-level="2"]', has=page.locator('.trow-k', has_text='tags')).nth(k - 1)
    tags(2).click()
    n = history()
    page.click('#node-add')
    page.wait_for_timeout(300)
    check_that(code() == JL.replace('"tags": []', '"tags": [""]'), 'adding to an empty array in a line keeps it on that line: ' + code().split('\n')[1])
    check_that(history() == n + 1, 'one undo step')
    page.evaluate('%s.undo()' % HOOK)
    page.wait_for_timeout(200)
    page.locator('#tree .trow', has=page.locator('.trow-k', has_text='id')).nth(0).locator('.trow-v').click()
    field.fill('10')
    field.press('Enter')
    page.wait_for_timeout(300)
    check_that(code() == JL.replace('"id": 1,', '"id": 10,'), 'a value changes in its own line only')
    page.evaluate('%s.undo()' % HOOK)
    page.wait_for_timeout(200)
    tags(1).click()
    page.select_option('#node-type', 'object')
    page.wait_for_timeout(300)
    check_that(code().split('\n')[0] == '{"id": 1, "tags": {"0": "a"}}' and code().count('\n') == 3, 'a type change keeps the line a line')
    page.evaluate('%s.undo()' % HOOK)
    page.wait_for_timeout(200)
    line(1).click()
    page.click('#node-dup')
    page.wait_for_timeout(300)
    check_that(code() == '{"id": 1, "tags": ["a"]}\n' + JL, 'Duplicate on a line copies the whole line')
    page.click('#node-down')
    page.wait_for_timeout(300)
    check_that(code().split('\n')[2] == '{"id": 1, "tags": ["a"]}' and code().split('\n')[1] == '{"id": 2, "tags": []}', 'Move down swaps two lines')
    page.click('#node-del')
    page.wait_for_timeout(300)
    check_that(code() == '{"id": 1, "tags": ["a"]}\n{"id": 2, "tags": []}\n{"id": 3, "tags": ["c"]}\n', 'Remove takes the whole line away')
    check_that(page.evaluate('%s.state.model.jsonl' % HOOK), 'it stays JSON Lines')
    for k in range(3):
        page.evaluate('%s.undo()' % HOOK)
    page.wait_for_timeout(200)
    check_that(code() == JL, 'Undo takes the line changes back one by one')

    # With a syntax error, the tree is not edited
    page.evaluate('c => %s.setCode(c)' % HOOK, CODE.replace('"age": 36,', '"age": 36'))
    page.wait_for_timeout(300)
    row('name').locator('.trow-v').click()
    page.wait_for_timeout(150)
    check_that(field.count() == 0 and 'syntax error' in page.inner_text('#toast'), 'with a syntax error the tree asks to fix it first')

    # German interface: the data itself is not translated
    page.goto(EDITOR + '?lang=de', wait_until='networkidle')
    page.wait_for_timeout(1200)
    page.evaluate('c => %s.setCode(c)' % HOOK, CODE)
    page.wait_for_timeout(300)
    row('name').locator('.trow-v').click()
    page.wait_for_timeout(150)
    check_that(field.count() == 1 and field.input_value() == 'Ada', 'also in the German interface, and the data is not translated')
    check_that(page.locator('#tree .trow-type').first.inner_text() == 'Objekt', 'the type names in the tree are German')
    field.press('Escape')
    page.goto(EDITOR + '?lang=en', wait_until='networkidle')
    check_that(not errors, 'no script errors: ' + '; '.join(errors))
    browser.close()

print()
print('all passed' if not failed else f'{len(failed)} failed')
sys.exit(1 if failed else 0)
