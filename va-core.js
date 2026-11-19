/* va-core.js - "Munim": voice assistant for Rohan Chauhan Trades Journals.
   Uses va-nlu.js for understanding. Loaded AFTER the main app script (shares its globals). */
(function () {
  'use strict';
  var NLU = window.VANLU;
  if (!NLU || typeof S === 'undefined') return;
  var D = document;
  var q = function (s) { return D.querySelector(s); };

  /* ---------- settings ---------- */
  var DEF = { mode: 'voicetext', lang: 'auto', rate: 1, pitch: 1, mute: false, aiSpeak: true, name: 'Munim', user: 'Rohan', hv: 'en-IN' };
  function C() { S.va = Object.assign({}, DEF, S.va || {}); return S.va; }
  var LOG = [], DLG = null, lastLang = 'hi', lastSpoken = '', moreTxt = null;
  var speaking = false, listening = false, busy = false, auto = false, idle = 0, tok = 0, rec = null, buf = null, greeted = false, openP = false;
  function lang() { var c = C(); return c.lang === 'auto' ? lastLang : c.lang; }
  function T2(h, e) { return lang() === 'en' ? e : h; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function plug(n) { var b = window.RCNativeVoice; if (b && b[n]) return b[n]; var c = window.Capacitor; return c && c.Plugins && c.Plugins[n]; }
  function fx(n) { return String(+Number(n).toFixed(5)); }
  function who() { return C().user + ' ji'; }

  /* ---------- speech cleaning / TTS ---------- */
  var SPK = { XAUUSD: 'gold', XAGUSD: 'silver', EURUSD: 'euro dollar', GBPUSD: 'pound dollar', AUDUSD: 'aussie dollar', NZDUSD: 'kiwi dollar', USDJPY: 'dollar yen', USDCAD: 'dollar cad', USDCHF: 'dollar swiss', BTCUSD: 'bitcoin', US30: 'US thirty', NAS100: 'Nasdaq hundred' };
  function clean(t) {
    t = String(t || '');
    Object.keys(SPK).forEach(function (k) { t = t.split(k).join(SPK[k]); });
    t = t.replace(/(-)?\$(\d+)(?:\.(\d+))?/g, function (m, neg, w, c) { return (neg ? 'minus ' : '') + w + ' dollar' + (c && +c ? ' ' + (c + '0').slice(0, 2) + ' cent' : ''); });
    t = t.replace(/R:R/g, 'R to R').replace(/(\d)R\b/g, '$1 R').replace(/%/g, ' percent').replace(/→/g, ' to ').replace(/P&L/g, 'P and L').replace(/&/g, ' and ');
    t = t.replace(/[*#_`~>|]/g, ' ').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/\s*\n+\s*/g, '. ').replace(/\s+/g, ' ').trim();
    return t;
  }
  function chunks(t) {
    var m = t.match(/[^.!?।\n]+[.!?।]*/g) || [t], out = [], cur = '';
    m.forEach(function (s) { if ((cur + s).length > 170 && cur) { out.push(cur); cur = s; } else cur += s; });
    if (cur) out.push(cur);
    return out.map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function ttsLang() { return lang() === 'en' ? 'en-IN' : (C().hv === 'hi-IN' ? 'hi-IN' : 'en-IN'); }
  function stopSpeak() {
    tok++; speaking = false;
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
    try { var P = plug('TextToSpeech'); if (P && P.stop) P.stop(); } catch (e) {}
    ui();
  }
  function webSpeak(txt, lg, c) {
    return new Promise(function (res) {
      var u = new window.SpeechSynthesisUtterance(txt); u.lang = lg; u.rate = c.rate; u.pitch = c.pitch;
      try { var vs = window.speechSynthesis.getVoices(); var v = vs.find(function (x) { return x.lang === lg; }) || vs.find(function (x) { return String(x.lang).replace('_', '-').indexOf(lg.slice(0, 2)) === 0; }); if (v) u.voice = v; } catch (e) {}
      var done = false, tm = null, fin = function () { if (!done) { done = true; clearTimeout(tm); res(); } };
      tm = setTimeout(fin, Math.max(4000, txt.length * 130));
      u.onend = fin; u.onerror = fin; window.speechSynthesis.speak(u);
    });
  }
  function speak(text) {
    var c = C();
    if (c.mute || c.mode === 'text') return Promise.resolve();
    var t = clean(text); if (!t) return Promise.resolve();
    stopSpeak();
    var my = ++tok, ch = chunks(t), lg = ttsLang(), P = plug('TextToSpeech');
    if (!(P && P.speak) && !(window.speechSynthesis && window.SpeechSynthesisUtterance)) return Promise.resolve();
    speaking = true; ui();
    return (async function () {
      for (var i = 0; i < ch.length && tok === my; i++) {
        if (P && P.speak) {
          try { await P.speak({ text: ch[i], lang: lg, rate: c.rate, pitch: c.pitch, volume: 1, category: 'ambient' }); }
          catch (e) { if (window.speechSynthesis && window.SpeechSynthesisUtterance) await webSpeak(ch[i], lg, c); }
        } else await webSpeak(ch[i], lg, c);
      }
      if (tok === my) { speaking = false; ui(); }
    })();
  }

  /* ---------- speech recognition ---------- */
  function sttLang() { return lang() === 'en' ? 'en-IN' : 'hi-IN'; }
  function listenOnce() {
    var SR = plug('SpeechRecognition'), lg = sttLang();
    if (SR && SR.start) {
      return (async function () {
        if (SR.available) { var av = await SR.available(); if (av && av.available === false) throw new Error('novoice'); }
        if (SR.requestPermissions) { var pm = await SR.requestPermissions(); if (pm && pm.speechRecognition && pm.speechRecognition !== 'granted') throw new Error('perm'); }
        var timeoutId, timeout = new Promise(function (_, reject) { timeoutId = setTimeout(function () { reject(new Error('timeout')); }, 25000); });
        try {
          var result = await Promise.race([SR.start({ language: lg, maxResults: 1, popup: false, partialResults: false, prompt: T2('Boliye', 'Speak now') }), timeout]);
          clearTimeout(timeoutId);
          return (result && result.matches && result.matches[0]) || '';
        } catch (e) { clearTimeout(timeoutId); try { if (SR.stop) await SR.stop(); } catch (_) {} throw e; }
      })();
    }
    var W = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (W) {
      return new Promise(function (res, rej) {
        var r = new W(), got = '', done = false; rec = r;
        r.lang = lg; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
        r.onresult = function (e) { var t = ''; for (var i = e.resultIndex; i < e.results.length; i++) { t += e.results[i][0].transcript; if (e.results[i].isFinal) got = t; } var s = q('#va-status'); if (s) s.textContent = t; };
        r.onerror = function (e) { if (done) return; done = true; if (e.error === 'no-speech' || e.error === 'aborted') res(''); else rej(new Error(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'perm' : (e.error || 'voice'))); };
        r.onend = function () { if (!done) { done = true; res(got); } };
        try { r.start(); } catch (e) { rej(e); }
      });
    }
    return Promise.reject(new Error('novoice'));
  }
  function stopListen() { try { if (rec) rec.abort(); } catch (e) {} try { var SR = plug('SpeechRecognition'); if (SR && SR.stop) SR.stop(); } catch (e) {} listening = false; ui(); }
  async function listen() {
    if (listening) { auto = false; stopListen(); return; }
    stopSpeak(); listening = true; ui();
    var txt = '';
    try { txt = await listenOnce(); } catch (e) { listening = false; auto = false; ui(); return errMsg(e); }
    listening = false; ui();
    if (txt) { idle = 0; return process(txt); }
    if (auto) { idle++; if (idle >= 2) { auto = false; buf = []; say(T2('Koi awaaz nahi aayi, main ruk raha hoon. Mic dabakar dobara bulao.', 'I did not hear anything, so I am pausing. Tap the mic to call me again.')); return flush(); } return listen(); }
  }
  function errMsg(e) {
    var m = e && e.message;
    buf = [];
    if (m === 'perm') say(T2('Mic ki permission nahi mili. Phone ki settings mein is app ko mic allow karo.', 'Microphone permission was not granted. Please allow the mic for this app in phone settings.'));
    else if (m === 'timeout') say(T2('Sunne ka samay khatam ho gaya. Mic dabakar dobara boliye.', 'Listening timed out. Tap the mic and try again.'));
    else if (m === 'novoice') say(T2('Is device par voice recognition nahi mil raha. Neeche likhkar poochho, ya keyboard ke mic button se bolo. APK ke liye with_voice build chahiye.', 'Voice recognition is not available here. Type below, or use the keyboard mic button. The APK needs the with_voice build.'));
    else say(T2('Voice sunne mein dikkat aayi. Dobara try karo ya likhkar poochho.', 'Could not listen. Try again or type your request.'));
    return flush();
  }

  /* ---------- transcript / replies ---------- */
  var cnt = 0;
  function push(w, t) { cnt++; LOG.push({ w: w, t: t }); if (LOG.length > 40) LOG.shift(); renderLog(); }
  function renderLog() {
    var el = q('#va-log'); if (!el) return;
    el.innerHTML = LOG.map(function (m) { return '<div class="va-b ' + m.w + '">' + esc(m.t).replace(/\n/g, '<br>') + '</div>'; }).join('');
    el.scrollTop = el.scrollHeight;
  }
  function say(text, o) {
    o = o || {}; push('munim', text);
    if (o.more) moreTxt = o.more; else if (!o.keepMore) moreTxt = null;
    var sp = o.speech || text;
    if (buf) { buf.push(sp); return Promise.resolve(); }
    lastSpoken = sp; return speak(sp).then(afterSpeak);
  }
  async function flush() {
    var t = (buf || []).join(' '); buf = null;
    if (t) { lastSpoken = t; await speak(t); }
    afterSpeak();
  }
  function afterSpeak() {
    if (C().mode === 'voicefirst' && auto && openP && !listening && !busy) setTimeout(function () { if (auto && !listening && !speaking && openP) listen(); }, 350);
  }
  function greet() { var h = new Date().getHours(); return (h < 12 ? T2('Suprabhat', 'Good morning') : h < 17 ? 'Namaste' : T2('Shubh sandhya', 'Good evening')) + ' ' + who() + '!'; }

  /* ---------- period helpers / stats ---------- */
  var PN = { today: ['aaj', 'today'], yesterday: ['kal', 'yesterday'], week: ['is hafte', 'this week'], lastweek: ['pichhle hafte', 'last week'], month: ['is mahine', 'this month'], lastmonth: ['pichhle mahine', 'last month'], all: ['ab tak', 'overall'] };
  function pname(p) { return (PN[p] || PN.all)[lang() === 'en' ? 1 : 0]; }
  function inP(t, p) {
    var d = t.date.slice(0, 10), n = new Date(), td = ld(n);
    if (p === 'today') return d === td;
    if (p === 'yesterday') { var y = new Date(n); y.setDate(y.getDate() - 1); return d === ld(y); }
    if (p === 'week') return d >= wkStart();
    if (p === 'lastweek') { var ws = new Date(wkStart() + 'T00:00:00'), e = new Date(ws), s = new Date(ws); e.setDate(e.getDate() - 1); s.setDate(s.getDate() - 7); return d >= ld(s) && d <= ld(e); }
    if (p === 'month') return d.slice(0, 7) === td.slice(0, 7);
    if (p === 'lastmonth') { var m = new Date(n.getFullYear(), n.getMonth() - 1, 1); return d.slice(0, 7) === ld(m).slice(0, 7); }
    return true;
  }
  function pdata(p) { return T.filter(function (t) { return inP(t, p); }); }
  function counts(a) {
    var w = 0, l = 0, n = 0;
    a.forEach(function (t) { if (t.sum) { w += t.nw || 0; l += t.nl || 0; n += (t.nw || 0) + (t.nl || 0); } else { n++; if (t.pnl > 0) w++; else if (t.pnl < 0) l++; } });
    return { w: w, l: l, n: n };
  }
  function dirw(d) { return d === 'buy' ? 'Buy' : 'Sell'; }
  function tline(t) { return dirw(t.dir) + ' ' + (t.sym || 'XAUUSD') + ' ' + t.lots + ' lot, ' + L('entry', 'entry') + ' ' + t.entry + ', exit ' + t.exit + ', ' + money(t.pnl) + (t.r != null ? ', ' + t.r.toFixed(2) + 'R' : ''); }
  function lastTrade() { var a = T.filter(function (t) { return !t.sum; }).sort(byDate); return a[a.length - 1] || null; }
  var NONE = function (per) { return say(T2('Is period (' + pname(per) + ') mein koi data nahi mila.', 'No data found for ' + pname(per) + '.')); };

  /* ---------- intent handlers ---------- */
  var H = {};
  H['stat.pnl'] = function (p) {
    var per = p.intent.args.period, a = pdata(per); if (!a.length) return NONE(per);
    var st = stats(a), pn = sumP(a), tail = pn > 0 ? T2(' Shabaash ' + who() + '!', ' Well done!') : pn < 0 ? T2(' Koi baat nahi, process par tike rahein.', ' It happens; stay with your process.') : '';
    return say(T2(cap(pname(per)) + ' ka net P&L ' + money(pn) + ' hai, ' + st.n + ' trades mein.' + tail, cap(pname(per)) + ' net P&L is ' + money(pn) + ' across ' + st.n + ' trades.' + tail),
      { more: T2('Win rate ' + st.wr.toFixed(0) + ' percent, profit factor ' + st.pf.toFixed(2) + ', expectancy ' + money(st.exp) + ' per trade.', 'Win rate ' + st.wr.toFixed(0) + ' percent, profit factor ' + st.pf.toFixed(2) + ', expectancy ' + money(st.exp) + ' per trade.') });
  };
  H['stat.winrate'] = function (p) {
    var per = p.intent.args.period, a = pdata(per); if (!a.length) return NONE(per);
    var c = counts(a), st = stats(a);
    return say(T2(cap(pname(per)) + ' ka win rate ' + st.wr.toFixed(0) + '% hai: ' + c.w + ' jeet aur ' + c.l + ' haar, kul ' + c.n + ' trades.', cap(pname(per)) + ' win rate is ' + st.wr.toFixed(0) + '%: ' + c.w + ' wins and ' + c.l + ' losses out of ' + c.n + ' trades.'),
      { more: T2('Profit factor ' + st.pf.toFixed(2) + '. Ek se upar ho toh net positive.', 'Profit factor is ' + st.pf.toFixed(2) + '. Above one means net positive.') });
  };
  function bySym(per) { var a = pdata(per), r = a.filter(function (t) { return !t.sum; }); return group(r.length ? r : a, function (t) { return t.sym; }); }
  H['stat.best_pair'] = function (p) { var g = bySym(p.intent.args.period); if (!g.length) return NONE(p.intent.args.period); return say(T2('Sabse acha pair ' + g[0].k + ' hai: ' + money(g[0].net) + ', ' + g[0].n + ' trades.', 'Your best pair is ' + g[0].k + ': ' + money(g[0].net) + ' over ' + g[0].n + ' trades.')); };
  H['stat.worst_pair'] = function (p) { var g = bySym(p.intent.args.period); if (!g.length) return NONE(p.intent.args.period); var w = g[g.length - 1]; return say(T2('Sabse kamzor pair ' + w.k + ' hai: ' + money(w.net) + ', ' + w.n + ' trades.', 'Your weakest pair is ' + w.k + ': ' + money(w.net) + ' over ' + w.n + ' trades.')); };
  function extreme(per, win) {
    var a = pdata(per), r = a.filter(function (t) { return !t.sum; }), pool = r.length ? r : a;
    if (!pool.length) return null;
    return pool.slice().sort(function (x, y) { return win ? y.pnl - x.pnl : x.pnl - y.pnl; })[0];
  }
  H['stat.biggest_loss'] = function (p) { var per = p.intent.args.period, t = extreme(per, false); if (!t || t.pnl >= 0) return say(T2('Is period mein koi loss nahi mila.', 'No losing trade in this period.')); return say(T2('Sabse bada loss ' + money(t.pnl) + ' tha, ' + day(t) + ' ko' + (t.sum ? ' (din ka total)' : ' ' + (t.sym || '') + ' mein') + '.', 'The biggest loss was ' + money(t.pnl) + ' on ' + day(t) + (t.sum ? ' (day total)' : ' in ' + (t.sym || '')) + '.')); };
  H['stat.biggest_win'] = function (p) { var per = p.intent.args.period, t = extreme(per, true); if (!t || t.pnl <= 0) return say(T2('Is period mein koi profit trade nahi mila.', 'No winning trade in this period.')); return say(T2('Sabse bada profit ' + money(t.pnl) + ' tha, ' + day(t) + ' ko' + (t.sum ? ' (din ka total)' : ' ' + (t.sym || '') + ' mein') + '. Bahut badhiya!', 'The biggest win was ' + money(t.pnl) + ' on ' + day(t) + (t.sum ? ' (day total)' : ' in ' + (t.sym || '')) + '. Nicely done!')); };
  H['stat.compare'] = function () {
    var a = pdata('month'), b = pdata('lastmonth'); if (!a.length && !b.length) return NONE('month');
    var sa = stats(a), sb = stats(b), d = sumP(a) - sumP(b);
    return say(T2('Is mahine ' + money(sumP(a)) + ' (' + sa.n + ' trades, win rate ' + sa.wr.toFixed(0) + '%), pichhle mahine ' + money(sumP(b)) + ' (' + sb.n + ' trades, win rate ' + sb.wr.toFixed(0) + '%). Farak ' + money(d) + '.', 'This month ' + money(sumP(a)) + ' (' + sa.n + ' trades, win rate ' + sa.wr.toFixed(0) + '%), last month ' + money(sumP(b)) + ' (' + sb.n + ' trades, win rate ' + sb.wr.toFixed(0) + '%). Difference ' + money(d) + '.'));
  };
  H['stat.performance'] = function (p) {
    var per = p.intent.args.period === 'all' ? 'month' : p.intent.args.period, a = pdata(per); if (!a.length) return NONE(per);
    var st = stats(a), g = guard();
    return say(T2(cap(pname(per)) + ': net ' + money(st.net) + ', ' + st.n + ' trades, win rate ' + st.wr.toFixed(0) + '%, profit factor ' + st.pf.toFixed(2) + ', max drawdown ' + money(-st.dd) + '. Aaj ' + money(g.tp) + ', hafta ' + money(g.wp) + '.', cap(pname(per)) + ': net ' + money(st.net) + ', ' + st.n + ' trades, win rate ' + st.wr.toFixed(0) + '%, profit factor ' + st.pf.toFixed(2) + ', max drawdown ' + money(-st.dd) + '. Today ' + money(g.tp) + ', week ' + money(g.wp) + '.'));
  };
  H['stat.count.wins'] = function (p) { var per = p.intent.args.period, c = counts(pdata(per)); return say(T2(cap(pname(per)) + ' ' + c.w + ' trades profit mein rahe.', cap(pname(per)) + ': ' + c.w + ' winning trades.')); };
  H['stat.count.losses'] = function (p) { var per = p.intent.args.period, c = counts(pdata(per)); return say(T2(cap(pname(per)) + ' ' + c.l + ' trades loss mein rahe.', cap(pname(per)) + ': ' + c.l + ' losing trades.')); };
  H['stat.count.trades'] = function (p) { var per = p.intent.args.period, c = counts(pdata(per)), g = guard(); return say(T2(cap(pname(per)) + ' ' + c.n + ' trades hue' + (per === 'today' && S.mt > 0 ? ' (limit ' + S.mt + ')' : '') + '.', cap(pname(per)) + ': ' + c.n + ' trades' + (per === 'today' && S.mt > 0 ? ' (limit ' + S.mt + ')' : '') + '.')); };

  var NAVN = { dash: ['Home', 'Home'], add: ['Add screen', 'the Add screen'], list: ['Trades', 'Trades'], goals: ['Goals', 'Goals'], diary: ['Diary', 'the Diary'], cal: ['Insights', 'Insights'], tools: ['Tools', 'Tools'] };
  function go(tab) { gotoTab(tab); return say(T2('Ji, ' + NAVN[tab][0] + ' khol diya.', 'Done, opened ' + NAVN[tab][1] + '.')); }
  H['nav.dash'] = function () { return go('dash'); }; H['nav.add'] = function () { return go('add'); }; H['nav.list'] = function () { return go('list'); };
  H['nav.goals'] = function () { return go('goals'); }; H['nav.diary'] = function () { return go('diary'); }; H['nav.cal'] = function () { return go('cal'); }; H['nav.tools'] = function () { return go('tools'); };
  H['nav.back'] = function () { return go(PREV && PREV !== TAB ? PREV : 'dash'); };

  H['trade.show_last'] = function () {
    var t = lastTrade(); if (!t) return say(T2('Abhi koi trade nahi hai.', 'There are no trades yet.'));
    detail(t.id);
    return say(T2('Aakhri trade: ' + tline(t) + '. Poori detail screen par khol di.', 'Last trade: ' + tline(t) + '. Opened the full details on screen.'));
  };
  H['trade.edit_last'] = function () { var t = lastTrade(); if (!t) return say(T2('Abhi koi trade nahi hai.', 'There are no trades yet.')); editTrade(t.id); return say(T2('Aakhri trade edit mode mein khol diya. Badlav karke save dabao.', 'Opened your last trade in edit mode. Make changes and press save.')); };
  H['trade.delete_last'] = function () {
    var t = lastTrade(); if (!t) return say(T2('Abhi koi trade nahi hai.', 'There are no trades yet.'));
    DLG = { type: 'del', id: t.id };
    return say(T2('Aakhri trade: ' + tline(t) + '. Ise delete karun? Pakka karne ke liye "delete" bolo, warna "cancel".', 'Last trade: ' + tline(t) + '. Delete it? Say "delete" to confirm, or "cancel".'));
  };
  H['trade.new'] = function (p) { return startTrade(p); };
  H['trade.save'] = function () {
    var en = q('#f-entry'), ex = q('#f-exit');
    if (en && ex && en.value !== '' && ex.value !== '' && !EDIT) { DLG = { type: 'form' }; return say(T2('Add screen ka trade save karun? Haan bolo.', 'Save the trade on the Add screen? Say yes.')); }
    return say(T2('Koi trade pending nahi hai. "naya trade" bolo.', 'Nothing pending. Say "new trade".'));
  };

  H['filter.clear'] = function () { LQ = ''; LF = ''; LP = 50; gotoTab('list'); return say(T2('Filter hata diya, saare trades dikh rahe hain.', 'Filter cleared; showing all trades.')); };
  function shown() { return T.filter(function (t) { return (!LF || (LF === 'w' ? t.pnl > 0 : LF === 'l' ? t.pnl < 0 : LF === 'r' ? t.ot : t.shot)) && (!LQ || [t.sym, t.tag, t.note, t.mis, t.ses, t.mood, t.news, t.grade, t.date].join(' ').toLowerCase().indexOf(LQ.toLowerCase()) >= 0); }).length; }
  H['filter.winners'] = function () { LF = 'w'; LQ = ''; LP = 50; gotoTab('list'); return say(T2('Sirf profit wale trades: ' + shown() + ' mile.', 'Showing winning trades only: ' + shown() + ' found.')); };
  H['filter.losers'] = function () { LF = 'l'; LQ = ''; LP = 50; gotoTab('list'); return say(T2('Sirf loss wale trades: ' + shown() + ' mile.', 'Showing losing trades only: ' + shown() + ' found.')); };
  H['filter.symbol'] = function (p) { var s = p.intent.args.sym; LQ = s || ''; LF = ''; LP = 50; gotoTab('list'); return say(T2(s + ' ke ' + shown() + ' trades mile.', shown() + ' trades found for ' + s + '.')); };
  H['search.date'] = function (p) { var d = p.intent.args.date; if (!d) return say(T2('Tareekh samajh nahi aayi. Jaise "5 nov" ya "2026-11-05" bolo.', 'I did not catch the date. Try "5 Nov" or "2026-11-05".')); LQ = d; LF = ''; LP = 50; gotoTab('list'); return say(T2(d + ' ke ' + shown() + ' trades mile.', shown() + ' trades found on ' + d + '.')); };
  H['search.text'] = function (p) { var s = p.intent.args.q; LQ = s; LF = ''; LP = 50; gotoTab('list'); return say(T2('"' + s + '" ke ' + shown() + ' trades mile.', shown() + ' trades match "' + s + '".')); };

  H['backup.status'] = function () {
    if (!S.lastBk) return say(T2('Abhi tak aapne backup nahi liya. Tools mein "Backup banao" dabao.', 'You have not taken a backup yet. Use "Create backup" in Tools.'));
    var d = Math.floor((Date.now() - S.lastBk) / 864e5);
    return say(T2('Aakhri backup ' + (d === 0 ? 'aaj' : d + ' din pehle') + ' liya tha.' + (d > 7 ? ' Naya backup le lo.' : ''), 'Your last backup was ' + (d === 0 ? 'today' : d + ' days ago') + '.' + (d > 7 ? ' Consider taking a new one.' : '')));
  };
  H['tools.export'] = function () { gotoTab('tools'); exportBk(); return say(T2('Backup bana diya. Share ya copy karke surakshit jagah save kar lo.', 'Backup created. Share or copy it to a safe place.')); };
  H['danger.reset'] = function () { gotoTab('tools'); return say(T2('Yeh khatarnak kaam hai, isliye main voice se nahi karunga. Tools khol diya hai, wahan se khud karo, aur pehle backup le lena.', 'That is a risky action, so I will not do it by voice. I opened Tools; please do it yourself and take a backup first.')); };

  H['set.theme.dark'] = function () { document.documentElement.dataset.theme = 'dark'; try { localStorage.setItem('gj_th', 'dark'); } catch (e) {} return say(T2('Dark mode chalu.', 'Dark mode on.')); };
  H['set.theme.light'] = function () { document.documentElement.dataset.theme = 'light'; try { localStorage.setItem('gj_th', 'light'); } catch (e) {} return say(T2('Light mode chalu.', 'Light mode on.')); };
  H['set.applang'] = function (p) { S.lang = p.intent.args.lang; save(); buildUI(); render(); return say(S.lang === 'en' ? 'App language is now English.' : 'App ki bhasha ab Hinglish hai.'); };
  H['set.mode.text'] = function () { C().mode = 'text'; auto = false; save(); ui(); return say(T2('Theek hai, ab sirf text mein jawab dunga.', 'Okay, text-only replies from now on.')); };
  H['set.mode.voicetext'] = function () { C().mode = 'voicetext'; C().mute = false; auto = false; save(); ui(); return say(T2('Ab main bolkar bhi bataunga aur likhkar bhi.', 'I will now both speak and write.')); };
  H['set.mode.voicefirst'] = function () { C().mode = 'voicefirst'; C().mute = false; auto = true; save(); ui(); return say(T2('Voice-first mode chalu. Main jawab dekar khud sunta rahunga. Rukna ho toh "stop" bolo.', 'Voice-first mode on. I will keep listening after each answer. Say "stop" to end.')); };
  H['voice.mute'] = function () { C().mute = true; stopSpeak(); save(); ui(); return say(T2('Voice jawab band. Ab sirf text.', 'Voice replies muted. Text only.'), { speech: '' }); };
  H['voice.unmute'] = function () { C().mute = false; if (C().mode === 'text') C().mode = 'voicetext'; save(); ui(); return say(T2('Voice jawab chalu.', 'Voice replies are on.')); };
  H['voice.stop'] = function () { stopSpeak(); auto = false; stopListen(); return Promise.resolve(); };
  H['voice.repeat'] = function () { return say(lastSpoken ? lastSpoken : T2('Dohrane ko kuch nahi hai.', 'Nothing to repeat.'), { keepMore: true }); };
  H['voice.more'] = function () { return say(moreTxt || T2('Isse zyada detail abhi nahi hai.', 'There is nothing more on that right now.')); };
  function tweak(k, d, lo, hi) { var c = C(); c[k] = Math.max(lo, Math.min(hi, +(c[k] + d).toFixed(2))); save(); syncTools(); }
  H['voice.faster'] = function () { tweak('rate', 0.15, 0.6, 1.6); return say(T2('Theek hai, ab thoda tez bolunga.', 'Okay, speaking a little faster.')); };
  H['voice.slower'] = function () { tweak('rate', -0.15, 0.6, 1.6); return say(T2('Theek hai, ab thoda dheere bolunga.', 'Okay, speaking a little slower.')); };
  H['voice.pitch.up'] = function () { tweak('pitch', 0.15, 0.7, 1.4); return say(T2('Awaaz thodi patli kar di.', 'Raised my pitch a little.')); };
  H['voice.pitch.down'] = function () { tweak('pitch', -0.15, 0.7, 1.4); return say(T2('Awaaz thodi bhaari kar di.', 'Lowered my pitch a little.')); };
  H['voice.lang.hi'] = function () { C().lang = 'hi'; lastLang = 'hi'; save(); syncTools(); return say('Ji, ab main Hinglish mein baat karunga.'); };
  H['voice.lang.en'] = function () { C().lang = 'en'; lastLang = 'en'; save(); syncTools(); return say('Sure, I will speak English from now on.'); };
  H['help'] = function () {
    return say(T2('Main ' + C().name + ' hoon, aapka trading munim. Aap bol sakte ho:\n• "aaj ka profit", "is mahine ka nafa", "win rate", "sabse accha pair", "sabse bada loss"\n• "naya trade" (main sawal puchhkar save kar dunga)\n• "aakhri trade dikhao", "aakhri trade delete karo"\n• "goals kholo", "diary", "tools", "dark mode"\n• "sirf gold dikhao", "5 nov dhundo", "losing trades dikhao"\n• "tez bolo", "dheere bolo", "english mein baat karo", "voice band karo"\nBaaki sawaalon ka jawab AI dega.',
      'I am ' + C().name + ', your trading assistant. You can say:\n• "today\'s profit", "this month\'s pnl", "win rate", "best pair", "biggest loss"\n• "new trade" (I will ask questions and save it)\n• "show last trade", "delete last trade"\n• "open goals", "diary", "tools", "dark mode"\n• "filter gold", "search 5 Nov", "show losing trades"\n• "faster", "slower", "speak Hindi", "mute"\nAnything else goes to the AI.'),
      { speech: T2('Main ' + C().name + ' hoon. Mujhse profit, win rate, naya trade, ya screen kholne ko kaho. Baaki sawaalon ka jawab AI dega.', 'I am ' + C().name + '. Ask for profit, win rate, a new trade, or to open a screen. Anything else goes to the AI.') });
  };
  H['op.cancel'] = function () { if (DLG) { DLG = null; return say(T2('Theek hai, cancel kar diya.', 'Okay, cancelled.')); } return say(T2('Cancel karne ko kuch nahi hai.', 'Nothing to cancel.')); };

  /* ---------- new trade dialog ---------- */
  var ORDER = ['dir', 'lots', 'entry', 'sl', 'exit', 'rules'];
  var NUMS = ['lots', 'entry', 'sl', 'exit', 'tp', 'fee'];
  var QS = {
    dir: function () { return T2('Buy tha ya sell?', 'Was it a buy or a sell?'); },
    lots: function () { return T2('Kitne lot?', 'How many lots?'); },
    entry: function () { return T2('Entry price kya thi?', 'What was the entry price?'); },
    sl: function () { return T2('Stop loss kya tha? Agar nahi tha toh "no" bolo.', 'What was the stop loss? Say "no" if there was none.'); },
    exit: function () { return T2('Exit price kya thi?', 'What was the exit price?'); },
    rules: function () { return T2('Kya aapne apne checklist ke rules follow kiye the? Haan ya nahi?', 'Did you follow your checklist rules? Yes or no?'); }
  };
  function tagList() { var base = ['Breakout', 'Pullback', 'Reversal', 'News', 'Other']; try { var s = q('#f-tag'); if (s && s.options && s.options.length) return Array.prototype.map.call(s.options, function (o) { return o.value || o.text; }); } catch (e) {} return base.concat((typeof PB !== 'undefined' ? PB : []).map(function (x) { return x.name; })); }
  function nextSlot() { var f = DLG.f; for (var i = 0; i < ORDER.length; i++) { var k = ORDER[i]; if (k === 'sl') { if (f.sl == null && !DLG.skip.sl) return k; } else if (f[k] == null) return k; } return null; }
  function calc(f) {
    var s = f.dir === 'buy' ? 1 : -1, k = pv(f.sym, f.exit), gross = (f.exit - f.entry) * s * f.lots * k, fee = f.fee || 0;
    var rk = f.sl != null && f.sl !== f.entry ? Math.abs(f.entry - f.sl) * f.lots * pv(f.sym, f.entry) : 0;
    var pnl = f.pnl != null ? f.pnl : gross - fee; return { pnl: pnl, r: rk ? (f.pnl != null ? f.pnl : gross) / rk : null, rk: rk };
  }
  function sumText() {
    var f = DLG.f, c = calc(f), g = guard(), w = g.block ? g.r.filter(function (x) { return 'tmlwc'.indexOf(x[0]) >= 0; })[0] : null;
    return (w ? T2('Dhyan rakhiye: ', 'Heads up: ') + w[1] + ' ' : '') +
      T2(dirw(f.dir) + ' ' + f.sym + ' ' + f.lots + ' lot, entry ' + f.entry + ', SL ' + (f.sl != null ? f.sl : 'nahi') + ', exit ' + f.exit + (f.tp != null ? ', TP ' + f.tp : '') + '. P&L ' + money(c.pnl) + (c.r != null ? ', ' + c.r.toFixed(2) + 'R' : '') + (f.rules ? ', rules follow hue' : ', rules follow nahi hue') + '. Save karun?',
        dirw(f.dir) + ' ' + f.sym + ' ' + f.lots + ' lot, entry ' + f.entry + ', SL ' + (f.sl != null ? f.sl : 'none') + ', exit ' + f.exit + (f.tp != null ? ', TP ' + f.tp : '') + '. P&L ' + money(c.pnl) + (c.r != null ? ', ' + c.r.toFixed(2) + 'R' : '') + (f.rules ? ', rules followed' : ', rules not followed') + '. Shall I save it?');
  }
  function ask() {
    var k = nextSlot();
    if (k) { DLG.asked = k; DLG.stage = 'collect'; return say(QS[k]()); }
    DLG.asked = null; DLG.stage = 'confirm'; return say(sumText());
  }
  function startTrade(p) {
    if (EDIT) return say(T2('Pehle edit mode band karo (Add screen par Cancel), phir voice se naya trade banega.', 'Please cancel edit mode on the Add screen first.'));
    DLG = { type: 'trade', f: { sym: 'XAUUSD', fee: 0 }, skip: {}, asked: null, stage: 'collect' };
    var ch = merge(p), note = ch.length ? '' : T2('Chaliye naya trade likhte hain. ', 'Let us record a new trade. ');
    return Promise.resolve(note ? say(note.trim(), { speech: note }) : 0).then(function () { var e = validate(); return e ? say(e).then(ask) : ask(); });
  }
  function merge(p) {
    var f = DLG.f, x = p.fields, ch = [];
    ['sym', 'dir', 'lots', 'entry', 'sl', 'exit', 'tp', 'fee', 'grade', 'mood', 'tag'].forEach(function (k) { if (x[k] != null) { if (f[k] !== x[k]) ch.push(k); f[k] = x[k]; } });
    if (x.pnl != null) { f.pnl = x.pnl; ch.push('pnl'); }
    if (p.note) { f.note = p.note; ch.push('note'); }
    var a = DLG.asked;
    if (a && NUMS.indexOf(a) >= 0 && x[a] == null && p.number != null && !NUMS.some(function (k) { return x[k] != null; })) { f[a] = p.number; ch.push(a); }
    if (a === 'sl' && !ch.length && (p.yn === 'no' || /\b(no|nahi|none|skip)\b/.test(p.norm))) { DLG.skip.sl = true; ch.push('skip'); }
    if (a === 'rules' && f.rules == null) { if (p.yn === 'yes') { f.rules = true; ch.push('rules'); } else if (p.yn === 'no') { f.rules = false; ch.push('rules'); } }
    if (f.exit == null && f.pnl != null && f.entry != null && f.lots && f.dir) { var s = f.dir === 'buy' ? 1 : -1; f.exit = +(f.entry + s * ((f.pnl + (f.fee || 0)) / (f.lots * pv(f.sym, f.entry)))).toFixed(5); }
    return ch;
  }
  function validate() {
    var f = DLG.f;
    if (f.lots != null && !(f.lots > 0 && f.lots <= 100)) { f.lots = null; return T2('Lot size theek nahi lag raha, dobara batao.', 'That lot size does not look right; please say it again.'); }
    if (f.dir && f.entry != null && f.sl != null && ((f.dir === 'buy' && f.sl >= f.entry) || (f.dir === 'sell' && f.sl <= f.entry))) { f.sl = null; DLG.skip.sl = false; return T2('Stop loss galat side par lag raha hai (buy mein entry se neeche, sell mein upar). Dobara batao.', 'The stop loss is on the wrong side (below entry for buys, above for sells). Please say it again.'); }
    return '';
  }
  async function dialogTurn(p, id) {
    var t = DLG.type;
    if (id === 'op.cancel') return false;
    if (t === 'del') {
      var ok = NLU.deleteWord(p.norm); var tr = T.find(function (x) { return x.id === DLG.id; }); DLG = null;
      if (ok && tr) { delTrade(tr.id); await say(T2('Delete ho gaya.', 'Deleted.')); } else await say(T2('Theek hai, trade delete nahi kiya.', 'Okay, I kept the trade.'));
      return true;
    }
    if (t === 'form') { var y = p.yn; DLG = null; if (y === 'yes') { await saveTrade(); await say(T2('Save kar diya.', 'Saved.')); } else await say(T2('Theek hai, save nahi kiya.', 'Okay, not saved.')); return true; }
    if (['voice.stop', 'voice.repeat', 'voice.mute', 'voice.unmute', 'voice.faster', 'voice.slower', 'voice.pitch.up', 'voice.pitch.down', 'voice.lang.hi', 'voice.lang.en', 'help', 'set.mode.text', 'set.mode.voicetext', 'set.mode.voicefirst'].indexOf(id) >= 0) return false;
    /* trade dialog */
    var ch = merge(p), e = validate();
    if (DLG.stage === 'confirm') {
      if (e) { await say(e); return ask(), true; }
      if (ch.length) { await say(T2('Theek hai, badal diya. ', 'Updated. ') + sumText()); return true; }
      if (p.yn === 'yes' || id === 'trade.save') { await doSave(); return true; }
      if (p.yn === 'no') { DLG.stage = 'fix'; await say(T2('Theek hai, kya badlun? Jaise "entry 2655" bolo, ya cancel.', 'Okay, what should I change? Say for example "entry 2655", or cancel.')); return true; }
      await say(T2('Save karun? Haan ya nahi bolo.', 'Shall I save it? Say yes or no.')); return true;
    }
    if (DLG.stage === 'fix') {
      if (e) { await say(e); return true; }
      if (ch.length) { DLG.stage = 'confirm'; await say(sumText()); return true; }
      await say(T2('Samajh nahi aaya. Jaise "entry 2655" ya "exit 2660" bolo, ya cancel.', 'I did not get that. Say "entry 2655" or "exit 2660", or cancel.')); return true;
    }
    if (!ch.length) { if (id) return false; await say(T2('Samajh nahi aaya. ', 'Sorry, I did not catch that. ') + QS[DLG.asked || nextSlot()]()); return true; }
    if (e) { await say(e); }
    await ask(); return true;
  }
  function fill(f) {
    var v = function (id, x) { var e = q('#' + id); if (e) e.value = x == null ? '' : x; };
    var n = new Date(); n.setMinutes(n.getMinutes() - n.getTimezoneOffset());
    v('f-sym', f.sym || 'XAUUSD'); v('f-dir', f.dir); v('f-lots', f.lots); v('f-entry', f.entry); v('f-sl', f.sl); v('f-tp', f.tp); v('f-exit', f.exit); v('f-fee', f.fee || 0); v('f-pl', f.pnl);
    v('f-date', n.toISOString().slice(0, 16)); v('f-cdate', ''); try { autoSes(); } catch (e) {}
    v('f-tag', f.tag || 'Other'); v('f-grade', f.grade || ''); v('f-mood', f.mood || 'Calm'); v('f-note', f.note || ''); v('f-mis', 'Koi nahi'); v('f-news', 'Koi nahi');
    ['c1', 'c2', 'c3'].forEach(function (c) { var e = q('#' + c); if (e) e.checked = !!f.rules; });
  }
  async function doSave() {
    var f = DLG.f; DLG = null;
    if (EDIT) { await say(T2('Pehle edit mode band karo.', 'Please close edit mode first.')); return; }
    var before = T.length; fill(f); await saveTrade();
    if (T.length <= before) { await say(T2('Trade save nahi ho paya. Add screen par check karo.', 'Could not save the trade. Please check the Add screen.')); return; }
    var t = T[T.length - 1], g = guard(), win = t.pnl > 0;
    await say(T2('Ho gaya ' + who() + '. ' + dirw(t.dir) + ' ' + t.sym + ' trade save: ' + money(t.pnl) + (t.r != null ? ', ' + t.r.toFixed(2) + 'R' : '') + '. ' + (win ? 'Shabaash!' : 'Koi baat nahi, journal mein seekh likh lena.') + (g.r.some(function (x) { return x[0] === 't'; }) ? ' Aaj ka target pura ho gaya, ab trading band.' : ''),
      'Done ' + who() + '. ' + dirw(t.dir) + ' ' + t.sym + ' trade saved: ' + money(t.pnl) + (t.r != null ? ', ' + t.r.toFixed(2) + 'R' : '') + '. ' + (win ? 'Well done!' : 'It happens; note the lesson in your journal.') + (g.r.some(function (x) { return x[0] === 't'; }) ? ' Your daily target is complete, so stop trading now.' : '')));
  }

  /* ---------- AI fallback (spoken) ---------- */
  async function aiFallback(raw) {
    if (!S.keys || !S.keys[S.ai]) return say(T2('Yeh samajh nahi aaya. "help" bolo toh main bataunga ki kya kar sakta hoon. AI se baat karne ke liye Tools mein API key daalo.', 'I did not understand that. Say "help" to hear what I can do. To chat with the AI, add an API key in Tools.'));
    var a = realS(), use = a.length && (S.aictx === 'yes' || (S.aictx !== 'no' && TRX.test(raw)));
    var sys = 'You are ' + C().name + ', a warm, concise voice assistant for an Indian gold (XAUUSD) and forex trader named ' + C().user + '. Answer in 3 to 6 clear spoken sentences. Explain reasoning and practical next steps when useful; avoid markdown tables because the answer is spoken aloud. Answer exactly what was asked. Do not summarise the trader\'s trades unless asked. If trade data is attached, use it only when the question is about their own trading. Never give buy/sell signals or personal financial advice. ' + (lang() === 'en' ? 'Reply in English.' : 'Reply in Hinglish (Hindi in Roman script).');
    try {
      var r = await callAI(raw + (use ? '\n\nMY TRADE DATA (use only if relevant):\n' + brief(a.slice(-40)) : ''), { sys: sys, hist: CH.slice(-6) });
      CH.push({ role: 'user', content: raw }, { role: 'assistant', content: r }); if (CH.length > 12) CH = CH.slice(-12);
      LASTAI = r; return say(r);
    } catch (e) { return say(T2('AI nahi chala: ', 'AI failed: ') + ((e && e.message) || '')); }
  }

  async function marketNewsTurn(raw) {
    if (!S.newsKey) return say(T2('Latest news analysis ke liye Tools mein GNews API key add karni hogi.', 'To analyze current headlines, add a GNews API key in Tools.'));
    if (!window.RCNews) return say(T2('News module load nahi hua. App reload karke try karo.', 'News module did not load. Please reload the app.'));
    await say(T2('Latest headlines check kar raha hoon. Phir unka market impact analyze karunga.', 'Checking current headlines, then analyzing their market relevance.'));
    var result = await window.RCNews.analyze(raw, S.newsKey, callAI, lang());
    LASTAI = result.analysis;
    var log = q('#va-log');
    if (log) { var block = D.createElement('div'); block.className = 'va-b munim'; block.innerHTML = window.RCNews.render(result); log.appendChild(block); log.scrollTop = log.scrollHeight; }
    await say(result.analysis + ' ' + T2('Sources screen par diye hain.', 'Sources are displayed on screen.'));
  }

  /* ---------- main pipeline ---------- */
  async function process(raw) {
    raw = String(raw || '').trim(); if (!raw) return;
    stopSpeak(); push('me', raw); busy = true; buf = []; ui();
    try {
      if (/\b(news|headlines?|market update|latest update|khabar|samachar)\b/i.test(raw) && !DLG) {
        await marketNewsTurn(raw);
      } else {
      var p = NLU.parse(raw, { tags: tagList(), pending: !!DLG, now: new Date() });
      if (C().lang === 'auto') { var wc = raw.split(/\s+/).length; if (p.lang === 'hi') lastLang = 'hi'; else if (!DLG && wc >= 2) lastLang = 'en'; }
      var id = p.intent && p.intent.id, hadDlg = !!DLG, consumed = false;
      if (DLG) consumed = (await dialogTurn(p, id)) === true;
      if (!consumed) {
        if (id && H[id]) await H[id](p);
        else if (!DLG && p.fields.dir && (p.fields.entry != null || p.fields.lots != null || p.fields.sl != null)) await startTrade(p);
        else if (!hadDlg || !DLG) await aiFallback(raw);
        else await say(T2('Samajh nahi aaya.', 'Sorry, I did not catch that.'));
        if (hadDlg && DLG && DLG.type === 'trade' && id !== 'op.cancel') { var k = DLG.stage === 'confirm' ? sumText() : QS[DLG.asked || nextSlot()](); await say(k); }
      }
      }
    } catch (e) { buf = buf || []; await say(T2('Kuch gadbad ho gayi: ', 'Something went wrong: ') + ((e && e.message) || '')); }
    busy = false; await flush(); ui();
  }

  /* ---------- AI answers spoken (used by the app) ---------- */
  function speakAI(t) { var c = C(); if (!c.aiSpeak || c.mute || c.mode === 'text') return; speak(t); }
  function toggleSpeak(t) { if (speaking) { stopSpeak(); return; } if (t) speak(t); }

  /* ---------- UI ---------- */
  var CSS = '.va-fab{position:fixed;right:14px;bottom:calc(88px + env(safe-area-inset-bottom,0px));width:54px;height:54px;border-radius:50%;border:0;background:var(--gg);color:#1b1405;font-size:24px;z-index:25;box-shadow:0 8px 22px rgba(212,168,56,.4);cursor:pointer;display:flex;align-items:center;justify-content:center}' +
    '.va-fab.listen,.va-mic.listen{animation:vap 1.1s infinite}@keyframes vap{0%{box-shadow:0 0 0 0 rgba(226,187,85,.6)}100%{box-shadow:0 0 0 18px rgba(226,187,85,0)}}' +
    '.va-sheet{position:fixed;left:0;right:0;bottom:0;max-width:560px;margin:0 auto;height:76vh;background:var(--bg2);border:1px solid var(--line);border-radius:22px 22px 0 0;z-index:40;display:flex;flex-direction:column;transform:translateY(105%);transition:transform .25s;box-shadow:0 -12px 40px rgba(0,0,0,.5);padding-bottom:env(safe-area-inset-bottom,0px)}' +
    '.va-sheet.on{transform:none}.va-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 8px}.va-head b{font:700 17px "Playfair Display",Georgia,serif;background:var(--gg);-webkit-background-clip:text;background-clip:text;color:transparent}' +
    '.va-head button,.va-chip{background:var(--fld);border:1px solid var(--line);border-radius:999px;padding:6px 12px;font-size:12px;cursor:pointer;color:var(--ink)}' +
    '#va-log{flex:1;overflow:auto;padding:6px 14px;display:flex;flex-direction:column;gap:8px}.va-b{max-width:86%;padding:9px 12px;border-radius:14px;font-size:13.5px;line-height:1.45}' +
    '.va-b.me{align-self:flex-end;background:rgba(226,187,85,.16);border:1px solid rgba(226,187,85,.35)}.va-b.munim{align-self:flex-start;background:var(--card);border:1px solid var(--line)}' +
    '.va-chips{display:flex;gap:6px;overflow-x:auto;padding:6px 14px}.va-in{display:flex;gap:8px;padding:8px 14px 12px;align-items:center}.va-in input{flex:1}' +
    '.va-mic{width:46px;height:46px;border-radius:50%;border:0;background:var(--gg);color:#1b1405;font-size:20px;cursor:pointer;flex-shrink:0}.va-mic.speak{opacity:.7}' +
    '#va-status{font-size:11.5px;color:var(--mut);min-height:16px;padding:0 16px}';
  function build() {
    if (q('#va-fab')) return;
    var st = D.createElement('style'); st.id = 'va-css'; st.textContent = CSS; (D.head || D.body).appendChild(st);
    var w = D.createElement('div'); w.id = 'va-root';
    w.innerHTML = '<button class="va-fab" id="va-fab" aria-label="Munim">🎙</button><div class="va-sheet" id="va-sheet"><div class="va-head"><b id="va-title">Munim</b><div><button id="va-mute">🔊</button> <button id="va-close">✕</button></div></div><div id="va-status"></div><div id="va-log"></div><div class="va-chips" id="va-chips"></div><div class="va-in"><input id="va-txt" autocomplete="off"><button class="va-mic" id="va-send" style="font-size:16px">➤</button><button class="va-mic" id="va-mic">🎤</button></div></div>';
    D.body.appendChild(w);
  }
  function labels() {
    var t = q('#va-title'); if (!t) return;
    t.textContent = C().name + ' · ' + L('aapka munim', 'your assistant');
    q('#va-txt').placeholder = L('Boliye ya likhiye…', 'Speak or type…');
    var ch = [['aaj ka profit', "today's profit"], ['win rate batao', 'win rate'], ['naya trade', 'new trade'], ['aakhri trade dikhao', 'show last trade'], ['help', 'help']];
    q('#va-chips').innerHTML = ch.map(function (c) { var s = L(c[0], c[1]); return '<button class="va-chip" data-vaq="' + esc(s) + '">' + esc(s) + '</button>'; }).join('');
  }
  function ui() {
    var s = q('#va-status'); if (!s) return;
    var st = listening ? 'listen' : busy ? 'think' : speaking ? 'speak' : 'idle';
    if (st !== 'listen' || !s.textContent) s.textContent = { listen: T2('Sun raha hoon…', 'Listening…'), think: T2('Soch raha hoon…', 'Thinking…'), speak: T2('Bol raha hoon…', 'Speaking…'), idle: '' }[st];
    var m = q('#va-mic'), f = q('#va-fab'), mu = q('#va-mute');
    if (m) m.className = 'va-mic ' + st; if (f) f.className = 'va-fab ' + (listening ? 'listen' : '');
    if (mu) mu.textContent = (C().mute || C().mode === 'text') ? '🔇' : '🔊';
  }
  function open(listenNow) {
    build(); labels(); openP = true; q('#va-sheet').className = 'va-sheet on'; q('#va-fab').style.display = 'none';
    if (!greeted) { greeted = true; buf = []; say(greet() + ' ' + T2('Main ' + C().name + ' hoon, aapka trading munim. Boliye, kya dekhna hai? "help" bolo toh main sab batata hoon.', 'I am ' + C().name + ', your trading assistant. How can I help? Say "help" to hear everything I can do.')); flush(); }
    renderLog(); ui(); if (listenNow) listen();
  }
  function close() { openP = false; auto = false; stopListen(); stopSpeak(); var s = q('#va-sheet'); if (s) s.className = 'va-sheet'; var f = q('#va-fab'); if (f) f.style.display = ''; }
  function send() { var i = q('#va-txt'), v = i.value.trim(); if (!v) return; i.value = ''; process(v); }

  /* ---------- Tools card ---------- */
  function toolsCard() {
    return '<div class="card"><div class="eb">' + esc(C().name) + ' · Voice</div><div class="sub" style="margin-top:6px">' + L('Neeche 🎙 button se bolo: "aaj ka profit", "naya trade", "goals kholo"…', 'Tap the 🎙 button and say: "today\'s profit", "new trade", "open goals"…') + '</div>' +
      '<div class="grid"><div><label>' + L('Assistant ka naam', 'Assistant name') + '</label><input data-va="name" value="' + esc(C().name) + '"></div><div><label>' + L('Aapka naam', 'Your name') + '</label><input data-va="user" value="' + esc(C().user) + '"></div></div>' +
      '<label>' + L('Mode', 'Mode') + '</label><select data-va="mode"><option value="text">' + L('Sirf text', 'Text only') + '</option><option value="voicetext">' + L('Voice + text', 'Voice + text') + '</option><option value="voicefirst">' + L('Voice-first (hands-free)', 'Voice-first (hands-free)') + '</option></select>' +
      '<label>' + L('Bolne ki bhasha', 'Spoken language') + '</label><select data-va="lang"><option value="auto">Auto</option><option value="hi">Hinglish</option><option value="en">English</option></select>' +
      '<label>' + L('Hinglish ke liye awaaz', 'Voice for Hinglish') + '</label><select data-va="hv"><option value="en-IN">English (India)</option><option value="hi-IN">Hindi (hi-IN)</option></select>' +
      '<label>' + L('Speed', 'Speed') + '</label><input type="range" data-va="rate" min="0.6" max="1.6" step="0.05"><label>Pitch</label><input type="range" data-va="pitch" min="0.7" max="1.4" step="0.05">' +
      '<div class="chk"><input type="checkbox" data-va="aiSpeak"><span>' + L('AI ke jawab bolkar sunao', 'Read AI answers aloud') + '</span></div><div class="chk"><input type="checkbox" data-va="mute"><span>' + L('Awaaz band (mute)', 'Mute voice') + '</span></div>' +
      '<button class="btn ghost" id="va-test">' + L('Awaaz test karo', 'Test voice') + '</button><div class="note">' + L('APK mein mic ke liye "with_voice" build chahiye. Agar mic na chale toh keyboard ke mic button se likhwa sakte ho.', 'The APK needs the "with_voice" build for the mic. If the mic does not work, use the keyboard mic button.') + '</div></div>';
  }
  function syncTools() {
    var c = C();
    ['name', 'user', 'mode', 'lang', 'hv', 'rate', 'pitch', 'aiSpeak', 'mute'].forEach(function (k) {
      var e = q('[data-va="' + k + '"]'); if (!e) return;
      if (e.type === 'checkbox') e.checked = !!c[k]; else e.value = c[k];
    });
  }
  function afterBuild() { if (!greeted && C().lang === 'auto') lastLang = S.lang === 'en' ? 'en' : 'hi'; build(); labels(); syncTools(); ui(); }

  /* ---------- events ---------- */
  D.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button'); if (!b) return;
    var id = b.id;
    if (id === 'va-fab') open(false);
    else if (id === 'va-close') close();
    else if (id === 'va-mic') { if (listening) { auto = false; stopListen(); } else { auto = C().mode === 'voicefirst'; listen(); } }
    else if (id === 'va-send') send();
    else if (id === 'va-mute') { var c = C(); c.mute = !c.mute; if (c.mute) stopSpeak(); save(); syncTools(); ui(); }
    else if (b.dataset && b.dataset.vaq) process(b.dataset.vaq);
    else if (id === 'va-test') { buf = []; say(greet() + ' ' + T2('Main ' + C().name + ' hoon. Meri awaaz kaisi lag rahi hai?', 'I am ' + C().name + '. How do I sound?')); flush(); }
  });
  function onSet(e) {
    var t = e.target, k = t && t.dataset && t.dataset.va; if (!k) return;
    var c = C(); c[k] = t.type === 'checkbox' ? t.checked : (t.type === 'range' ? +t.value : t.value);
    if (k === 'lang') lastLang = c.lang === 'en' ? 'en' : 'hi';
    if (k === 'mute' && c.mute) stopSpeak();
    save(); ui(); if (k === 'name') labels();
  }
  D.addEventListener('change', onSet);
  D.addEventListener('input', function (e) { if (e.target && e.target.dataset && e.target.dataset.va && e.target.type === 'text') onSet(e); });
  D.addEventListener('keydown', function (e) { if (e.target && e.target.id === 'va-txt' && e.key === 'Enter') send(); });

  window.VA = { open: open, close: close, process: process, speak: speak, speakAI: speakAI, toggleSpeak: toggleSpeak, stopSpeak: stopSpeak, toolsCard: toolsCard, afterBuild: afterBuild, _log: LOG, _n: function () { return cnt; }, _state: function () { return { dlg: DLG, lang: lang(), cfg: C() }; }, _clean: clean };
  afterBuild();
})();
