/*
 * ai-bridge.js — הגשר בין מציג הדף לאפליקציית תלמוד AI.
 *
 * המציג רץ בתוך iframe של האפליקציה. כל אינטראקציית בחירה — לחיצה על
 * מקטע (מאמר בגמרא / ד"ה ברש"י ותוספות) או גרירת טקסט חופשית — משודרת
 * להורה ב-postMessage, וחלון הלימוד נפתח עם ההקשר המלא: המסכת, הדף,
 * האזור, טקסט הקטע, וכל טקסט הגמרא שבעמוד (להקשר של המודל).
 */
(function () {
  'use strict';

  // שמות מדויקים בלבד; כל השאר — עמודות שפוצלו (bottom-1, rashi-1…)
  // הם מדורי שוליים
  function zoneLabel(zone) {
    if (zone === 'gemara') return 'גמרא';
    if (zone === 'rashi') return 'רש"י';
    if (zone === 'tosafot') return 'תוספות';
    if (zone === 'header') return 'כותרת';
    return zone ? 'שוליים' : '';
  }

  // בדף צרוב האזור נשמר על השורה, ולצדו סימון "מסביב": מדור שוליים
  // הכתוב בכתב מלא (תוספות רי"ד וכד') יושב גיאומטרית באזור רש"י או
  // תוספות, ובלי הסימון היה מדווח למודל כרש"י.
  function labelOf(el) {
    var ln = el && el.closest ? el.closest('.ln') : null;
    if (ln && ln.dataset.surround) return 'שוליים';
    return zoneLabel(window.Daf && el ? window.Daf.zoneOf(el) : null);
  }

  // המצב הגלובלי של default.js: thisMasechet / thisDaf / talmud / dafRef()
  // מספר הדף אינו זהה לאינדקס העמוד: המסכתות הקטנות שבסוף הש"ס פותחות
  // באמצע מספור הדפים (תמיד בכה:), ולכן ההמרה נעשית רק דרך dafRef —
  // אחרת מראה המקום שנשלח למודל היה שגוי במסכתות האלה.
  function meta() {
    var ref = window.dafRef(window.thisMasechet, window.thisDaf);
    return {
      masechetIndex: window.thisMasechet,
      masechetName: window.talmud[window.thisMasechet][0],
      dafIndex: window.thisDaf,
      dafLabel: ref.label,                          // "ו." / "כה:"
      dafNumber: ref.number,
      amud: ref.amud,
    };
  }

  function post(msg) {
    try { window.parent.postMessage(msg, '*'); } catch (e) { /* ignore */ }
  }

  // ---------------------------------------- בחירת מקטע בלחיצה
  document.addEventListener('daf:select', function (e) {
    var seg = e.detail && e.detail.seg;
    if (!seg) { post({ type: 'daf-select', seg: null }); return; }
    // האזור נגזר מהמיקום בפועל של המקטע — לא מקידומת המזהה
    var el = document.querySelector('[data-seg="' + seg + '"]');
    post(Object.assign({
      type: 'daf-select',
      seg: seg,
      zone: labelOf(el),
      text: window.Daf ? window.Daf.segText(seg) : '',
      gemaraText: window.Daf ? window.Daf.zoneText('gemara') : '',
    }, meta()));
  });

  // ---------------------------------------- בחירה חלקית בגרירה
  // גרירה בתוך מקטע בוחרת רק את הקטע שנגרר; daf.js משדר את תוצאתה
  // באירוע daf:selection — לא ב-window.getSelection של הדפדפן.
  // האזור נגזר מהמקטע שהטווח יושב בו, בדיוק כמו בבחירת מקטע שלם.
  document.addEventListener('daf:selection', function (e) {
    var d = e.detail || {};
    if (!d.text || d.text.length < 3) return;
    var el = d.seg ? document.querySelector('[data-seg="' + d.seg + '"]') : null;
    post(Object.assign({
      type: 'daf-selection',
      seg: d.seg,
      zone: el ? labelOf(el) : zoneLabel(d.zone),
      text: d.text,
      gemaraText: window.Daf ? window.Daf.zoneText('gemara') : '',
    }, meta()));
  });

  // ---------------------------------------- דיווח ניווט בין דפים
  // עוטפים את loadDaf של default.js; ההורה מעדכן את הכותרת ואת ההקשר.
  // העטיפה נעשית לפני body.onload, כך שגם הטעינה הראשונה מדווחת.
  var origLoad = window.loadDaf;
  if (origLoad) {
    window.loadDaf = function (m, d) {
      origLoad(m, d);
      post(Object.assign({ type: 'daf-nav' }, meta()));
    };
  }

  // ---------------------------------------- פקודות מההורה
  window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.type === 'clear-select' && window.Daf) window.Daf.select(null);
  });
}());
