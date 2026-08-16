/*
 * daf.js — כל הלוגיקה של דפי צורת-הדף, מחוץ לדפים עצמם.
 *
 * הדף שנוצר מכיל אך ורק גיאומטריה וטקסט: כל ריצת-טקסט ממוקמת אבסולוטית
 * לפי המיקום המדויק שלה ב-PDF. הקובץ הזה מוסיף בזמן ריצה את כל השאר —
 * סיווג לאזורים, פילוח לדיבורי-המתחיל, קיבוץ ה-DOM לפי אזור (כדי
 * שגרירה בעכבר תבחר טקסט של מקטע אחד בלבד), ואת ה-API לאפליקציה.
 * שיפור בלוגיקה נעשה כאן פעם אחת וחל על כל הדפים — בלי לייצר אותם מחדש.
 *
 * API — window.Daf:
 *   Daf.zones()               רשימת האזורים שנמצאו בדף
 *   Daf.zoneOf(el)            האזור של אלמנט
 *   Daf.zoneText(zone)        הטקסט הרציף של אזור
 *   Daf.segments()            מזהי כל המקטעים ('r3' / 't1')
 *   Daf.segText(segId)        הטקסט המלא של מקטע (ד"ה + גוף)
 *   Daf.select(segId)         בחירת/ביטול מקטע שלם; null מנקה
 *   Daf.selected()            מזהה המקטע הנבחר או null
 *   Daf.hide(zone) / show / toggle / hidden()
 *   Daf.fit()                 כיול רוחב הריצות (רץ אוטומטית)
 * אירוע: 'daf:select' על ה-document עם detail={seg}.
 */
(function () {
  'use strict';

  // מוצג בסרגל (span#daf-ver) — כדי שאפשר יהיה לדעת בוודאות איזו
  // גרסת מציג רצה בפועל, בלי לנחש מול מטמונים והתקנות.
  var DAF_VERSION = 20;

  var ZONES = ['header', 'gemara', 'rashi', 'tosafot',
               'margin-right', 'margin-left', 'bottom'];
  var SQUARE = { 'sq': 1, 'sqs': 1, 'bd': 1, 'dh': 1, 'to': 1 };

  // גודל וסוג-כתב נגזרים מהריצה עצמה (font-size ומחלקת הגופן), כדי
  // שהדף לא יישא אותם שוב כ-data attributes בכל מילה
  function wsize(w) { return parseFloat(w.style.fontSize) || 0; }
  function wfam(w) {
    var m = /(?:^|\s)f-([\w-]+)/.exec(w.className);
    return m ? m[1] : 'sq';
  }
  function isSquare(w) {
    var f = wfam(w);
    if (SQUARE[f]) return true;
    if (f === 'rs' || f === 'rss') return false;
    return !/rashi/i.test(f);       // גופני TrueType — לפי שמם
  }

  // --------------------------------------------------------------- גופנים

  function eachFace(fn) {
    var fs = document.fonts;
    if (!fs) return false;
    if (fs.forEach) { fs.forEach(fn); return true; }
    if (fs.values) {                       // דפדפנים ישנים — איטרטור בלבד
      var it = fs.values(), n;
      while (!(n = it.next()).done) fn(n.value);
      return true;
    }
    return false;
  }

  function fontsReady() {
    if (!document.fonts) return true;      // אין API — אין מה לחכות לו
    var pending = false;
    var ok = eachFace(function (f) {
      if (/^Shas/.test(f.family) && f.status !== 'loaded') pending = true;
    });
    return ok ? !pending : document.fonts.status === 'loaded';
  }

  // מאלץ הורדה של כל גופני הדף במקום להמתין לטעינה עצלה
  function ensureFonts() {
    if (!document.fonts) return Promise.resolve();
    var jobs = [];
    eachFace(function (f) {
      if (/^Shas/.test(f.family) && f.status === 'unloaded') {
        try { jobs.push(f.load().catch(function () {})); } catch (e) { /* ignore */ }
      }
    });
    return Promise.all(jobs).then(function () { return document.fonts.ready; });
  }

  function daf() { return document.querySelector('.daf-page'); }
  function num(el, k) { return parseFloat(el.dataset[k]); }

  // ---------------------------------------------------------- סיווג אזורים

  function gemaraMetrics(lines) {
    // הגמרא היא הכתב המרובע הגדול ביותר שיש לו נפח טקסט ממשי: השוליים
    // מרובעים אף הם אך קטנים בהרבה, והכותרות גדולות אך זעירות בנפחן.
    // סף גודל קבוע נשבר במסכתות שגופן הגמרא בהן קטן (מנחות — 11.5).
    var mass = {}, total = 0, cands = [];
    lines.forEach(function (ln) {
      if (parseFloat(ln.style.top) <= 28) return;
      if (!isSquareLine(ln)) return;
      var n = 0;
      ln.querySelectorAll('.w').forEach(function (w) { n += w.textContent.length; });
      var k = num(ln, 'size').toFixed(1);
      mass[k] = (mass[k] || 0) + n;
      total += n;
      cands.push(ln);
    });
    var gsize = 0;
    Object.keys(mass).forEach(function (k) {
      if (mass[k] >= 0.10 * total) gsize = Math.max(gsize, parseFloat(k));
    });
    if (!gsize) return { box: { x0: 200, x1: 450, y0: 60, y1: 700 }, size: 13.7 };
    var kept = cands.filter(function (ln) {
      return Math.abs(num(ln, 'size') - gsize) < 0.6;
    }).sort(function (a, b) {
      return parseFloat(a.style.top) - parseFloat(b.style.top);
    });
    // בדפי פתיחת פרק, דיבור-המתחיל של רש"י/תוספות בראש הדף עשוי להיות
    // בדיוק בגודל הגמרא — והוא מושך את תקרת הקופסה עשרות נקודות מעל
    // הגמרא האמיתית (ואיתה את הסיווג של כל מה שביניהן). שורות בודדות
    // בראש, שרחוקות מהגוש הרציף שמתחתיהן, מושמטות מחישוב הקופסה.
    var start = 0;
    while (start < kept.length - 1 &&
           parseFloat(kept[start + 1].style.top) -
           parseFloat(kept[start].style.top) > 3 * gsize) start++;
    var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    kept.slice(start).forEach(function (ln) {
      var top = parseFloat(ln.style.top);
      x0 = Math.min(x0, num(ln, 'x0')); x1 = Math.max(x1, num(ln, 'x1'));
      y0 = Math.min(y0, top); y1 = Math.max(y1, top + 1.08 * num(ln, 'size'));
    });
    return { box: { x0: x0, x1: x1, y0: y0, y1: y1 }, size: gsize };
  }

  // סוג-הכתב של שורה נקבע לפי מסת האותיות ולא לפי הריצה הארוכה ביותר:
  // לשורת גמרא נגררת לפעמים מילה בודדת בכתב רש"י מהטור הסמוך, ודי היה
  // בה כדי להעיף את כל השורה לאזור רש"י/תוס' — ושם גלאי הד"ה מדגיש
  // את המילים המרובעות שבה.
  function isSquareLine(ln) {
    var sq = 0, other = 0;
    ln.querySelectorAll('.w').forEach(function (w) {
      var n = w.textContent.replace(/[^א-ת]/g, '').length;
      if (!n) return;
      if (isSquare(w)) sq += n; else other += n;
    });
    return sq > other;
  }

  function classify(ln, gb, rashiSide, gsize) {
    var x0 = num(ln, 'x0'), x1 = num(ln, 'x1'), top = parseFloat(ln.style.top);
    var cx = (x0 + x1) / 2, size = num(ln, 'size');
    if (top < 28) return 'header';
    // תנאי הגובה מונע מדיבורי-המתחיל של רש"י/תוספות שמעל תחילת הגמרא
    // (בדפי פתיחת פרק) להיבלע באזור הגמרא — גודלם קרוב לגודל הגמרא
    // (עד ~פי 1.2). מילת הפתיחה המעוטרת של הגמרא עצמה ענקית (פי 2+)
    // ויושבת הרחק מעל גוף הגמרא — לכן גודל חריג מוחרג מתנאי הגובה.
    var nearGemX = cx >= gb.x0 - 10 && cx <= gb.x1 + 10;
    if (isSquareLine(ln) && nearGemX &&
        (size >= 1.8 * gsize ||
         (size >= 0.9 * gsize && top >= gb.y0 - 1.5 * gsize))) return 'gemara';
    if (top > gb.y1 + 8) return 'bottom';
    var inGemaraX = cx >= gb.x0 - 10 && cx <= gb.x1 + 10;
    if (gsize && size < 0.65 * gsize && !inGemaraX) {
      return cx > (gb.x0 + gb.x1) / 2 ? 'margin-right' : 'margin-left';
    }
    var right = cx > (gb.x0 + gb.x1) / 2;
    return (rashiSide === 'right') === right ? 'rashi' : 'tosafot';
  }

  // ------------------------------------------------ פילוח לדיבורי-המתחיל

  function bodySize(lines) {
    // גודל גוף הטקסט השכיח באזור (במשקל תווים)
    var acc = {};
    lines.forEach(function (ln) {
      ln.querySelectorAll('.w').forEach(function (w) {
        if (isSquare(w)) return;
        var k = wsize(w).toFixed(1);
        acc[k] = (acc[k] || 0) + w.textContent.length;
      });
    });
    var best = 11.2, bv = -1;
    Object.keys(acc).forEach(function (k) {
      if (acc[k] > bv) { bv = acc[k]; best = parseFloat(k); }
    });
    return best;
  }

  function dhState(w, lineSize, body) {
    // ד"ה: כתב מרובע בגודל שורה מלא, או כתב רש"י גדול מגוף האזור.
    // null = ניטרלי (פיסוק) וממשיך את המצב הקודם.
    if (!/[א-ת]/.test(w.textContent)) return null;
    var sz = wsize(w), sq = isSquare(w);
    if (sq && sz >= 0.95 * lineSize &&
        w.textContent.replace(/[^א-ת]/g, '').length >= 2) return true;
    if (!sq && sz >= body + 0.3) return true;
    return false;
  }

  var FAM_CLASSES = ['f-sq', 'f-sqs', 'f-rs', 'f-rss', 'f-dh', 'f-bd', 'f-to'];
  var TTF_FAM = /^f-Shas/;

  function segment(zoneLines, prefix, zone) {
    var body = bodySize(zoneLines), seg = 0, inDh = false;
    zoneLines.forEach(function (ln) {
      var lineSize = num(ln, 'size');
      ln.querySelectorAll('.w').forEach(function (w) {
        var dh = dhState(w, lineSize, body);
        if (dh === null) dh = inDh;
        else if (dh && !inDh) seg++;
        inDh = dh;
        w.dataset.seg = prefix + seg;
        if (!dh) return;
        w.classList.add('dh');
        // ד"ה של תוספות בכתב מרובע (וילנה) כמו בדפוס. ב-PDF הוא מקודד
        // כמו כתב רש"י ולכן הזיהוי לפי הקידוד לבדו מפספס אותו.
        if (zone === 'tosafot') {
          FAM_CLASSES.forEach(function (c) { w.classList.remove(c); });
          [].slice.call(w.classList).forEach(function (c) {
            if (TTF_FAM.test(c)) w.classList.remove(c);
          });
          w.classList.add('f-dh');
        }
      });
    });
  }

  // ----------------------------------------- פילוח הגמרא למאמרים
  // בדפוס וילנא כל מאמר בגמרא מסתיים בנקודתיים. המילה הסוגרת שייכת
  // למאמר, והמילה שאחריה פותחת מקטע חדש. כך לחיצה על הגמרא בוחרת
  // מאמר שלם — כמו דיבור-המתחיל ברש"י ותוספות.
  function segmentGemara(lines) {
    var seg = 1;
    lines.forEach(function (ln) {
      ln.querySelectorAll('.w').forEach(function (w) {
        w.dataset.seg = 'g' + seg;
        if (/:\s*$/.test(w.textContent)) seg++;
      });
    });
  }

  // ------------------------------- פיצול התחתית לעמודות עצמאיות
  // אזור התחתית מכיל כמה מדורים זה לצד זה — המשך רש"י/תוספות במרכז,
  // ולצדדיו מדורים כמו רב נסים גאון. שתי שורות של אותה עמודה חופפות
  // אופקית כמעט לגמרי, ושורת מדור צדדי נוגעת בשורה רחבה רק בקצה —
  // לכן הקיבוץ לפי יחס חפיפה (חיתוך/איחוד ≥ 0.5). בלי הפיצול, בחירה
  // בעמודה אחת צובעת גם את שכנותיה: כולן באותו אזור, והבחירה של
  // הדפדפן הולכת לפי סדר ה-DOM.
  function splitColumns(lines) {
    function overlap(a, b) {
      var inter = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      if (inter <= 0) return 0;
      return inter / (Math.max(a.x1, b.x1) - Math.min(a.x0, b.x0));
    }
    // מיזוג רק בין שורות באותו גוף-כתב: מדורים שונים הערומים אנכית
    // באותו רוחב (המשך רש"י 11.2 ומתחתיו המשך רב נסים 7.0) הם עמודות
    // נפרדות — חפיפת ה-x לבדה הייתה ממזגת אותם לאשכול אחד.
    function sameSize(a, b) { return Math.abs(a.size - b.size) <= 1.5; }
    var groups = [];
    lines.forEach(function (ln) {
      var box = { x0: num(ln, 'x0'), x1: num(ln, 'x1'),
                  size: num(ln, 'size'), lines: [ln] };
      var into = null;
      groups.forEach(function (g) {
        if (!into && sameSize(g, box) && overlap(g, box) >= 0.5) into = g;
      });
      if (into) {
        into.x0 = Math.min(into.x0, box.x0);
        into.x1 = Math.max(into.x1, box.x1);
        into.lines.push(ln);
      } else groups.push(box);
    });
    // קבוצות שהתרחבו תוך כדי ועכשיו חופפות — מאוחדות בדיעבד
    for (var i = 0; i < groups.length; i++) {
      for (var j = groups.length - 1; j > i; j--) {
        if (sameSize(groups[i], groups[j]) && overlap(groups[i], groups[j]) >= 0.5) {
          groups[i].x0 = Math.min(groups[i].x0, groups[j].x0);
          groups[i].x1 = Math.max(groups[i].x1, groups[j].x1);
          groups[i].lines = groups[i].lines.concat(groups[j].lines);
          groups.splice(j, 1);
        }
      }
    }
    // שורה קצרה בסוף פסקה נופלת מסף החפיפה של עמודתה ונעשית קבוצה
    // זעירה משל עצמה — מה שהיה קורע אותה מהבחירה באמצע פסקה. קבוצה
    // של עד שתי שורות נבלעת בעמודה שיש לה שורה צמודה אנכית (עד ~2
    // שורות מרחק) שמכילה אותה אופקית. מדור צדדי אמיתי רחוק אנכית
    // מהשורות המכילות אותו, ולכן אינו נבלע.
    function absorbs(g, tiny) {
      var ok = false;
      tiny.lines.forEach(function (tl) {
        var t0 = num(tl, 'x0'), t1 = num(tl, 'x1');
        var ty = parseFloat(tl.style.top), ts = num(tl, 'size');
        g.lines.forEach(function (gl) {
          var inter = Math.min(t1, num(gl, 'x1')) - Math.max(t0, num(gl, 'x0'));
          if (inter < 0.9 * (t1 - t0)) return;
          var dy = Math.abs(parseFloat(gl.style.top) - ty);
          if (dy <= 2.2 * Math.max(ts, num(gl, 'size'))) ok = true;
        });
      });
      return ok;
    }
    for (var ti = groups.length - 1; ti >= 0; ti--) {
      if (groups[ti].lines.length > 2) continue;
      for (var gi = 0; gi < groups.length; gi++) {
        if (gi === ti || groups[gi].lines.length <= 2) continue;
        if (absorbs(groups[gi], groups[ti])) {
          groups[gi].lines = groups[gi].lines.concat(groups[ti].lines);
          groups.splice(ti, 1);
          break;
        }
      }
    }
    return groups;
  }

  // ------------------------------------- קיבוץ ה-DOM לפי אזור (לבחירה)

  function build() {
    var d = daf();
    if (!d || d.dataset.ready) return;
    var lines = Array.prototype.slice.call(d.querySelectorAll('.ln'));
    var gm = gemaraMetrics(lines);
    var gb = gm.box, gsize = gm.size;
    var side = d.dataset.rashiSide || 'right';
    var zoneOfLine = new Map();
    lines.forEach(function (ln) { zoneOfLine.set(ln, classify(ln, gb, side, gsize)); });
    // כותרות המדורים ("מסורת הש"ס", "תורה אור השלם") מודפסות בגופן גדול
    // מגוף המדור, ולכן מבחן הגודל מפספס אותן — מצרפים לפי הכלה בטור.
    // הרצועה נבנית רק מאשכולות צרים שצמודים לשולי הדף: הפניות זעירות
    // בתוך גוף התוספות (כמו "(ג"י שם)") מסווגות אף הן כשוליים לפי
    // הגודל, ובלי הסינון הן היו מותחות את הרצועה עד אמצע הדף — והכלה
    // בה הייתה בולעת עמודה ראשית שלמה לתוך השוליים.
    var pageW = parseFloat(d.style.width) ||
                (d.querySelector('.ln') ? 643.58 : 643.58);
    var marginBands = [];
    ['margin-left', 'margin-right'].forEach(function (side2) {
      var cols = lines.filter(function (l) { return zoneOfLine.get(l) === side2; });
      if (!cols.length) return;
      splitColumns(cols).forEach(function (g) {
        if (g.x1 - g.x0 > 0.25 * pageW) return;              // רחב מדי לטור שוליים
        var edge = side2 === 'margin-left'
          ? g.x0 <= 0.2 * pageW : g.x1 >= 0.8 * pageW;       // צמוד לשול הדף
        if (!edge) return;
        var band = { side: side2, lo: g.x0 - 2, hi: g.x1 + 2 };
        marginBands.push(band);
        lines.forEach(function (l) {
          var z = zoneOfLine.get(l);
          if ((z === 'rashi' || z === 'tosafot') &&
              num(l, 'x0') >= band.lo && num(l, 'x1') <= band.hi) {
            zoneOfLine.set(l, side2);
          }
        });
      });
    });
    var byZone = {};
    lines.forEach(function (ln) {
      var z = zoneOfLine.get(ln);
      ln.classList.add(z);
      // קופסת השורה עצמה גבוהה כפס הטקסט: בלעדיה גובהה ~1px (צמתי
      // הרווחים בלבד — המילים אבסולוטיות וגולשות ממנה), ולחיצה או
      // עיגון-גרירה בין מילים נופלים על רקע הדף במקום על השורה.
      ln.style.height = (1.15 * num(ln, 'size')) + 'px';
      (byZone[z] = byZone[z] || []).push(ln);
    });
    var zoneNames = ZONES.slice();

    // איחוי אחרי הפיצול: אשכול זעיר (סימוני אות והפניות, עד 2 שורות)
    // או אשכול דיבורי-פתיחה (גופן ≥1.35 מגוף העמודה) מתאחה לעמודת
    // הגוף שהוא חופף — הם חלק מזרימת הקריאה שלה, לא עמודה עצמאית.
    // גבולות העמודה אינם מורחבים על ידם, כדי שמדד החפיפה יישאר נקי.
    function reattach(cs) {
      if (cs.length < 2) return cs;
      var bodySz = cs.slice().sort(function (a, b) {
        return b.lines.length - a.lines.length;
      })[0].size;
      for (var i = cs.length - 1; i >= 0 && cs.length > 1; i--) {
        var c = cs[i];
        var tiny = c.lines.length <= 2;
        var opener = c.size >= 1.35 * bodySz;
        if (!tiny && !opener) continue;
        var best = null, bo = 0;
        cs.forEach(function (g) {
          if (g === c || g.lines.length <= 2) return;
          var inter = Math.min(c.x1, g.x1) - Math.max(c.x0, g.x0);
          var ov = inter / (c.x1 - c.x0);
          if (ov > bo) { bo = ov; best = g; }
        });
        if (best && bo >= 0.6) {
          best.lines = best.lines.concat(c.lines);
          cs.splice(i, 1);
        }
      }
      return cs;
    }

    // גם אזורי רש"י ותוספות עשויים להכיל עמודה פיזית נוספת — מדור
    // שוליים הכתוב בכתב רש"י בגודל מלא (תוספות רי"ד, מהרש"א וכו'),
    // שמבחן-הגודל של השוליים מפספס. בלי הפיצול, סדר הקריאה שוזר את
    // שתי העמודות — והבחירה, המקטעים וההקשר למודל מתערבבים ביניהן.
    // העמודה הגדולה שומרת את השם; הנוספות ('rashi-1'…) מתויגות בהמשך
    // כ"מסביב" ומוסתרות עם כפתור העין.
    ['rashi', 'tosafot'].forEach(function (z) {
      if (!byZone[z] || byZone[z].length < 2) return;
      var cs = reattach(splitColumns(byZone[z]));
      if (cs.length < 2) return;
      cs.sort(function (a, b) { return b.lines.length - a.lines.length; });
      byZone[z] = cs[0].lines;
      for (var ci = 1; ci < cs.length; ci++) {
        byZone[z + '-' + ci] = cs[ci].lines;
        zoneNames.push(z + '-' + ci);
      }
    });
    // התחתית מפוצלת לעמודות — כל מדור צדדי נעשה אזור נפרד (bottom-1…)
    if (byZone.bottom && byZone.bottom.length > 1) {
      var cols = reattach(splitColumns(byZone.bottom));
      if (cols.length > 1) {
        cols.sort(function (a, b) { return b.lines.length - a.lines.length; });
        byZone.bottom = cols[0].lines;
        for (var ci = 1; ci < cols.length; ci++) {
          byZone['bottom-' + ci] = cols[ci].lines;
          zoneNames.push('bottom-' + ci);
        }
      }
    }
    // סדר ה-DOM אינו משפיע על המיקום (הכל אבסולוטי), ולכן אפשר לקבץ
    // את השורות לפי אזור. כך גרירה בעכבר בתוך עמודה בוחרת רק אותה,
    // במקום לדלג בין הגמרא, רש"י ותוס' שיושבים באותו גובה.
    zoneNames.forEach(function (z) {
      if (!byZone[z]) return;
      var box = document.createElement('div');
      box.className = 'zone zone-' + z;
      box.dataset.zone = z;
      byZone[z].sort(function (a, b) {
        var dy = parseFloat(a.style.top) - parseFloat(b.style.top);
        return dy || (num(b, 'x1') - num(a, 'x1'));
      }).forEach(function (ln) { box.appendChild(ln); });
      d.appendChild(box);
    });
    // פילוח רש"י ותוספות — גם לעמודות הנוספות, עם קידומות ייחודיות
    zoneNames.forEach(function (z) {
      var m = /^(rashi|tosafot)(?:-(\d+))?$/.exec(z);
      if (!m || !byZone[z]) return;
      var p = m[1] === 'rashi' ? 'r' : 't';
      segment(byZone[z], m[2] ? p + m[2] + '-' : p, m[1]);
    });
    if (byZone.gemara) segmentGemara(byZone.gemara);
    // המשכי רש"י/תוספות והמדורים הצדדיים שבתחתית — פילוח לדיבורי-
    // המתחיל בכל עמודה בנפרד, עם קידומת מזהה ייחודית לעמודה
    // ('b' לעמודה הראשית, 'b1-'... לצדדיות) כדי שהמקטעים לא יתנגשו.
    zoneNames.forEach(function (z) {
      if (z.indexOf('bottom') !== 0 || !byZone[z]) return;
      segment(byZone[z], z === 'bottom' ? 'b' : 'b' + z.slice(7) + '-', z);
    });

    // ------------------- תיוג "מסביב" (surround) — מה שכפתור העין מסתיר
    // גלויים תמיד: גמרא, רש"י, תוספות — והמשכיהם שבתחתית. מוסתרים:
    // השוליים והמשכיהם, המדורים העצמאיים (רב נסים גאון וכו'), וכותרות
    // המדורים שיושבות באזור הכותרת מעל רצועת השוליים.
    // הגודל הדומיננטי על פני כל המילים — בלי סינון סוג-כתב: מדורים
    // כמו רב נסים גאון מקודדים בגופן שההיוריסטיקה של bodySize מחשיבה
    // "מרובע", וההיסטוגרמה שלה יוצאת שם ריקה ומחזירה ברירת מחדל שגויה.
    function domSize(lines2) {
      var acc = {};
      lines2.forEach(function (ln) {
        ln.querySelectorAll('.w').forEach(function (w) {
          var k = wsize(w).toFixed(1);
          acc[k] = (acc[k] || 0) + w.textContent.length;
        });
      });
      var best = 0, bv = -1;
      Object.keys(acc).forEach(function (k) {
        if (acc[k] > bv) { bv = acc[k]; best = parseFloat(k); }
      });
      return best;
    }

    function unitOf(lines2, family) {
      var u = { x0: 1e9, x1: -1e9, top: 1e9, bot: -1e9,
                family: family, body: domSize(lines2) };
      lines2.forEach(function (l) {
        u.x0 = Math.min(u.x0, num(l, 'x0'));
        u.x1 = Math.max(u.x1, num(l, 'x1'));
        var t = parseFloat(l.style.top);
        u.top = Math.min(u.top, t);
        u.bot = Math.max(u.bot, t);
      });
      return u;
    }
    var units = [];
    ['rashi', 'tosafot'].forEach(function (z) {
      if (byZone[z]) units.push(unitOf(byZone[z], 'gefet'));
    });
    ['margin-right', 'margin-left'].forEach(function (z) {
      if (!byZone[z]) return;
      units.push(unitOf(byZone[z], 'surround'));
      byZone[z].forEach(function (l) { l.classList.add('surround'); });
    });
    // העמודות הנוספות שפוצלו מרש"י/תוספות — מדורי שוליים בכתב מלא
    // (תוספות רי"ד וכד') — שייכות ל"מסביב"
    zoneNames.forEach(function (z) {
      if (!/^(rashi|tosafot)-\d+$/.test(z) || !byZone[z]) return;
      units.push(unitOf(byZone[z], 'surround'));
      byZone[z].forEach(function (l) { l.classList.add('surround'); });
    });
    // כותרות המדורים בראש הדף — בתוך רצועת ה-x של טור שוליים אמיתי
    // (הרצועות המסוננות בלבד — לא היקף הזון כולו, שעלול להיות רחב)
    if (byZone.header) byZone.header.forEach(function (l) {
      var inBand = marginBands.some(function (b) {
        return num(l, 'x0') >= b.lo - 12 && num(l, 'x1') <= b.hi + 12;
      });
      if (inBand) l.classList.add('surround');
    });
    // עמודת תחתית שמתחילה מיד מתחת ליחידה קיימת וחופפת אותה אופקית
    // היא המשך שלה ויורשת את משפחתה; עמודה בלי הורה צמוד היא מדור
    // עצמאי. העמודות נבדקות מלמעלה למטה כדי שהמשך-של-המשך ישתרשר.
    var cols = zoneNames.filter(function (z) {
      return z.indexOf('bottom') === 0 && byZone[z];
    }).map(function (z) {
      var u = unitOf(byZone[z], null);
      u.zone = z;
      return u;
    }).sort(function (a, b) { return a.top - b.top; });
    cols.forEach(function (col) {
      var w = col.x1 - col.x0, best = null, bestOv = 0;
      units.forEach(function (u) {
        var gap = col.top - u.bot;
        if (gap < -2 || gap > 4 * gsize) return;
        // המשך אמיתי כתוב באותו גוף-כתב; מדור חדש (רב נסים גאון —
        // 6.7 מול 11.2 של תוספות) נפסל גם כשהוא צמוד וחופף.
        if (Math.abs(col.body - u.body) > 1.5) return;
        // החפיפה נמדדת יחסית לצר מבין השניים: המשך של עמודה מתרחב
        // לרוחב מלא ברגע שנגמרות העמודות שלצדו, והחפיפה יחסית אליו
        // עצמו הייתה יורדת מתחת לסף למרות שההורה חופף לו במלואו.
        var inter = Math.min(col.x1, u.x1) - Math.max(col.x0, u.x0);
        var ov = inter / Math.max(1, Math.min(w, u.x1 - u.x0));
        if (ov >= 0.55 && ov > bestOv) { bestOv = ov; best = u; }
      });
      col.family = best ? best.family : 'surround';
      if (col.family === 'surround') {
        byZone[col.zone].forEach(function (l) { l.classList.add('surround'); });
      }
      units.push(col);
    });

    d.dataset.ready = '1';
  }

  // ---------------------------------------------------------------- API

  // ------------------------------------------- סדר קריאה גיאומטרי
  // סדר ה-DOM אינו אמין לקריאה רציפה: שורה ויזואלית אחת מפוצלת לא פעם
  // לכמה קטעי ‎.ln (סביב מילת פתיחה מעוטרת או קישוט), וה-top שלהם שונה
  // בשבריר נקודה — מיון לפי top לבדו שובר את סדר הקריאה. כאן המילים
  // ממוינות לפי המיקום בפועל: קיבוץ לשורות בסובלנות של חצי גובה-מילה,
  // ובתוך שורה מימין לשמאל.
  function readingOrder(words) {
    var items = [];
    words.forEach(function (w) {
      var r = w.getBoundingClientRect();
      if (r.height > 0) items.push({ w: w, top: r.top, right: r.right, h: r.height });
    });
    if (!items.length) return [];
    var hs = items.map(function (it) { return it.h; }).sort(function (a, b) { return a - b; });
    var tol = 0.6 * hs[Math.floor(hs.length / 2)];
    items.sort(function (a, b) { return a.top - b.top; });
    var rows = [], row = null, rowTop = -1e9;
    items.forEach(function (it) {
      if (it.top - rowTop > tol) { row = []; rows.push(row); rowTop = it.top; }
      row.push(it);
    });
    var out = [];
    rows.forEach(function (r) {
      r.sort(function (a, b) { return b.right - a.right; });
      r.forEach(function (it) { out.push(it.w); });
    });
    return out;
  }

  function joinWords(words) {
    return words.map(function (w) { return w.textContent; })
      .join(' ').replace(/\s+/g, ' ').trim();
  }

  function runText(nodes) {
    return joinWords(readingOrder(nodes));
  }

  var Daf = {
    ZONES: ZONES,
    // בנייה מחדש — לשימוש כשמזריקים דף חדש לאותו מסמך
    build: function () {
      build();
      ensureFonts().then(function () { Daf.fit(); });
    },

    fit: function () {
      var box = daf();
      if (!box) return;
      // הגופנים חייבים להיות טעונים לפני המדידה. ‎document.fonts.ready
      // לבדו אינו מספיק: הוא נפתר גם כשעדיין לא התחילה טעינה כלשהי
      // (הדפדפן מוריד גופן רק כשהטקסט נכנס לפריסה), ואז נמדד גופן חלופי
      // וכל הריצות נמתחות לפי מספר שגוי — זה מה שנראה בעלייה הראשונה.
      if (!fontsReady()) { ensureFonts().then(Daf.fit); return; }
      // מקדם התצוגה (zoom/scale של הדפדפן) — בלעדיו המדידה מוחזרת
      // ביחידות מסך ולא ביחידות הדף, וכל הריצות היו נדחסות
      var zoom = box.offsetWidth ?
        box.getBoundingClientRect().width / box.offsetWidth : 0;
      if (!isFinite(zoom) || zoom < 0.01) return;   // אי אפשר למדוד — לא נוגעים
      document.querySelectorAll('.w[data-w]').forEach(function (el) {
        el.style.transform = '';
        var want = parseFloat(el.dataset.w);
        var got = el.getBoundingClientRect().width / zoom;
        if (want > 0.5 && got > 0.5 && Math.abs(got - want) / want > 0.02) {
          el.style.transform = 'scaleX(' + (want / got) + ')';
        }
      });
    },

    zones: function () {
      return ZONES.filter(function (z) { return document.querySelector('.zone-' + z); });
    },
    zoneOf: function (el) {
      var z = el && el.closest ? el.closest('.zone') : null;
      return z ? z.dataset.zone : null;
    },
    zoneText: function (zone) {
      var box = document.querySelector('.zone-' + zone);
      if (!box) return '';
      return runText(Array.prototype.slice.call(box.querySelectorAll('.w')));
    },

    segments: function () {
      var seen = [];
      document.querySelectorAll('[data-seg]').forEach(function (w) {
        if (seen.indexOf(w.dataset.seg) < 0) seen.push(w.dataset.seg);
      });
      return seen;
    },
    segText: function (segId) {
      return runText(Array.prototype.slice.call(
        document.querySelectorAll('[data-seg="' + segId + '"]')));
    },
    select: function (segId) {
      document.querySelectorAll('.seghl').forEach(function (x) {
        x.classList.remove('seghl');
      });
      if (segId) {
        document.querySelectorAll('[data-seg="' + segId + '"]')
          .forEach(function (x) { x.classList.add('seghl'); });
      }
      document.dispatchEvent(new CustomEvent('daf:select',
        { detail: { seg: segId || null } }));
    },
    selected: function () {
      var el = document.querySelector('.seghl');
      return el ? el.dataset.seg : null;
    },

    hide: function (z) { daf().classList.add('hide-' + z); },
    show: function (z) { daf().classList.remove('hide-' + z); },
    toggle: function (z) { daf().classList.toggle('hide-' + z); },
    hidden: function () {
      return ZONES.filter(function (z) {
        return daf().classList.contains('hide-' + z);
      });
    },
  };

  // לחיצה בין מילים באותה שורה נתפסת למילה הקרובה ביותר — בלי זה
  // הרווחים שבין המילים "בולעים" חלק ניכר מהלחיצות.
  function segAt(e) {
    var t = e.target;
    if (t.dataset && t.dataset.seg) return t.dataset.seg;
    var ln = t.closest && t.closest('.ln');
    if (!ln) return null;
    var best = null, bd = 1e9;
    ln.querySelectorAll('.w[data-seg]').forEach(function (w) {
      var r = w.getBoundingClientRect();
      var dx = e.clientX < r.left ? r.left - e.clientX :
               e.clientX > r.right ? e.clientX - r.right : 0;
      if (dx < bd) { bd = dx; best = w; }
    });
    return best ? best.dataset.seg : null;
  }

  // ---------------------- בחירה לפי מקטעים בלבד — קשיח ויציב
  // גרירה חופשית בוטלה במכוון: בדף בנוי-שכבות אין דרך אמינה לגרור
  // בחירה בין מנועי דפדפן שונים בלי שטקסט זר ייכנס. הבחירה היחידה
  // היא מקטע שלם — דיבור-המתחיל ברש"י/תוספות/מדורי התחתית, או מאמר
  // בגמרא — בלחיצה. המקטעים מחושבים מראש בתוך עמודה אחת, ולכן
  // התוצאה דטרמיניסטית לחלוטין. ⌘C מעתיק את המקטע הנבחר; Esc מנקה.

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') Daf.select(null);
  });

  document.addEventListener('click', function (e) {
    var seg = segAt(e);
    if (!seg) return;
    Daf.select(Daf.selected() === seg ? null : seg);
  });

  // ריחוף: הדגשה קלה של כל המקטע שהעכבר מעליו, כדי שיהיה ברור מה ייבחר
  var hovSeg = null;
  function setHover(seg) {
    if (seg === hovSeg) return;
    document.querySelectorAll('.seghov').forEach(function (x) {
      x.classList.remove('seghov');
    });
    hovSeg = seg;
    if (seg) {
      document.querySelectorAll('[data-seg="' + seg + '"]')
        .forEach(function (x) { x.classList.add('seghov'); });
    }
  }
  document.addEventListener('mouseover', function (e) {
    if (csel.drag) return;                // לא באמצע גרירת בחירה
    setHover((e.target.dataset && e.target.dataset.seg) || null);
  });

  // העתקה: ⌘C מעתיק את המקטע הנבחר, בסדר קריאה נכון.
  // בלי מקטע נבחר — התנהגות הדפדפן הרגילה (מחוץ לדף).
  document.addEventListener('copy', function (e) {
    var seg = Daf.selected();
    if (!seg || !e.clipboardData) return;
    e.clipboardData.setData('text/plain', Daf.segText(seg));
    e.preventDefault();
  });

  var verEl = document.getElementById('daf-ver');
  if (verEl) verEl.textContent = 'ג' + DAF_VERSION;

  build();
  ensureFonts().then(Daf.fit);
  // גופן שמסיים להיטען מאוחר (למשל אחרי החלפת דף) — יישור חוזר
  if (document.fonts && document.fonts.addEventListener) {
    document.fonts.addEventListener('loadingdone', function () { Daf.fit(); });
  }
  window.Daf = Daf;
}());
