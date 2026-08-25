#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fixtext.py — תיקון נקודתי של שיבוש אותיות בעמוד בודד.

הרקע: בעמוד מעילה כב. (הקיים פעמיים — daf/35/40 ו-daf/36/0, כי מעילה
מסתיימת בו וקינים מתחילה) טבלת ה-ToUnicode שב-PDF המקורי מתייגת חלק
מגליפי ה-נ' כ-ן' או כ-ך'. זו תקלה בקובץ המקור ולא במחולל: MuPDF מפענח
לפי מה שה-PDF מצהיר, והמחולל אינו יכול לדעת שההצהרה שקרית. (נבדק גם
הכיוון של מיזוג תתי-הגופן ב-build_fixmaps — תיקון שם החמיר את המצב
מ-21 מילים ל-56, ולכן נדחה.)

היקף: סריקת כל 5,407 עמודי הש"ס העלתה 465 חריגות של אות סופית שאינה
בסוף מילה. 46 מהן (23 בכל עותק) הן העמוד הזה; כל השאר הן מילים תקינות
שנדבקו זו לזו בלי רווח ("מקטיניןועושים", "(דףיט.)") — שם האותיות
נכונות ורק הרווח חסר, ואין מה לתקן באותיות.

הכלל: אות סופית (ךםןףץ) שאחריה אות עברית היא בלתי אפשרית בעברית.
בעמוד הזה כל 23 המקרים הם נ' שהתחלפה, ולכן ההחלפה היא ל-נ'. 11 מהם
אומתו מילה-במילה מול טקסט ספריא (Meilah 22a / Mishnah Kinnim 1),
והשאר הם מילים חד-משמעיות בפירושים (רבינו, אחרונה, יוחנן, נר מצוה).

הסקריפט מוגבל לשני הקבצים האלה בלבד, מדווח כל החלפה, ואידמפוטנטי.

    python3 tools/fixtext.py [--dry-run]
"""

import argparse
import gzip
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# העמודים היחידים שבהם התגלה השיבוש — אותו עמוד פיזי, שני עותקים
TARGETS = ['daf/35/40.html.gz', 'daf/36/0.html.gz']

# אות סופית שאחריה אות עברית — בעמוד הזה תמיד נ' משובשת
DEFECT = re.compile(r'[ךן](?=[א-ת])')
SPAN = re.compile(r'(<span class="w [^"]*"[^>]*>)([^<]*)(</span>)')


def fix_page(path, dry):
    html = gzip.decompress(path.read_bytes()).decode('utf-8')
    changes = []

    def repl(m):
        head, text, tail = m.groups()
        fixed = DEFECT.sub('נ', text)
        if fixed != text:
            changes.append((text, fixed))
        return head + fixed + tail

    out = SPAN.sub(repl, html)
    if changes and not dry:
        path.write_bytes(gzip.compress(out.encode('utf-8'), 9, mtime=0))
    return changes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()
    total = 0
    for rel in TARGETS:
        p = ROOT / rel
        if not p.exists():
            print('חסר: %s' % rel, file=sys.stderr)
            continue
        ch = fix_page(p, args.dry_run)
        total += len(ch)
        print('%s — %d החלפות' % (rel, len(ch)))
        for before, after in ch:
            print('    %-14s -> %s' % (before, after))
    print('סה"כ %d החלפות%s' % (total, ' (הרצת יובש)' if args.dry_run else ''))


if __name__ == '__main__':
    main()
