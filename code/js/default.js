
//////table talmud
// [שם, מספר עמודים, היסט-פתיחה]
// ההיסט הוא מספר העמוד (אמוד) שבו המסכת מתחילה, כשעמוד 0 = דף ב. —
// רוב המסכתות פותחות שם ולכן ההיסט מושמט. המסכתות הקטנות שבסוף הש"ס
// חולקות את מספור הדפים עם המסכת שלפניהן (תמיד פותחת בכה:, מדות בלד.,
// קינים בכב.), ובלעדיו רשימת הדפים הייתה מתייגת אותן ב. ב: ג. …
var talmud = [
    ["ברכות", 125],
    ["שבת", 312],
    ["עירובין", 207],
    ["פסחים", 240],
    ["שקלים", 42],
    ["ראש השנה", 67],
    ["יומא", 173],
    ["סוכה", 110],
    ["ביצה", 78],
    ["תענית", 59],
    ["מגילה", 61],
    ["מועד קטן", 55],
    ["חגיגה", 51],

    ["יבמות", 242],
    ["כתובות", 222],
    ["נדרים", 180],
    ["נזיר", 130],
    ["סוטה", 96],
    ["גיטין", 178],
    ["קידושין", 162],

    ["בבא קמא", 236],
    ["בבא מציעא", 235],
    ["בבא בתרא", 350],
    ["סנהדרין", 224],
    ["מכות", 46],
    ["שבועות", 96],
    ["עבודה זרה", 150],
    ["הוריות", 25],

    ["זבחים", 238],
    ["מנחות", 217],
    ["חולין", 281],
    ["בכורות", 119],
    ["ערכין", 65],
    ["תמורה", 65],
    ["כריתות", 54],
    ["מעילה", 41],
    ["קינין", 7, 40],
    ["תמיד", 17, 47],
    ["מדות", 8, 64],

    ["נדה", 143]];

var thisMasechet = 0;
var thisDaf = 0;


function start() {

    if ("thisMasecet" in localStorage) {
        thisMasechet = parseInt(localStorage.getItem('thisMasecet'));
    }
    if ("thisDaf" in localStorage) {
        thisDaf = parseInt(localStorage.getItem('thisDaf'));
    }

    tableTalmud();
    //tableMefasim() ;
    watchDafScale();          // לפני הטעינה — כדי לתפוס גם את הפריסה הראשונה
    loadMasechet(thisMasechet, thisDaf);
    //showDivMasechtot()
    //LEFT: 37, UP: 38,  RIGHT: 39, DOWN: 40
    window.addEventListener("keydown", function (e) {
        if (e.keyCode === 37 && document.activeElement !== 'text') {
            e.preventDefault();
            next();
        }
        if (e.keyCode === 39 && document.activeElement !== 'text') {
            e.preventDefault();
            back();
        }
        if (e.keyCode === 38 && document.activeElement !== 'text') {
            e.preventDefault();
            //togglebt();
        }
        if (e.keyCode === 40 && document.activeElement !== 'text') {
            e.preventDefault();
            //togglebt();
        }
        // מקשי + / - במקלדת — הגדלה והקטנה של הדף (כמו כפתורי הזום בממשק).
        // '=' נחשב כמו '+' (אותו מקש בלי Shift). לא כשהמיקוד בשדה קלט,
        // ולא עם Cmd/Ctrl — כדי לא לדרוס את זום הדפדפן/מערכת.
        var tag = (document.activeElement || {}).tagName;
        var typing = tag === 'INPUT' || tag === 'TEXTAREA' ||
            (document.activeElement || {}).isContentEditable;
        if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
            if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                zoomIn();
            }
            if (e.key === '-') {
                e.preventDefault();
                zoomOut();
            }
        }
    });
    // בתלמוד AI אין מסך מפרשים — חלון הלימוד מחליף אותו
    const el = document.getElementById('mefarshim-bt');
    if (el) el.addEventListener("click", () => tableMefasim());

    if (!isPinchSetup) {
        setupPinchZoom();
        isPinchSetup = true;
    }
}



// ששת הסדרים, לפי הסדר של טבלת talmud שמעליה. בבורר המסכתות הם
// מובחנים במשקל האות — סדר אחד מודגש, הבא אחריו רגיל, וחוזר חלילה.
// כך גבולות הסדרים נראים לעין בלי להוסיף כותרות שיפרקו את רשת
// הבחירה בת חמש העמודות. הספירה חייבת להסתכם במספר המסכתות שבטבלה.
var SEDARIM = [
    ["זרעים", 1], ["מועד", 12], ["נשים", 7],
    ["נזיקין", 8], ["קדשים", 11], ["טהרות", 1],
];

// אינדקס הסדר של מסכת, לפי מיקומה בטבלה
function sederOf(masechetIndex) {
    var upto = 0;
    for (var s = 0; s < SEDARIM.length; s++) {
        upto += SEDARIM[s][1];
        if (masechetIndex < upto) return s;
    }
    return SEDARIM.length - 1;
}

function tableTalmud() {

    var row = 0;
    var cols = 0;
    var len = talmud.length;
    for (var i = 0; i < len; i++) {
        var cell = makeDir("cal", i, talmud[i][0], function () {
            //window.location.assign("masechet.html?no=" + this.id);
            //showDivDaf(this.id);
            loadMasechet(this.id, 0);
            localStorage.setItem('thisMasecet', this.id);
            $('#exampleModal').modal('hide');

        }, cols, row, "shas")
        var sd = sederOf(i);
        cell.classList.add(sd % 2 ? "seder-b" : "seder-a");
        cell.title = "סדר " + SEDARIM[sd][0];

        cols++;
        if (cols == 5) { row++; cols = 0; }
    }


}

function makeDir(name, id, conect, click, column, row, tableID) {

    var div = document.createElement("div");
    div.className = name;
    div.id = id;
    div.appendChild(document.createTextNode(conect));
    //console.log(conect);
    div.onclick = click;

    var tbl = document.getElementById(tableID);
    if (tbl) { tbl.rows[row].cells[column].appendChild(div); }

    return div;
}

/*
function makeNewTab(text) {

  var tab = '<label id=' + text +' class="topcoat-tab-bar__item">' +
     '<input type="radio" name="topcoat" class="hide-input">' +
     '<button'  +
         //onclick='showMasechtot()' +
         ' class="topcoat-tab-bar__button">' + text + '</button></label>'
        document.getElementById("tab-bar").innerHTML += tab;

}
*/

/*
function  showDivMasechtot() {
  var masechtot = document.getElementById("masecet-show");
  var daf = document.getElementById("daf-show");

  masechtot.style.display = 'block'
  daf.style.display = 'none'

  tableTalmud();
}

function  showDivDaf(n_masechet) {
  //var masechtot = document.getElementById("masecet-show");
  //var daf = document.getElementById("daf-show");

  //daf.style.display = 'block';
  //masechtot.style.display = 'none';

  loadMasechet(n_masechet);

}
*/
////
var folder = 0;

/*
function getUrlVars() {
    var vars = {};
    var parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
        vars[key] = value;
    });
    return vars;
}
*/

function loadMasechet(n_masechet, n_daf) {
    //folder =  getUrlVars()["no"];

    loadDaf(n_masechet, n_daf);
    makeList(n_masechet);
    //makeNewTab(talmud[n_masechet][0]) ;
    document.title = talmud[n_masechet][0];
    //alert(talmud[n_masechet][0]);
    // tableMefasim();

}


// ---------------------------------------------------------------------------
// מציג דפי ה-HTML (ש"ס חדש).
//
// הדף אינו נטען ב-iframe אלא **מוזרק ישירות** לתוך המסמך: כך אין שכבת
// רסטור נפרדת (ה-iframe היה מרונדר בגודלו המקורי ונמתח — ומכאן הטשטוש),
// והתוכן חי באותו DOM — כלומר בחירה, חיפוש והדפסה עובדים ישירות עליו.
// ה-CSS והלוגיקה (daf/assets/daf.css + daf.js) נטענים פעם אחת ב-index.
// ---------------------------------------------------------------------------

var DAF_W = 643.58, DAF_H = 992.58;   // מידות הדף בנקודות
var scale = 0;                        // 0 = התאם לרוחב אוטומטית
var MAX_AUTO_W = 1024;                // רוחב ברירת המחדל של הדף (לפני זום ידני)
var isPinchSetup = false;
var dafReq = 0;                       // מונה בקשות — מונע "עקיפה" בין דפים

// קנה המידה שהוחל בפועל — שומר מלצייר מחדש לחינם, וחוסם לולאת-הזנה
// אפשרית מול ה-ResizeObserver (הופעת פס גלילה משנה את רוחב המכולה).
var lastScale = 0;

// רוחב המכולה נקבע ע"י הפריסה, ולעיתים רק אחרי שהדף כבר הוזרק. במקום
// לנחש מתי זה קורה, מקשיבים לשינוי בפועל: כך הדף מקבל את גודלו הנכון
// מיד כשהרוחב האמיתי ידוע, בטעינה הראשונה כמו בכל שינוי חלון.
function watchDafScale() {
    var container = document.getElementById('canvas-container');
    if (!container || !window.ResizeObserver || container.dataset.roDone) return;
    container.dataset.roDone = '1';
    new ResizeObserver(function () {
        if (!scale) applyDafScale();             // רק במצב התאמה אוטומטית
    }).observe(container);
}

function applyDafScale() {
    var host = document.getElementById('the-daf');
    var wrap = document.getElementById('pdf-wrapper');
    var container = document.getElementById('canvas-container');
    var page = host && host.querySelector('.daf-page');
    if (!page || !container) return;

    var s = scale;
    if (!s) {
        // ברירת מחדל: רוחב הדף עד MAX_AUTO_W, ובחלון צר יותר — לפי רוחב החלון.
        // בזמן ההזרקה הפריסה לא תמיד מוכנה והמכולה עדיין חסרת רוחב; חישוב
        // כזה היה נחתך לרצפה (0.2) והדף היה נשאר זעיר עד שינוי חלון הבא.
        // כאן פשוט לא נוגעים, וה-ResizeObserver יקרא שוב כשהרוחב יתייצב.
        if (container.clientWidth < 2) return;
        s = Math.min(container.clientWidth, MAX_AUTO_W) / DAF_W;
        s = Math.max(0.2, Math.min(s, 3));
    }
    if (s === lastScale) return;                 // אין שינוי — אין מה לצייר
    lastScale = s;
    // zoom (ולא transform) — הדפדפן מרנדר מחדש בגודל היעד, כך שהאותיות
    // נשארות חדות בכל רמת הגדלה
    host.style.zoom = s;
    if (wrap) {
        wrap.style.width = (DAF_W * s) + 'px';
        wrap.style.height = (DAF_H * s) + 'px';
        // מידות אפקט הכריכה נגזרות מהרוחב המוצג, כך שהמראה זהה בכל זום
        wrap.style.setProperty('--gutter-w', (0.018 * DAF_W * s) + 'px');
        wrap.style.setProperty('--gutter-r', (0.006 * DAF_W * s) + 'px');
        // הדף עצמו יושב בתוך ‎#the-daf שמוגדל ב-zoom, ולכן כל px בתוכו נמתח
        // פי s. כדי שהפינה שלו תהיה זהה בדיוק לפינת שכבת ההצללה שמחוצה לו,
        // הרדיוס הפנימי נמסר ביחידות הדף (בלי s)
        wrap.style.setProperty('--gutter-rp', (0.006 * DAF_W) + 'px');
    }
    if (window.Daf) Daf.fit();
}

function loadDaf(n_masechet, n_daf) {
    thisMasechet = n_masechet;
    thisDaf = n_daf;

    // תווית בורר המסכתות. נקבעת כאן ולא ב-loadMasechet כי loadDaf הוא
    // המסלול היחיד שעובר בכל טעינת דף — גם בדילוג בתוך אותה מסכת.
    var pick = document.getElementById('masechet-name');
    if (pick) pick.textContent = talmud[n_masechet][0];

    localStorage.setItem('thisDaf', thisDaf);

    if (n_daf == 0) { $(".bi-chevron-right").show(); }
    if (n_daf == talmud[n_masechet][1] - 1) { $(".bi-chevron-left").hide(); }
    else { $(".bi-chevron-left").show(); }

    var bindRight = n_daf % 2 === 0;          // עמוד א — הכריכה מימין
    var overlayEl = document.getElementById('book-effect-overlay');
    if (overlayEl) {
        overlayEl.classList.remove('effect-left-page', 'effect-right-page');
        overlayEl.classList.add(bindRight ? 'effect-left-page' : 'effect-right-page');
    }
    var wrapEl = document.getElementById('pdf-wrapper');
    if (wrapEl) {
        wrapEl.classList.remove('binding-right', 'binding-left');
        wrapEl.classList.add(bindRight ? 'binding-right' : 'binding-left');
    }

    var host = document.getElementById('the-daf');
    if (!host) return;
    var req = ++dafReq;
    // no-cache = לאמת מול השרת ולא להגיש עותק ישן מהמטמון; דפים שנבנו
    // מחדש נטענים מיד, ודף שלא השתנה מוחזר כ-304 בלי הורדה חוזרת.
    // הדפים מאוחסנים דחוסים (‎.html.gz, פי ~10 פחות נפח) ונפרסים כאן
    // עם DecompressionStream — ה-HTML שמתקבל זהה ביט-ביט למקור
    fetch('daf/' + n_masechet + '/' + n_daf + '.html.gz', { cache: 'no-cache' })
        .then(function (r) {
            if (!r.ok) return Promise.reject(r.status);
            return r.arrayBuffer();
        })
        .then(function (buf) {
            // שרת שמזהה ‎.gz (כמו שרת הפיתוח של Vite) שולח
            // Content-Encoding: gzip והדפדפן כבר פורס את הקובץ בעצמו.
            // בודקים את בייטי הפתיחה של gzip ופורסים רק אם עוד צריך.
            var b = new Uint8Array(buf);
            if (b[0] === 0x1f && b[1] === 0x8b) {
                var ds = new DecompressionStream('gzip');
                return new Response(new Response(buf).body.pipeThrough(ds)).text();
            }
            return new TextDecoder().decode(buf);
        })
        .then(function (html) {
            if (req !== dafReq) return;            // בקשה ישנה — התעלם
            var doc = new DOMParser().parseFromString(html, 'text/html');
            var page = doc.querySelector('.daf-page');
            if (!page) return Promise.reject('מבנה דף לא מוכר');
            // מידות הדף מוגדרות במשתני CSS שבתוך הקובץ; מעתיקים אותן
            // לאלמנט עצמו, כי ה-:root של הדף אינו מוזרק
            var vars = /--page-w:\s*([\d.]+)px;\s*--page-h:\s*([\d.]+)px/.exec(html);
            if (vars) {
                DAF_W = parseFloat(vars[1]); DAF_H = parseFloat(vars[2]);
            }
            page.style.width = DAF_W + 'px';
            page.style.height = DAF_H + 'px';
            host.innerHTML = '';
            host.appendChild(document.adoptNode(page));
            if (window.Daf) Daf.build();           // סיווג אזורים ומקטעים
            applySurround();                       // מצב הסתרת המפרשים נשמר
            applyDafScale();
        })
        .catch(function (e) {
            if (req === dafReq) host.innerHTML =
                '<div style="padding:2rem">הדף אינו זמין (' + e + ')</div>';
        });
}

window.addEventListener('resize', function () { if (!scale) applyDafScale(); });

// ---------------------------------------------------------------------------
// הצגה/הסתרה של המפרשים שמסביב לגפ"ת — השוליים (עין משפט, מסורת הש"ס,
// גליון, תורה אור) והתחתית (המשכי רש"י/תוס', רב נסים גאון וכו').
// המצב נשמר בין הפעלות ומוחל מחדש על כל דף שנטען, כי הדף המוזרק חדש.
// ---------------------------------------------------------------------------
var hideSurround = localStorage.getItem('hideSurround') === '1';

function applySurround() {
    if (!window.Daf || !document.querySelector('.daf-page')) return;
    // התיוג עצמו נעשה ב-daf.js: 'surround' מסומן על השוליים והמשכיהם,
    // על המדורים העצמאיים שבתחתית ועל כותרותיהם — אך לא על המשכי
    // רש"י/תוספות, שנשארים גלויים גם במצב הדף הנקי.
    hideSurround ? Daf.hide('surround') : Daf.show('surround');
    var ic = document.querySelector('#surround-bt i');
    if (ic) ic.className = 'bi ' + (hideSurround ? 'bi-eye-slash' : 'bi-eye');
}

function toggleSurround() {
    hideSurround = !hideSurround;
    localStorage.setItem('hideSurround', hideSurround ? '1' : '0');
    applySurround();
}

// ---------------------------------------------------------------------------
// צביטה להגדלה/הקטנה.
// באייפון אי אפשר לסמוך על הזום של הדפדפן: ב-WKWebView (האפליקציה) הוא
// כבוי, ובספארי הוא מגדיל את כל העמוד ולא את הדף. לכן הצביטה נתפסת כאן
// ומוזנת ל-scale, כלומר ל-CSS zoom — הדף מרונדר מחדש בגודל היעד ונשאר חד.
// במהלך התנועה נותנים משוב מיידי עם transform (זול), ובסיומה מתחייבים.
// ---------------------------------------------------------------------------
function setupPinchZoom() {
    var container = document.getElementById('canvas-container');
    var wrap = document.getElementById('pdf-wrapper');
    if (!container || !wrap) return;

    var startDist = 0, startScale = 0, live = 1;

    function dist(e) {
        var dx = e.touches[0].clientX - e.touches[1].clientX;
        var dy = e.touches[0].clientY - e.touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function currentScale() {
        return scale || Math.min(container.clientWidth, MAX_AUTO_W) / DAF_W;
    }

    container.addEventListener('touchstart', function (e) {
        if (e.touches.length !== 2) return;
        startDist = dist(e);
        startScale = currentScale();
        live = 1;
    }, { passive: true });

    container.addEventListener('touchmove', function (e) {
        if (e.touches.length !== 2 || !startDist) return;
        e.preventDefault();               // חוסם את זום העמוד המובנה
        live = dist(e) / startDist;
        wrap.style.transformOrigin = 'center top';
        wrap.style.transform = 'scale(' + live + ')';
    }, { passive: false });

    function commit() {
        if (!startDist) return;
        wrap.style.transform = '';
        wrap.style.transformOrigin = '';
        if (Math.abs(live - 1) > 0.01) {
            scale = Math.max(0.3, Math.min(3, startScale * live));
            applyDafScale();
        }
        startDist = 0;
        live = 1;
    }

    container.addEventListener('touchend', commit);
    container.addEventListener('touchcancel', commit);

    // ספארי שולח גם אירועי gesture — חוסמים כדי שלא יזום את העמוד כולו
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (n) {
        container.addEventListener(n, function (e) { e.preventDefault(); });
    });
}

function zoomIn() {
    var container = document.getElementById('canvas-container');
    if (!scale) scale = container
        ? Math.min(container.clientWidth, MAX_AUTO_W) / DAF_W : 1;
    scale = Math.min(3, scale + 0.2);
    applyDafScale();
}

function zoomOut() {
    var container = document.getElementById('canvas-container');
    if (!scale) scale = container
        ? Math.min(container.clientWidth, MAX_AUTO_W) / DAF_W : 1;
    if (scale > 0.4) { scale -= 0.2; applyDafScale(); }
}

function makeList(n_masechet) {

    var len = talmud[n_masechet][1];
    var bar = document.getElementById("bar-daf");
    bar.innerHTML = "";
    for (var i = 0; i < len; i++) {
        var div = document.createElement("li");
        div.className = "nam-daf";
        div.id = i;
        div.appendChild(document.createTextNode(a(i, n_masechet)));
        div.onclick = function () {
            //var daf = document.getElementById("daf");
            //daf.src = "shas/" + n_masechet + "/" + this.id + ".pdf"
            loadDaf(n_masechet, this.id);
            // בנייד הרשימה צפה מעל הדף — נסגרת אחרי הבחירה
            if (window.matchMedia('(max-width: 991.98px)').matches) closeDafList();
        }
        bar.appendChild(div);

    }
}


// ---------------------------------------------------------------------------
// מספור הדפים. אינדקס העמוד בתיקייה הוא יחסי למסכת (0 = העמוד הראשון
// שלה), ואילו מספר הדף המודפס נגזר ממנו בתוספת היסט-הפתיחה שבטבלה.
// dafRef הוא מקור האמת היחיד להמרה — גם התווית ברשימה וגם מראה המקום
// שנשלח למודל (ai-bridge) נגזרים ממנו, כדי שלא ייפרדו לעולם.
// ---------------------------------------------------------------------------

function dafOffset(m) {
    var row = talmud[m];
    return (row && row[2]) || 0;
}

function dafRef(m, d) {
    var k = parseInt(d, 10) + dafOffset(m);      // עמוד מוחלט: 0 = ב.
    return {
        label: gimatria(Math.floor(k / 2) + 2) + (k % 2 === 0 ? "." : ":"),
        number: Math.floor(k / 2) + 2,
        amud: k % 2 === 0 ? "a" : "b",
    };
}

// m מושמט — המסכת המוצגת כעת
function a(i, m) {
    return dafRef(m === undefined ? thisMasechet : m, i).label;
}

//גימטריה
var letters1 = 'אבגדהוזחטי';
var letters2 = 'יכלמנסעפצק';
var letters3 = 'קרשת';
var letters4 = 'אבגדה';
function gimatria(num) {
    heb = "";
    while (num > 1000) {
        heb += letters4.charAt((num / 1000) - 1);
        heb += "";
        num %= 1000;
    }
    while (num > 400) {
        heb += "ת";
        num -= 400;
    }
    if (num >= 100) {
        heb += letters3.charAt((num / 100) - 1);
        num %= 100;
    }
    if (num >= 10) {
        if (num == 15) {
            heb += 'טו';
            num = 0;
        }
        else if (num == 16) {
            heb += 'טז';
            num = 0;
        }
        else {
            heb += letters2.charAt((num / 10) - 1);
            num %= 10;

        }
    }
    if (num >= 1) {
        heb += letters1.charAt(num - 1);
    }
    if (heb.length > 1) {

        heb = heb.slice(0, heb.length - 1) + heb.charAt(heb.length - 1);
    }
    return heb;
    //document.getElementById("result1").innerHTML = heb;
}

/*
function toggle(id ) {

       var button = document.getElementById("show");
       var masechtot = document.getElementById("masecet-show");

       if(masechtot.style.display == 'none')
          {
            masechtot.style.display = 'block';
            button.innerHTML = "-";
          }
       else
          {
            masechtot.style.display = 'none';
            button.innerHTML = "+";
          }
    }

*/


////mefarshim///



var mefarshimJSON = {};
var mefarshimGridCols = 0;
var mefarshimGridRow = 0;

function loadedMefareshData(result) {
    if (!result || !result.id) return;

    var t = result.text;
    mefarshimJSON[result.id] = t;

    makeDir("cal-mf", "mf-" + result.id, mf[result.id], function (event) {
        loadMefaresh(this.id);
    }, mefarshimGridCols, mefarshimGridRow, "list-mefarshim");

    mefarshimGridCols++;
    if (mefarshimGridCols == 5) {
        mefarshimGridRow++;
        mefarshimGridCols = 0;
    };

    var tt = mefarshimJSON[result.id][thisDaf + 2];
    if (tt === undefined || tt.length === 0) {
        $('#mf-' + result.id).css("color", "#E8E8E8");
    } else {
        $('#mf-' + result.id).css("color", "black");
    }
}

// thisMasechet =0;
// thisDaf = 0;
function tableMefasim() {
    //alert('n');
    mefarshimJSON = {};
    $('#list-mefarshim tr td').empty();
    // Fixed typo from doobsidian://...
    document.getElementById("con-mefares").innerHTML = "";
    $('.cal-mf').css("font-weight", "normal");


    mefarshimGridRow = 0;
    mefarshimGridCols = 0;
    // Clean up old scripts to prevent memory leaks/DOM clutter
    const oldScripts = document.querySelectorAll('script[src^="mefarshim/"]');
    oldScripts.forEach(script => script.remove());

    var len = Lmefarshim[thisMasechet].length - 1;

    for (var i = 0; i < len; i++) {
        var mefaresh = Lmefarshim[thisMasechet][i + 1];
        var script = document.createElement('script');
        script.src = "mefarshim/" + mefaresh + "/" + thisMasechet + ".js";
        document.body.appendChild(script);
    }


    /*
    var slides = document.getElementsByClassName("cal-mf");
     
    for (var i = 0; i < slides.length; i++) {
       console.log(slides);
       var idd = slides.item(i).id.substring(3);
       var tt = mefarshimJSON[idd][thisDaf+2];
       //console.log(slides.item(i));
       if (tt === undefined || tt.length === 0  ) {
           //console.log("The string is empty");
           $(slides.item(i) ).css( "color", "gray" );
       } else {
               //console.log(t[thisDaf]);
               $(slides.item(i) ).css( "color", "black" );
       }
       console.log(slides.item(i).id);
    }
    */
    document.getElementById("title-daf-mefaresh").innerHTML = a(thisDaf);

    //console.log(JSON.stringify(mefarshimJSON));

}
var thisMefaresh = 0;

function loadMefaresh(id) {

    var idd = id.substring(3);
    thisMefaresh = idd;
    document.getElementById("con-mefares").innerHTML = "";
    //console.log( a(thisDaf));

    $('.cal-mf').css("font-weight", "normal");
    $("#" + id).css("font-weight", "bold");
    document.getElementById("con-mefares").innerHTML = prossesMefaresh(mefarshimJSON[idd][thisDaf + 2]);
    //console.log(prossesMefaresh(mefarshimJSON[idd][thisDaf+2]));

    document.getElementById("title-daf-mefaresh").innerHTML = a(thisDaf);

    var slides = document.getElementsByClassName("cal-mf");

    for (var i = 0; i < slides.length; i++) {
        // console.log(slides);
        var idd = slides.item(i).id.substring(3);
        var tt = mefarshimJSON[idd][thisDaf + 2];
        //console.log(slides.item(i));
        if (tt === undefined || tt.length === 0) {
            //console.log("The string is empty");
            $(slides.item(i)).css("color", "#E8E8E8");
        } else {
            //console.log(t[thisDaf]);
            $(slides.item(i)).css("color", "black");
        }
        //console.log(slides.item(i).id);
    }

}

function prossesMefaresh(text) {
    var t = [];
    t = text;
    var r = "";
    if (Array.isArray(t)) {
        t.forEach(function (t1) {
            r += t1 + "<br>";
        });
    }
    //console.log(r);
    return r;

}

//Flatten an array//
const flatten = (arr) => {
    const result = [];
    arr.forEach((item) => {
        if (Array.isArray(item)) {
            result.push(...flatten(item));
        } else {
            result.push(item);
        }
    });
    return result;
};


function prossesGmaraText(text, textR, textT) {
    var t = [];
    t = text;
    var r = "";
    r += '<b>גמרא</b><br>';

    if (Array.isArray(text)) {
        t.forEach(function (t1) {
            r += t1 + ".<br>";
        });
    }
    //console.log(textR);
    if (Array.isArray(textR)) {
        r += '<hr><b>רש״י </b><br>'
        flatten(textR).forEach(function (t2) {
            t2.length > 0 ? r += "<b>" + t2.replace("-", "-</b>").replace("–", "-</b>").replace("-", "-</b>") + "<br>" : "";
        });
    }
    if (Array.isArray(textT)) {
        r += '<hr><b>תוספות</b><br>'
        flatten(textT).forEach(function (t3) {
            t3.length > 0 ? r += "<b>" + t3.replace("-", "-</b>").replace("–", "-</b>").replace("-", "-</b>").replace(".", "-</b>") + "<br>" : "";
        });
    }


    return r;

}


function next() {
    if (parseInt(thisDaf) + 1 < talmud[thisMasechet][1]) {
        loadDaf(thisMasechet, parseInt(thisDaf) + 1);
    }

}
function back() {

    if (parseInt(thisDaf) - 1 >= 0) {
        loadDaf(thisMasechet, parseInt(thisDaf) - 1);
    }
}


function backMf() {
    back();
    document.getElementById("con-mefares").innerHTML = "";
    !(thisMefaresh == 0) ? loadMefaresh('mf-' + thisMefaresh) : document.getElementById("con-mefares").innerHTML = "";//prossesMefaresh(mefarshimJSON[thisMefaresh][thisDaf+2]);
    document.getElementById("title-daf-mefaresh").innerHTML = a(thisDaf);


}
function nextMf() {
    next()
    document.getElementById("con-mefares").innerHTML = "";
    !(thisMefaresh == 0) ? loadMefaresh('mf-' + thisMefaresh) : document.getElementById("con-mefares").innerHTML = "";//prossesMefaresh(mefarshimJSON[thisMefaresh][thisDaf+2]);
    document.getElementById("title-daf-mefaresh").innerHTML = a(thisDaf);

}

var myIFrame = document.getElementById("daf-text");
var cssLink = document.createElement("link")
cssLink.href = "code/css/default.css";
cssLink.rel = "stylesheet";
cssLink.type = "text/css";
//myIFrame.document.body.appendChild(cssLink);

function toggleDafList() {
    var dafCol = document.getElementById("col-daf");
    var contentCol = dafCol.nextElementSibling; // The PDF container column

    if (dafCol.classList.contains("d-none")) {
        // Show List
        dafCol.classList.remove("d-none");

        // Shrink content to make space (restore original mobile layout)
        contentCol.classList.remove("col-12");
        contentCol.classList.add("col-10");

        // בנייד הרשימה צפה מעל הדף — נגיעה בדף סוגרת אותה
        if (window.matchMedia('(max-width: 991.98px)').matches) {
            document.getElementById('canvas-container')
                .addEventListener('click', closeDafList, { once: true });
        }
    } else {
        // Hide List
        dafCol.classList.add("d-none");

        // Expand content to full width
        contentCol.classList.remove("col-10");
        contentCol.classList.add("col-12");
    }
}

function closeDafList() {
    var dafCol = document.getElementById("col-daf");
    if (dafCol && !dafCol.classList.contains("d-none")) toggleDafList();
}
