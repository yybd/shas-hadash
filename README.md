# ש"ס חדש — צורת הדף

מציג התלמוד הבבלי בצורת הדף המסורתית, כ-HTML סטטי: כל עמוד הוא קובץ
`daf/<מסכת>/<עמוד>.html.gz` שבו כל ריצת-טקסט ממוקמת אבסולוטית לפי
מיקומה המדויק בדפוס וילנא. הלוגיקה כולה רצה בדפדפן בזמן טעינה.

**זהו מקור האמת היחיד** — הריפו משמש כ-git submodule בשני פרויקטים:

| פרויקט | נתיב ה-submodule |
|---|---|
| [sfarim](https://github.com/yybd/sfarim) — אפליקציית ספרים | `public/shas-hadash` |
| talmud-ai — הש"ס עם חברותא AI | `public/shas-hadash` |

תיקון שנעשה כאן מגיע לשתי האפליקציות עם `git submodule update --remote`.

## נוהל עדכון

עורכים בתוך `public/shas-hadash` של אחד הפרויקטים (זה אותו ריפו):

```bash
cd public/shas-hadash
git checkout master          # ראה סעיף detached HEAD למטה
git add -A && git commit -m "..." && git push
cd .. && git add public/shas-hadash && git commit -m "עדכון הש\"ס" && git push
```

ובפרויקט השני:

```bash
git submodule update --remote public/shas-hadash
git add public/shas-hadash && git commit -m "עדכון הש\"ס" && git push
```

## שלושה דברים שחשוב לדעת

1. **שכפול למחשב חדש** — `git clone --recurse-submodules`, או אחרי
   clone רגיל: `git submodule update --init`. בלי זה `public/shas-hadash`
   תהיה תיקייה ריקה והאפליקציה לא תיבנה.
2. **סדר דחיפה** — תמיד לדחוף קודם את ה-submodule ורק אחר כך את
   הפרויקט. פרויקט שמצביע על קומיט שלא נדחף ייתן שגיאה בכל שכפול,
   כי הקומיט לא קיים בגיטהאב.
3. **detached HEAD** — אחרי `git submodule update` התיקייה עומדת "על
   קומיט", לא על ענף. לפני עריכה: `git checkout master` בתוך
   `public/shas-hadash`, אחרת הקומיט יישאר תלוש. אם שכחת ועשית קומיט —
   `git checkout master && git merge <hash-הקומיט>` מציל אותו.

## המבנה

- `daf/` — דפי הש"ס הדחוסים + `assets/` (גופנים, `daf.css`, `daf.js`).
- `code/` — המעטפת: `default.js` (טעינת דפים, ניווט, זום),
  `mefarshim.js` + `mefarshim/` (מסך המפרשים), `ai-bridge.js`
  (שידור בחירות לאפליקציה מארחת; שקט כשאין מאזין), bootstrap ו-jQuery.
- `shastext/` — טקסט הגמרא/רש"י/תוספות כ-JS (למסך המפרשים).
- `index.html` — הכניסה; נטען ישירות או בתוך iframe של אפליקציה.

## daf.js — שכבת ההיגיון של הדף

רץ פעם אחת על כל דף שנטען: מסווג את השורות לאזורים (גמרא, רש"י,
תוספות, שוליים, תחתית), מפצל את התחתית לעמודות עצמאיות, מפלח
לדיבורי-המתחיל ולמאמרי גמרא (לפי ":"), נותן לכל שורה גובה אמיתי,
ונועל גרירת-בחירה לעמודת המוצא. ה-API — `window.Daf` (ראה תיעוד בראש
הקובץ). אירוע `daf:select` נורה על כל בחירת מקטע.

## עדכון גרסאות מטמון

שינוי ב-`daf.js` / `daf.css` / `default.js` מחייב הקפצת פרמטר
`?v=` ב-`index.html` — זה מנגנון שבירת המטמון של הדפדפן.
