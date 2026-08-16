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

  var ZONE_HE = { g: 'גמרא', r: 'רש"י', t: 'תוספות' };
  var ZONE_BY_NAME = {
    gemara: 'גמרא', rashi: 'רש"י', tosafot: 'תוספות',
    'margin-right': 'שוליים', 'margin-left': 'שוליים',
    header: 'כותרת',
  };
  function zoneLabel(zone) {
    if (!zone) return '';
    // התחתית מפוצלת לעמודות (bottom, bottom-1…) — כולן "שוליים"
    if (zone.indexOf('bottom') === 0) return 'שוליים';
    return ZONE_BY_NAME[zone] || '';
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
    // מקטעי התחתית ('b...') — עמודות ההמשך והמדורים הצדדיים
    post(Object.assign({
      type: 'daf-select',
      seg: seg,
      zone: seg.charAt(0) === 'b' ? 'שוליים' : ZONE_HE[seg.charAt(0)] || '',
      text: window.Daf ? window.Daf.segText(seg) : '',
      gemaraText: window.Daf ? window.Daf.zoneText('gemara') : '',
    }, meta()));
  });

  // ---------------------------------------- בחירה חופשית בגרירה
  document.addEventListener('mouseup', function () {
    // הבחירה מתעדכנת רק אחרי שאירוע ה-mouseup מסתיים
    setTimeout(function () {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      var node = sel.anchorNode;
      var el = node && (node.nodeType === 1 ? node : node.parentElement);
      if (!el || !el.closest('.daf-page')) return;
      var text = sel.toString().replace(/\s+/g, ' ').trim();
      if (text.length < 3) return;
      var zone = window.Daf ? window.Daf.zoneOf(el) : null;
      post(Object.assign({
        type: 'daf-selection',
        zone: zoneLabel(zone),
        text: text,
        gemaraText: window.Daf ? window.Daf.zoneText('gemara') : '',
      }, meta()));
    }, 0);
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
