"""Best-effort converter: legacy LMG-Arun / Terafont-Varun style Gujarati -> Unicode Gujarati.

The client's Excel stores Gujarati as ASCII bytes that only look right with the LMG-Arun font
(e.g. "TFZLB" is shown as "તારીખ"). This maps those bytes to real Unicode.

Usage:
    python tools/lmg_arun_to_unicode.py "TFZLB"                  # convert text
    python tools/lmg_arun_to_unicode.py in.xlsm out.xlsx         # convert every LMG-Arun cell in a workbook

Limits: mapping was derived from the sample workbook, so rare glyphs may be wrong or left as-is.
Cells in Guj_*_SULEKH fonts use a different mapping and are NOT converted. Always review the output.
Requires openpyxl for the workbook mode.
"""
import sys

MAP = {
    # independent vowels
    'V': 'અ', 'p': 'ઉ', '>': 'ઈ',
    # consonants
    'S': 'ક', 'B': 'ખ', 'U': 'ગ', '3': 'ઘ', 'R': 'ચ', 'K': 'છ', 'H': 'જ', 'h': 'ઝ',
    '8': 'ટ', '9': 'ઠ', '0': 'ડ', '(': 'ઢ', '6': 'ણ', 'T': 'ત', 'Y': 'થ', 'N': 'દ', 'W': 'ધ',
    'G': 'ન', '5': 'પ', 'O': 'ફ', 'A': 'બ', 'E': 'ભ', 'D': 'મ', 'I': 'ય', 'Z': 'ર', ',': 'લ',
    '/': 'ળ', 'J': 'વ', 'X': 'શ', 'Ø': 'ષ', ';': 'સ', 'C': 'હ',
    # ligatures / half forms
    'z': 'શ્ર', '7': 'જ્ઞ', 'Ù': 'ક્ષ', 'Ì': 'ક્ર', 'Ê': 'ક્ર', '£': 'દ્વ', '+': 'ત્ર', '~': 'રૂ',
    'g': 'ન્', 'j': 'વ્', 'e': 'ભ્', 't': 'ત્', 'r': 'ચ્', ':': 'સ્', 'n': 'દ્ય', 'd': 'મ્',
    'b': 'ખ્', 'y': 'થ્', '<': 'લ્', '?': 'ળ્', 'Q': 'ષ્', '1': 'ક્ષ્',
    # dependent vowel signs and marks
    'F': 'ા', 'L': 'ી', ']': 'ુ', '}': 'ૂ', '[': 'ે', '{': 'ૈ', 'M': 'ો', '\\': 'ં', 'k': 'ૃ',
    '|': '્ર', '=': '્ર',
    # punctuation / digits as used in the sample
    'P': '.', 'q': '/', 'v': '–', 'o': ':', 's': '(', 'f': ')', '4': ',',
    # digits: '_' ૦, '!' ૧, '#' ૩, '&' ૬, ')' ૯ are confirmed from the sample; '@' '$' '%' '*' '(' are guesses
    '_': '૦', '!': '૧', '@': '૨', '#': '૩', '$': '૪', '%': '૫', '&': '૬', '*': '૭', '(': '૮', ')': '૯',
}
# Latin words typed inside LMG-Arun cells (shown in a Latin font in the printouts) - keep as-is
KEEP_LATIN = {'SMCE', 'SMC', 'BOB', 'SSA', 'TO', 'BM', 'CRC', 'BRC', 'DISE'}
FIX_VOWELS = [('અા', 'આ'), ('અે', 'એ'), ('અૈ', 'ઐ'), ('અો', 'ઓ'), ('આૈ', 'ઔ')]
_DIGITS = '૦૧૨૩૪૫૬૭૮૯'
I_MATRA = 'l'      # written before the consonant, pronounced after it
REPH = '"'         # written after the syllable, pronounced before it
POST_BASE = {'|', '='}
SIGNS = set('ાીુૂેૈોૌંૃિ')


def _syllable_start(out):
    """Index in `out` where the last consonant cluster (plus its signs) starts."""
    i = len(out) - 1
    while i >= 0 and out[i] in SIGNS:
        i -= 1
    while i > 0 and out[i - 1].endswith('્'):
        i -= 1
    while i >= 0 and out[i] == '્ર':
        i -= 1
    return max(i, 0)


def _fix_digits(s):
    # the font uses the letters ર and પ as the digits ૨ and ૫ (they look alike); fix them inside numbers
    import re
    def rep(m):
        t = m.group(0)
        if not any(ch in _DIGITS for ch in t):
            return t
        return t.replace('ર', '૨').replace('પ', '૫')
    return re.sub(r'(?<![\u0A80-\u0AFF])[૦-૯રપ]{2,}(?![\u0ABE-\u0ACD\u0A81-\u0A83])', rep, s)


def convert(text):
    if not isinstance(text, str):
        return text
    import re
    parts = re.split(r'(\b(?:' + '|'.join(sorted(KEEP_LATIN, key=len, reverse=True)) + r')\b)', text)
    res = ''.join(p if p in KEEP_LATIN else _convert_run(p) for p in parts)
    for a, b in FIX_VOWELS:
        res = res.replace(a, b)
    return _fix_digits(res)


def _convert_run(text):
    out, pending_i = [], False
    chars = list(text)
    for k, ch in enumerate(chars):
        if ch == I_MATRA:
            pending_i = True
            continue
        if ch == REPH:
            out.insert(_syllable_start(out), 'ર્')
            continue
        u = MAP.get(ch, ch)
        out.append(u)
        if pending_i and ch != ' ' and not u.endswith('્'):
            nxt = chars[k + 1] if k + 1 < len(chars) else ''
            if nxt not in POST_BASE:
                out.append('િ')
                pending_i = False
    return ''.join(out)


def convert_workbook(src, dst):
    import openpyxl
    wb = openpyxl.load_workbook(src)
    n = 0
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for c in row:
                if isinstance(c.value, str) and not c.value.startswith('=') and c.font and c.font.name == 'LMG-Arun':
                    c.value = convert(c.value)
                    from copy import copy
                    f = copy(c.font)
                    f.name = 'Noto Sans Gujarati'
                    c.font = f
                    n += 1
    wb.save(dst)
    print(f'converted {n} cells -> {dst}')


if __name__ == '__main__':
    args = sys.argv[1:]
    if len(args) == 2 and args[0].lower().endswith(('.xlsx', '.xlsm')):
        convert_workbook(args[0], args[1])
    else:
        for a in args:
            print(convert(a))
