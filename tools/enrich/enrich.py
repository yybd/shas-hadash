#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
enrich.py — צריבת מקטעים דטרמיניסטית לתוך דפי צורת-הדף.

הבעיה: עד היום daf.js סיווג ופילח כל דף מחדש בדפדפן, בהיוריסטיקות
גיאומטריות מקומיות. דיבור-המתחיל שמתפרס על רוחבים שונים (העמודה הצרה
שלצד הגמרא + המשכה ברוחב מלא מתחתיה) נקרע לשני מקטעים, כי כל אזור
פולח בנפרד; עמוד שבו רש"י תופס את שתי הכנפיים (כשאין תוספות) קיבל
תוויות צד שגויות; ושורת ד"ה גדולה נבלעה באזור הגמרא.

הפתרון: הפילוח רץ פעם אחת, כאן, בזמן-בנייה — על כל נתוני הדף במלואם —
והתוצאה נצרבת לתוך ה-HTML כ-data attributes. בזמן-ריצה לא נשארת שום
היוריסטיקה: לחיצה קוראת data-seg, העתקה ממוינת לפי data-i.

מה נצרב:
  <div class="daf-page" data-segv="1">          תג גרסת ההעשרה
  <div class="ln" data-zone="rashi" data-flow="r">   אזור + זרימה
  <span class="w" data-i="512" data-seg="r3" data-dh="1">  סדר-קריאה,
                                                מקטע, דיבור-המתחיל

שני מושגי מפתח:

"זרימה" (flow) — רצף קריאה אחד. זרימת רש"י כוללת את העמודה הראשית ואת
כל המשכיה שבתחתית הדף (גם ברוחב שונה), משורשרים לפי סמיכות אנכית,
חפיפה אופקית וגוף-כתב זהה. הפילוח לדיבורי-המתחיל רץ על הזרימה כולה —
ולכן דיבור שחוצה שינוי רוחב הוא מקטע אחד.

"עיגון" — רשימת דיבורי-המתחיל שזוהתה גיאומטרית מיושרת מול הטקסט
הדיגיטלי הבלתי-תלוי שב-shastext/ (מחולק לדיבורים). היישור נעשה מול
חלון של שלושה עמודים (הקודם, הנוכחי, הבא), כי הייחוס הולך לפי עמוד
הגמרא ואילו הדפוס גולש בין עמודים. העיגון גם מכריע לאיזו משפחה שייכת
כל כנף (עמוד שכולו רש"י), ממזג ד"ה שנקטע, מפצל ד"ה שפוספס — ומדווח.

הפעלה (משורש הריפו):
  python3 tools/enrich/enrich.py 0            מסכת שלמה
  python3 tools/enrich/enrich.py 0 8          עמוד בודד (חלון העיגון
                                              נטען גם משכניו)
  python3 tools/enrich/enrich.py --all
  --out DIR    כתיבה לתיקייה אחרת (ברירת מחדל: במקום, על הדפים עצמם)
  --dry-run    דו"ח בלבד, בלי כתיבה
  --report F   קובץ הדו"ח (ברירת מחדל: tools/enrich/report/<מסכת>.json)
"""

import argparse
import difflib
import gzip
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# ---------------------------------------------------------------- ניתוח הדף
# הדפים נוצרים ע"י daf2html.py בפורמט קשיח: כל שורה פיזית של הקובץ היא
# <div class="ln"> אחד. הניתוח וההזרקה נעשים בכירורגיית-מחרוזות על
# השורות עצמן — שום דבר אחר בקובץ לא משתנה, בייט אחר בייט.

LN_RE = re.compile(
    r'^<div class="ln" style="right:([\d.-]+)px;top:([\d.-]+)px;'
    r'width:([\d.-]+)px" data-x0="([\d.-]+)" data-x1="([\d.-]+)"'
    r' data-size="([\d.]+)"[^>]*>(.*)</div>\s*$')
W_RE = re.compile(
    r'<span class="w ([^"]+)" style="([^"]*)" data-w="([\d.]+)"[^>]*>'
    r'([^<]*)</span>( ?)')
TOP_RE = re.compile(r'(?:^|;)top:([\d.-]+)px')
SIZE_RE = re.compile(r'font-size:([\d.]+)px')
PAGEW_RE = re.compile(r'--page-w:([\d.]+)px')
# ניקוי צריבה קודמת — הסקריפט אידמפוטנטי
STRIP_RE = re.compile(
    r' data-(?:i|seg|dh|zone|flow|segv|surround)="[^"]*"')

SQUARE = {'sq', 'sqs', 'bd', 'dh', 'to'}
HEB = re.compile(r'[א-ת]')
# סטייה מותרת מגודל הגמרא האופייני למסכת, בנקודות. אותה מסכת נדפסה
# בגופן אחד, וההפרשים שנמדדים בפועל בין עמודיה הם שברי נקודה.
HINT_TOL = 0.8


class Word:
    __slots__ = ('cls', 'style', 'dataw', 'text', 'sp', 'fam', 'size',
                 'x0', 'x1', 'top', 'seg', 'dh', 'idx', 'line',
                 'colbody', 'colsq')

    def __init__(self, cls, style, dataw, text, sp, line):
        self.cls, self.style, self.dataw, self.text, self.sp = \
            cls, style, dataw, text, sp
        m = re.search(r'(?:^|\s)f-([\w-]+)', cls)
        self.fam = m.group(1) if m else 'sq'
        m = SIZE_RE.search(style)
        self.size = float(m.group(1)) if m else line.size
        mr = re.match(r'right:([\d.-]+)px', style)
        self.x1 = line.x1 - (float(mr.group(1)) if mr else 0.0)
        self.x0 = self.x1 - float(dataw)
        m = TOP_RE.search(style)
        self.top = line.top + (float(m.group(1)) if m else 0.0)
        self.seg = None
        self.dh = False
        self.idx = None
        self.line = line
        self.colbody = None
        self.colsq = False

    @property
    def square(self):
        f = self.fam
        if f in SQUARE:
            return True
        if f in ('rs', 'rss'):
            return False
        return not re.search('rashi', f, re.I)

    def heb_len(self):
        return len(HEB.findall(self.text))


class Line:
    __slots__ = ('x0', 'x1', 'size', 'top', 'words', 'file_idx',
                 'zone', 'flow')

    def __init__(self, m, file_idx):
        self.top = float(m.group(2))
        self.x0 = float(m.group(4))
        self.x1 = float(m.group(5))
        self.size = float(m.group(6))
        self.file_idx = file_idx
        self.zone = None
        self.flow = None
        self.words = []
        for wm in W_RE.finditer(m.group(7)):
            self.words.append(Word(wm.group(1), wm.group(2), wm.group(3),
                                   wm.group(4), wm.group(5), self))


def parse_page(html):
    raw_lines = html.split('\n')
    lines, page_idx = [], None
    for i, raw in enumerate(raw_lines):
        if raw.startswith('<div class="daf-page"'):
            page_idx = i
            continue
        m = LN_RE.match(STRIP_RE.sub('', raw))
        if m:
            lines.append(Line(m, i))
    mw = PAGEW_RE.search(html)
    page_w = float(mw.group(1)) if mw else 643.58
    ms = re.search(r'data-rashi-side="(\w+)"', html)
    side = ms.group(1) if ms else 'right'
    return raw_lines, lines, page_idx, page_w, side


# ---------------------------------------------------------- סיווג אזורים
# פורט של הלוגיקה מ-daf.js (גרסה 21) עם שני שיפורים: מבחן ה-x של הגמרא
# לפי מעטפת מקומית בגובה השורה (ולא הקופסה הגלובלית), והמשכיות ד"ה
# מרובע (בפילוח). מעתה זהו מקור האמת של הסיווג.

def is_square_line(ln):
    sq = other = 0
    for w in ln.words:
        n = w.heb_len()
        if not n:
            continue
        if w.square:
            sq += n
        else:
            other += n
    return sq > other


def gemara_metrics(lines, size_hint=None):
    """מאתר את גוש הגמרא ואת גודל גופו.

    גודל הגמרא נבחר כגודל המרובע הגדול ביותר שיש לו נפח טקסט ממשי
    (10% מהמסה). בעמוד שרוב שטחו פירושים ושוליים — למשל עמוד שמסכת
    מסתיימת בראשו — נפח הגמרא צונח מתחת לסף, והמנצח הוא גופן הפירוש
    הזעיר; משם כל הסיווג מתמוטט. size_hint הוא גודל הגמרא האופייני
    למסכת (חציון כל עמודיה): גופן הגמרא קבוע לאורך המסכת בדפוס, ולכן
    זיהוי שנפל בהרבה מתחתיו הוא שגיאה ודאית, ומתוקן לפי הרמז.
    """
    mass, total, cands = {}, 0, []
    for ln in lines:
        if ln.top <= 28 or not is_square_line(ln):
            continue
        n = sum(len(w.text) for w in ln.words)
        k = round(ln.size, 1)
        mass[k] = mass.get(k, 0) + n
        total += n
        cands.append(ln)
    gsize = 0
    for k, m in mass.items():
        if m >= 0.10 * total:
            gsize = max(gsize, k)
    # תיקון לפי רמז המסכת — רק כשהזיהוי המקומי נפל בבירור, וכשיש בפועל
    # שורות בגודל הרמוז. אחרת לא נוגעים: עדיף הזיהוי המקומי מהמצאה.
    if size_hint and gsize < 0.8 * size_hint:
        near = {k: m for k, m in mass.items()
                if abs(k - size_hint) <= HINT_TOL}
        if near:
            gsize = max(near, key=lambda k: (near[k], k))
    if not gsize:
        return {'x0': 200, 'x1': 450, 'y0': 60, 'y1': 700}, 13.7, []
    kept = sorted([l for l in cands if abs(l.size - gsize) < 0.6],
                  key=lambda l: l.top)
    # ד"ה בגודל הגמרא בראש דפי פתיחת פרק — מושמט מחישוב הקופסה
    start = 0
    while start < len(kept) - 1 and \
            kept[start + 1].top - kept[start].top > 3 * gsize:
        start += 1
    kept = kept[start:]
    return {'x0': min(l.x0 for l in kept), 'x1': max(l.x1 for l in kept),
            'y0': min(l.top for l in kept),
            'y1': max(l.top + 1.08 * l.size for l in kept)}, gsize, kept


def make_near_gem(gb, gsize, kept):
    """מבחן "בתחום ה-x של הגמרא" לפי מעטפת מקומית בגובה השורה, לא לפי
    הקופסה הגלובלית: בדף שהגמרא רחבה בתחתיתו, הקופסה הגלובלית מכסה את
    כל רוחב הדף — וד"ה מרובע גדול של תוספות בראש העמוד נבלע בה. השורות
    השכנות אנכית (עד שורה וחצי) קובעות את הרוחב האמיתי באותו גובה."""
    def near(ln):
        cx = (ln.x0 + ln.x1) / 2
        rows = [k for k in kept if abs(k.top - ln.top) <= 1.5 * gsize
                and k is not ln]
        if not rows:
            return gb['x0'] - 10 <= cx <= gb['x1'] + 10
        return min(r.x0 for r in rows) - 10 <= cx <= \
            max(r.x1 for r in rows) + 10
    return near


def classify(ln, gb, rashi_side, gsize, near_gem, gem_cx=None):
    cx = (ln.x0 + ln.x1) / 2
    if ln.top < 28:
        return 'header'
    if is_square_line(ln) and near_gem(ln) and \
            (ln.size >= 1.8 * gsize or
             (ln.size >= 0.9 * gsize and ln.top >= gb['y0'] - 1.5 * gsize)):
        return 'gemara'
    # סימוני-הפניה זעירים (אותיות מסורת הש"ס וההגהות) מודפסים בתוך גוף
    # הגמרא עצמו. הם קטנים מכדי לעבור את מבחן הגמרא, ומבחן השוליים
    # פוסל אותם כי אינם בשוליים — ולכן נפלו עד כה לטור הצדדי לפי הצד
    # ונבלעו בדיבור של רש"י/תוספות, כך שבחירת דיבור גררה איתה אות
    # קטנה שיושבת באמצע הגמרא. מקומם הפיזי — ולכן גם הלוגי — הוא הגמרא.
    if gsize and ln.size < 0.65 * gsize and near_gem(ln) and \
            gb['y0'] - gsize <= ln.top <= gb['y1']:
        return 'gemara'
    if ln.top > gb['y1'] + 8:
        return 'bottom'
    # שורה שחוצה את ציר הגמרא אינה יכולה להיות טור צדדי — הגמרא תופסת
    # את הרוחב הזה — ולכן היא שורה של רצועת התחתית. הסף האנכי לבדו
    # מפספס: קופסת הגמרא נגמרת לעיתים כמה פיקסלים *אחרי* תחילת הרצועה
    # (כשהמשפט האחרון של הגמרא נמשך לרוחב מלא), ואז המשך שלם של תוספות
    # נדבק לעמודת רש"י הצרה שלצדו ונבלע בדיבור האחרון שלה.
    if gem_cx is not None and ln.x0 < gem_cx < ln.x1 and ln.top > gb['y0']:
        return 'bottom'
    if gsize and ln.size < 0.65 * gsize and not near_gem(ln):
        return 'margin-right' if cx > (gb['x0'] + gb['x1']) / 2 \
            else 'margin-left'
    right = cx > (gb['x0'] + gb['x1']) / 2
    return 'rashi' if (rashi_side == 'right') == right else 'tosafot'


# ---------------------------------------------------- פיצול לעמודות פיזיות

def _overlap_union(a, b):
    inter = min(a['x1'], b['x1']) - max(a['x0'], b['x0'])
    if inter <= 0:
        return 0
    return inter / (max(a['x1'], b['x1']) - min(a['x0'], b['x0']))


def split_columns(lines, page_lines=None):
    """מפצל אוסף שורות לעמודות פיזיות.

    עמודה היא רצף אנכי רציף באותו תחום x. חפיפת x לבדה אינה מספיקה:
    שורות-זנב קצרות של פסקאות, שמפוזרות לאורך כל הדף, חופפות זו לזו
    אופקית — ובלי דרישת הרציפות הן מתקבצות ל"עמודה" מדומה אחת. אז הן
    נעשות מקטע אחד, ולחיצה על אחת מהן מדגישה קטעים מפוזרים בכל הדף.
    """
    def same_size(a, b):
        return abs(a['size'] - b['size']) <= 1.5

    # החציצה נבדקת מול *כל* שורות הדף ולא מול תת-הקבוצה המפוצלת: פער
    # בעמודת תוספות עשוי להיות תפוס בשורות גמרא, שאינן בקלט, ובלעדיהן
    # הפער נראה ריק והעמודות היו מתאחות דרך חצי דף.
    all_lines = page_lines if page_lines is not None else lines

    def span(box, lo, hi):
        w = box['x1'] - box['x0']
        for o in all_lines:
            if not (lo < o.top < hi):
                continue
            inter = min(o.x1, box['x1']) - max(o.x0, box['x0'])
            if inter > 0.3 * min(o.x1 - o.x0, w):
                return True
        return False

    def near_v(g, ln):
        # רצף אנכי: או סמיכות ישירה, או פער מתון שאין בו טקסט כלל.
        # עמודה נקטעת ברווח לבן (מילת פתיחה מעוטרת, ציור, סוף פסקה) אך
        # לעולם לא ע"י טור אחר — ולכן חציצה פוסלת. התקרה נחוצה בנפרד:
        # שני שברים בשני קצות הדף עשויים שלא לחצוץ זה בזה ובכל זאת
        # אינם עמודה אחת.
        tol = 4 * max(g['size'], ln.size)
        if any(abs(l.top - ln.top) <= tol for l in g['lines']):
            return True
        tops = [l.top for l in g['lines']]
        lo, hi = (max(tops), ln.top) if ln.top > max(tops) else (ln.top, min(tops))
        if hi - lo > 12 * max(g['size'], ln.size):
            return False
        return not span(g, lo, hi)

    groups = []
    for ln in lines:
        box = {'x0': ln.x0, 'x1': ln.x1, 'size': ln.size, 'lines': [ln]}
        into = None
        for g in groups:
            if into is None and same_size(g, box) and \
                    _overlap_union(g, box) >= 0.5 and near_v(g, ln):
                into = g
        if into:
            into['x0'] = min(into['x0'], box['x0'])
            into['x1'] = max(into['x1'], box['x1'])
            into['lines'].append(ln)
        else:
            groups.append(box)
    # קבוצות שהתרחבו תוך כדי ועכשיו חופפות — מאוחדות בדיעבד, ובלבד
    # שהן גם נוגעות אנכית זו בזו
    def groups_near_v(a, b):
        tol = 4 * max(a['size'], b['size'])
        at = [l.top for l in a['lines']]
        bt = [l.top for l in b['lines']]
        if min(at) - max(bt) <= tol and min(bt) - max(at) <= tol:
            return True
        lo, hi = (max(at), min(bt)) if min(bt) > max(at) else (max(bt), min(at))
        if hi - lo > 12 * max(a['size'], b['size']):
            return False
        return not span(a, lo, hi)

    i = 0
    while i < len(groups):
        j = len(groups) - 1
        while j > i:
            if same_size(groups[i], groups[j]) and \
                    _overlap_union(groups[i], groups[j]) >= 0.5 and \
                    groups_near_v(groups[i], groups[j]):
                groups[i]['x0'] = min(groups[i]['x0'], groups[j]['x0'])
                groups[i]['x1'] = max(groups[i]['x1'], groups[j]['x1'])
                groups[i]['lines'] += groups[j]['lines']
                del groups[j]
            j -= 1
        i += 1

    # שורה קצרה בסוף פסקה — נבלעת בעמודה שמכילה אותה ושסמוכה אנכית
    def absorbs(g, tiny):
        for tl in tiny['lines']:
            for gl in g['lines']:
                inter = min(tl.x1, gl.x1) - max(tl.x0, gl.x0)
                if inter < 0.9 * (tl.x1 - tl.x0):
                    continue
                if abs(gl.top - tl.top) <= 2.2 * max(tl.size, gl.size):
                    return True
        return False

    ti = len(groups) - 1
    while ti >= 0:
        if len(groups[ti]['lines']) <= 2:
            for gi, g in enumerate(groups):
                if gi == ti or len(g['lines']) <= 2:
                    continue
                if absorbs(g, groups[ti]):
                    g['lines'] += groups[ti]['lines']
                    del groups[ti]
                    break
        ti -= 1
    # קטע פנימי בגופן אחר — הגהה, תוספת בסוגריים, ציטוט בכתב זעיר —
    # קוטע את העמודה לשלושה אשכולות: מעליו, הוא עצמו, ומתחתיו. מבחן
    # הגודל מפריד אותו ומבחן הרציפות מונע מהחלקים להתאחות דרכו, ואז
    # הוא נעשה עמודה עצמאית, מתויג "מסביב", ונעלם עם כפתור העין.
    # הסימן שזהו קטע פנימי ולא מדור עצמאי הוא ה"כריך": העמודה המקורית
    # חוזרת אחריו — שני אשכולות באותו גודל ובאותו תחום x, אחד מעליו
    # ואחד מתחתיו. מדור עצמאי (רב נסים גאון וכד') אינו כריך, שכן אחריו
    # לא שבה העמודה שמעליו.
    merged = True
    while merged:
        merged = False
        for b in groups:
            btop = min(l.top for l in b['lines'])
            bbot = max(l.top for l in b['lines'])
            above = below = None
            for g in groups:
                if g is b or _overlap_union(g, b) < 0.5:
                    continue
                gt = [l.top for l in g['lines']]
                if max(gt) <= btop and (above is None or max(gt) >
                                        max(l.top for l in above['lines'])):
                    above = g
                if min(gt) >= bbot and (below is None or min(gt) <
                                        min(l.top for l in below['lines'])):
                    below = g
            if above is None or below is None or above is below:
                continue
            if not same_size(above, below):
                continue
            above['x0'] = min(above['x0'], b['x0'], below['x0'])
            above['x1'] = max(above['x1'], b['x1'], below['x1'])
            above['lines'] += b['lines'] + below['lines']
            groups[:] = [g for g in groups if g is not b and g is not below]
            merged = True
            break

    return groups


def reattach(cs):
    """אשכול זעיר או אשכול דיבורי-פתיחה מתאחה לעמודת הגוף שהוא חופף.

    החפיפה האופקית לבדה אינה מספיקה: שורה בודדת בתחתית הדף חופפת
    אופקית גם עמודה שנמצאת מאות פיקסלים מעליה, ואיחוי כזה מותח עמודה
    על פני כל הדף — ואיתה מקטע שההדגשה שלו קופצת בין קצוות. נדרשת גם
    סמיכות אנכית לאחת משורות היעד, כמו בפיצול לעמודות.
    """
    if len(cs) < 2:
        return cs

    def near_v(g, c):
        tol = 4 * max(g['size'], c['size'])
        return any(abs(gl.top - cl.top) <= tol
                   for cl in c['lines'] for gl in g['lines'])

    body_sz = sorted(cs, key=lambda c: -len(c['lines']))[0]['size']
    i = len(cs) - 1
    while i >= 0 and len(cs) > 1:
        c = cs[i]
        tiny = len(c['lines']) <= 2
        # פותח: אשכול דיבורי-פתיחה מעוטרים — בהגדרה שורות בודדות;
        # בלי המגבלה, עמודת המשך בכתב מלא נבלעת בעמודת הכתב הקטן שלצדה
        opener = c['size'] >= 1.35 * body_sz and len(c['lines']) <= 4
        if tiny or opener:
            best, bo = None, 0
            for g in cs:
                if g is c or len(g['lines']) <= 2 or not near_v(g, c):
                    continue
                inter = min(c['x1'], g['x1']) - max(c['x0'], g['x0'])
                ov = inter / (c['x1'] - c['x0'])
                if ov > bo:
                    bo, best = ov, g
            if best and bo >= 0.6:
                best['lines'] += c['lines']
                del cs[i]
        i -= 1
    return cs


# ------------------------------------------------------------- זרימות
# עמודה מצטרפת לזרימה קיימת כשהיא המשך-קריאה שלה: מתחילה מיד מתחתיה,
# חופפת אותה אופקית (יחסית לצרה מבין השתיים), וכתובה באותו גוף-כתב.
# הבדיקה מלמעלה למטה כדי שהמשך-של-המשך ישתרשר. עמודה בלי הורה —
# מדור עצמאי ("מסביב").

def dom_size(lines):
    acc = {}
    for ln in lines:
        for w in ln.words:
            k = round(w.size, 1)
            acc[k] = acc.get(k, 0) + len(w.text)
    best, bv = 0, -1
    for k, v in acc.items():
        if v > bv:
            bv, best = v, k
    return best


def unit_of(lines, flow):
    x0 = min(l.x0 for l in lines)
    x1 = max(l.x1 for l in lines)
    bot = max(l.top for l in lines)
    # "מילוי" — כמה מרוחב העמודה תופסת שורתה האחרונה. פסקה שהסתיימה
    # מותירה שורה קצרה; עמודה שנגמר לה המקום נחתכת בשורה מלאה, והטקסט
    # שלה ממשיך הלאה. זה המבדיל כששתי עמודות נגמרות באותו גובה.
    last = [l for l in lines if abs(l.top - bot) < 2]
    lw = max(l.x1 for l in last) - min(l.x0 for l in last)
    return {'x0': x0, 'x1': x1, 'top': min(l.top for l in lines), 'bot': bot,
            'flow': flow, 'body': dom_size(lines),
            'fill': lw / max(1.0, x1 - x0)}


def chain_columns(cols, units, gsize):
    """משייך כל עמודה (ממוינות לפי top) לזרימה שהיא ממשיכה (או None).
    מחזיר [(עמודה, יחידה)]; היחידה נוספת ל-units כדי שהמשך-של-המשך
    ישתרשר."""
    out = []
    for col in sorted(cols, key=lambda c: min(l.top for l in c['lines'])):
        u = unit_of(col['lines'], None)
        w = u['x1'] - u['x0']
        best, best_key = None, None
        for prev in units:
            gap = u['top'] - prev['bot']
            if gap < -2 or gap > 4 * gsize:
                continue
            if abs(u['body'] - prev['body']) > 1.5:
                continue
            # טור שוליים ממשיך צר; עמודה רחבה ממנו בהרבה איננה המשכו —
            # היא המשך רש"י/תוס' בכתב הקטן, שגופו קרוב במקרה לשוליים
            if prev['flow'] in ('mr', 'ml') and \
                    w > 1.4 * (prev['x1'] - prev['x0']):
                continue
            # חפיפה יחסית לצר מבין השניים — המשך שמתרחב לרוחב מלא
            # עדיין חופף במלואו את ההורה הצר ממנו
            inter = min(u['x1'], prev['x1']) - max(u['x0'], prev['x0'])
            ov = inter / max(1, min(w, prev['x1'] - prev['x0']))
            if ov < 0.55:
                continue
            # סדר ההכרעה: קרבה אנכית, ואז "מי עוד רץ", ואז חפיפה.
            # החפיפה לבדה מצרפת לטור השגוי, כי רצועה ברוחב מלא בולעת
            # אופקית גם טור שאינו שייך לה. גם הקרבה לבדה אינה מספיקה:
            # כששתי עמודות נגמרות באותו גובה (רצועה מלאה שהופכת לרוחב
            # מלא), ההפרש ביניהן הוא פיקסלים בודדים ומקרי. המכריע אז
            # הוא המילוי — העמודה שנחתכה בשורה מלאה היא זו שהטקסט שלה
            # נמשך, ואילו זו שסיימה בשורה קצרה כבר תמה.
            key = (round(gap / max(1.0, gsize)), -prev.get('fill', 0), -ov)
            if best_key is None or key < best_key:
                best_key, best = key, prev
        u['flow'] = best['flow'] if best else None
        units.append(u)
        out.append((col, u))
    return out


# ------------------------------------------------------------ סדר קריאה

def reading_order(words):
    """קיבוץ לשורות ויזואליות בסובלנות של חצי גובה-מילה, ובתוך שורה
    מימין לשמאל — פורט של readingOrder מ-daf.js."""
    items = [w for w in words if w.text.strip()]
    if not items:
        return []
    hs = sorted(w.size for w in items)
    tol = 0.6 * hs[len(hs) // 2]
    items.sort(key=lambda w: w.top)
    rows, row, row_top = [], None, -1e9
    for w in items:
        if w.top - row_top > tol:
            row = []
            rows.append(row)
            row_top = w.top
        row.append(w)
    out = []
    for r in rows:
        r.sort(key=lambda w: -w.x1)
        out.extend(r)
    return out


# ------------------------------------------------------------- פילוח

def body_size(words):
    acc = {}
    for w in words:
        if w.square:
            continue
        k = round(w.size, 1)
        acc[k] = acc.get(k, 0) + len(w.text)
    best, bv = 11.2, -1
    for k, v in acc.items():
        if v > bv:
            bv, best = v, k
    return best


def dh_state(w, body):
    """True=ד"ה, False=גוף, None=ניטרלי (פיסוק — נגרר אחרי שכניו).
    הגוף להשוואה הוא של העמודה שהמילה חיה בה (colbody): זרימה שמאחה
    כתב מלא עם המשך בכתב הקטן נושאת שני גדלי-גוף שונים.
    בעמודה שרובה כתב מרובע (הכתב הקטן שבתחתית מקודד כמרובע) חוק
    "מרובע=ד"ה" חסר משמעות — שם ד"ה נקבע לפי גודל בלבד."""
    if not HEB.search(w.text):
        return None
    if w.colsq:
        return w.size >= (w.colbody or body) + 0.3
    if w.square and w.size >= 0.95 * w.line.size and w.heb_len() >= 2:
        return True
    if not w.square and w.size >= (w.colbody or body) + 0.3:
        return True
    return False


def segment_flow(words, prefix):
    """פילוח לדיבורי-המתחיל על פני זרימה שלמה, בסדר קריאה.
    מקטע 0 = המשך מהעמוד הקודם. מחזיר [{'id','words'}] בסדר קריאה."""
    body = body_size(words)
    seg, in_dh, dh_fam = 0, False, None
    segs = {}
    for w in words:
        dh = dh_state(w, body)
        # המשך ד"ה מרובע: בתוספות וילנא מילת הד"ה הראשונה גדולה והמשכו
        # מרובע קטן ממנה ("חד | לא מכתבן") — מבחן הגודל לבדו קוטע אותו.
        # מילה מרובעת באותה משפחת-גופן, מיד בתוך ריצת ד"ה — שייכת לד"ה.
        if dh is False and in_dh and w.square and not w.colsq \
                and w.fam == dh_fam and w.heb_len():
            dh = True
        if dh is None:
            dh = in_dh
        elif dh and not in_dh:
            seg += 1
        in_dh = dh
        if dh and w.square:
            dh_fam = w.fam
        elif not dh:
            dh_fam = None
        w.seg = prefix + str(seg)
        w.dh = dh
        segs.setdefault(w.seg, []).append(w)
    return [{'id': sid, 'words': ws} for sid, ws in segs.items()]


def segment_gemara(words):
    seg = 1
    for w in words:
        w.seg = 'g' + str(seg)
        if re.search(r':\s*$', w.text):
            seg += 1


# ------------------------------------------- עיגון מול הטקסט הדיגיטלי
# shastext/ הוא מקור בלתי-תלוי (מהדורה דיגיטלית) שבו רש"י והתוספות
# כבר מחולקים לדיבורים: <b>ד"ה -</b> טקסט. רשימת הד"ה שלו היא עוגן
# גלובלי. הייחוס הולך לפי עמוד הגמרא והדפוס גולש בין עמודים — לכן
# היישור נעשה מול חלון של שלושה עמודים (קודם, נוכחי, הבא).

NIKUD = re.compile(r'[֑-ׇ]')
PUNCT = re.compile(r'[^\sא-ת]')


def normalize(s):
    s = unicodedata.normalize('NFC', s)
    s = NIKUD.sub('', s)
    s = PUNCT.sub(' ', s)
    return ' '.join(s.split())


def parse_shastext(path):
    """מחזיר {'rashi': [dh...], 'tosafot': [dh...]} או None."""
    if not path.exists():
        return None
    t = path.read_text(encoding='utf-8', errors='replace')
    m = re.search(r'loadedGmaraText\("(.*)"\)', t, re.S)
    if not m:
        return None
    html = m.group(1).replace('\\"', '"').replace('\\/', '/') \
        .replace('\\\\', '\\')
    out = {}
    for key, pat in (('rashi', r'<b>\s*רש[״"]י\s*</b>'),
                     ('tosafot', r'<b>\s*תוספות\s*</b>')):
        ms = re.search(pat, html)
        if not ms:
            out[key] = []
            continue
        rest = html[ms.end():]
        entries = []
        for bm in re.finditer(r'<b>([^<]+)</b>', rest):
            txt = bm.group(1).strip()
            if txt.endswith('-'):
                entries.append(txt[:-1].strip())
            elif entries:
                break                       # כותרת המדור הבא
        out[key] = entries
    return out


def _sim(a, b):
    """דמיון בין ד"ה גיאומטרי לד"ה מהמקור — על תחיליות מנורמלות.
    הכלה ברמת מילים שלמות (הדפוס מקצר: "תפילין שבראש" מול
    "אלו תפילין שבראש") נחשבת התאמה מלאה."""
    na, nb = normalize(a), normalize(b)
    if not na or not nb:
        return 0.0
    wa, wb = na.split(), nb.split()
    short, long_ = (wa, wb) if len(wa) <= len(wb) else (wb, wa)
    if short and long_[:len(short)] == short:
        return 1.0                      # תחילית — התאמה מלאה
    if len(short) >= 2 and any(long_[i:i + len(short)] == short
                               for i in range(1, len(long_) - len(short) + 1)):
        return 1.0                      # הכלה פנימית — צירוף של 2+ מילים
    n = min(len(wa), len(wb), 4)
    return difflib.SequenceMatcher(
        None, ' '.join(wa[:n]), ' '.join(wb[:n])).ratio()


def align(geo, ref):
    """יישור רצפים (DP) בין הד"ה הגיאומטריים לרשימת המקור.
    מחזיר (זוגות, גיאומטריים-ללא-התאמה, מקור-ללא-התאמה) — באינדקסים."""
    n, m = len(geo), len(ref)
    GAP = -0.2
    score = [[0.0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        score[i][0] = i * GAP
    for j in range(1, m + 1):
        score[0][j] = j * GAP
    sims = [[_sim(g, r) for r in ref] for g in geo]
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            s = sims[i - 1][j - 1]
            match = score[i - 1][j - 1] + (s if s >= 0.6 else GAP * 2)
            score[i][j] = max(match, score[i - 1][j] + GAP,
                              score[i][j - 1] + GAP)
    pairs, i, j = [], n, m
    while i > 0 and j > 0:
        s = sims[i - 1][j - 1]
        if abs(score[i][j] - (score[i - 1][j - 1] +
                              (s if s >= 0.6 else GAP * 2))) < 1e-9:
            if s >= 0.6:
                pairs.append((i - 1, j - 1))
            i, j = i - 1, j - 1
        elif abs(score[i][j] - (score[i - 1][j] + GAP)) < 1e-9:
            i -= 1
        else:
            j -= 1
    pairs.reverse()
    gm = {p[0] for p in pairs}
    rm = {p[1] for p in pairs}
    return pairs, [k for k in range(n) if k not in gm], \
        [k for k in range(m) if k not in rm]


def geo_dh(seg):
    return ' '.join(w.text for w in seg['words'] if w.dh)


def anchor_flow(segs, ref_entries, log, matched_refs):
    """מיישר את מקטעי הזרימה מול חלון הייחוס ומתקן: מיזוג ד"ה שנקטע,
    פיצול ד"ה שפוספס (רק כשהוא שייך לעמוד הזה — בין שתי התאמות שלו).
    ref_entries: [(dh, tag)] כשה-tag מזהה את עמוד המקור של הרשומה.
    matched_refs: סט שנצבר של תגי-ייחוס שהותאמו (לדו"ח המסכת)."""
    numbered = [s for s in segs if int(s['id'][1:]) > 0]
    ref_dhs = [e[0] for e in ref_entries]
    geo_dhs = [geo_dh(s) for s in numbered]
    pairs, geo_un, ref_un = align(geo_dhs, ref_dhs)
    matched = len(pairs)
    unmatched = set(geo_un)
    for g, r in pairs:
        matched_refs.add(ref_entries[r][1])
    splits = merges = 0

    # --- מיזוג: ד"ה שנקטע באמצע ע"י מילות-גוף ("חד | לא מכתבן | מליה
    # בספר הזכרונות") נהפך לשני מקטעים עוקבים; כשצירופם משחזר ד"ה שלם
    # מהמקור — הם מקטע אחד, וכל מילות הד"ה מסומנות.
    still_ref_un = []
    for rk in ref_un:
        ref_norm = normalize(ref_dhs[rk])
        done = False
        for jj in range(len(numbered) - 1):
            s, nxt = numbered[jj], numbered[jj + 1]
            if jj not in unmatched or jj + 1 not in unmatched \
                    or not s['words'] or not nxt['words']:
                continue
            body_ws = [w for w in s['words'] if not w.dh]
            if len(body_ws) > 4:
                continue
            concat = normalize(
                ' '.join(w.text for w in s['words']) + ' ' +
                ' '.join(w.text for w in nxt['words'] if w.dh))
            if difflib.SequenceMatcher(None, concat,
                                       ref_norm).ratio() < 0.85:
                continue
            for w in s['words']:
                w.dh = True
            for w in nxt['words']:
                w.seg = s['id']
            s['words'] += nxt['words']
            nxt['words'] = []
            unmatched.discard(jj)
            unmatched.discard(jj + 1)
            merges += 1
            matched += 1
            matched_refs.add(ref_entries[rk][1])
            log.append({'fix': 'merge', 'dh': ref_dhs[rk], 'at': s['id']})
            done = True
            break
        if not done:
            still_ref_un.append(rk)

    # --- פיצול: ד"ה מהמקור שלא הותאם, ששתי ההתאמות שמסביבו יושבות
    # בעמוד הזה (כלומר הוא באמת כאן ולא גלש לעמוד אחר) — מילותיו
    # מחופשות ברצף בתוך גוף המקטעים שביניהן; מציאה חד-משמעית מפצלת.
    missed = []
    for rk in still_ref_un:
        prev_g = max((g for g, r in pairs if r < rk), default=None)
        next_g = min((g for g, r in pairs if r > rk), default=None)
        if prev_g is None and next_g is None:
            missed.append(rk)
            continue
        lo = prev_g if prev_g is not None else 0
        hi = next_g if next_g is not None else len(numbered) - 1
        window = [s for s in numbered[lo:hi + 1] if s['words']]
        if prev_g is None and segs and segs[0]['id'].endswith('0'):
            window = segs[:1] + window          # אולי בהמשך מהעמוד הקודם
        ref_words = normalize(ref_dhs[rk]).split()[:3]
        if not ref_words:
            continue
        hits = []
        for s in window:
            ws = s['words']
            for i in range(len(ws)):
                cand = [normalize(w.text) for w in ws[i:i + len(ref_words)]]
                if len(cand) == len(ref_words) and \
                        all(c and difflib.SequenceMatcher(
                            None, c, rw).ratio() >= 0.85
                            for c, rw in zip(cand, ref_words)):
                    if i > 0 or not ws[0].dh:   # לא בראש מקטע קיים
                        hits.append((s, i))
                    break
        if len(hits) == 1:
            s, i = hits[0]
            new_id = s['id'] + 'x%d' % rk       # ממוספר מחדש בהמשך
            for k, w in enumerate(s['words'][i:]):
                w.seg = new_id
                if k < len(ref_words):
                    w.dh = True
            splits += 1
            matched += 1
            matched_refs.add(ref_entries[rk][1])
            log.append({'fix': 'split', 'dh': ref_dhs[rk], 'at': s['id']})
        else:
            missed.append(rk)

    # --- שארית חסרת-סדר: המהדורה הדיגיטלית מסדרת לעיתים דיבורים
    # בסדר שונה מהדפוס, וה-DP שומר-הסדר מפסיד את הזוג. שארית מול
    # שארית מותאמת חופשי (הדמיון הטוב ביותר, ≥0.8) — בלי תיקון, רק
    # רישום ההתאמה.
    for rk in list(missed):
        best, bg = 0, None
        for gk in unmatched:
            s = _sim(geo_dhs[gk], ref_dhs[rk])
            if s >= 0.8 and s > best:
                best, bg = s, gk
        if bg is not None:
            unmatched.discard(bg)
            missed.remove(rk)
            matched += 1
            matched_refs.add(ref_entries[rk][1])
    for rk in missed:
        log.append({'miss': ref_dhs[rk]})
    for gk in sorted(unmatched):
        if geo_dhs[gk]:
            log.append({'extra': geo_dhs[gk]})
    return matched, splits, merges


def renumber(words, prefix):
    """מספור מחדש רציף אחרי מיזוגים/פיצולים — לפי סדר הקריאה בפועל."""
    mapping, nxt = {}, 0
    first = True
    for w in words:
        if w.seg not in mapping:
            if first and not w.dh:
                mapping[w.seg] = prefix + '0'      # המשך מהעמוד הקודם
            else:
                nxt += 1
                mapping[w.seg] = prefix + str(nxt)
        first = False
        w.seg = mapping[w.seg]


# --------------------------------------------- הכרעת משפחה לפי הייחוס
# תוויות rashi/tosafot נגזרות מצד העמודה — אבל התוכן לא תמיד מציית:
# כשאין תוספות בעמוד, רש"י תופס את שתי הכנפיים. הייחוס מכריע: כל כנף
# משויכת למשפחה שרשימת הד"ה שלה מתאימה לה. שתי כנפיים מאותה משפחה —
# זרימה אחת, בסדר שהייחוס קובע.

def family_score(dhs, ref_list):
    score = 0
    for d in dhs:
        if any(_sim(d, r) >= 0.8 for r in ref_list):
            score += 1
    return score


def family_of(dl, window):
    """המשפחה שרשימת ד"ה שייכת לה לפי הייחוס, או None כשאין הכרעה.

    תיוג-מחדש הוא פעולה הרסנית (מזיז טקסט בין רש"י לתוספות), ולכן
    ההכרעה שמרנית בכפליים: מצביעים רק ד"ה איכותיים (2+ מילים —
    התאמת מילה בודדת היא רעש), ונדרשות לפחות 3 התאמות, רוב של 75%,
    ופי שניים מהמשפחה השנייה. בספק — None, והתוויות נשארות כמות שהן:
    הכשל הבטוח הוא אי-מיזוג, לא מיזוג שגוי."""
    strong = [d for d in dl if len(normalize(d).split()) >= 2]
    if len(strong) < 3:
        return None
    rs = family_score(strong, [e[0] for e in window['rashi']])
    ts = family_score(strong, [e[0] for e in window['tosafot']])
    if rs >= 3 and rs >= 0.75 * len(strong) and rs >= 2 * max(ts, 1):
        return 'rashi'
    if ts >= 3 and ts >= 0.75 * len(strong) and ts >= 2 * max(rs, 1):
        return 'tosafot'
    return None


def rescue_family(dl, window):
    """כלל משני לחילוץ עמודות בלבד (לא לתיוג-מחדש של כנפיים): עמודת
    המשך קטנה נושאת לעיתים רק 2–3 דיבורים, מעט מדי לכלל הראשי. כאן
    הדיוק מחליף את הכמות — לפחות שתי התאמות מושלמות (sim≥0.95) של
    ד"ה רב-מילים, אפס התאמות למשפחה השנייה, ורוב מהד"ה האיכותיים.
    השער הגיאומטרי (חפיפה לזרימת היעד) נבדק בנפרד אצל הקורא."""
    strong = [d for d in dl if len(normalize(d).split()) >= 2]
    if len(strong) < 2:
        return None
    for fam in ('rashi', 'tosafot'):
        other = 'tosafot' if fam == 'rashi' else 'rashi'
        perfect = sum(1 for d in strong
                      if any(_sim(d, e[0]) >= 0.95 for e in window[fam]))
        cross = family_score(strong, [e[0] for e in window[other]])
        if perfect >= 2 and cross == 0 and perfect >= 0.6 * len(strong):
            return fam
    return None


def med_pos(dl, ref_list):
    """מיקום חציוני של רשימת ד"ה בתוך רצף הייחוס — קובע סדר קריאה
    בין חלקי זרימה מפוצלת."""
    pos = []
    for d in dl:
        best, bi = 0, None
        for i, r in enumerate(ref_list):
            s = _sim(d, r)
            if s >= 0.8 and s > best:
                best, bi = s, i
        if bi is not None:
            pos.append(bi)
    pos.sort()
    return pos[len(pos) // 2] if pos else 1e9


def resolve_families(page, window):
    """מחזיר רשימת פעולות שבוצעו (לדו"ח); ממזג/מחליף זרימות במקום."""
    acts = []
    flows = page['flows']
    dhs = {}
    for fid in ('r', 't'):
        if fid in flows:
            dhs[fid] = [geo_dh(s) for s in page['segs'][fid]
                        if int(s['id'][1:]) > 0 and geo_dh(s)]
    if not dhs:
        return acts
    fam = {fid: family_of(dl, window) for fid, dl in dhs.items()}
    default = {'r': 'rashi', 't': 'tosafot'}
    eff = {fid: fam.get(fid) or default[fid] for fid in dhs}
    if len(eff) == 2 and eff['r'] == eff['t']:
        # שתי הכנפיים משפחה אחת — מיזוג לזרימה אחת בסדר שהייחוס קובע:
        # הכנף שהד"ה שלה מתאימים לרשומות מוקדמות יותר קוראת ראשונה
        ref_list = [e[0] for e in window[eff['r']]]
        order = sorted(['r', 't'], key=lambda f: med_pos(dhs[f], ref_list))
        keep, other = order[0], order[1]
        final = 'r' if eff['r'] == 'rashi' else 't'
        zone = 'rashi' if final == 'r' else 'tosafot'
        merged_words = page['ordered'][keep] + page['ordered'][other]
        flows[keep]['cols'] += flows[other]['cols']
        flows[keep]['zone'] = zone
        for l in (l for c in flows[keep]['cols'] for l in c):
            l.zone = zone
            l.flow = final
        if final != keep:
            flows[final] = flows.pop(keep)
        if other in flows and other != final:
            del flows[other]
        page['ordered'][final] = merged_words
        page['ordered'].pop(other if other != final else keep, None)
        if keep != final:
            page['ordered'].pop(keep, None)
        page['segs'][final] = segment_flow(merged_words, final)
        page['segs'].pop(other if other != final else keep, None)
        if keep != final:
            page['segs'].pop(keep, None)
        acts.append({'relabel': 'both-' + eff['r'],
                     'order': [order[0], order[1]]})
    elif len(eff) == 2 and eff['r'] == 'tosafot' and eff['t'] == 'rashi':
        # החלפה מלאה — צד רש"י שגוי בדף
        flows['r'], flows['t'] = flows['t'], flows['r']
        page['ordered']['r'], page['ordered']['t'] = \
            page['ordered']['t'], page['ordered']['r']
        for fid, zone in (('r', 'rashi'), ('t', 'tosafot')):
            for l in (l for c in flows[fid]['cols'] for l in c):
                l.zone = zone
                l.flow = fid
            page['segs'][fid] = segment_flow(page['ordered'][fid], fid)
        acts.append({'relabel': 'swap'})

    # --- חילוץ עמודות "מסביב" שהייחוס מזהה כרש"י/תוספות: רש"י המודפס
    # בשתי עמודות זו-לצד-זו — העמודה השנייה נכשלת בשרשור האנכי ונופלת
    # ל"מסביב"; רשימת הד"ה שלה מכריעה, והיא ממוזגת לזרימה במקומה
    # בסדר הקריאה (לפי מיקום הד"ה שלה ברצף הייחוס).
    for sid in [f for f in list(flows) if f.startswith('s')]:
        ssegs = page['segs'].get(sid)
        if not ssegs:
            continue
        dl = [geo_dh(s) for s in ssegs
              if s['id'].rsplit('-', 1)[-1] != '0' and geo_dh(s)]
        fam2 = family_of(dl, window) or rescue_family(dl, window)
        if not fam2:
            continue
        target = 'r' if fam2 == 'rashi' else 't'
        ref_list = [e[0] for e in window[fam2]]
        # אימות גיאומטרי: המשך אמיתי של זרימה חופף אותה אופקית (עמודה
        # שנייה לצדה או המשך רחב מתחתיה). עמודה מצדו האחר של הדף שד"ה
        # שלה תואמים במקרה — נפסלת גם כשההצבעה עברה.
        if target in flows:
            tu = unit_of([l for c in flows[target]['cols'] for l in c],
                         None)
            su = unit_of([l for c in flows[sid]['cols'] for l in c], None)
            inter = min(tu['x1'], su['x1']) - max(tu['x0'], su['x0'])
            narrow = max(1, min(tu['x1'] - tu['x0'], su['x1'] - su['x0']))
            if inter / narrow < 0.3:
                continue
        if target in flows:
            tdl = [geo_dh(s) for s in page['segs'].get(target, [])
                   if geo_dh(s)]
            parts = sorted(
                [(med_pos(tdl, ref_list), page['ordered'][target]),
                 (med_pos(dl, ref_list), page['ordered'][sid])],
                key=lambda p: p[0])
            merged = parts[0][1] + parts[1][1]
            flows[target]['cols'] += flows[sid]['cols']
        else:
            merged = page['ordered'][sid]
            flows[target] = {'zone': fam2, 'cols': flows[sid]['cols']}
        flows[target]['zone'] = fam2
        for l in (l for c in flows[target]['cols'] for l in c):
            l.zone = fam2
            l.flow = target
        del flows[sid]
        page['ordered'][target] = merged
        page['ordered'].pop(sid, None)
        page['segs'][target] = segment_flow(merged, target)
        page['segs'].pop(sid, None)
        acts.append({'rescue': sid, 'to': target})
    return acts


# --------------------------------------------------------------- עמוד שלם

def analyze_page(html, size_hint=None):
    """שלב א: סיווג, עמודות, זרימות ופילוח גיאומטרי. מחזיר מבנה עמוד."""
    raw_lines, lines, page_idx, page_w, side = parse_page(html)
    page = {'raw': raw_lines, 'lines': lines, 'page_idx': page_idx,
            'flows': {}, 'ordered': {}, 'segs': {},
            'rep': {'lines': len(lines)}}
    if not lines or page_idx is None:
        page['rep']['error'] = 'no daf-page'
        return page

    # בקרת שלמות: כל שורה וכל מילה שבקובץ חייבות להיקלט. סטייה פירושה
    # פורמט לא צפוי — העמוד מדולג ונשאר לא-מועשר, במקום אובדן שקט.
    n_div = sum(1 for raw in raw_lines if raw.startswith('<div class="ln"'))
    n_span = sum(raw.count('<span class="w ') for raw in raw_lines)
    n_words = sum(len(l.words) for l in lines)
    if len(lines) != n_div or n_words != n_span:
        page['rep']['error'] = 'parse-loss: lines %d/%d words %d/%d' % (
            len(lines), n_div, n_words, n_span)
        return page

    gb, gsize, kept = gemara_metrics(lines, size_hint)
    near_gem = make_near_gem(gb, gsize, kept)
    # ציר הגמרא — חציון מרכזי שורות הגמרא ולא מרכז הקופסה: המשפט האחרון
    # של הגמרא נמשך לעיתים לרוחב מלא ומטה את הקופסה, והחציון עמיד לכך.
    gem_cx = None
    if kept:
        cs = sorted((l.x0 + l.x1) / 2 for l in kept)
        gem_cx = cs[len(cs) // 2]
    for ln in lines:
        ln.zone = classify(ln, gb, side, gsize, near_gem, gem_cx)

    # רצועות השוליים — אשכולות צרים צמודי-שול בולעים שורות רש"י/תוס'
    # שיושבות בתוכם גיאומטרית (כמו ב-daf.js). הרצועות נשמרות כדי לסמן
    # בהמשך גם את כותרות המדורים שבראש הדף כ"מסביב".
    page['bands'] = []
    banded = set()
    for mside in ('margin-left', 'margin-right'):
        cols = [l for l in lines if l.zone == mside]
        if not cols:
            continue
        for g in split_columns(cols, lines):
            if g['x1'] - g['x0'] > 0.25 * page_w:
                continue
            edge = g['x0'] <= 0.2 * page_w if mside == 'margin-left' \
                else g['x1'] >= 0.8 * page_w
            if not edge:
                continue
            lo, hi = g['x0'] - 2, g['x1'] + 2
            page['bands'].append((lo, hi))
            banded.add(mside)
            for l in lines:
                if l.zone in ('rashi', 'tosafot') and \
                        lo <= l.x0 and l.x1 <= hi:
                    l.zone = mside

    # והכיוון ההפוך: השוליים הם רצועות בשולי הדף, ומבחן הגודל לבדו
    # מזהה אותם רק בקירוב — בלוק קטן בתוך טור הפירוש (הגהה, תוספת
    # בסוגריים) נופל מתחת לסף ומוגלה לשוליים, ומשם הוא מתויג "מסביב"
    # ונעלם עם כפתור העין. בכתובות יז. הפרש הגדלים היה 0.005 נקודה.
    # שורה שסווגה שוליים אך אינה יושבת באף רצועה אמיתית חוזרת לטור
    # שהיא בתוכו. נבדק רק בצד שבו נמצאה רצועה: אם הזיהוי נכשל שם
    # לגמרי, עדיף להשאיר כמות שהיה מאשר להציף את הגפ"ת בשוליים.
    for l in lines:
        if l.zone not in banded:
            continue
        if any(lo - 12 <= l.x0 and l.x1 <= hi + 12
               for lo, hi in page['bands']):
            continue
        right = (l.x0 + l.x1) / 2 > (gb['x0'] + gb['x1']) / 2
        l.zone = 'rashi' if (side == 'right') == right else 'tosafot'

    by_zone = {}
    for ln in lines:
        by_zone.setdefault(ln.zone, []).append(ln)

    units, flows, surr_seq = [], {}, 0

    def new_surr():
        nonlocal surr_seq
        surr_seq += 1
        return 's' + str(surr_seq)

    # פיצול עמודות על איחוד רש"י+תוספות, ושיוך אזור ברמת העמודה: חלוקה
    # לפי צד של כל שורה לבדה תולשת מילת ד"ה שחוצה את קו האמצע מעמודתה
    # ("לא" של "לא יערענו"); כשקודם נבנות העמודות ורק אז נקבע הצד —
    # המילה נבלעת בעמודתה עוד קודם, והעמודה כולה מסווגת יחד.
    gefet = [l for l in lines
             if l.zone in ('rashi', 'tosafot')]
    zone_cols = {'rashi': [], 'tosafot': []}
    if gefet:
        mid = (gb['x0'] + gb['x1']) / 2
        for col in reattach(split_columns(gefet, lines)):
            cx = (col['x0'] + col['x1']) / 2
            right = cx > mid
            zone = 'rashi' if (side == 'right') == right else 'tosafot'
            for l in col['lines']:
                l.zone = zone
            zone_cols[zone].append(col)

    for zone, fid in (('rashi', 'r'), ('tosafot', 't')):
        cs = zone_cols[zone]
        if not cs:
            continue
        cs.sort(key=lambda c: -len(c['lines']))
        main, extras = cs[0], cs[1:]
        flows[fid] = {'zone': zone, 'cols': [main['lines']]}
        units.append(unit_of(main['lines'], fid))
        # עמודה נוספת שהיא המשך אנכי של הראשית — מצטרפת לזרימה
        # (דיבור שמתפרס על רוחבים שונים); צמודת-צד — מדור "מסביב"
        for col, u in chain_columns(extras, units, gsize):
            if u['flow'] in flows and flows[u['flow']]['zone'] in \
                    ('rashi', 'tosafot'):
                flows[u['flow']]['cols'].append(col['lines'])
            else:
                sid = new_surr()
                u['flow'] = sid
                flows[sid] = {'zone': zone + '-x', 'cols': [col['lines']],
                              'surround': True}

    for mside, fid in (('margin-right', 'mr'), ('margin-left', 'ml')):
        if by_zone.get(mside):
            flows[fid] = {'zone': mside, 'cols': [by_zone[mside]],
                          'surround': True, 'noseg': True}
            units.append(unit_of(by_zone[mside], fid))

    bottom = by_zone.get('bottom', [])
    if bottom:
        for col, u in chain_columns(reattach(split_columns(bottom, lines)),
                                    units, gsize):
            fid = u['flow']
            if fid in flows:      # המשך רש"י/תוס' — או של מדור שוליים
                flows[fid]['cols'].append(col['lines'])
            else:
                sid = new_surr()
                u['flow'] = sid
                flows[sid] = {'zone': 'bottom-x', 'cols': [col['lines']],
                              'surround': True}

    if by_zone.get('gemara'):
        flows['g'] = {'zone': 'gemara', 'cols': [by_zone['gemara']],
                      'noseg': True}
    if by_zone.get('header'):
        flows['h'] = {'zone': 'header', 'cols': [by_zone['header']],
                      'noseg': True}

    page['flows'] = flows
    for fid, fl in flows.items():
        ordered = []
        for col in fl['cols']:
            cw = [w for l in col for w in l.words]
            sq_n = sum(w.heb_len() for w in cw if w.square)
            rs_n = sum(w.heb_len() for w in cw if not w.square)
            colsq = sq_n > 2 * max(rs_n, 1)
            if colsq:                     # גוף = שכיח המרובעים
                acc = {}
                for w in cw:
                    if w.square:
                        k = round(w.size, 1)
                        acc[k] = acc.get(k, 0) + len(w.text)
                cb = max(acc, key=acc.get) if acc else 11.2
            else:
                cb = body_size(cw)
            for w in cw:
                w.colbody = cb
                w.colsq = colsq
            ordered.extend(reading_order(cw))
        page['ordered'][fid] = ordered
        for l in (l for col in fl['cols'] for l in col):
            l.flow = fid
        if fid == 'g':
            segment_gemara(ordered)
        elif not fl.get('noseg'):
            prefix = fid if fid in ('r', 't') else fid + '-'
            page['segs'][fid] = segment_flow(ordered, prefix)
    return page


def finalize_page(page, window, matched_refs):
    """שלב ב: הכרעת משפחות ועיגון (אם יש ייחוס), מספור סדר-קריאה,
    והזרקת ה-attributes. מחזיר את ה-HTML המועשר."""
    rep = page['rep']
    if 'error' in rep:
        return '\n'.join(page['raw'])
    anchor_log = []
    if window:
        acts = resolve_families(page, window)
        if acts:
            rep['family'] = acts
        for fid in ('r', 't'):
            if fid not in page['segs']:
                continue
            zone = page['flows'][fid]['zone']
            matched, splits, merges = anchor_flow(
                page['segs'][fid], window[zone], anchor_log, matched_refs)
            renumber(page['ordered'][fid], fid)
            rep.setdefault('anchorstats', {})[fid] = {
                'matched': matched, 'splits': splits, 'merges': merges}
    if anchor_log:
        rep['anchor'] = anchor_log

    # מספור סדר-קריאה גלובלי לעמוד: גמרא, רש"י, תוספות, שוליים,
    # מדורי "מסביב", ולבסוף הכותרת
    flows = page['flows']
    order = [f for f in ('g', 'r', 't', 'mr', 'ml') if f in flows] + \
        [f for f in flows if f not in ('g', 'r', 't', 'mr', 'ml', 'h')] + \
        (['h'] if 'h' in flows else [])
    idx = 0
    for fid in order:
        for w in page['ordered'].get(fid, []):
            w.idx = idx
            idx += 1
    # רשת ביטחון: מילה שנשמטה מכל זרימה מקבלת אינדקס אף היא
    for ln in page['lines']:
        for w in ln.words:
            if w.idx is None:
                w.idx = idx
                idx += 1

    rep['flows'] = {fid: {'cols': len(fl['cols']),
                          'segs': len({w.seg for w in
                                       page['ordered'].get(fid, [])
                                       if w.seg})}
                    for fid, fl in flows.items()}

    # ---- הזרקה חזרה לקובץ — כירורגיית מחרוזות, שום דבר אחר לא זז
    raw_lines = page['raw']
    for i, raw in enumerate(raw_lines):
        if i == page['page_idx']:
            clean = STRIP_RE.sub('', raw)
            raw_lines[i] = clean.replace('<div class="daf-page"',
                                         '<div class="daf-page"'
                                         ' data-segv="1"', 1)
    for ln in page['lines']:
        raw = STRIP_RE.sub('', raw_lines[ln.file_idx])
        m = LN_RE.match(raw)
        widx = 0

        def rebuild(wm):
            nonlocal widx
            w = ln.words[widx]
            widx += 1
            # data-i רק למילים בנות-בחירה — סדר ההעתקה והגרירה חי בתוך
            # מקטע; לשאר המילים (שוליים, כותרת) הוא משקל מת בקובץ
            extra = ''
            if w.seg:
                extra = ' data-i="%d" data-seg="%s"' % (w.idx, w.seg)
            if w.dh:
                extra += ' data-dh="1"'
            return ('<span class="w %s" style="%s" data-w="%s"%s>%s</span>%s'
                    % (wm.group(1), wm.group(2), wm.group(3), extra,
                       wm.group(4), wm.group(5)))

        inner = W_RE.sub(rebuild, m.group(7))
        head = raw[:raw.index('>') + 1]
        zattr = ' data-zone="%s" data-flow="%s"' % (ln.zone, ln.flow or '')
        # "מסביב" (מה שכפתור העין מסתיר) נצרב אף הוא: השוליים והמשכיהם,
        # המדורים העצמאיים, וכותרות המדורים שבתוך רצועת שוליים — כדי
        # שבזמן-ריצה לא תישאר שום היוריסטיקה
        surround = ln.flow in ('mr', 'ml') or \
            (ln.flow or '').startswith('s') or \
            (ln.zone == 'header' and any(
                lo - 12 <= ln.x0 and ln.x1 <= hi + 12
                for lo, hi in page.get('bands', [])))
        if surround:
            zattr += ' data-surround="1"'
        head = head[:-1] + zattr + '>'
        raw_lines[ln.file_idx] = head + inner + '</div>'
    return '\n'.join(raw_lines)


# ------------------------------------------------------------------ CLI

def load_page_counts():
    """מספר העמודים האמיתי לכל מסכת, מטבלת talmud של המציג. בתיקיות
    הדפים יש גם קבצים תועים שמעבר לטווח (שאריות ייצור, למשל עותק כפול
    של יומא בתיקיית ר"ה) — האפליקציה לא ניגשת אליהם ואין לעבד אותם."""
    try:
        t = (ROOT / 'code' / 'js' / 'default.js').read_text(encoding='utf-8')
        m = re.search(r'var talmud = \[(.*?)\];', t, re.S)
        return [int(c) for c in
                re.findall(r'\[\s*"[^"]*"\s*,\s*(\d+)', m.group(1))]
    except Exception:                        # noqa: BLE001
        return None


def load_ref(mas, pg):
    return parse_shastext(ROOT / 'shastext' / 'gmara1' / str(mas) /
                          ('%s.js' % pg))


def make_window(mas, pg):
    """חלון הייחוס: העמוד הקודם, הנוכחי והבא — עם תגי מקור."""
    win = {'rashi': [], 'tosafot': []}
    found = False
    for d in (-1, 0, 1):
        ref = load_ref(mas, int(pg) + d)
        if not ref:
            continue
        if d == 0:
            found = bool(ref['rashi'] or ref['tosafot'])
        for key in ('rashi', 'tosafot'):
            win[key] += [(dh, '%s:%s:%d' % (int(pg) + d, key, k))
                         for k, dh in enumerate(ref[key])]
    return win if (win['rashi'] or win['tosafot']) else None, found


def masechet_gsize(mas):
    """גודל הגמרא האופייני למסכת — חציון הזיהוי בכל עמודיה.

    הגופן קבוע לאורך המסכת בדפוס, ולכן החציון הוא הערך הנכון; העמודים
    הבודדים שהזיהוי בהם נכשל (עמוד שרובו פירושים) אינם מזיזים אותו.
    החישוב נעשה תמיד על כל עמודי המסכת — גם בהרצת עמוד בודד — כדי
    שהתוצאה לא תשתנה לפי מה שביקשו לעבד.
    """
    sizes = []
    for f in sorted((ROOT / 'daf' / str(mas)).glob('*.html.gz')):
        try:
            html = gzip.decompress(f.read_bytes()).decode('utf-8')
            lines = parse_page(html)[1]
            if lines:
                sizes.append(gemara_metrics(lines)[1])
        except Exception:                    # noqa: BLE001
            pass
    if not sizes:
        return None
    sizes.sort()
    return sizes[len(sizes) // 2]


def run_masechet(mas, pages, out_dir, dry, report_path):
    report, matched_refs = {}, set()
    hint = masechet_gsize(mas)
    for pg in pages:
        src = ROOT / 'daf' / str(mas) / ('%s.html.gz' % pg)
        try:
            html = gzip.decompress(src.read_bytes()).decode('utf-8')
            page = analyze_page(html, hint)
            window, ref_found = make_window(mas, pg)
            enriched = finalize_page(page, window, matched_refs)
            page['rep']['ref_found'] = ref_found
            report[pg] = page['rep']
            if not dry:
                dst = Path(out_dir) / str(mas) / ('%s.html.gz' % pg) \
                    if out_dir else src
                dst.parent.mkdir(parents=True, exist_ok=True)
                dst.write_bytes(gzip.compress(enriched.encode('utf-8'),
                                              9, mtime=0))
        except Exception as e:               # noqa: BLE001
            report[pg] = {'error': repr(e)}
        r = report[pg]
        stats = r.get('anchorstats', {})
        msg = ' '.join(
            '%s:%s' % (f, v['segs']) +
            ('(%d✓+%d/%d)' % (stats[f]['matched'], stats[f]['splits'],
                              stats[f]['merges']) if f in stats else '')
            for f, v in r.get('flows', {}).items() if v.get('segs'))
        extras = ['relabel'] if 'family' in r else []
        if 'error' in r:
            extras.append('ERROR ' + r['error'])
        print('%s/%s  %s  %s' % (mas, pg, msg, ' '.join(extras)))

    # דו"ח מסכת: רשומות ייחוס שלא הותאמו בשום עמוד — פספוסים אמיתיים
    unmatched_by_page = {}
    for pg in pages:
        ref = load_ref(mas, pg)
        if not ref:
            continue
        for key in ('rashi', 'tosafot'):
            for k, dh in enumerate(ref[key]):
                tag = '%s:%s:%d' % (pg, key, k)
                if tag not in matched_refs:
                    unmatched_by_page.setdefault(pg, []).append(
                        {'flow': key, 'dh': dh})
    summary = {'pages': len(report),
               'errors': [p for p, r in report.items() if 'error' in r],
               'relabeled': [p for p, r in report.items() if 'family' in r],
               'ref_unmatched': unmatched_by_page}
    out = {'summary': summary, 'pages': report}
    rp = Path(report_path) if report_path else \
        Path(__file__).parent / 'report' / ('%s.json' % mas)
    rp.parent.mkdir(parents=True, exist_ok=True)
    rp.write_text(json.dumps(out, ensure_ascii=False, indent=1))
    un = sum(len(v) for v in unmatched_by_page.values())
    print('== %s: %d pages, %d errors, %d relabeled, %d ref-unmatched' %
          (mas, len(report), len(summary['errors']),
           len(summary['relabeled']), un))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('masechta', nargs='?')
    ap.add_argument('page', nargs='?')
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--out', help='write to another dir (default in-place)')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--report')
    args = ap.parse_args()

    if args.all:
        masechtot = sorted((p.name for p in (ROOT / 'daf').iterdir()
                            if p.is_dir() and p.name.isdigit()), key=int)
    elif args.masechta is not None:
        masechtot = [args.masechta]
    else:
        ap.error('masechta or --all required')

    counts = load_page_counts()
    for mas in masechtot:
        pages = [args.page] if args.page else sorted(
            (p.stem.split('.')[0] for p in
             (ROOT / 'daf' / mas).glob('*.html.gz')), key=int)
        if not args.page and counts and int(mas) < len(counts):
            limit = counts[int(mas)]
            stray = [p for p in pages if int(p) >= limit]
            pages = [p for p in pages if int(p) < limit]
            if stray:
                print('%s: skipping %d stray pages beyond the talmud '
                      'table (%s..)' % (mas, len(stray), stray[0]))
        run_masechet(mas, pages, args.out, args.dry_run, args.report)


if __name__ == '__main__':
    main()
