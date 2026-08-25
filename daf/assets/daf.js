/*
 * daf.js — שכבת ההיגיון של דפי צורת-הדף.
 *
 * הדף שנוצר מכיל גיאומטריה וטקסט: כל ריצת-טקסט ממוקמת אבסולוטית לפי
 * המיקום המדויק שלה ב-PDF. הסמנטיקה — אזורים, מקטעים וסדר קריאה —
 * נצרבת לתוך הדף מראש בזמן-בנייה (ראה tools/enrich).
 *
 * אין כאן שום היוריסטיקה ושום מדידה: לחיצה קוראת data-seg, גרירה
 * חותכת טווח data-i בתוך המקטע, ההעתקה ממוינת לפי data-i, וההסתרה
 * לפי data-zone / data-surround. התוצאה זהה בכל דפדפן, בכל זום ובכל
 * מצב טעינת גופנים — דטרמיניסטית לחלוטין.
 *
 * הקובץ מניח דף מועשר. הסיווג בזמן-ריצה שקדם להעשרה נמחק אחרי שכל
 * הש"ס נצרב; דף בלי data-segv יוצג כרגיל אך לא יהיו בו מקטעים,
 * ותירשם אזהרה בקונסולה.
 *
 * API — window.Daf:
 *   Daf.zones()               רשימת האזורים שנמצאו בדף
 *   Daf.zoneOf(el)            האזור של אלמנט
 *   Daf.zoneText(zone)        הטקסט הרציף של אזור
 *   Daf.segments()            מזהי כל המקטעים ('r3' / 't1' / 'g2')
 *   Daf.segText(segId)        הטקסט המלא של מקטע (ד"ה + גוף)
 *   Daf.select(segId)         בחירת/ביטול מקטע שלם; null מנקה
 *   Daf.selected()            מזהה המקטע הנבחר או null
 *   Daf.selectRange(seg,a,b)  בחירה חלקית — טווח data-i בתוך מקטע
 *   Daf.range()               {seg, from, to, text} של הטווח, או null
 *   Daf.copyText()            מה שיועתק: הטווח, או המקטע השלם
 *   Daf.hide(zone) / show / toggle / hidden()
 *   Daf.fit()                 כיול רוחב הריצות (רץ אוטומטית)
 *   Daf.baked()               האם הדף הנוכחי צרוב
 * אירועים על ה-document:
 *   'daf:select'    detail={seg}                    — בחירת מקטע שלם
 *   'daf:selection' detail={seg, from, to, text}    — סיום גרירה חלקית
 */
(function () {
  'use strict';

  // מוצג בסרגל (span#daf-ver) — כדי שאפשר יהיה לדעת בוודאות איזו
  // גרסת מציג רצה בפועל, בלי לנחש מול מטמונים והתקנות.
  var DAF_VERSION = 24;

  var ZONES = ['header', 'gemara', 'rashi', 'tosafot',
               'margin-right', 'margin-left', 'bottom'];

  function daf() { return document.querySelector('.daf-page'); }
  function num(el, k) { return parseFloat(el.dataset[k]); }
  function isBaked() { var d = daf(); return !!(d && d.dataset.segv); }

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

  // ------------------------------------------------------- קריאת הצריבה
  // כל מה שהמסלול הצרוב צריך: איסוף מילים לפי מקטע/אזור וצירופן בסדר
  // הקריאה הצרוב (data-i). אין כאן מדידה, ולכן אין תלות ברינדור.

  function all(sel) {
    return Array.prototype.slice.call(document.querySelectorAll(sel));
  }

  function byIndex(words) {
    return words.slice().sort(function (a, b) {
      return (+a.dataset.i) - (+b.dataset.i);
    });
  }

  function joinWords(words) {
    return words.map(function (w) { return w.textContent; })
      .join(' ').replace(/\s+/g, ' ').trim();
  }

  // גובה אמיתי לקופסת השורה: בלעדיו גובהה ~1px (צמתי הרווחים בלבד —
  // המילים אבסולוטיות וגולשות ממנה), ולחיצה בין מילים נופלת על רקע
  // הדף במקום על השורה. חשבון פשוט מ-data-size, בלי מדידה.
  function setLineHeights(lines) {
    lines.forEach(function (ln) {
      ln.style.height = (1.15 * num(ln, 'size')) + 'px';
    });
  }

  // ------------------------------------------- בחירה חלקית (טווח גרירה)
  // מילות מקטע תופסות טווח רצוף של data-i, ולכן חלק ממקטע מיוצג בשני
  // מספרים — from/to — ולא ברשימת אלמנטים. כל החישוב הוא השוואת
  // מספרים שנצרבו מראש: אין מדידה, ואין תלות ברינדור או במנוע.

  var range = null;      // {seg, from, to} — הטווח הנבחר, או null

  function segWords(seg) {
    return all('[data-seg="' + seg + '"][data-i]');
  }

  function segBounds(seg) {
    var lo = Infinity, hi = -Infinity;
    segWords(seg).forEach(function (w) {
      var i = +w.dataset.i;
      if (i < lo) lo = i;
      if (i > hi) hi = i;
    });
    return { lo: lo, hi: hi };
  }

  function rangeWords(r) {
    return byIndex(segWords(r.seg).filter(function (w) {
      var i = +w.dataset.i;
      return i >= r.from && i <= r.to;
    }));
  }

  function paintRange() {
    document.querySelectorAll('.selhl, .segdim').forEach(function (x) {
      x.classList.remove('selhl', 'segdim');
    });
    if (!range) return;
    segWords(range.seg).forEach(function (w) {
      var i = +w.dataset.i;
      w.classList.add(i >= range.from && i <= range.to ? 'selhl' : 'segdim');
    });
  }

  function clearRange() {
    if (!range) return;
    range = null;
    paintRange();
  }

  // ---------------------------------------------------------------- API

  var Daf = {
    ZONES: ZONES,
    baked: isBaked,

    // בנייה מחדש — לשימוש כשמזריקים דף חדש לאותו מסמך
    build: function () {
      var d = daf();
      if (!d || d.dataset.ready) return;
      // דף בלי צריבה אינו נתמך עוד: הוא ייראה תקין אך לא יהיו בו
      // מקטעים. אזהרה רועשת עדיפה על כישלון שקט בבחירה.
      if (!isBaked()) {
        console.warn('daf.js: הדף אינו מועשר (אין data-segv) — ' +
                     'אין מקטעים ואין בחירה. יש להריץ tools/enrich.');
      }
      setLineHeights(all('.daf-page .ln'));
      d.dataset.ready = '1';
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
      return ZONES.filter(function (z) {
        return document.querySelector('.ln[data-zone="' + z + '"]');
      });
    },

    zoneOf: function (el) {
      var ln = el && el.closest ? el.closest('.ln') : null;
      return ln ? ln.dataset.zone || null : null;
    },

    zoneText: function (zone) {
      return joinWords(byIndex(
        all('.ln[data-zone="' + zone + '"] .w[data-i]')));
    },

    segments: function () {
      var seen = [];
      document.querySelectorAll('[data-seg]').forEach(function (w) {
        if (seen.indexOf(w.dataset.seg) < 0) seen.push(w.dataset.seg);
      });
      return seen;
    },

    segText: function (segId) {
      return joinWords(byIndex(all('[data-seg="' + segId + '"]')));
    },

    select: function (segId) {
      clearRange();                       // בחירת מקטע מבטלת טווח חלקי
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

    // בחירה חלקית: טווח data-i בתוך מקטע אחד. הטווח נחתך תמיד לגבולות
    // המקטע — אי אפשר לבחור טקסט משני מקטעים.
    selectRange: function (seg, from, to) {
      if (!seg) { clearRange(); return null; }
      var b = segBounds(seg);
      if (!isFinite(b.lo)) return null;
      var lo = Math.max(b.lo, Math.min(from, to));
      var hi = Math.min(b.hi, Math.max(from, to));
      if (lo > hi) return null;
      // מקטע שלם ובחירה חלקית אינם דרים יחד. ההדגשה מוסרת ישירות ולא
      // דרך select(null) — כדי שגרירה לא תשדר אירוע ביטול בכל תזוזה.
      document.querySelectorAll('.seghl').forEach(function (x) {
        x.classList.remove('seghl');
      });
      range = { seg: seg, from: lo, to: hi };
      paintRange();
      return { seg: seg, from: lo, to: hi };
    },

    range: function () {
      return range ? { seg: range.seg, from: range.from, to: range.to,
                       text: joinWords(rangeWords(range)) } : null;
    },

    // הטקסט שייצא בהעתקה: הטווח החלקי אם קיים, אחרת המקטע השלם
    copyText: function () {
      if (range) return joinWords(rangeWords(range));
      var seg = Daf.selected();
      return seg ? Daf.segText(seg) : '';
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

  // ------------------------------- לחיצה, גרירה והעתקה — קשיח ויציב
  // לחיצה בוחרת מקטע שלם: דיבור-המתחיל ברש"י/תוספות/מדורי התחתית, או
  // מאמר בגמרא. גרירה בתוך מקטע בוחרת רק את הקטע שנגרר, ונחתכת תמיד
  // בגבול המקטע — אי אפשר לגרור לתוך מקטע שכן, וטקסט זר לא נכנס
  // לבחירה. הבחירה המובנית של הדפדפן כבויה ואינה משתתפת בכלל: כל
  // ההכרעה היא השוואת data-i שנצרבו, ולכן זהה בכל מנוע ובכל זום.
  // ⌘C מעתיק את הבחירה; Esc מנקה.

  // לחיצה בין מילים באותה שורה נתפסת למילה הקרובה ביותר — בלי זה
  // הרווחים שבין המילים "בולעים" חלק ניכר מהלחיצות.
  function wordAt(e) {
    var t = e.target;
    if (t.dataset && t.dataset.seg) return t;
    var ln = t.closest && t.closest('.ln');
    if (!ln) return null;
    var best = null, bd = 1e9;
    ln.querySelectorAll('.w[data-seg]').forEach(function (w) {
      var r = w.getBoundingClientRect();
      var dx = e.clientX < r.left ? r.left - e.clientX :
               e.clientX > r.right ? e.clientX - r.right : 0;
      if (dx < bd) { bd = dx; best = w; }
    });
    return best;
  }

  function segAt(e) {
    var w = wordAt(e);
    return w ? w.dataset.seg : null;
  }

  // ריחוף: הדגשה קלה של כל המקטע שהעכבר מעליו, כדי שיהיה ברור מה ייבחר.
  // אותה פונקציית תפיסה כמו בלחיצה — מה שמודגש הוא מה שייבחר.
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

  var drag = null;            // {seg, lo, hi, anchor, cur, x, y, moved}
  var skipClick = false;      // גרירה מסתיימת ב-click — שאין לפרש כלחיצה

  document.addEventListener('mousedown', function (e) {
    skipClick = false;
    if (e.button !== 0) return;
    var w = wordAt(e);
    // גרירה דורשת סדר קריאה צרוב; בדף לא-מועשר נשארת בחירת מקטע בלבד
    if (!w || w.dataset.i === undefined) return;
    var b = segBounds(w.dataset.seg);
    drag = { seg: w.dataset.seg, lo: b.lo, hi: b.hi, anchor: +w.dataset.i,
             cur: +w.dataset.i, x: e.clientX, y: e.clientY, moved: false,
             painted: null };
    e.preventDefault();       // בלי זה הדפדפן מתחיל גרירת-טקסט משלו
  });

  document.addEventListener('mousemove', function (e) {
    if (!drag) { setHover(segAt(e)); return; }
    // סף תזוזה: בלעדיו רעידה זעירה באצבע הופכת כל לחיצה לגרירה
    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 4) return;
      drag.moved = true;
      setHover(null);
    }
    var w = wordAt(e);
    if (w && w.dataset.i !== undefined) {
      var wi = +w.dataset.i;
      // מחוץ למקטע — נחתך לקצה שלכיוונו נגררת העכבר; מילה שאינה
      // בת-בחירה כלל (שוליים, כותרת) אינה מזיזה את הקצה
      drag.cur = w.dataset.seg === drag.seg ? wi :
                 wi < drag.lo ? drag.lo : wi > drag.hi ? drag.hi : drag.cur;
    }
    if (drag.painted === drag.cur) return;      // אותו קצה — אין מה לצבוע
    drag.painted = drag.cur;
    Daf.selectRange(drag.seg, drag.anchor, drag.cur);
  });

  window.addEventListener('mouseup', function () {
    if (!drag) return;
    var moved = drag.moved;
    drag = null;
    if (!moved) return;                   // לחיצה רגילה — ה-click יטפל
    skipClick = true;
    var r = Daf.range();
    if (!r || !r.text) return;
    document.dispatchEvent(new CustomEvent('daf:selection', { detail: r }));
  });

  document.addEventListener('click', function (e) {
    if (skipClick) { skipClick = false; return; }
    var seg = segAt(e);
    if (!seg) return;
    // לחיצה על מקטע שכבר נבחר במלואו מבטלת; לחיצה על מקטע שיש בו
    // בחירה חלקית מרחיבה אותה למקטע השלם
    Daf.select(Daf.selected() === seg ? null : seg);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') Daf.select(null);
  });

  // העתקה: ⌘C מעתיק את הבחירה — הטווח שנגרר, או המקטע השלם.
  // בלי בחירה — התנהגות הדפדפן הרגילה (מחוץ לדף).
  document.addEventListener('copy', function (e) {
    var txt = Daf.copyText();
    if (!txt || !e.clipboardData) return;
    e.clipboardData.setData('text/plain', txt);
    e.preventDefault();
  });


  var verEl = document.getElementById('daf-ver');
  if (verEl) verEl.textContent = 'ג' + DAF_VERSION;

  Daf.build();
  // במצב אפליקציה הדף מוזרק מאוחר יותר ו-build לא עשה דבר; הורדת
  // הגופנים מתחילה כבר עכשיו כדי שהיישור הראשון לא ימתין להם
  ensureFonts();
  // גופן שמסיים להיטען מאוחר (למשל אחרי החלפת דף) — יישור חוזר
  if (document.fonts && document.fonts.addEventListener) {
    document.fonts.addEventListener('loadingdone', function () { Daf.fit(); });
  }
  window.Daf = Daf;
}());
