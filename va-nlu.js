/* va-nlu.js (small fixes: 'kitne trade' singular, verb-after filters, bare 'point one') - language detection, number parsing, entities and intents.
   Pure functions only (no DOM, no app access) so it can be unit-tested in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VANLU = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- Devanagari -> Roman keyword dictionary ---------- */
  const DEV = {};
  (function (s) {
    s.split('|').forEach(function (p) { const a = p.split('='); DEV[a[0]] = a[1]; });
  })(
    'गोल्ड=gold|सोना=sona|सिल्वर=silver|चांदी=silver|बिटकॉइन=bitcoin|यूरो=euro|पाउंड=pound|येन=yen|नैस्डैक=nasdaq|डाओ=dow|' +
    'डैशबोर्ड=dashboard|होम=home|खोलो=kholo|खोलिए=kholo|खोलें=kholo|खोल=khol|दिखाओ=dikhao|दिखाइए=dikhao|दिखाएं=dikhao|दिखा=dikha|' +
    'बताओ=batao|बताइए=batao|बताएं=batao|बता=bata|बोलो=bolo|बोल=bol|मेरा=mera|मेरी=meri|मेरे=mere|मुझे=mujhe|आज=aaj|कल=kal|का=ka|की=ki|के=ke|' +
    'कितना=kitna|कितने=kitne|कितनी=kitni|है=hai|हैं=hain|क्या=kya|ट्रेड=trade|ट्रेड्स=trades|ट्रेडिंग=trading|जर्नल=journal|' +
    'प्रॉफिट=profit|प्रोफिट=profit|लॉस=loss|नुकसान=nuksan|मुनाफा=nafa|मुनाफ़ा=nafa|कमाई=kamai|टोटल=total|कुल=kul|' +
    'महीना=mahina|महीने=mahine|हफ्ता=hafta|हफ्ते=hafte|सप्ताह=hafta|आखिरी=aakhri|आख़िरी=aakhri|आखरी=aakhri|पिछला=pichla|पिछले=pichle|' +
    'नया=naya|नई=nayi|जोड़ो=jodo|जोड़ें=jodo|डालो=dalo|सेव=save|करो=karo|कर=kar|दो=do|हाँ=haan|हां=haan|जी=ji|ठीक=theek|नहीं=nahi|नही=nahi|' +
    'रद्द=cancel|कैंसिल=cancel|रुको=ruko|रोको=ruko|बंद=band|चालू=chalu|आवाज=awaaz|आवाज़=awaaz|जवाब=jawab|हिंदी=hindi|हिन्दी=hindi|' +
    'अंग्रेज़ी=angrezi|अंग्रेजी=angrezi|इंग्लिश=english|में=mein|मैं=main|बात=baat|ओपन=open|सेटिंग=setting|सेटिंग्स=settings|टूल्स=tools|' +
    'डायरी=diary|गोल=goal|गोल्स=goals|टारगेट=target|एनालिटिक्स=analytics|स्टैटिस्टिक्स=statistics|कैलेंडर=calendar|रिपोर्ट=report|' +
    'हिस्ट्री=history|विन=win|रेट=rate|जीत=jeet|हार=haar|सबसे=sabse|बड़ा=bada|बड़ी=badi|अच्छा=accha|पेयर=pair|खरीद=kharid|बेच=bech|' +
    'बाय=buy|सेल=sell|एंट्री=entry|एग्जिट=exit|एक्जिट=exit|स्टॉप=stop|लॉट=lot|टेक=take|नोट=note|स्ट्रैटेजी=strategy|स्ट्रेटेजी=strategy|' +
    'डिलीट=delete|हटाओ=hatao|मिटाओ=mita|एडिट=edit|बदलो=badlo|सर्च=search|ढूंढो=dhundo|ढूँढो=dhundo|फिल्टर=filter|क्लियर=clear|' +
    'वापस=wapas|पीछे=peeche|डार्क=dark|लाइट=light|मोड=mode|थीम=theme|दोबारा=dobara|फिर=phir|से=se|तेज=tez|धीरे=dheere|चुप=chup|' +
    'मदद=madad|एक्सपोर्ट=export|बैकअप=backup|कंपेयर=compare|तुलना=tulna|परफॉर्मेंस=performance|वॉयस=voice|टेक्स्ट=text|और=aur|' +
    'डिटेल=detail|डिटेल्स=details|विस्तार=vistaar|कीमत=price|प्राइस=price|ऐप=app|एप=app|स्क्रीन=screen|सिंबल=symbol|' +
    'एक=ek|तीन=teen|चार=char|पांच=paanch|पाँच=paanch|छह=chhe|छः=chhe|सात=saat|आठ=aath|नौ=nau|दस=das|सौ=sau|हजार=hazaar|हज़ार=hazaar|लाख=lakh|' +
    'बीस=bees|तीस=tees|चालीस=chalis|पचास=pachaas|साठ=saath|सत्तर=sattar|अस्सी=assi|नब्बे=nabbe|पॉइंट=point|पॉइन्ट=point|दशमलव=dashamlav|शून्य=shunya|जीरो=zero'
  );

  const DEVDIG = '०१२३४५६७८९';

  function norm(s) {
    s = String(s == null ? '' : s).normalize('NFC');
    s = s.replace(/[०-९]/g, function (c) { return String(DEVDIG.indexOf(c)); });
    s = s.replace(/[\u200c\u200d]/g, '').toLowerCase();
    s = s.replace(/p\s*&\s*l|p\s+and\s+l|p\s+n\s+l/g, ' pnl ');
    s = s.replace(/[₹$]/g, ' ');
    s = s.replace(/(\d),(\d{3})/g, '$1$2');
    s = s.replace(/[।,;:!?"'()\[\]{}]/g, ' ');
    s = s.replace(/\.(\s|$)/g, ' ');
    return s.split(/\s+/).filter(Boolean).map(function (t) { return DEV[t] !== undefined ? DEV[t] : t; }).join(' ');
  }

  const HINGLISH = /\b(kya|kitna|kitni|kitne|hai|hain|mera|meri|mere|mujhe|batao|bata|dikhao|dikha|kholo|khol|karo|aaj|nahi|haan|mein|aur|abhi|sabse|dobara|bolo|baat|jawab|chahiye|raha|rahi|naya|nayi|wapas|peeche|hatao|dhundo|kal|pichla|pichle|aakhri|nafa|nuksan|kamai|awaaz|tez|dheere|ruko|chup|jodo|dalo|badlo|theek)\b/;
  function detectLang(raw, n) {
    if (/[\u0900-\u097F]/.test(raw || '')) return 'hi';
    return HINGLISH.test(n != null ? n : norm(raw)) ? 'hi' : 'en';
  }

  /* ---------- Numbers (digits, English words, Roman Hindi words) ---------- */
  const EN_U = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
  const EN_T = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  const HI = {};
  ('shunya ek do teen char paanch chhe saat aath nau das gyarah barah terah chaudah pandrah solah satrah atharah unnis bees ' +
   'ikkis baais teis chaubis pachchis chhabbis sattais atthais untis tees ikatis battis taintis chauntis paintis chhattis saintis adtis unchalis chalis ' +
   'iktalis bayalis tretalis chauwalis paintalis chhiyalis saintalis adtalis unchas pachaas ikyavan baavan tirpan chauvan pachpan chhappan sattavan athavan unsath saath ' +
   'iksath baasath tirsath chausath painsath chhiyasath sadsath adsath unhattar sattar ikhattar bahattar tihattar chauhattar pachhattar chhihattar satattar athattar unyasi assi ' +
   'ikyasi bayasi tirasi chaurasi pachasi chhiyasi sattasi atthasi nauasi nabbe ikyanve baanve tiranve chauranve pachanve chhiyanve sattanve atthanve ninyanve')
    .split(' ').forEach(function (w, i) { HI[w] = i; });
  Object.assign(HI, { panch: 5, chah: 6, chhah: 6, che: 6, chhe: 6, ath: 8, nav: 9, dus: 10, pachas: 50, sath: 60, pachchas: 50 });
  const MULT = { hundred: 100, sau: 100, sao: 100, thousand: 1000, hazaar: 1000, hajar: 1000, hazar: 1000, lakh: 100000, lac: 100000, lakhs: 100000, million: 1000000 };
  const POINT = { point: 1, dot: 1, dashamlav: 1 };

  const isDigits = function (t) { return /^-?\d+(\.\d+)?$/.test(t); };
  function isNumTok(t) {
    return isDigits(t) || EN_U[t] !== undefined || EN_T[t] !== undefined || HI[t] !== undefined || MULT[t] !== undefined || POINT[t] === 1;
  }
  function valOf(t) {
    if (isDigits(t)) return { v: parseFloat(t), dig: true };
    if (EN_U[t] !== undefined) return { v: EN_U[t] };
    if (EN_T[t] !== undefined) return { v: EN_T[t], tens: true };
    if (HI[t] !== undefined) return { v: HI[t] };
    if (MULT[t] !== undefined) return { m: MULT[t] };
    return null;
  }
  function digitStr(t) {
    if (/^\d+$/.test(t)) return t;
    if (EN_U[t] !== undefined && EN_U[t] < 10) return String(EN_U[t]);
    if (HI[t] !== undefined && HI[t] < 10) return String(HI[t]);
    return null;
  }
  function intFromTokens(tokens) {
    const parts = tokens.map(valOf);
    if (parts.some(function (p) { return !p; })) return null;
    const hasMult = parts.some(function (p) { return p.m; });
    if (!hasMult) {
      const g = [];
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i], nx = parts[i + 1];
        if (p.tens && nx && !nx.tens && !nx.m && !nx.dig && nx.v >= 1 && nx.v <= 9) { g.push(p.v + nx.v); i++; } else g.push(p.v);
      }
      if (g.length === 1) return g[0];
      if (g.length === 2 && g[0] >= 10 && g[0] <= 99 && g[1] >= 10 && g[1] <= 99) return g[0] * 100 + g[1]; /* "twenty six fifty" -> 2650 */
      if (g.every(function (x) { return x >= 0 && x < 10; })) return parseInt(g.join(''), 10); /* "two six five zero" */
      return null;
    }
    let total = 0, cur = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.m) {
        if (p.m === 100) cur = (cur || 1) * 100;
        else { total += (cur || 1) * p.m; cur = 0; }
      } else cur += p.v;
    }
    return total + cur;
  }
  function parseNumber(run) {
    if (!run || !run.length) return null;
    if (run.length === 1 && isDigits(run[0])) return parseFloat(run[0]);
    const pi = run.findIndex(function (t) { return POINT[t] === 1; });
    const ip = pi < 0 ? run : run.slice(0, pi), dp = pi < 0 ? [] : run.slice(pi + 1);
    const iv = ip.length ? intFromTokens(ip) : 0;
    if (iv == null) return null;
    let frac = '';
    for (let i = 0; i < dp.length; i++) { const d = digitStr(dp[i]); if (d == null) return null; frac += d; }
    if (pi >= 0 && !frac) return null;
    return parseFloat(iv + (frac ? '.' + frac : ''));
  }
  const FILL = new Set(['price', 'at', 'is', 'hai', 'ko', 'to', 'set', 'kar', 'karo', 'rakho', 'rakh', 'par', 'pe', 'me', 'mein', 'of', 'hua', 'tha', 'thi', 'the', 'as', 'ka', 'ki', 'ke', 'kiya', 'change', 'badlo', 'badal', 'bhav', 'rate', 'value', 'level', 'it', 'be', 'make']);
  const NEGW = /^(minus|negative|-)$/;
  function numRunAfter(tokens, i) {
    let j = i + 1, skip = 0;
    while (j < tokens.length && FILL.has(tokens[j]) && skip < 4) { j++; skip++; }
    let neg = false;
    if (tokens[j] && NEGW.test(tokens[j])) { neg = true; j++; }
    const run = [];
    while (j < tokens.length && isNumTok(tokens[j])) { run.push(tokens[j]); j++; }
    if (!run.length) return null;
    const v = parseNumber(run);
    return v == null ? null : { value: neg ? -v : v, end: j };
  }
  /* first number anywhere in an utterance (used for slot answers like "2650") */
  function firstNumber(n) {
    const tokens = n.split(' ');
    for (let i = 0; i < tokens.length; i++) {
      if (!isNumTok(tokens[i])) continue;
      if (POINT[tokens[i]] === 1 && !(tokens[i + 1] && isNumTok(tokens[i + 1]))) continue; /* bare "point one" -> 0.1 */
      let neg = i > 0 && NEGW.test(tokens[i - 1]);
      const run = [];
      let j = i;
      while (j < tokens.length && isNumTok(tokens[j])) { run.push(tokens[j]); j++; }
      const v = parseNumber(run);
      if (v != null) return neg ? -v : v;
      i = j;
    }
    return null;
  }

  /* ---------- Symbols, direction, entities ---------- */
  const SYM = [
    ['XAUUSD', /\b(xau ?usd|xau|gold|sona|sone)\b/],
    ['XAGUSD', /\b(xag ?usd|xag|silver|chandi)\b/],
    ['EURUSD', /\b(eur ?usd|euro dollar|euro|eur)\b/],
    ['GBPUSD', /\b(gbp ?usd|pound|cable|gbp)\b/],
    ['AUDUSD', /\b(aud ?usd|aussie|aud)\b/],
    ['NZDUSD', /\b(nzd ?usd|kiwi|nzd)\b/],
    ['USDJPY', /\b(usd ?jpy|yen|jpy)\b/],
    ['USDCAD', /\b(usd ?cad|loonie|cad)\b/],
    ['USDCHF', /\b(usd ?chf|swissy|chf)\b/],
    ['BTCUSD', /\b(btc ?usd|btc|bitcoin)\b/],
    ['US30', /\b(us ?30|dow jones|dow)\b/],
    ['NAS100', /\b(nas ?100|nasdaq|us ?100)\b/]
  ];
  function findSymbol(n) {
    for (let i = 0; i < SYM.length; i++) if (SYM[i][1].test(n)) return SYM[i][0];
    return null;
  }
  const BUY = /\b(buy|long|kharid|kharido|kharidna|kharidi|kharida|bullish)\b/;
  const SELL = /\b(sell|short|bech|becho|bechna|becha|bechi|bearish)\b/;
  function findDir(n) {
    const b = BUY.test(n), s = SELL.test(n);
    if (b && !s) return 'buy';
    if (s && !b) return 'sell';
    return null;
  }

  const KEYS = [
    ['entry', /^(entry|enter)$/],
    ['exit', /^(exit|close|closed|closing)$/],
    ['sl', /^(sl|stoploss)$/],
    ['tp', /^(tp|takeprofit|target)$/],
    ['lots', /^(lot|lots|volume|size)$/],
    ['fee', /^(fee|fees|commission|charges)$/],
    ['pnl', /^(pnl|profit|loss|nafa|nuksan)$/]
  ];
  function pre(n) {
    return (' ' + n + ' ')
      .replace(/ stop loss /g, ' sl ').replace(/ take profit /g, ' tp ').replace(/ target price /g, ' tp ')
      .replace(/ entry price /g, ' entry ').replace(/ exit price /g, ' exit ').replace(/ close price /g, ' exit ').replace(/ closing price /g, ' exit ')
      .replace(/ lot size /g, ' lot ').replace(/ position size /g, ' lot ').replace(/ open price /g, ' entry ').trim();
  }

  const GRADE = /\bgrade (a plus|a\+|a|b|c)\b/;
  const MOODS = ['Calm', 'Focused', 'Excited', 'Anxious', 'Angry', 'Tired'];
  /* ctx: {tags:[...], pending:bool}. Returns only the fields actually heard. */
  function extractFields(n, ctx) {
    ctx = ctx || {};
    const out = {};
    const s = pre(n), tokens = s.split(' ');
    const sym = findSymbol(s); if (sym) out.sym = sym;
    const dir = findDir(s); if (dir) out.dir = dir;
    let keyed = false;
    for (let i = 0; i < tokens.length; i++) {
      for (let k = 0; k < KEYS.length; k++) {
        if (!KEYS[k][1].test(tokens[i])) continue;
        const name = KEYS[k][0];
        if (name === 'pnl' && !ctx.pending) continue;
        const r = numRunAfter(tokens, i);
        if (!r) continue;
        let v = r.value;
        if (name === 'pnl' && /^(loss|nuksan)$/.test(tokens[i]) && v > 0) v = -v;
        if (name === 'fee') v = Math.abs(v);
        if (out[name] === undefined) { out[name] = v; keyed = true; }
        i = r.end - 1;
        break;
      }
    }
    if (!keyed && out.dir && out.sym) { /* "buy gold at 2650" */
      const m = s.match(/\b(?:at|par|pe|ke bhav)\s+(\S+)/);
      const v = m && isDigits(m[1]) ? parseFloat(m[1]) : null;
      if (v != null) out.entry = v;
    }
    const g = s.match(GRADE); if (g) out.grade = g[1] === 'a plus' ? 'A+' : g[1].toUpperCase();
    MOODS.forEach(function (m) { if (new RegExp('\\bmood ' + m.toLowerCase() + '\\b').test(s)) out.mood = m; });
    const t = s.match(/\b(?:strategy|setup|tag)\s+(?:is |ko |select |choose |karo |set )*(.+)$/);
    if (t && ctx.tags) {
      const want = t[1].trim();
      const hit = ctx.tags.filter(function (x) { const lx = x.toLowerCase(); return lx === want || want.indexOf(lx) === 0 || lx.indexOf(want) === 0; })[0];
      if (hit) out.tag = hit;
    }
    return out;
  }
  function extractNote(raw) {
    const m = String(raw || '').match(/\b(?:note|notes|comment|remark|likho)\b[\s:,-]*(?:is |ye |this )?(.+)$/i) || String(raw || '').match(/(?:नोट)[\s:,-]*(.+)$/);
    return m && m[1] && m[1].trim().length > 1 ? m[1].trim() : null;
  }

  /* ---------- Periods and dates ---------- */
  function findPeriod(n) {
    if (/\b(last|previous|pichla|pichle|pichhla|pichhle) (month|mahina|mahine)\b/.test(n)) return 'lastmonth';
    if (/\b(last|previous|pichla|pichle|pichhla|pichhle) (week|hafta|hafte)\b/.test(n)) return 'lastweek';
    if (/\b(aaj|today|abhi)\b/.test(n)) return 'today';
    if (/\b(kal|yesterday)\b/.test(n)) return 'yesterday';
    if (/\b(month|monthly|mahina|mahine|mahinewar)\b/.test(n)) return 'month';
    if (/\b(week|weekly|hafta|hafte)\b/.test(n)) return 'week';
    return 'all';
  }
  const MONTHS = { jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12 };
  function findDate(n, now) {
    const iso = n.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (iso) return iso[0];
    const m = n.match(/\b(\d{1,2})(?:st|nd|rd|th)? ([a-z]+)\b/);
    if (m && MONTHS[m[2]]) {
      const y = (now || new Date()).getFullYear();
      return y + '-' + String(MONTHS[m[2]]).padStart(2, '0') + '-' + String(+m[1]).padStart(2, '0');
    }
    return null;
  }

  /* ---------- Intent table ---------- */
  const W = function (s) { return new RegExp('\\b(?:' + s + ')\\b'); };
  const STAT = W('profit|loss|pnl|earn|earned|earning|kamai|kamaya|nafa|nuksan|income|net|total');
  const NOTR = /\b(delete|edit|save|badlo|hatao|filter|search|dhundo|cancel)\b/;
  const R = function (id, all, none, w) { return { id: id, all: all, none: none || [], w: w || 1 }; };

  const INTENTS = [
    /* voice / assistant control */
    R('voice.mute', [/\b(mute|band|off|disable|stop|mat|nahi|bina)\b.*\b(voice|reply|replies|jawab|awaaz)\b|\b(voice|reply|replies|jawab|awaaz)\b.*\b(band|off|mute|disable)\b|^mute\b/], [/unmute|enable|chalu/], 3),
    R('voice.unmute', [/\bunmute\b|\b(enable|chalu|on|start|shuru|karo)\b.*\b(voice|reply|replies|jawab|awaaz)\b|\bvoice (mein|me) (jawab|reply|batao|bolo)\b|\bbolkar\b|\bspeak to me\b|\bawaaz mein\b/], [], 4),
    R('voice.stop', [W('stop|ruko|chup|bas|enough|quiet|silence')], [/reply|replies|jawab|mute|disable|stop loss|stoploss|\bsl\b/, /\b(trade|profit|loss)\b/], 1),
    R('voice.repeat', [W('repeat|dobara|dubara|again|phir se|fir se|ek baar aur|ek bar aur|once more')], [/trade/], 3),
    R('voice.more', [/\b(more|aur|zyada|full|poori)\b.*\b(detail|details|info|batao|bolo)\b|\bdetails?\b|\bvistaar\b|\btell me more\b|\bexplain\b/], [/trade|pnl|profit|loss/], 2),
    R('voice.faster', [W('faster|fast|tez|jaldi|quicker|speed up')], [/\bslow/], 3),
    R('voice.slower', [W('slow|slowly|slower|dheere|dhire|aahista')], [], 3),
    R('voice.pitch.up', [/\b(pitch|awaaz|voice)\b.*\b(high|higher|upar|badha|thin|patli|sharp)\b|\b(higher|high) (pitch|voice)\b/], [], 3),
    R('voice.pitch.down', [/\b(pitch|awaaz|voice)\b.*\b(low|lower|kam|heavy|deep|thick|neeche|bhaari)\b|\b(lower|low|deep) (pitch|voice)\b/], [], 3),
    R('voice.lang.hi', [W('hindi|hinglish'), W('baat|bolo|bol|speak|reply|jawab|mein|me|talk|ab')], [/\b(app|screen|interface|ui|display)\b/], 4),
    R('voice.lang.en', [W('english|angrezi'), W('baat|bolo|bol|speak|reply|jawab|mein|me|talk|switch|change|karo|ab')], [/\b(app|screen|interface|ui|display)\b/], 4),
    R('set.applang', [/\b(app|screen|interface|ui|display)\b/, W('english|hinglish|hindi')], [], 5),
    R('set.mode.text', [/\b(text only|only text|sirf text|text mode|no voice|bina voice)\b/], [], 4),
    R('set.mode.voicetext', [/\b(voice (and|plus|aur|\+) text|text (and|plus|aur) voice|voice text)\b/], [], 4),
    R('set.mode.voicefirst', [/\b(voice first|voice only|only voice|sirf voice|voice mode)\b/], [], 4),
    R('set.theme.dark', [/\b(dark|andhera)\b/, W('mode|theme')], [], 4),
    R('set.theme.light', [/\b(light|ujala)\b/, W('mode|theme')], [], 4),
    R('help', [W('help|madad|commands|what can you do|kya kar sakte')], [], 4),
    R('op.cancel', [W('cancel|abort|rehne do|rahne do|chhodo|chodo|forget it|never mind|nevermind')], [], 3),

    /* dangerous: navigation only */
    R('danger.reset', [/\b(restore|reset|saara data|sara data|delete all|clear all|purge|purane trades|old trades)\b/], [], 6),

    /* data / export */
    R('backup.status', [W('backup'), W('status|kab|last|check')], [], 5),
    R('tools.export', [/\b(export|share|send)\b.*\b(backup|report|journal|data|csv)\b|\bbackup (banao|lo|karo|share|create)\b|\b(csv|report) (banao|export|share)\b/], [], 4),

    /* navigation */
    R('nav.back', [/\b(back|wapas|peeche|previous screen)\b/], [/trade|profit|loss/], 3),
    R('nav.dash', [W('dashboard|home|ghar')], [STAT], 4),
    R('nav.add', [/\b(trade|entry) (form|screen|tab)\b|\bform (kholo|open)\b|\badd (screen|tab)\b|\b(open|kholo|show|dikhao)\b.*\b(add|new|naya)\b.*\btrade\b/], [], 4),
    R('nav.list', [W('history|journal|trades|trade list|all trades|saare trades|sab trades')], [STAT, /\b(delete|edit|last|latest|aakhri|filter|search|dhundo|how many|kitne|best|worst|biggest|compare|performance|winning|losing|new|naya|add)\b/], 2),
    R('nav.goals', [W('goals|goal|limits|playbook|rank')], [STAT], 2),
    R('nav.diary', [W('diary|dairy')], [], 2),
    R('nav.cal', [W('insights|insight|analytics|analysis|statistics|calendar|reports')], [STAT], 2),
    R('nav.tools', [W('tools|tool|settings|setting|backup|import|calculator')], [/\b(status|kab|export|share|restore|reset)\b/], 2),

    /* statistics */
    R('stat.winrate', [/\b(win ?rate|jeet|accuracy|success rate|strike rate|winning percent)\b/], [], 4),
    R('stat.best_pair', [/\b(best|top|sabse accha|most profitable)\b.*\b(pair|symbol|instrument)\b|\bwhich (pair|symbol)\b|\bpair\b.*\b(best|accha)\b/], [/worst/], 5),
    R('stat.worst_pair', [/\b(worst|sabse kharab|least profitable)\b.*\b(pair|symbol|instrument)\b/], [], 5),
    R('stat.biggest_loss', [/\b(biggest|largest|worst|sabse bada|sabse badi|maximum|max)\b.*\b(loss|nuksan)\b|\b(loss|nuksan)\b.*\b(biggest|sabse bada)\b/], [], 5),
    R('stat.biggest_win', [/\b(biggest|largest|best|sabse bada|sabse badi|maximum|max)\b.*\b(win|profit|nafa|jeet)\b/], [/pair|symbol/], 5),
    R('stat.compare', [W('compare|comparison|versus|vs|tulna|muqabla'), W('month|mahina|mahine')], [], 5),
    R('stat.performance', [W('performance|summary|overview|how am i doing|report card|kaisa chal raha')], [/\b(open|kholo)\b/], 3),
    R('stat.count.wins', [/\b(how many|kitne|count|number of)\b.*\b(win|wins|winning|winner|winners|profitable|jeet|jeete)\b/], [], 5),
    R('stat.count.losses', [/\b(how many|kitne|count|number of)\b.*\b(loss|losses|losing|loser|losers|haar|haare)\b/], [], 5),
    R('stat.count.trades', [/\b(how many trades|kitne trades?|total trades|trades count|number of trades)\b/], [], 5),
    R('stat.pnl', [STAT], [NOTR, /\b(stop loss|stoploss|take profit|sl|tp)\b/, /\b(win ?rate|biggest|best|worst|sabse|compare|pair|symbol|last|latest|aakhri|winning|losing|winners|losers)\b/, /\b(trade|trades)\b.*\b(add|new|naya)\b/], 2),

    /* trade operations */
    R('trade.show_last', [/\b(last|latest|recent|aakhri|akhri|pichla|pichhla|sabse naya)\b.*\btrade\b/], [/\b(delete|hatao|mita|remove|edit|badlo|sudhar)\b/], 3),
    R('trade.edit_last', [/\b(edit|badlo|badal|sudhar|modify|update|change)\b.*\btrade\b|\btrade\b.*\b(edit|badlo|badal|sudhar|modify)\b/], [], 4),
    R('trade.delete_last', [/\b(delete|hatao|mita|mitao|remove)\b.*\btrade\b|\btrade\b.*\b(delete|hatao|mita|mitao|remove)\b/], [], 5),
    R('trade.save', [/\b(save|submit|store)\b/], [/\b(voice|reply|backup)\b/], 3),
    R('trade.new', [/\b(new|naya|nayi|add|create|start|shuru|enter|daal|dalo|jodo|banao|record)\b.*\btrade\b|\btrade\b.*\b(add|karni|karna|daalna|banao|shuru|jodo|dalo)\b/], [/\b(form|screen|tab)\b/], 3),

    /* search / filter */
    R('filter.clear', [/\b(clear|reset|remove|hatao)\b.*\b(filter|filters|search)\b|\bfilter (hatao|clear)\b|\b(show|dikhao) all trades\b|\bsab trades dikhao\b/], [], 5),
    R('filter.winners', [/\b(show|dikhao|filter|only|sirf|list)\b.*\b(winning|winners|profitable|jeet|jeete|profit wale)\b|\b(winning|winners|profitable|jeet|jeete|profit wale)\b.*\b(show|dikhao|dikha|filter|list)\b/], [/\b(how many|kitne|count)\b/], 5),
    R('filter.losers', [/\b(show|dikhao|filter|only|sirf|list)\b.*\b(losing|losers|loss wale|haar|haare)\b|\b(losing|losers|loss wale|haar|haare)\b.*\b(show|dikhao|dikha|filter|list)\b/], [/\b(how many|kitne|count)\b/], 5),
    R('search.date', [/\b(search|find|dhundo|khojo|show|dikhao)\b.*(\d{4}-\d{2}-\d{2}|\b\d{1,2}(st|nd|rd|th)? (jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b)/], [], 5),
    R('filter.symbol', [/\b(filter|search|dhundo|find|only|sirf|show|dikhao)\b/, /\b(xau ?usd|xau|gold|sona|silver|euro|eur ?usd|pound|gbp ?usd|aud ?usd|nzd ?usd|usd ?jpy|yen|usd ?cad|usd ?chf|btc|bitcoin|us ?30|dow|nas ?100|nasdaq)\b/], [STAT, /\bhow many|kitne\b/], 4),
    R('search.text', [/\b(search|find|dhundo|khojo)\b\s+\S+/], [], 2)
  ];

  function matchAll(list, n) { return list.every(function (re) { return re.test(n); }); }
  function matchIntent(n) {
    let best = null;
    INTENTS.forEach(function (it) {
      if (!matchAll(it.all, n)) return;
      if (it.none.some(function (re) { return re.test(n); })) return;
      if (!best || it.w > best.w) best = it;
    });
    return best;
  }

  function intentArgs(id, n, raw, now) {
    if (id.indexOf('stat.') === 0) return { period: findPeriod(n) };
    if (id === 'filter.symbol') return { sym: findSymbol(n) };
    if (id === 'search.date') return { date: findDate(n, now) };
    if (id === 'search.text') { const m = n.match(/\b(?:search|find|dhundo|khojo)\b\s+(?:for |trades? )?(.+)$/); return { q: m ? m[1].trim() : '' }; }
    if (id === 'set.applang') return { lang: /english|angrezi/.test(n) ? 'en' : 'hi' };
    if (id === 'nav.dash' || id.indexOf('nav.') === 0) return {};
    return {};
  }

  /* yes / no handling (strict: anything unclear is neither) */
  const YES = W('yes|yeah|yep|yup|haan|han|haa|ha|ji|theek hai|thik hai|ok|okay|sure|bilkul|confirm|kar do|karo|correct|sahi|done|proceed|go ahead|save');
  const NO = W('no|nope|nahi|na|mat|cancel|ruko|stop|wait|ruk|rehne do|galat|dont|not|abort');
  function yesNo(n) {
    const y = YES.test(n), no = NO.test(n);
    if (y && !no) return 'yes';
    if (no && !y) return 'no';
    return y && no ? 'unclear' : null;
  }
  const DEL_WORD = W('delete|hata do|hatao|mita do|mitao|remove|confirm delete');
  function deleteWord(n) { return DEL_WORD.test(n) && !NO.test(n); }
  const CORRECT = W('sorry|change|badlo|badal|correct|correction|actually|galat|update|make it|set it|nahi');
  function isCorrection(n) { return CORRECT.test(n); }

  function parse(raw, ctx) {
    ctx = ctx || {};
    const n = norm(raw);
    const lang = detectLang(raw, n);
    const it = n ? matchIntent(n) : null;
    return {
      raw: raw, norm: n, lang: lang,
      intent: it ? { id: it.id, args: intentArgs(it.id, n, raw, ctx.now) } : null,
      fields: extractFields(n, ctx),
      note: extractNote(raw),
      number: firstNumber(n),
      yn: yesNo(n)
    };
  }

  return {
    norm: norm, detectLang: detectLang, parse: parse, parseNumber: parseNumber, firstNumber: firstNumber,
    extractFields: extractFields, extractNote: extractNote, findSymbol: findSymbol, findDir: findDir,
    findPeriod: findPeriod, findDate: findDate, yesNo: yesNo, deleteWord: deleteWord, isCorrection: isCorrection,
    INTENTS: INTENTS, matchIntent: matchIntent
  };
});
