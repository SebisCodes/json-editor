"""A large JSON Lines file: 100 000 lines stay usable (the tree draws only
the entries in sight).

    php -S 127.0.0.1:8101 -t src src/php/router.php          (in the project folder)
    python tests/perf_test.py

Times loading, scrolling the tree, editing a value in the middle (written
into its own line, one undo step) and undo, and checks that the page holds
only a few rows of the tree."""
import os
import sys

from playwright.sync_api import sync_playwright

EDITOR = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8101/')
HOOK = 'jsonEditor'
LINES = 100_000
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
    page.goto(EDITOR + '?lang=en', wait_until='load')
    page.wait_for_timeout(1000)
    ms = page.evaluate("""([n, hook]) => {
        const lines = [];
        for (let i = 1; i <= n; i++) lines.push(JSON.stringify({ id: i, name: 'Name ' + i, city: 'City ' + (i % 97), amount: +(i * 7.31 % 1000).toFixed(2), tags: ['a', 'b'], ok: i % 2 === 0 }));
        const text = lines.join('\\n') + '\\n';
        const t = performance.now();
        window[hook].setCode(text);
        return [performance.now() - t, text.length];
    }""", [LINES, HOOK])
    print(f'      {ms[1] / 1e6:.1f} MB, setCode {ms[0]:.0f} ms')
    check_that(page.evaluate('%s.state.model.jsonl && %s.state.model.docs.length' % (HOOK, HOOK)) == LINES, f'{LINES:,} lines read as JSON Lines')
    check_that(ms[0] < 6000, f'loading takes {ms[0]:.0f} ms (< 6000)')
    rows = page.locator('#tree .trow').count()
    check_that(rows < 200, f'only the entries in sight are in the page ({rows})')
    check_that(page.locator('#tree .trow').first.inner_text().startswith('Line 1'), 'the first entry is "Line 1"')

    t = page.evaluate("""() => new Promise(res => {
        const g = document.getElementById('tree'); const t = performance.now();
        g.scrollTop = g.scrollHeight / 2;
        requestAnimationFrame(() => requestAnimationFrame(() => res(performance.now() - t)));
    })""")
    page.wait_for_timeout(150)
    shown = [r for r in page.locator('#tree .trow .trow-root').all_inner_texts()]
    mid = int(shown[len(shown) // 2].split()[1]) if shown else 0
    check_that(t < 300 and 40000 < mid < 60000, f'scrolling to the middle draws its entries in {t:.0f} ms (line {mid})')

    target = 50_000
    t0 = page.evaluate(f"""() => {{ const t = performance.now(); {HOOK}.tree.select({{ doc: {target - 1}, path: ['name'] }}); return performance.now() - t; }}""")
    page.wait_for_timeout(200)
    check_that(page.locator('#tree .trow.active').count() == 1 and f'Name {target}' in page.locator('#tree .trow.active').inner_text(), f'selecting a value in line {target:,} opens and shows it ({t0:.0f} ms)')
    n = page.evaluate('%s.state.history.length' % HOOK)
    page.locator('#tree .trow.active .trow-v').click()
    page.wait_for_timeout(150)
    t = page.evaluate("""() => { const f = document.querySelector('#tree .trow-edit'); f.value = 'Edited "in" the middle';
        const t = performance.now(); f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return performance.now() - t; }""")
    page.wait_for_timeout(200)
    line = page.evaluate(f"""() => {HOOK}.state.code.split('\\n')[{target - 1}]""")
    check_that(line == '{"id":%d,"name":"Edited \\"in\\" the middle","city":"City %d","amount":%s,"tags":["a","b"],"ok":true}' % (target, target % 97, page.evaluate(f'+({target} * 7.31 % 1000).toFixed(2)')), 'the value is written into its own line only: ' + line[:80])
    check_that(page.evaluate(f"""() => {HOOK}.state.code.split('\\n').length""") == LINES + 1, 'the file keeps its number of lines')
    check_that(page.evaluate('%s.state.history.length' % HOOK) == n + 1, 'one undo step')
    check_that(t < 3000, f'editing a value (write, read again, draw) takes {t:.0f} ms (< 3000)')
    t = page.evaluate('() => { const t = performance.now(); %s.undo(); return performance.now() - t; }' % HOOK)
    check_that('Name %d"' % target in page.evaluate(f"""() => {HOOK}.state.code.split('\\n')[{target - 1}]"""), f'Undo takes it back in {t:.0f} ms')
    check_that(t < 3000, f'undo takes {t:.0f} ms (< 3000)')
    t = page.evaluate("""() => { const t = performance.now(); const i = document.querySelector('#tree-search'); i.value = 'Name 99999'; i.dispatchEvent(new Event('input')); return performance.now() - t; }""")
    page.wait_for_timeout(1500)
    check_that(page.inner_text('#tree-hits') == '1 / 1', 'search finds a value in the whole file: ' + page.inner_text('#tree-hits'))
    check_that(not errors, 'no script errors: ' + '; '.join(errors))
    browser.close()

print()
print('all passed' if not failed else f'{len(failed)} failed')
sys.exit(1 if failed else 0)
