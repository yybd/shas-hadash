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

  // המצב הגלובלי של default.js: thisMasechet / thisDaf / talmud / a()
  function meta() {
    return {
      masechetIndex: window.thisMasechet,
      masechetName: window.talmud[window.thisMasechet][0],
      dafIndex: window.thisDaf,
      dafLabel: window.a(window.thisDaf),           // "ו." / "ו:"
      dafNumber: Math.floor(window.thisDaf / 2) + 2, // מספר הדף (ב=2)
      amud: window.thisDaf % 2 === 0 ? 'a' : 'b',
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
      zone: zoneLabel(window.Daf && el ? window.Daf.zoneOf(el) : null),
      text: window.Daf ? window.Daf.segText(seg) : '',
      gemaraText: window.Daf ? window.Daf.zoneText('gemara') : '',
    }, meta()));
  });

  // ---------------------------------------- בחירה חופשית בגרירה
  // daf.js מממש בחירה מותאמת (עמודה אחת, בסדר קריאה) ומשדר את תוצאתה
  // באירוע daf:selection — לא ב-window.getSelection של הדפדפן.
  document.addEventListener('daf:selection', function (e) {
    var d = e.detail || {};
    if (!d.text || d.text.length < 3) return;
    post(Object.assign({
      type: 'daf-selection',
      zone: zoneLabel(d.zone),
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
