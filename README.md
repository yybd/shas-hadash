# ש"ס חדש — צורת הדף

מציג התלמוד הבבלי בצורת הדף המסורתית, כ-HTML סטטי: כל עמוד הוא קובץ
`daf/<מסכת>/<עמוד>.html.gz` שבו כל ריצת-טקסט ממוקמת אבסולוטית לפי
מיקומה המדויק בדפוס וילנא. הלוגיקה כולה רצה בדפדפן בזמן טעינה.

**זהו מקור האמת היחיד** — הריפו משמש כ-git submodule בשני פרויקטים:

| פרויקט | נתיב ה-submodule | תפקיד |
|---|---|---|
| talmud-ai — הש"ס עם חברותא AI | `public/shas-hadash` | **ריפו העבודה** — כאן עורכים |
| [sfarim](https://github.com/yybd/sfarim) — אפליקציית ספרים | `public/shas-hadash` | **צרכן בלבד** — רק מושך |

## נוהל עדכון — עובדים במקום אחד בלבד

הכלל: **כל עריכה נעשית מתוך talmud-ai. בsfarim לא עורכים לעולם** —
הוא רק מושך את מה שכבר נדחף. שני עותקי-עבודה שעורכים בהם במקביל הם
הדרך הבטוחה לקומיטים תלושים ולמצביעים סותרים.

### 1. לערוך ולדחוף — מתוך talmud-ai

```bash
cd ~/Developer/AI/talmud-ai/public/shas-hadash
git checkout master          # ודא שאתה על ענף, לא על קומיט תלוש
# ...לערוך...
git add -A && git commit -m "..." && git push

cd ~/Developer/AI/talmud-ai
git add public/shas-hadash && git commit -m "עדכון הש\"ס — ..." && git push
```

**סדר הדחיפה קריטי:** קודם ה-submodule, רק אחר כך הפרויקט. פרויקט
שמצביע על קומיט שלא נדחף ייתן שגיאה בכל שכפול.

### הכלל שמונע נפיחות: לצבור, לאמת, לדחוף פעם אחת

הדפים הם ~220MB של קובצי `.gz`, ו-git אינו יכול לדחוס אותם. **כל
הרצת העשרה מלאה שנדחפת מוסיפה ~100MB להיסטוריה — לצמיתות.** ריפו
שהגיע ל-616MB רוסק פעם אחת בחזרה ל-243MB; אין רצון לחזור לשם.

לכן, כשעובדים על אלגוריתם הפילוח:

```bash
# 1. לצבור — מתקנים הכל, בלי לגעת ב-daf/
#    (עורכים רק tools/enrich/enrich.py)

# 2. לאמת בתיקייה חיצונית — לעולם לא במקום
python3 tools/enrich/enrich.py --all --out /tmp/check
#    משווים, בודקים, מתקנים שוב, ומריצים שוב ל-/tmp

# 3. רק כשהכל נכון — מחילים ודוחפים פעם אחת
python3 tools/enrich/enrich.py --all
git add -A && git commit -m "..." && git push
```

הרצת ביניים אחת ל-`--out` עולה זמן בלבד; הרצת ביניים אחת שנדחפת עולה
100MB לנצח. אם כבר נדחפו כמה סבבים — אפשר לרסק שוב (ראה למטה).

### 2. למשוך לsfarim — פקודה אחת, בלי לערוך

```bash
cd ~/Developer/tauri/sfarim
git submodule update --remote public/shas-hadash
git add public/shas-hadash && git commit -m "עדכון הש\"ס" && git push
```

`--remote` מושך את קצה `master` (הענף מוגדר ב-`.gitmodules`).
אחרי הפקודה תיקיית ה-submodule בsfarim עומדת ב-**detached HEAD** —
וזה תקין ואף רצוי: זה בדיוק הסימן ש-sfarim הוא צרכן ולא מקום עריכה.

### 3. לצרכנים — שכפול רדוד

מי שרק צורך את הדפים אינו זקוק להיסטוריה שלהם. שכפול רדוד מוריד את
הגרסה הנוכחית בלבד — כשליש מהנפח, ובלי לשנות דבר בשרת:

```bash
git clone --depth 1 --recurse-submodules --shallow-submodules \
    https://github.com/yybd/sfarim
```

ולריפו הזה לבדו:

```bash
git clone --depth 1 https://github.com/yybd/shas-hadash
```

שכפול רדוד מספיק לבנייה ולהרצה. הוא אינו מספיק לעריכה ולדחיפה — למי
שעורך (talmud-ai) נדרש שכפול מלא.

### אם ה-submodule בsfarim "מפגר" אחרי המצביע

`git status` מראה `M public/shas-hadash` בלי ששינית כלום? זה אומר
שתיקיית העבודה לא מסונכרנת עם הקומיט הרשום. סנכרון:

```bash
git submodule update --init --recursive public/shas-hadash
```

## שלושה דברים שחשוב לדעת

1. **שכפול למחשב חדש** — `git clone --recurse-submodules`, או אחרי
   clone רגיל: `git submodule update --init`. בלי זה `public/shas-hadash`
   תהיה תיקייה ריקה והאפליקציה לא תיבנה.
2. **סדר דחיפה** — תמיד לדחוף קודם את ה-submodule ורק אחר כך את
   הפרויקט (ראה למעלה).
3. **detached HEAD** — בtalmud-ai זו אזהרה: לפני עריכה תמיד
   `git checkout master`, אחרת הקומיט יישאר תלוש. אם שכחת ועשית קומיט —
   `git checkout master && git merge <hash-הקומיט>` מציל אותו.
   בsfarim זה המצב הרגיל ואין מה לתקן, כי שם לא עורכים.

## המבנה

- `daf/` — דפי הש"ס הדחוסים + `assets/` (גופנים, `daf.css`, `daf.js`).
- `code/` — המעטפת: `default.js` (טעינת דפים, ניווט, זום),
  `mefarshim.js` + `mefarshim/` (מסך המפרשים), `ai-bridge.js`
  (שידור בחירות לאפליקציה מארחת; שקט כשאין מאזין), bootstrap ו-jQuery.
- `shastext/` — טקסט הגמרא/רש"י/תוספות כ-JS (למסך המפרשים).
- `index.html` — הכניסה; נטען ישירות או בתוך iframe של אפליקציה.

## הסמנטיקה של הדף — נצרבת מראש

האזורים, המקטעים וסדר הקריאה אינם מחושבים בדפדפן אלא **נצרבים לתוך
הדפים בזמן-בנייה** ע"י [tools/enrich](tools/enrich/) — כל דף נושא
`data-segv` על ‎`.daf-page`, `data-zone`/`data-flow`/`data-surround` על
כל שורה, ו-`data-seg`/`data-i`/`data-dh` על כל מילה בת-בחירה. כך
ההתנהגות זהה בכל דפדפן, בכל זום ובכל מצב טעינת גופנים.

"מקטע" הוא דיבור-המתחיל שלם ברש"י/תוספות/מדורי התחתית, או מאמר בגמרא.
מקטע נמדד על פני **זרימה** — עמודה וכל המשכיה, גם כשהם ברוחב אחר
(העמודה הצרה שלצד הגמרא + המשכה הרחב שמתחתיה) — ולכן דיבור שחוצה
שינוי רוחב הוא מקטע אחד עם מזהה אחד.

## daf.js — שכבת ההיגיון של הדף

אין בו היוריסטיקה ואין מדידה: **לחיצה** בוחרת מקטע שלם לפי `data-seg`,
**גרירה** בוחרת רק את הקטע שנגרר ונחתכת בגבול המקטע לפי `data-i`,
ההעתקה ממוינת לפי `data-i`, וההסתרה (כפתור העין) לפי
`data-zone`/`data-surround`. הסיווג הגיאומטרי שרץ בדפדפן לפני ההעשרה
נמחק אחרי שכל הש"ס נצרב — מקור האמת היחיד של הלוגיקה הוא
`tools/enrich`. דף בלי `data-segv` יוצג כרגיל אך לא יהיו בו מקטעים,
ותירשם אזהרה בקונסולה.

ה-API — `window.Daf` (ראה תיעוד בראש הקובץ). אירועים: `daf:select`
על בחירת מקטע שלם, `daf:selection` על סיום גרירה חלקית.

## מספור הדפים

אינדקס העמוד בתיקייה יחסי למסכת (0 = העמוד הראשון שלה), ומספר הדף
המודפס נגזר ממנו בתוספת **היסט-הפתיחה** — השדה השלישי בטבלת `talmud`
שב-`default.js`. רוב המסכתות פותחות בדף ב. וההיסט מושמט; המסכתות
הקטנות שבסוף הש"ס חולקות מספור עם המסכת שלפניהן (תמיד פותחת בכה:,
מדות בלד., קינים בכב.). `dafRef(masechet, daf)` הוא הממיר היחיד —
גם תווית הרשימה וגם מראה המקום שנשלח לאפליקציה נגזרים ממנו.

## ריסוק ההיסטוריה — כשהריפו תפח

ההיסטוריה כאן היא של **נתונים מיוצרים**: הדפים נוצרים מחדש ע"י
`tools/enrich` מתוך הדפים המקוריים, ולכן גרסאות ישנות שלהם אינן שוות
דבר. כשהנפח תופח (נמדד ב-`du -sh .git`), אפשר לאפס:

```bash
cd ~/Developer/AI/talmud-ai/public/shas-hadash
git bundle create ~/shas-hadash-history-$(date +%Y%m%d).bundle --all
git bundle verify ~/shas-hadash-history-*.bundle     # לא לדלג!

git checkout --orphan clean && git add -A
git commit -m "ש\"ס חדש — צורת הדף"
git branch -D master && git branch -m master
git push -f origin master
git reflog expire --expire=now --all && git gc --prune=now
```

**זה בלתי הפיך.** הגיבוי (bundle) הוא רשת הביטחון היחידה — מוודאים
אותו לפני, ושומרים מחוץ לריפו. שחזור: `git clone הקובץ.bundle`.

אחרי הריסוק, כל שכפול קיים מצביע על קומיטים שנמחקו. בsfarim:

```bash
cd ~/Developer/tauri/sfarim
git submodule update --remote --force public/shas-hadash
git add public/shas-hadash && git commit -m "עדכון הש\"ס" && git push
```

בוצע לראשונה ב-2026-08-25: 616MB ← 243MB.

## עדכון גרסאות מטמון

שינוי ב-`daf.js` / `daf.css` / `default.js` מחייב הקפצת פרמטר
`?v=` ב-`index.html` — זה מנגנון שבירת המטמון של הדפדפן.
