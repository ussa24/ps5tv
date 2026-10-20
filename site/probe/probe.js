/* PS5 TV Probe: measures what the PS5 WebKit browser can do for an IPTV player.
 * Written in ES2017 (no optional chaining) because the PS5 WebKit version is unknown.
 * Everything is wrapped so one failing test never stops the rest. */
(function () {
  'use strict';

  var VERSION = 'p1';
  var LS_MARK = 'ps5probe.marker';
  var LS_KEYS = 'ps5probe.keys';
  var STREAMS = {
    // Public test streams, chosen because they send CORS headers.
    vod1080: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    live: 'https://demo.unified-streaming.com/k8s/live/stable/live.isml/.m3u8',
    hevc: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_adv_example_hevc/master.m3u8',
    ts: 'https://test-streams.mux.dev/x36xhzz/url_8/url_590/193039199_mp4_h264_aac_fhd_7.ts',
    httpHls: 'http://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    httpJson: 'http://httpbin.org/get',
    httpImg: 'http://httpbin.org/image/png',
    noCors: 'https://example.com/'
  };

  var R = { v: VERSION, t: new Date().toISOString() };
  var stage = document.getElementById('stage');
  var logEl = document.getElementById('log');
  document.getElementById('ver').textContent = VERSION;

  window.addEventListener('error', function (e) {
    document.getElementById('err').textContent += 'JS error: ' + e.message + ' @' + (e.lineno || '?') + '\n';
    (R.jsErr = R.jsErr || []).push(String(e.message).slice(0, 80));
  });

  // ---------- small helpers ----------
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function errStr(e) { return e ? String(e.name || '') + ':' + String(e.message || e).slice(0, 60) : 'err'; }
  function withTimeout(p, ms, label) {
    return Promise.race([p, sleep(ms).then(function () { throw { name: 'Timeout', message: label || (ms + 'ms') }; })]);
  }
  function row(name) {
    var li = document.createElement('li');
    li.innerHTML = '<span class="s run">…</span><span class="n"></span><span class="d"></span>';
    li.querySelector('.n').textContent = name;
    logEl.appendChild(li);
    while (logEl.children.length > 16) logEl.removeChild(logEl.firstChild);
    return {
      done: function (state, detail) {
        var s = li.querySelector('.s');
        s.className = 's ' + state;
        s.textContent = state === 'ok' ? '✓' : state === 'bad' ? '✗' : '!';
        li.querySelector('.d').textContent = detail || '';
      }
    };
  }
  async function step(name, fn) {
    var r = row(name);
    try {
      var out = await fn();
      var st = out && out.state ? out.state : 'ok';
      r.done(st, out && out.detail ? out.detail : '');
    } catch (e) {
      r.done('bad', errStr(e));
    }
  }
  function has(path) {
    try {
      var o = window, parts = path.split('.');
      for (var i = 0; i < parts.length; i++) { o = o[parts[i]]; if (o === undefined || o === null) return 0; }
      return 1;
    } catch (e) { return 0; }
  }
  function syntax(src) { try { new Function(src); return 1; } catch (e) { return 0; } }
  function cssOk(p, v) { try { return (window.CSS && CSS.supports(p, v)) ? 1 : 0; } catch (e) { return 0; } }
  function selOk(sel) { try { document.querySelector(sel); return 1; } catch (e) { return 0; } }

  // ---------- persistence (run first so we read the previous visit's marker) ----------
  function idbOpen() {
    return new Promise(function (res, rej) {
      var req = indexedDB.open('ps5probe', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error); };
    });
  }
  function idbDo(mode, fn) {
    return idbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('kv', mode), st = tx.objectStore('kv'), out = fn(st);
        tx.oncomplete = function () { db.close(); res(out && out.result !== undefined ? out.result : undefined); };
        tx.onerror = function () { db.close(); rej(tx.error); };
      });
    });
  }
  function getCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  async function persistence() {
    var p = R.pers = {};
    var prev = null;
    try { prev = JSON.parse(localStorage.getItem(LS_MARK) || 'null'); p.ls = prev ? prev.t : 0; } catch (e) { p.ls = errStr(e); }
    try { p.ck = getCookie('ps5probe') || 0; } catch (e) { p.ck = errStr(e); }
    try { p.ss = sessionStorage.getItem('ps5probe') || 0; } catch (e) { p.ss = errStr(e); }
    try { p.idb = (await withTimeout(idbDo('readonly', function (s) { return s.get('marker'); }), 4000)) || 0; } catch (e) { p.idb = errStr(e); }
    try {
      if (window.caches) {
        var c = await caches.open('ps5probe');
        var m = await c.match('marker');
        p.cache = m ? await m.text() : 0;
      } else p.cache = 'na';
    } catch (e) { p.cache = errStr(e); }
    try { p.swCtl = (navigator.serviceWorker && navigator.serviceWorker.controller) ? 1 : 0; } catch (e) { p.swCtl = errStr(e); }

    var visits = prev && prev.n ? prev.n + 1 : 1;
    R.visit = visits;
    var mark = { t: R.t, n: visits };
    try { localStorage.setItem(LS_MARK, JSON.stringify(mark)); } catch (e) { p.lsW = errStr(e); }
    try { document.cookie = 'ps5probe=' + encodeURIComponent(R.t) + '; max-age=31536000; path=/; SameSite=Lax; Secure'; } catch (e) {}
    try { sessionStorage.setItem('ps5probe', R.t); } catch (e) {}
    try { await withTimeout(idbDo('readwrite', function (s) { return s.put(R.t, 'marker'); }), 4000); } catch (e) { p.idbW = errStr(e); }
    try { if (window.caches) { var c2 = await caches.open('ps5probe'); await c2.put('marker', new Response(R.t)); } } catch (e) { p.cacheW = errStr(e); }
    try {
      if (navigator.serviceWorker) {
        var reg = await withTimeout(navigator.serviceWorker.register('sw.js'), 6000);
        p.swReg = reg ? 1 : 0;
      } else p.swReg = 'na';
    } catch (e) { p.swReg = errStr(e); }
    try {
      if (navigator.storage && navigator.storage.estimate) {
        var est = await navigator.storage.estimate();
        p.quotaMB = Math.round((est.quota || 0) / 1048576); p.usageMB = Math.round((est.usage || 0) / 1048576);
      }
      if (navigator.storage && navigator.storage.persisted) p.persisted = (await navigator.storage.persisted()) ? 1 : 0;
      if (navigator.storage && navigator.storage.persist) p.persistReq = (await navigator.storage.persist()) ? 1 : 0;
    } catch (e) { p.storErr = errStr(e); }
    return { detail: 'visit #' + visits + (prev ? ', previous marker found' : ', first visit'), state: visits > 1 && !prev ? 'warn' : 'ok' };
  }

  // ---------- environment + features ----------
  function environment() {
    R.ua = navigator.userAgent;
    R.scr = { w: screen.width, h: screen.height, iw: innerWidth, ih: innerHeight, dpr: window.devicePixelRatio || 1,
      hdr: matchMedia('(dynamic-range: high)').matches ? 1 : 0, p3: matchMedia('(color-gamut: p3)').matches ? 1 : 0 };
    R.env = { lang: navigator.language, tz: (Intl.DateTimeFormat().resolvedOptions().timeZone || ''), cores: navigator.hardwareConcurrency || 0,
      mem: navigator.deviceMemory || 0, secure: window.isSecureContext ? 1 : 0, proto: location.protocol, ref: (document.referrer || '').slice(0, 60),
      hist: history.length, conn: (navigator.connection && navigator.connection.effectiveType) || '' };
    var f = {};
    ['MediaSource', 'ManagedMediaSource', 'WebKitMediaSource', 'VideoDecoder', 'MediaCapabilities', 'Worker', 'SharedWorker',
     'OffscreenCanvas', 'WebAssembly', 'SharedArrayBuffer', 'CompressionStream', 'DecompressionStream', 'ReadableStream',
     'AbortController', 'IntersectionObserver', 'ResizeObserver', 'requestIdleCallback', 'structuredClone', 'WeakRef',
     'BroadcastChannel', 'RTCPeerConnection', 'WebSocket', 'EventSource', 'TextDecoder', 'PointerEvent', 'crypto.subtle',
     'navigator.getGamepads', 'navigator.wakeLock', 'navigator.mediaSession', 'navigator.share', 'navigator.clipboard',
     'document.fullscreenEnabled', 'document.webkitFullscreenEnabled', 'Element.prototype.requestFullscreen',
     'Element.prototype.webkitRequestFullscreen', 'HTMLVideoElement.prototype.webkitEnterFullscreen',
     'HTMLVideoElement.prototype.requestPictureInPicture', 'HTMLVideoElement.prototype.getVideoPlaybackQuality',
     'HTMLVideoElement.prototype.requestVideoFrameCallback', 'indexedDB', 'caches', 'navigator.serviceWorker'
    ].forEach(function (k) { f[k.replace('Element.prototype.', 'E.').replace('HTMLVideoElement.prototype.', 'V.').replace('navigator.', 'n.').replace('document.', 'd.')] = has(k); });
    f.ontouch = ('ontouchstart' in window) ? 1 : 0;
    f.module = ('noModule' in document.createElement('script')) ? 1 : 0;
    f.optChain = syntax('var a=null; return a?.b;');
    f.nullish = syntax('return null ?? 1;');
    f.bigint = syntax('return 1n;');
    f.privField = syntax('class A{#x=1}');
    R.feat = f;
    R.css = { grid: cssOk('display', 'grid'), flexGap: cssOk('gap', '1px'), aspect: cssOk('aspect-ratio', '1'), inset: cssOk('inset', '0'),
      bdf: cssOk('backdrop-filter', 'blur(4px)'), wbdf: cssOk('-webkit-backdrop-filter', 'blur(4px)'), cv: cssOk('content-visibility', 'auto'),
      contain: cssOk('contain', 'strict'), sticky: cssOk('position', 'sticky'), focusVis: selOk(':focus-visible'), has: selOk(':has(a)'),
      clamp: cssOk('width', 'clamp(1px, 2vw, 3px)'), vars: cssOk('--x', '1') };
    return { detail: R.scr.iw + 'x' + R.scr.ih + ' @' + R.scr.dpr + ' ' + location.protocol };
  }

  // ---------- codecs ----------
  var CODECS = {
    h264b: 'video/mp4; codecs="avc1.42E01E"', h264m: 'video/mp4; codecs="avc1.4D401F"', h264h40: 'video/mp4; codecs="avc1.640028"',
    h264h51: 'video/mp4; codecs="avc1.640033"', hevc: 'video/mp4; codecs="hvc1.1.6.L120.90"', hevcHev: 'video/mp4; codecs="hev1.1.6.L120.90"',
    hevc10: 'video/mp4; codecs="hvc1.2.4.L150.B0"', vp9: 'video/webm; codecs="vp9"', vp9mp4: 'video/mp4; codecs="vp09.00.40.08"',
    av1: 'video/mp4; codecs="av01.0.08M.08"', aac: 'audio/mp4; codecs="mp4a.40.2"', heaac: 'audio/mp4; codecs="mp4a.40.5"',
    ac3: 'audio/mp4; codecs="ac-3"', eac3: 'audio/mp4; codecs="ec-3"', mp3: 'audio/mpeg', opus: 'audio/webm; codecs="opus"',
    ts264: 'video/mp2t; codecs="avc1.42E01E,mp4a.40.2"', mpeg2: 'video/mp2t; codecs="mp2v"'
  };
  function codecs() {
    var MS = window.ManagedMediaSource || window.MediaSource || window.WebKitMediaSource;
    var v = document.createElement('video');
    var mse = {}, cpt = {};
    Object.keys(CODECS).forEach(function (k) {
      try { mse[k] = MS && MS.isTypeSupported(CODECS[k]) ? 1 : 0; } catch (e) { mse[k] = 'e'; }
    });
    ['application/vnd.apple.mpegurl', 'application/x-mpegURL', 'video/mp2t', 'video/mp4', 'video/webm', 'video/x-matroska',
     'video/mp4; codecs="hvc1.1.6.L120.90"', 'audio/mp4; codecs="ac-3"', 'audio/mp4; codecs="ec-3"'].forEach(function (t, i) {
      try { cpt[['hls', 'hlsx', 'ts', 'mp4', 'webm', 'mkv', 'hevc', 'ac3', 'eac3'][i]] = v.canPlayType(t) || '-'; } catch (e) { cpt[i] = 'e'; }
    });
    R.mse = mse; R.cpt = cpt;
    var bad = !MS;
    return { state: bad ? 'bad' : 'ok', detail: (MS ? 'MSE ' : 'no MSE ') + 'h264:' + mse.h264h40 + ' hevc:' + mse.hevc + ' ac3:' + mse.ac3 + ' nativeHLS:' + cpt.hls };
  }

  // ---------- network ----------
  async function network() {
    var n = R.net = {};
    // Throughput: download one 5 MB TS segment.
    try {
      var t0 = now();
      var r = await withTimeout(fetch(STREAMS.ts, { cache: 'no-store' }), 20000);
      var buf = await r.arrayBuffer();
      var dt = (now() - t0) / 1000;
      n.mbps = Math.round(buf.byteLength * 8 / dt / 1e5) / 10;
    } catch (e) { n.mbps = errStr(e); }
    // CORS: a server that does not send Access-Control-Allow-Origin.
    try { await withTimeout(fetch(STREAMS.noCors), 8000); n.noCors = 'allowed'; } catch (e) { n.noCors = 'blocked:' + errStr(e); }
    // Mixed content (only meaningful when this page is https).
    try { var mr = await withTimeout(fetch(STREAMS.httpJson), 8000); n.mixFetch = 'allowed:' + mr.status + ':' + (mr.url || '').slice(0, 6); } catch (e) { n.mixFetch = 'blocked:' + errStr(e); }
    n.mixImg = await new Promise(function (res) {
      var img = new Image(), done = false;
      img.onload = function () { if (!done) { done = true; res('loaded'); } };
      img.onerror = function () { if (!done) { done = true; res('blocked'); } };
      setTimeout(function () { if (!done) { done = true; res('timeout'); } }, 8000);
      img.src = STREAMS.httpImg + '?r=' + Math.random();
    });
    // Clock skew vs server Date header (matters for EPG "now" bars).
    try {
      var hr = await fetch(location.href, { method: 'HEAD', cache: 'no-store' });
      var sd = Date.parse(hr.headers.get('date'));
      if (sd) n.skewS = Math.round((Date.now() - sd) / 1000);
    } catch (e) { n.skewS = errStr(e); }
    return { detail: n.mbps + ' Mbps, mixed fetch ' + String(n.mixFetch).split(':')[0] + ', noCORS ' + String(n.noCors).split(':')[0] };
  }

  // ---------- playback ----------
  function newVideo(muted) {
    stage.innerHTML = '';
    var v = document.createElement('video');
    v.muted = muted !== false; v.playsInline = true; v.autoplay = false; v.setAttribute('playsinline', '');
    stage.appendChild(v);
    return v;
  }
  function quality(v) {
    try {
      if (v.getVideoPlaybackQuality) { var q = v.getVideoPlaybackQuality(); return { tot: q.totalVideoFrames, drop: q.droppedVideoFrames }; }
      if ('webkitDecodedFrameCount' in v) return { tot: v.webkitDecodedFrameCount, drop: v.webkitDroppedFrameCount };
    } catch (e) {}
    return { tot: -1, drop: -1 };
  }
  // Starts playback via `attach`, waits for real frames, watches for `watchMs`, reports timings.
  async function playTest(key, attach, watchMs, timeoutMs) {
    var v = newVideo(true);
    var res = { ok: 0 };
    var t0 = now(), cleanup = null, stalls = 0, lastErr = '';
    v.addEventListener('waiting', function () { stalls++; });
    v.addEventListener('error', function () { lastErr = 'media:' + (v.error ? v.error.code : '?'); });
    try {
      cleanup = attach(v, function (e) { lastErr = e; });
      var pr = v.play(); if (pr && pr.catch) pr.catch(function (e) { lastErr = 'play:' + errStr(e); });
      await withTimeout(new Promise(function (resolve, reject) {
        var iv = setInterval(function () {
          if (v.currentTime > 0.3 && v.readyState >= 2) { clearInterval(iv); resolve(); }
          if (lastErr && /fatal|media:/.test(lastErr)) { clearInterval(iv); reject({ name: 'Err', message: lastErr }); }
        }, 100);
      }), timeoutMs, 'no frames');
      res.ok = 1; res.ttff = Math.round(now() - t0);
      var q0 = quality(v), ct0 = v.currentTime, w0 = now();
      var rafN = 0, rafOn = true;
      (function raf() { if (!rafOn) return; rafN++; requestAnimationFrame(raf); })();
      await sleep(watchMs);
      rafOn = false;
      var q1 = quality(v), secs = (now() - w0) / 1000;
      res.w = v.videoWidth; res.h = v.videoHeight;
      res.fps = q1.tot >= 0 ? Math.round((q1.tot - q0.tot) / secs) : -1;
      res.drop = q1.drop >= 0 ? q1.drop - q0.drop : -1;
      res.adv = Math.round((v.currentTime - ct0) / secs * 100) / 100; // 1.0 = real time
      res.raf = Math.round(rafN / secs);
      res.stalls = stalls;
    } catch (e) {
      res.err = errStr(e) + (lastErr ? '|' + lastErr : '');
    }
    try { if (cleanup) cleanup(); } catch (e) {}
    try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {}
    stage.innerHTML = '';
    (R.play = R.play || {})[key] = res;
    return { state: res.ok ? (res.drop > 30 || res.adv < 0.9 ? 'warn' : 'ok') : 'bad',
      detail: res.ok ? (res.w + 'x' + res.h + ' ' + res.fps + 'fps drop ' + res.drop + ' start ' + res.ttff + 'ms') : res.err };
  }
  function nativeAttach(url) { return function (v) { v.src = url; return null; }; }
  function hlsAttach(url, opts) {
    return function (v, onErr) {
      if (!window.Hls || !Hls.isSupported()) throw { name: 'NoHls', message: 'Hls.isSupported() false' };
      var h = new Hls(Object.assign({ enableWorker: true, lowLatencyMode: false, capLevelToPlayerSize: false, startLevel: -1 }, opts || {}));
      h.on(Hls.Events.ERROR, function (ev, d) { if (d.fatal) onErr('fatal:' + d.type + ':' + d.details); });
      h.on(Hls.Events.MANIFEST_PARSED, function () {
        // Force the highest level so we measure 1080p decode, not ABR guesses.
        if (opts && opts.forceTop) h.currentLevel = h.levels.length - 1;
      });
      h.loadSource(url); h.attachMedia(v);
      return function () { h.destroy(); };
    };
  }
  function mpegtsAttach(url) {
    return function (v, onErr) {
      if (!window.mpegts || !mpegts.isSupported()) throw { name: 'NoMpegts', message: 'mpegts.isSupported() false' };
      var p = mpegts.createPlayer({ type: 'mpegts', isLive: false, url: url }, { enableWorker: false, lazyLoad: false });
      p.on(mpegts.Events.ERROR, function (t, d) { onErr('fatal:' + t + ':' + d); });
      p.attachMediaElement(v); p.load();
      return function () { p.destroy(); };
    };
  }

  async function autoplayUnmuted() {
    var v = newVideo(false);
    v.src = STREAMS.vod1080;
    try {
      await withTimeout(v.play(), 8000);
      R.autoSound = 'allowed';
    } catch (e) { R.autoSound = 'blocked:' + errStr(e); }
    try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {}
    stage.innerHTML = '';
    return { state: R.autoSound === 'allowed' ? 'ok' : 'warn', detail: R.autoSound };
  }

  // ---------- performance ----------
  function synthM3U(n) {
    var out = ['#EXTM3U'];
    for (var i = 0; i < n; i++) {
      out.push('#EXTINF:-1 tvg-id="ch' + i + '.test" tvg-name="Channel ' + i + '" tvg-logo="https://example.invalid/l/' + i + '.png" group-title="Group ' + (i % 40) + '",Channel number ' + i);
      out.push('http://example.invalid:8080/live/user/pass/' + i + '.ts');
    }
    return out.join('\n');
  }
  var PARSER_SRC = 'self.onmessage=function(e){var t0=Date.now();var L=e.data.split("\\n"),o=[],c=null;' +
    'for(var i=0;i<L.length;i++){var l=L[i];if(l.indexOf("#EXTINF")===0){var g=/group-title="([^"]*)"/.exec(l),n=l.slice(l.lastIndexOf(",")+1);c={n:n,g:g?g[1]:""};}' +
    'else if(c&&l&&l[0]!=="#"){c.u=l;o.push(c);c=null;}}self.postMessage({count:o.length,ms:Date.now()-t0});};';
  async function perf() {
    var pf = R.perf = {};
    var text = synthM3U(10000);
    pf.m3uKB = Math.round(text.length / 1024);
    try {
      var w = new Worker(URL.createObjectURL(new Blob([PARSER_SRC], { type: 'text/javascript' })));
      var t0 = now();
      var out = await withTimeout(new Promise(function (res, rej) { w.onmessage = function (e) { res(e.data); }; w.onerror = function (e) { rej(e); }; w.postMessage(text); }), 15000);
      pf.parseWorkerMs = out.ms; pf.parseRoundMs = Math.round(now() - t0); pf.parsed = out.count;
      w.terminate();
    } catch (e) { pf.parseWorkerMs = errStr(e); }
    try {
      var t1 = now();
      var big = JSON.stringify({ d: text });
      await withTimeout(idbDo('readwrite', function (s) { return s.put(big, 'bigplaylist'); }), 15000);
      pf.idbWriteMs = Math.round(now() - t1);
      var t2 = now();
      var back = await withTimeout(idbDo('readonly', function (s) { return s.get('bigplaylist'); }), 15000);
      pf.idbReadMs = Math.round(now() - t2); pf.idbReadOk = back && back.length === big.length ? 1 : 0;
      await idbDo('readwrite', function (s) { return s.delete('bigplaylist'); });
    } catch (e) { pf.idbWriteMs = errStr(e); }
    // localStorage ceiling in 512 KB steps, capped at 8 MB.
    try {
      var chunk = new Array(512 * 1024 + 1).join('a'), kb = 0;
      for (var i = 0; i < 16; i++) {
        try { localStorage.setItem('ps5probe.fill' + i, chunk); kb += 512; } catch (e) { break; }
      }
      for (var j = 0; j < 16; j++) localStorage.removeItem('ps5probe.fill' + j);
      pf.lsMaxKB = kb >= 8192 ? '8192+' : kb;
    } catch (e) { pf.lsMaxKB = errStr(e); }
    // Crypto for the pairing flow: AES-GCM round trip.
    try {
      var key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
      var iv = crypto.getRandomValues(new Uint8Array(12));
      var ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode('pair-test'));
      var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
      pf.aesgcm = new TextDecoder().decode(pt) === 'pair-test' ? 1 : 0;
    } catch (e) { pf.aesgcm = errStr(e); }
    return { detail: '10k parse ' + pf.parseWorkerMs + 'ms, IDB write ' + pf.idbWriteMs + 'ms, LS ' + pf.lsMaxKB + 'KB' };
  }

  // ---------- controller test ----------
  var KEY_STEPS = [
    ['up', 'D-pad UP'], ['down', 'D-pad DOWN'], ['left', 'D-pad LEFT'], ['right', 'D-pad RIGHT'],
    ['x', 'Cross ✕'], ['sq', 'Square □'], ['tri', 'Triangle △'], ['l1', 'L1'], ['r1', 'R1'], ['l2', 'L2'], ['r2', 'R2'],
    ['opt', 'OPTIONS'], ['lsr', 'Left stick → push RIGHT'], ['rsd', 'Right stick → push DOWN'],
    ['o', 'Circle ○', 'Last one. This button may try to leave the page; if it does, just reopen the link.']
  ];
  function padSnapshot() {
    var out = { b: [], a: [] };
    try {
      var pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (var i = 0; i < pads.length; i++) {
        var p = pads[i]; if (!p) continue;
        out.id = (p.id || '').slice(0, 40); out.map = p.mapping;
        for (var b = 0; b < p.buttons.length; b++) out.b[b] = p.buttons[b].pressed || p.buttons[b].value > 0.5 ? 1 : 0;
        for (var a = 0; a < p.axes.length; a++) out.a[a] = Math.round(p.axes[a] * 10) / 10;
        break;
      }
    } catch (e) {}
    return out;
  }

  function controllerTest() {
    var panel = document.getElementById('keysPanel'), promptEl = document.getElementById('prompt');
    panel.classList.remove('hidden');
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(LS_KEYS) || 'null'); } catch (e) {}
    var results = saved && saved.v === VERSION ? saved.steps : {};
    var events = [];
    var padSeen = { connected: 0, id: '' };

    function rec(type, extra) { events.push(Object.assign({ ty: type, t: Math.round(now()) }, extra || {})); }
    function onKey(e) {
      rec(e.type === 'keydown' ? 'kd' : 'ku', { k: e.key, c: e.code, kc: e.keyCode || e.which || 0, r: e.repeat ? 1 : 0 });
      if (e.type === 'keydown') { try { e.preventDefault(); } catch (x) {} }
    }
    function onClick(e) { rec('click', { x: Math.round(e.clientX), y: Math.round(e.clientY), tg: e.target && e.target.tagName }); }
    function onPop() { rec('pop'); try { history.pushState({ probe: 1 }, ''); } catch (x) {} }
    function onWheel(e) { rec('wheel', { dy: Math.round(e.deltaY), dx: Math.round(e.deltaX) }); }
    function onUnload() { rec('unload'); persistKeys(); }
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPop);
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('gamepadconnected', function (e) { padSeen.connected = 1; padSeen.id = (e.gamepad && e.gamepad.id || '').slice(0, 40); });
    try { history.pushState({ probe: 1 }, ''); } catch (e) {}

    function persistKeys() { try { localStorage.setItem(LS_KEYS, JSON.stringify({ v: VERSION, steps: results, pad: padSeen })); } catch (e) {} }

    function summarize(evts, padBase, padHits) {
      var s = {};
      var kd = evts.filter(function (e) { return e.ty === 'kd'; });
      if (kd.length) { s.k = kd[0].k; s.c = kd[0].c; s.kc = kd[0].kc; if (kd.length > 1) s.n = kd.length; }
      if (evts.some(function (e) { return e.ty === 'ku'; })) s.up = 1;
      var cl = evts.filter(function (e) { return e.ty === 'click'; });
      if (cl.length) s.click = cl[0].tg;
      if (evts.some(function (e) { return e.ty === 'pop'; })) s.pop = 1;
      if (evts.some(function (e) { return e.ty === 'wheel'; })) s.wheel = 1;
      if (padHits.b.length) s.gb = padHits.b;
      if (padHits.a.length) s.ga = padHits.a;
      return s;
    }

    return new Promise(function (resolve) {
      var idx = 0;
      function next() {
        while (idx < KEY_STEPS.length && results[KEY_STEPS[idx][0]]) idx++;
        if (idx >= KEY_STEPS.length) return finish();
        var st = KEY_STEPS[idx];
        promptEl.innerHTML = 'Press <span style="color:var(--accent)"></span><small></small>';
        promptEl.querySelector('span').textContent = st[1];
        promptEl.querySelector('small').textContent = (idx + 1) + ' / ' + KEY_STEPS.length + (st[2] ? ' · ' + st[2] : ' · no press within 10 s = skipped');
        events = [];
        var base = padSnapshot(), hits = { b: [], a: [] }, firstAt = 0, t0 = now();
        var iv = setInterval(function () {
          var cur = padSnapshot();
          if (cur.id) { padSeen.id = cur.id; padSeen.map = cur.map; }
          for (var b = 0; b < cur.b.length; b++) if (cur.b[b] && !base.b[b] && hits.b.indexOf(b) < 0) hits.b.push(b);
          for (var a = 0; a < cur.a.length; a++) {
            if (Math.abs(cur.a[a] - (base.a[a] || 0)) > 0.5 && !hits.a.some(function (h) { return h[0] === a; })) hits.a.push([a, cur.a[a]]);
          }
          if (!firstAt && (events.length || hits.b.length || hits.a.length)) firstAt = now();
          var elapsed = now() - t0;
          if ((firstAt && now() - firstAt > 700) || elapsed > 10000) {
            clearInterval(iv);
            var s = summarize(events, base, hits);
            if (!firstAt) s.none = 1;
            results[st[0]] = s;
            persistKeys();
            idx++;
            setTimeout(next, 500);
          }
        }, 30);
      }
      function finish() {
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('keyup', onKey, true);
        window.removeEventListener('click', onClick, true);
        window.removeEventListener('wheel', onWheel);
        R.keys = results; R.pad = padSeen;
        resolve();
      }
      next();
    });
  }

  // Needs a user activation, so it waits for the user to press Cross on a focused button.
  function fullscreenTest() {
    var promptEl = document.getElementById('prompt'), btns = document.getElementById('fsButtons');
    promptEl.innerHTML = 'Press <span style="color:var(--accent)">Cross ✕</span> on the button below<small>Tests fullscreen, sound and keep-screen-awake. Move the cursor with the left stick if needed.</small>';
    btns.classList.remove('hidden');
    var fsBtn = document.getElementById('fsBtn'), skip = document.getElementById('skipBtn');
    try { fsBtn.focus(); } catch (e) {}
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () { finish({ skipped: 'timeout' }); }, 30000);
      function finish(fs) {
        if (done) return; done = true; clearTimeout(timer);
        R.fs = fs; btns.classList.add('hidden'); resolve();
      }
      function onKey(e) { if (e.key === 'Enter' || e.keyCode === 13 || e.key === ' ') { e.preventDefault(); run('key:' + e.key); } }
      document.addEventListener('keydown', onKey, true);
      skip.addEventListener('click', function () { document.removeEventListener('keydown', onKey, true); finish({ skipped: 'user' }); });
      fsBtn.addEventListener('click', function () { run('click'); });
      var ran = false;
      async function run(via) {
        if (ran) return; ran = true;
        document.removeEventListener('keydown', onKey, true);
        var fs = { via: via };
        var v = newVideo(false); v.src = STREAMS.vod1080;
        try { await withTimeout(v.play(), 8000); fs.sound = 'ok'; } catch (e) { fs.sound = errStr(e); }
        var el = document.documentElement;
        try {
          if (el.requestFullscreen) { await withTimeout(Promise.resolve(el.requestFullscreen()), 4000); fs.doc = 'ok'; }
          else if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); await sleep(800); fs.doc = (document.webkitFullscreenElement ? 'ok' : 'noeffect') + ':webkit'; }
          else fs.doc = 'na';
        } catch (e) { fs.doc = errStr(e); }
        await sleep(1500);
        fs.fsEl = (document.fullscreenElement || document.webkitFullscreenElement) ? 1 : 0;
        fs.dims = innerWidth + 'x' + innerHeight;
        try {
          if (document.exitFullscreen && document.fullscreenElement) await document.exitFullscreen();
          else if (document.webkitExitFullscreen && document.webkitFullscreenElement) document.webkitExitFullscreen();
        } catch (e) {}
        try {
          if (navigator.wakeLock) { var wl = await withTimeout(navigator.wakeLock.request('screen'), 4000); fs.wake = 'ok'; wl.release(); }
          else fs.wake = 'na';
        } catch (e) { fs.wake = errStr(e); }
        try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {}
        stage.innerHTML = '';
        finish(fs);
      }
    });
  }

  // ---------- results → QR ----------
  function b64url(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function encodeResults() {
    var json = JSON.stringify(R);
    if (window.CompressionStream) {
      try {
        var cs = new CompressionStream('deflate-raw');
        var w = cs.writable.getWriter(); w.write(new TextEncoder().encode(json)); w.close();
        var buf = new Uint8Array(await new Response(cs.readable).arrayBuffer());
        return 'PS5P1Z:' + b64url(buf);
      } catch (e) {}
    }
    return 'PS5P1J:' + json;
  }
  function drawQR(text) {
    var q = qrcode(0, 'L');
    q.addData(text, 'Byte');
    q.make();
    var n = q.getModuleCount();
    var size = Math.min(760, innerHeight - 260);
    var cell = Math.max(2, Math.floor(size / (n + 8)));
    var c = document.createElement('canvas');
    c.width = c.height = cell * (n + 8);
    var g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000';
    for (var r = 0; r < n; r++) for (var col = 0; col < n; col++) if (q.isDark(r, col)) g.fillRect((col + 4) * cell, (r + 4) * cell, cell, cell);
    var box = document.getElementById('qr'); box.innerHTML = ''; box.appendChild(c);
    return n;
  }
  async function showResults() {
    document.getElementById('keysPanel').classList.add('hidden');
    document.getElementById('stagePanel').classList.add('hidden');
    document.getElementById('qrPanel').classList.remove('hidden');
    var text = await encodeResults();
    var CHUNK = 1100;
    var parts = [];
    if (text.length <= CHUNK + 300) parts.push(text);
    else for (var i = 0, n = Math.ceil(text.length / CHUNK); i < n; i++) parts.push('[' + (i + 1) + '/' + n + ']' + text.slice(i * CHUNK, (i + 1) * CHUNK));
    var info = document.getElementById('qrinfo');
    var cur = 0;
    function show() {
      drawQR(parts[cur]);
      info.textContent = (parts.length > 1 ? 'Code ' + (cur + 1) + ' of ' + parts.length + ' (press R1 / → for next) · ' : '') +
        'Scan with the phone camera, copy the text, paste it to Claude.' + (R.visit === 1 ? ' Then fully restart the PS5 and open this link again.' : '');
    }
    document.addEventListener('keydown', function (e) {
      if (parts.length < 2) return;
      if (e.key === 'ArrowRight' || e.code === 'GamepadRightShoulder') cur = (cur + 1) % parts.length;
      else if (e.key === 'ArrowLeft') cur = (cur + parts.length - 1) % parts.length;
      else return;
      show();
    });
    if (parts.length > 1) setInterval(function () { cur = (cur + 1) % parts.length; show(); }, 12000);
    show();
    window.PS5PROBE_RESULT = text; // read by the automated tests
    document.body.setAttribute('data-done', '1');
  }

  // ---------- main ----------
  async function main() {
    await step('Storage persistence', persistence);
    await step('Screen and features', environment);
    await step('Codecs (MSE + native)', codecs);
    await step('Network, CORS, mixed content', network);
    await step('Autoplay with sound (no press)', autoplayUnmuted);
    await step('Native HLS <video> 1080p', function () { return playTest('nativeHls', nativeAttach(STREAMS.vod1080), 8000, 15000); });
    await step('hls.js VOD 1080p', function () { return playTest('hlsjsVod', hlsAttach(STREAMS.vod1080, { forceTop: true }), 12000, 20000); });
    await step('hls.js live 720p25', function () { return playTest('hlsjsLive', hlsAttach(STREAMS.live), 15000, 25000); });
    await step('mpegts.js raw .ts', function () { return playTest('mpegts', mpegtsAttach(STREAMS.ts), 8000, 20000); });
    await step('hls.js HEVC', function () {
      if (!R.mse.hevc) { (R.play = R.play || {}).hevc = { skip: 'no-mse-hevc' }; return { state: 'warn', detail: 'skipped: HEVC not in MSE' }; }
      return playTest('hevc', hlsAttach(STREAMS.hevc, { forceTop: true }), 8000, 20000);
    });
    await step('Native HLS over http://', function () { return playTest('mixNative', nativeAttach(STREAMS.httpHls), 3000, 10000); });
    await step('hls.js over http://', function () { return playTest('mixHlsjs', hlsAttach(STREAMS.httpHls), 3000, 10000); });
    await step('Large playlist + storage + crypto', perf);
    document.getElementById('intro').textContent = 'Automatic tests done. Now follow the prompts on the right.';
    await controllerTest();
    await fullscreenTest();
    await showResults();
  }

  main().catch(function (e) { document.getElementById('err').textContent += 'Fatal: ' + errStr(e); showResults(); });
})();
