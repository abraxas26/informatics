/* 생기부 기반 대입 면접 준비 — 정적 웹앱 */
'use strict';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const ASSET_VER = '20260911n';   // 배포마다 올려 브라우저 캐시를 갱신한다
const OFFICIAL = '__official__';
const ADMISSION = '__admission__';   // 학과 필터와 섞이지 않는 특수 키

/** 업로드한 파일에 섞인 제어문자 제거 (탭·줄바꿈은 유지) */
function stripCtrl(s) {
  let out = '';
  for (const ch of String(s)) {
    const c = ch.charCodeAt(0);
    if (c > 31 || c === 9 || c === 10 || c === 13) out += ch;
  }
  return out;
}

const state = {
  index: null,        // data/index.json
  common: null,       // data/common.json
  qindex: null,       // data/qindex.json (지연 로딩)
  univCache: new Map(),
  currentSlug: null,
  filterDept: null,
};

/* ────────── 데이터 로딩 ──────────
   file:// 로 직접 열어도 동작하도록 fetch 대신 <script> 로 데이터를 읽는다.
   (data/*.js 는 전역 IV 에 값을 담는 스크립트) */
const pending = new Map();
function loadDataScript(src, pick) {
  const got = pick();
  if (got !== undefined && got !== null) return Promise.resolve(got);
  if (pending.has(src)) return pending.get(src);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src + (src.includes('?') ? '&' : '?') + 'v=' + ASSET_VER;
    s.onload = () => {
      const v = pick();
      if (v === undefined || v === null) reject(new Error(src + ' 안에 데이터가 없습니다.'));
      else resolve(v);
    };
    s.onerror = () => reject(new Error(src + ' 를 불러오지 못했습니다.'));
    document.head.appendChild(s);
  });
  pending.set(src, p);
  return p;
}
async function loadUniv(slug) {
  if (state.univCache.has(slug)) return state.univCache.get(slug);
  const d = await loadDataScript('data/univ/' + slug + '.js',
    () => (window.IV && window.IV.univ ? window.IV.univ[slug] : null));
  state.univCache.set(slug, d);
  return d;
}
async function loadQIndex() {
  if (!state.qindex) {
    state.qindex = await loadDataScript('data/qindex.js',
      () => (window.IV ? window.IV.qindex : null));
  }
  return state.qindex;
}
function highlight(text, terms) {
  let out = esc(text);
  terms.filter(Boolean).forEach((t) => {
    const re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    out = out.replace(re, '<mark>$1</mark>');
  });
  return out;
}

/* ────────── 탭 ────────── */
function showView(name) {
  $$('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === name)));
  ['reviews', 'common', 'jesimun', 'analyze'].forEach((v) => { $('#view-' + v).hidden = (v !== name); });
  if (name === 'jesimun') initJesimun();
  if (name !== 'reviews') clearReturn();
  if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$$('.tab').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

/* 테마 토글 */
$('#themeBtn').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  const dark = cur ? cur === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('iv_theme', next); } catch (e) { /* 무시 */ }
});
try {
  const t = localStorage.getItem('iv_theme');
  if (t) document.documentElement.setAttribute('data-theme', t);
} catch (e) { /* 무시 */ }

/* ══════════ 1. 대학·학과별 면접 후기 ══════════ */

function renderStats() {
  const t = state.index.totals;
  $('#stats').innerHTML = [
    ['대학', t.universities], ['면접 후기', t.reviews],
    ['실제 문항', t.questions + t.official],
  ].map(([k, v]) => `<div class="stat"><b>${v.toLocaleString()}</b><span>${k}</span></div>`).join('');
}

function renderUnivSelect() {
  const us = state.index.universities;
  const withReview = us.filter((u) => u.reviews > 0);
  const onlyOfficial = us.filter((u) => u.reviews === 0);
  const opt = (u) => `<option value="${u.slug}">${esc(u.name)} — 후기 ${u.reviews} · 문항 ${u.questions + u.official}</option>`;
  $('#univSelect').innerHTML =
    '<option value="">— 목록에서 선택 —</option>' +
    `<optgroup label="면접 후기 있는 대학 (${withReview.length})">${withReview.map(opt).join('')}</optgroup>` +
    (onlyOfficial.length
      ? `<optgroup label="대학 공개 예시문항만 (${onlyOfficial.length})">${onlyOfficial.map(opt).join('')}</optgroup>`
      : '');
}

function renderUnivList(filter) {
  const q = (filter || '').trim();
  let list = state.index.universities.filter((u) =>
    !q || u.name.includes(q) || u.depts.some((d) => d.includes(q)));
  if (q) {
    // '서울대' 로 찾을 때 남서울대가 먼저 나오지 않도록, 이름이 검색어로 시작하는 대학을 위로
    const rank = (u) => (u.name.startsWith(q) ? 0 : u.name.includes(q) ? 1 : 2);
    list = list.slice().sort((a, b) => rank(a) - rank(b) || b.reviews - a.reviews);
  }
  const box = $('#univList');
  if (!list.length) { box.innerHTML = '<div class="empty">검색 결과가 없습니다.</div>'; return; }
  box.innerHTML = list.map((u) => `
    <button class="uitem" data-slug="${u.slug}" ${u.slug === state.currentSlug ? 'aria-current="true"' : ''}>
      <span>${esc(u.name)}</span>
      <small>후기 ${u.reviews} · 문항 ${u.questions + u.official}</small>
    </button>`).join('');
  $$('.uitem', box).forEach((b) =>
    b.addEventListener('click', () => {
      clearReturn();
      selectUniv(b.dataset.slug, { scroll: true });
    }));
}

function reviewCard(r, terms, ri) {
  const badges = [];
  if (r.result) badges.push(`<span class="badge ${r.result === '불합격' ? 'r' : 'g'}">${esc(r.result)}</span>`);
  if (r.naesin) badges.push(`<span class="badge n">내신 ${esc(r.naesin)}</span>`);
  if (r.suneung) badges.push(`<span class="badge n">${esc(r.suneung)}</span>`);
  if (r.resultNote) badges.push(`<span class="badge n">${esc(r.resultNote)}</span>`);

  const kv = [];
  if (r.method) kv.push(`<div class="kv"><b>면접 방식</b>${esc(r.method)}</div>`);
  if (r.type)   kv.push(`<div class="kv"><b>전형 방법</b>${esc(r.type)}</div>`);
  if (r.notes)  kv.push(`<div class="kv"><b>유의사항 · 분위기</b>${esc(r.notes)}</div>`);

  return `<article class="rcard" data-ri="${ri}">
    <div class="rhead">
      <h4>${esc(r.dept || '학과 미기재')}</h4>
      <div class="meta">
        <span class="badge">${esc(r.jeonhyeong || '전형 미기재')}</span>
        ${badges.join('')}
        <span>· ${r.qa.length ? '문항 ' + r.qa.length + '개' : '문항 기록 없음 (면접 방식만 수록)'}</span>
        <span>· ${esc(r.src)}</span>
      </div>
    </div>
    ${kv.join('')}
    <div class="qa">${r.qa.map((qa, i) => `
      <details ${i < 3 ? 'open' : ''}>
        <summary><span>${highlight(qa.q, terms)}</span></summary>
        <div class="ans">${highlight(qa.a, terms)}</div>
      </details>`).join('')}
    </div>
  </article>`;
}

async function selectUniv(slug, opts) {
  state.currentSlug = slug;
  state.filterDept = (opts && opts.dept) || null;
  const terms = (opts && opts.terms) || [];
  $$('.uitem').forEach((b) => b.setAttribute('aria-current', String(b.dataset.slug === slug)));
  if ($('#univSelect').value !== slug) $('#univSelect').value = slug;
  revealInList($('#univList .uitem[aria-current="true"]'));

  const box = $('#univDetail');
  box.innerHTML = '<div class="pad"><div class="progress"><i></i></div></div>';
  let d;
  try { d = await loadUniv(slug); }
  catch (e) { box.innerHTML = `<div class="pad"><div class="err">${esc(e.message)}</div></div>`; return; }

  const depts = Array.from(new Set(d.reviews.map((r) => r.dept).filter(Boolean))).sort();
  const adm = d.admission || [];
  const admMode = state.filterDept === ADMISSION;
  const officialMode = !admMode
    && (state.filterDept === OFFICIAL || (!d.reviews.length && d.official.length));
  const shown = (state.filterDept && state.filterDept !== OFFICIAL && state.filterDept !== ADMISSION)
    ? d.reviews.filter((r) => r.dept === state.filterDept) : d.reviews;

  const chip = (val, label, on) =>
    `<button class="chip" data-dept="${esc(val)}" ${on ? 'aria-pressed="true"' : ''}>${label}</button>`;
  const chips = `<div class="chips" style="margin:12px 0 4px">
      ${d.reviews.length ? chip('', '전체 후기 ' + d.reviews.length, !officialMode && !state.filterDept) : ''}
      ${adm.length ? chip(ADMISSION,
        '<b>2027학년도 면접 전형</b> ' + adm.length, admMode) : ''}
      ${d.official.length ? chip(OFFICIAL,
        '<b>대학이 공개한 면접 예시 문항</b> ' + d.official.length, officialMode) : ''}
      ${(officialMode || admMode) ? '' : depts.map((x) => chip(x, esc(x), state.filterDept === x)).join('')}
    </div>`;

  box.innerHTML = `
    <div class="pad" style="padding-bottom:0">
      <h2 style="margin:0;font-size:20px;letter-spacing:-.03em">${esc(d.univ)}</h2>
      <p class="hint" style="margin-top:4px">면접 후기 ${d.reviews.length}건 · 실제 문항 ${d.reviews.reduce((a, r) => a + r.qa.length, 0)}개${d.official.length ? ' · 대학 공개 예시문항 ' + d.official.length + '개' : ''}${adm.length ? ' · 2027 전형 ' + adm.length + '개' : ''}</p>
      ${chips}
    </div>
    <div class="pad">${admMode ? admissionPanel(adm)
      : officialMode ? officialPanel(d.official, terms)
      : (shown.length ? shown.map((r) => reviewCard(r, terms, d.reviews.indexOf(r))).join('')
                      : '<div class="empty">수집된 후기가 없습니다.</div>')}</div>`;

  $$('.chip[data-dept]', box).forEach((c) => c.addEventListener('click', () => {
    selectUniv(slug, { dept: c.dataset.dept || null, terms });
  }));

  if (opts && opts.focus) revealQuestion(box, opts.focus);
  else if (opts && opts.scroll) scrollToEl(box, false);
}

/** 목록 안에서만 스크롤한다 — scrollIntoView 는 페이지까지 끌고 올라가 버린다 */
function revealInList(el) {
  if (!el) return;
  const box = el.closest('.ulist');
  if (!box) return;
  const top = el.offsetTop - box.offsetTop;
  if (top < box.scrollTop || top + el.offsetHeight > box.scrollTop + box.clientHeight) {
    box.scrollTop = top - Math.max(0, (box.clientHeight - el.offsetHeight) / 2);
  }
}

/** 부드러운 스크롤이 막힌 환경에서도 반드시 이동하도록 보정한다 */
function scrollToY(y) {
  const start = window.scrollY;
  const top = Math.max(0, Math.round(y));
  window.scrollTo({ top, behavior: 'smooth' });
  setTimeout(() => {
    if (Math.abs(window.scrollY - start) < 4 && Math.abs(top - start) > 8) {
      window.scrollTo(0, top);
    }
  }, 420);
}
function scrollToEl(el, center) {
  const r = el.getBoundingClientRect();
  const y = r.top + window.scrollY - (center
    ? Math.max(20, (window.innerHeight - r.height) / 2)
    : 90);
  scrollToY(y);
}

/* ── 검색 결과로 돌아가기 ──────────────────────
   문항으로 뛰기 전 스크롤 위치를 기억해 두었다가 되돌려 준다. */
const backBtn = $('#backToSearch');

function markReturn(y, fromEl) {
  state.returnY = y;
  state.returnEl = fromEl || null;
  backBtn.hidden = false;
}
function clearReturn() {
  state.returnY = null;
  state.returnEl = null;
  backBtn.hidden = true;
}
backBtn.addEventListener('click', () => {
  const el = state.returnEl;
  const y = state.returnY;
  clearReturn();
  if (el && document.body.contains(el)) {
    scrollToEl(el, true);
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 5100);
  } else if (y != null) {
    scrollToY(y);
  }
});

/** 검색 결과에서 고른 문항을 펼쳐서 화면 가운데로 가져오고 잠깐 강조한다 */
function revealQuestion(box, focus) {
  const key = (t) => String(t).replace(/\s+/g, '');
  const want = key(focus.q).slice(0, 24);
  let target = null;

  if (focus.ri >= 0) {
    const card = box.querySelector('.rcard[data-ri="' + focus.ri + '"]');
    if (card) {
      target = Array.from(card.querySelectorAll('details'))
        .find((d) => key(d.querySelector('summary').textContent).includes(want)) || card;
      if (target.tagName === 'DETAILS') target.open = true;
    }
  } else {
    target = Array.from(box.querySelectorAll('.ccard ol li'))
      .find((li) => key(li.textContent).includes(want));
  }
  if (!target) return;
  scrollToEl(target, true);
  target.classList.add('flash');
  setTimeout(() => target.classList.remove('flash'), 5100);
}

/* 2027학년도 면접 전형 — 선발 방법 · 면접 방식 · 일정 · 평가 영역 */
function admissionPanel(list) {
  const row = (k, v) => (v ? `<div class="kv"><b>${k}</b>${esc(v)}</div>` : '');
  return `
    <p class="hint" style="margin:0 0 14px">
      <b style="color:var(--ink)">2027학년도 기준</b>입니다. 지금 고2가 치를 입시의 전형 방법·면접 방식·일정입니다.
      실제 문항은 위의 <b>대학이 공개한 면접 예시 문항</b>에서 볼 수 있습니다.
    </p>
    ${list.map((a) => `
      <article class="rcard">
        <div class="rhead"><h4>${esc(a.jeonhyeong)}</h4>
          <div class="meta">
            ${a.type ? `<span class="badge">${esc(a.type)}</span>` : ''}
            ${a.schedule ? `<span class="badge g">${esc(a.schedule.slice(0, 40))}</span>` : ''}
          </div>
        </div>
        ${row('선발 방법', a.select)}
        ${row('면접 방법', a.method)}
        ${row('면접 일정', a.schedule)}
        ${row('유의사항', a.notes)}
        ${(a.areas || []).length ? `<div class="kv"><b>평가 영역</b>${
          a.areas.map((x) => esc(x.area) + ' (' + x.questions.length + '문항)').join(' · ')}</div>` : ''}
      </article>`).join('')}
    <p class="hint">출처 · 세종특별자치시교육청 「2027학년도 대입 수시모집 면접 전형 자료집」</p>`;
}

/* 대학이 공개한 면접 예시 문항 — 평가영역/학과별로 묶어 보여준다 */
function officialPanel(list, terms) {
  const groups = new Map();
  list.forEach((o) => {
    const k = (o.category || '').trim() || '구분 없음';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(o);
  });
  const srcs = Array.from(new Set(list.map((o) => o.src).filter(Boolean)));
  return `
    <p class="hint" style="margin:0 0 14px">
      각 대학이 선행학습영향평가 결과보고서·교육청 면접자료집을 통해 공개한 예시 문항입니다.
      실제 응시생 후기와 달리 <b>대학이 직접 밝힌 출제 방향</b>이므로 먼저 확인할 가치가 있습니다.
    </p>
    ${Array.from(groups.entries()).map(([k, items]) => `
      <section class="ccard" style="margin-bottom:12px">
        <header><h3 style="font-size:15px">${esc(k)}</h3>
          <span class="badge n">${items.length}문항</span>
          ${items[0].jeonhyeong ? `<span class="badge">${esc(items[0].jeonhyeong)}</span>` : ''}</header>
        <ol style="margin:0;padding:14px 17px 16px 34px;font-size:13.8px;color:var(--ink-2)">
          ${items.map((o) => `<li style="margin-bottom:9px">${highlight(o.q, terms)}</li>`).join('')}
        </ol>
      </section>`).join('')}
    ${srcs.length ? `<p class="hint">출처 · ${srcs.map(esc).join(' / ')}</p>` : ''}`;
}

async function runQuestionSearch() {
  const raw = $('#qSearch').value.trim();
  const out = $('#qSearchResult');
  if (raw.length < 2) { out.innerHTML = '<div class="hint">두 글자 이상 입력하세요.</div>'; return; }
  out.innerHTML = '<div class="progress"><i></i></div>';

  let rows;
  try { rows = await loadQIndex(); }
  catch (e) { out.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }

  const terms = raw.split(/\s+/).filter((t) => t.length >= 1);
  const nameBySlug = {};
  state.index.universities.forEach((u) => { nameBySlug[u.slug] = u.name; });

  const hits = rows.filter(([slug, ri, dept, q]) =>
    terms.every((t) => q.includes(t) || (dept || '').includes(t) || (nameBySlug[slug] || '').includes(t)));

  if (!hits.length) { out.innerHTML = '<div class="hint">일치하는 문항이 없습니다.</div>'; return; }

  const byUniv = new Map();
  hits.forEach((h) => {
    if (!byUniv.has(h[0])) byUniv.set(h[0], []);
    byUniv.get(h[0]).push(h);
  });
  const groups = Array.from(byUniv.entries()).sort((a, b) => b[1].length - a[1].length);

  out.innerHTML = `
    <div class="srow">
      <div class="hint" style="margin:0"><b style="color:var(--ink)">${hits.length.toLocaleString()}개</b> 문항 · ${groups.length}개 대학에서 발견</div>
      <button class="btn sub sm" id="qClear">검색 결과 닫기 ✕</button>
    </div>
    ${groups.slice(0, 25).map(([slug, list]) => `
      <div style="border-top:1px solid var(--line-2);padding:10px 0">
        <button class="btn ghost" style="padding:2px 0;font-size:13.5px" data-goto="${slug}">${esc(nameBySlug[slug] || slug)} · ${list.length}개 →</button>
        <ul class="qhits">
          ${list.slice(0, 4).map(([, ri, dept, q]) => `<li>
            <button class="qjump" data-goto="${slug}" data-ri="${ri}" data-q="${esc(q)}">
              <span>${highlight(q, terms)}</span>
              <small>${dept ? esc(dept) : '대학 공개 예시문항'} · 이 문항 보기 →</small>
            </button></li>`).join('')}
        </ul>
      </div>`).join('')}
    ${groups.length > 25 ? `<div class="hint">…외 ${groups.length - 25}개 대학</div>` : ''}`;

  const clearBtn = $('#qClear', out);
  if (clearBtn) clearBtn.addEventListener('click', () => {
    out.innerHTML = '';
    $('#qSearch').value = '';
    clearReturn();
    $('#qSearch').focus();
  });

  $$('.qjump', out).forEach((b) => b.addEventListener('click', (ev) => {
    ev.stopPropagation();
    markReturn(window.scrollY, b);
    const ri = Number(b.dataset.ri);
    selectUniv(b.dataset.goto, {
      terms,
      dept: ri < 0 ? OFFICIAL : null,
      focus: { ri, q: b.dataset.q },
    });
  }));

  $$('button[data-goto]:not(.qjump)', out).forEach((b) => b.addEventListener('click', () => {
    selectUniv(b.dataset.goto, { terms });
    scrollToEl($('#univDetail'), false);
  }));
}
$('#qSearchBtn').addEventListener('click', runQuestionSearch);
$('#qSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter') runQuestionSearch(); });
$('#univFilter').addEventListener('input', (e) => renderUnivList(e.target.value));
$('#univSelect').addEventListener('change', (e) => {
  const slug = e.target.value;
  if (!slug) return;
  clearReturn();
  const jump = true;
  const u = state.index.universities.find((x) => x.slug === slug);
  // 선택한 대학이 목록에 보이도록 검색어를 비운다
  if (u && $('#univFilter').value.trim() && !u.name.includes($('#univFilter').value.trim())) {
    $('#univFilter').value = '';
    renderUnivList('');
  }
  selectUniv(slug);
});

/* ══════════ 2. 공통 면접 문항 ══════════ */

function renderCommon(activeId) {
  const cats = state.common.categories;
  $('#commonChips').innerHTML =
    `<button class="chip" data-cid="" ${!activeId ? 'aria-pressed="true"' : ''}>전체</button>` +
    cats.map((c) => `<button class="chip${c.star ? ' starred' : ''}" data-cid="${c.id}" ${activeId === c.id ? 'aria-pressed="true"' : ''}>${
      c.star ? '<span class="star" aria-label="중요">★</span>' : ''}${esc(c.title)}</button>`).join('');
  $$('#commonChips .chip').forEach((b) =>
    b.addEventListener('click', () => renderCommon(b.dataset.cid || null)));

  const list = activeId ? cats.filter((c) => c.id === activeId) : cats;
  $('#commonList').innerHTML = list.map((c) => `
    <section class="ccard${c.star ? ' starred' : ''}">
      <header>
        <h3>${c.star ? '<span class="star" aria-label="중요">★</span>' : ''}${esc(c.title)}</h3>
        <span class="badge">실제 기출의 ${c.share}%</span>
        <span class="badge n">${c.count.toLocaleString()}개 문항에서 확인</span>
        ${c.star ? '<span class="badge w">가장 많이 묻는 구간</span>' : ''}
      </header>
      <p class="why">${esc(c.why)}</p>
      ${c.mustCheck ? `<p class="must"><b>★ 이것부터 검토하세요</b>${esc(c.mustCheck)}</p>` : ''}
      <div class="cols">
        <div>
          <h5>평가 포인트 · 준비 방법</h5>
          <ul>${c.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
        </div>
        <div>
          <h5>답변 뼈대</h5>
          <p class="frame">${esc(c.frame)}</p>
          <p class="caution">주의 · ${esc(c.caution)}</p>
        </div>
      </div>
      <div class="exlist">
        <h5 style="margin:0 0 8px;font-size:12.5px;color:var(--ink-3)">실제 기출 예시</h5>
        <ul>${c.examples.slice(0, 10).map((e) => `
          <li>${esc(e.q)}<small>${esc(e.univ)}${e.dept ? ' · ' + esc(e.dept) : ''}</small></li>`).join('')}</ul>
      </div>
    </section>`).join('');
}

/* ── 학과로 찾기 ─────────────────────────────
   지원 학과와 이름이 비슷한 학과를 모아, 그 학과에서 실제로 나온 문항을 유형별로 묶어 준다 */
const deptFind = { term: '', picked: null };

function catOf(q) {
  for (const c of state.common.categories) {
    if (c.pat && new RegExp(c.pat).test(q)) return c;
  }
  return null;
}

async function runDeptSearch(term) {
  const raw = (term !== undefined ? term : $('#deptSearch').value).trim();
  const out = $('#deptResult');
  if (raw.length < 2) {
    $('#deptSuggest').innerHTML = '';
    out.innerHTML = '<div class="hint">두 글자 이상 입력하세요. (예: 컴퓨터, 간호, 사범)</div>';
    return;
  }
  deptFind.term = raw;
  out.innerHTML = '<div class="progress"><i></i></div>';

  let rows;
  try { rows = await loadQIndex(); }
  catch (e) { out.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }

  const nameBySlug = {};
  state.index.universities.forEach((u) => { nameBySlug[u.slug] = u.name; });
  const key = raw.replace(/\s+/g, '');

  // 1) 이름에 검색어가 들어간 학과 모으기
  const byDept = new Map();
  rows.forEach((r) => {
    const dept = r[2];
    if (!dept || !dept.replace(/\s+/g, '').includes(key)) return;
    if (!byDept.has(dept)) byDept.set(dept, []);
    byDept.get(dept).push(r);
  });
  if (!byDept.size) {
    $('#deptSuggest').innerHTML = '';
    out.innerHTML = `<div class="hint">‘${esc(raw)}’ 가 들어간 학과를 찾지 못했습니다. 더 짧은 말로 바꿔 보세요.</div>`;
    return;
  }

  const depts = Array.from(byDept.entries()).sort((a, b) => b[1].length - a[1].length);
  if (deptFind.picked && !byDept.has(deptFind.picked)) deptFind.picked = null;

  $('#deptSuggest').innerHTML =
    `<button class="chip" data-dp="" ${!deptFind.picked ? 'aria-pressed="true"' : ''}>관련 학과 전체 ${depts.length}개</button>` +
    depts.slice(0, 40).map(([d, list]) =>
      `<button class="chip" data-dp="${esc(d)}" ${deptFind.picked === d ? 'aria-pressed="true"' : ''}>${esc(d)} ${list.length}</button>`).join('');
  $$('#deptSuggest .chip').forEach((c) => c.addEventListener('click', () => {
    deptFind.picked = c.dataset.dp || null;
    runDeptSearch(deptFind.term);
  }));

  // 2) 문항을 공통 유형별로 묶기
  const picked = deptFind.picked
    ? byDept.get(deptFind.picked) : depts.flatMap(([, list]) => list);
  const groups = new Map();
  const seen = new Set();
  picked.forEach((r) => {
    const q = r[3];
    const k = q.replace(/\s+/g, '').slice(0, 30);
    if (seen.has(k)) return;
    seen.add(k);
    const c = catOf(q);
    const id = c ? c.id : 'etc';
    if (!groups.has(id)) groups.set(id, { title: c ? c.title : '학과별 심화 · 기타', items: [] });
    groups.get(id).items.push({ q, univ: nameBySlug[r[0]] || '', dept: r[2] });
  });
  const order = state.common.categories.map((c) => c.id).concat('etc');
  const list = order.filter((id) => groups.has(id)).map((id) => [id, groups.get(id)]);

  out.innerHTML = `
    <div class="hint" style="margin:14px 0 10px">
      <b style="color:var(--ink)">${esc(deptFind.picked || raw + ' 관련 학과')}</b>
      에서 실제로 나온 문항 <b style="color:var(--ink)">${picked.length.toLocaleString()}개</b>
      ${deptFind.picked ? '' : ` · 학과 ${depts.length}개`}
    </div>
    ${list.map(([id, g]) => `
      <section class="ccard" style="margin-bottom:12px">
        <header><h3 style="font-size:15px">${esc(g.title)}</h3>
          <span class="badge n">${g.items.length}문항</span></header>
        <ol style="margin:0;padding:14px 17px 16px 34px;font-size:13.8px;color:var(--ink-2)">
          ${g.items.slice(0, 30).map((x) => `<li style="margin-bottom:9px">${highlight(x.q, [])}
            <small style="display:block;color:var(--ink-3);font-size:11.5px">${esc(x.univ)}${x.dept ? ' · ' + esc(x.dept) : ''}</small></li>`).join('')}
        </ol>
        ${g.items.length > 30 ? `<p class="hint" style="padding:0 17px 14px">…외 ${g.items.length - 30}개</p>` : ''}
      </section>`).join('')}`;
}
$('#deptSearchBtn').addEventListener('click', () => { deptFind.picked = null; runDeptSearch(); });
$('#deptSearch').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { deptFind.picked = null; runDeptSearch(); }
});

/* 연습 모드 */
const prac = { pool: [], timer: null, sec: 0, running: false };
function fmt(s) { return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
function pracStop() {
  clearInterval(prac.timer); prac.timer = null; prac.running = false;
  $('#pracToggle').textContent = '타이머 시작';
}
function pracReset() { pracStop(); prac.sec = 0; $('#pracTimer').textContent = '00:00'; $('#pracTimer').classList.remove('over'); }
$('#pracToggle').addEventListener('click', () => {
  if (prac.running) { pracStop(); return; }
  prac.running = true;
  $('#pracToggle').textContent = '일시정지';
  prac.timer = setInterval(() => {
    prac.sec += 1;
    const el = $('#pracTimer');
    el.textContent = fmt(prac.sec);
    el.classList.toggle('over', prac.sec > 90);
  }, 1000);
});
/* 공통 문항 연습에서도 카메라로 표정·말투를 확인할 수 있게 한다 */
$('#pracCamToggle').addEventListener('click', () => {
  const box = $('#pracCamBox');
  if (box.hidden) {
    if (!box.dataset.ready) {
      box.innerHTML = `<p class="hint" style="margin:0 0 10px">
          카메라를 켜고 답해 보면 시선 · 표정 · 말버릇까지 확인할 수 있습니다.
          <b>영상과 음성은 이 브라우저 안에만 있고 어디로도 전송되지 않습니다.</b></p>`
        + cameraBlock('pc');
      box.dataset.ready = '1';
      bindCamera('pc');
    }
    box.hidden = false;
    $('#pracCamToggle').textContent = '📹 카메라 접기';
  } else {
    cam.p = 'pc'; rhClose();
    box.hidden = true;
    $('#pracCamToggle').textContent = '📹 내 모습 보며 연습';
  }
});

$('#pracNext').addEventListener('click', () => {
  if (!prac.pool.length) {
    // 어느 학과에 지원하든 쓸 수 있는 문항만 (build_common.py 의 practice)
    prac.pool = (state.common.practice || []).slice();
    if (!prac.pool.length) {
      state.common.categories.forEach((c) =>
        c.examples.forEach((e) => prac.pool.push({ cat: c.title, q: e.q, univ: e.univ })));
    }
  }
  const p = prac.pool[Math.floor(Math.random() * prac.pool.length)];
  $('#pracCat').textContent = p.cat;
  $('#pracQ').textContent = p.q;
  $('#pracHint').textContent = p.univ + ' 기출 · 권장 답변 시간 60초';
  pracReset();
});

/* ══════════ 3. 제시문 기반 기출 ══════════ */

const jes = { data: null, mode: null, id: null };

async function loadJesimun() {
  if (!jes.data) {
    jes.data = await loadDataScript('data/jesimun.js',
      () => (window.IV ? window.IV.jesimun : null));
  }
  return jes.data;
}

function jesLabel(s) {
  return Array.from(new Set([s.jeonhyeong, s.track, s.title].filter(Boolean))).join(' · ');
}

async function initJesimun() {
  const box = $('#jDetail');
  if (jes.data) return;
  $('#jList').innerHTML = '<div class="progress"><i></i></div>';
  try { await loadJesimun(); }
  catch (e) {
    $('#jList').innerHTML = `<div class="err">${esc(e.message)}</div>`;
    box.innerHTML = '';
    return;
  }
  const sets = jes.data.sets;
  const modes = Array.from(new Set(sets.map((s) => s.mode)));
  $('#jStats').innerHTML = [
    ['대학', new Set(sets.map((s) => s.univ)).size],
    ['문제 세트', sets.length],
    ['원본 페이지', new Set(sets.flatMap((s) => s.blocks.flatMap(
      (b) => b.pages.map((p) => (s.img || 'p') + p)))).size],
  ].map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('');
  $('#jModeChips').innerHTML =
    `<button class="chip" data-mode="" aria-pressed="true">전체</button>` +
    modes.map((m) => `<button class="chip" data-mode="${esc(m)}">${esc(m)}</button>`).join('');
  $$('#jModeChips .chip').forEach((c) => c.addEventListener('click', () => {
    jes.mode = c.dataset.mode || null;
    $$('#jModeChips .chip').forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
    renderJesList();
  }));
  renderJesList();
}

function renderJesList() {
  const sets = jes.data.sets.filter((s) => !jes.mode || s.mode === jes.mode);
  const byUniv = new Map();
  sets.forEach((s) => {
    if (!byUniv.has(s.univ)) byUniv.set(s.univ, []);
    byUniv.get(s.univ).push(s);
  });

  $('#jSelect').innerHTML = '<option value="">— 목록에서 선택 —</option>' +
    Array.from(byUniv.entries()).map(([u, list]) =>
      `<optgroup label="${esc(u)} (${list.length})">${list.map((s) =>
        `<option value="${s.id}">${esc(u)} — ${esc(jesLabel(s))}</option>`).join('')}</optgroup>`).join('');
  $('#jSelect').value = jes.id || '';

  $('#jList').innerHTML = Array.from(byUniv.entries()).map(([u, list]) => `
    <div style="margin-bottom:10px">
      <div style="font-weight:700;font-size:12.5px;color:var(--ink-3);padding:4px 10px">${esc(u)}</div>
      ${list.map((s) => `<button class="uitem" data-jid="${s.id}" ${s.id === jes.id ? 'aria-current="true"' : ''}>
          <span>${esc(jesLabel(s))}</span>
          <small>${s.blocks.length}개 블록</small>
        </button>`).join('')}
    </div>`).join('');
  $$('#jList .uitem').forEach((b) =>
    b.addEventListener('click', () => showJes(b.dataset.jid)));
}

function showJes(id) {
  jes.id = id;
  const s = jes.data.sets.find((x) => x.id === id);
  if (!s) return;
  $$('#jList .uitem').forEach((b) => b.setAttribute('aria-current', String(b.dataset.jid === id)));
  if ($('#jSelect').value !== id) $('#jSelect').value = id;
  revealInList($('#jList .uitem[aria-current="true"]'));

  const pre = s.img || 'p';
  const src = (p) => `data/jesimun/${pre}${String(p).padStart(3, '0')}.${jes.data.ext}`;
  const img = (p) => `<figure class="jpage">
      <a href="${src(p)}" target="_blank" rel="noopener" title="새 창에서 크게 보기">
        <img loading="lazy" src="${src(p)}" alt="원본 ${p}쪽"></a>
      <figcaption>${p}쪽 · 눌러서 크게 보기</figcaption>
    </figure>`;

  $('#jDetail').innerHTML = `
    <div class="pad" style="padding-bottom:6px">
      <h2 style="margin:0;font-size:20px;letter-spacing:-.03em">${esc(s.univ)}</h2>
      <div class="meta" style="margin-top:6px">
        <span class="badge">${esc(s.mode)}</span>
        ${s.jeonhyeong ? `<span class="badge n">${esc(s.jeonhyeong)}</span>` : ''}
        ${s.track ? `<span class="badge n">${esc(s.track)}</span>` : ''}
        ${s.title && s.title !== s.track ? `<span>· ${esc(s.title)}</span>` : ''}
      </div>
      <p class="notice" style="margin-top:12px">${esc(jes.data.note)}</p>
    </div>
    <div class="pad">
      ${s.blocks.map((b, i) => `
        <details class="rcard jblock" ${i === 0 ? 'open' : ''} style="padding:0">
          <summary>
            ${esc(b.label)}
            <span class="badge n" style="margin-left:6px">원본 ${b.pages.join(', ') || '-'}쪽</span>
          </summary>
          <div style="padding:0 15px 14px">
            ${b.pages.length
              ? b.pages.map(img).join('')
              : '<p class="hint">이 블록에 해당하는 원본 쪽이 없습니다.</p>'}
            ${b.text ? `<details style="margin-top:10px">
                <summary style="cursor:pointer;font-weight:700;font-size:12.5px;color:var(--ink-3)">텍스트로 보기 (복사용 · 수식은 빠져 있습니다)</summary>
                <pre style="white-space:pre-wrap;font:inherit;margin:8px 0 0;color:var(--ink-2);font-size:13.4px">${esc(b.text)}</pre>
              </details>` : ''}
          </div>
        </details>`).join('')}
      <p class="hint">출처 · ${esc(s.src || (jes.data.sources || []).join(' / '))}</p>
    </div>`;
  $('#jDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('#jSelect').addEventListener('change', (e) => { if (e.target.value) showJes(e.target.value); });

/* ══════════ 4. 생기부 분석 ══════════ */

const KEY_STORE = 'iv_gemini_key', MODEL_STORE = 'iv_gemini_model';
const DEFAULT_MODEL = 'gemini-3.6-flash';
// 계정에서 쓸 수 없을 때 위에서부터 대신 고를 후보
const MODEL_FALLBACK = ['3.6-flash', '3-flash', '2.5-flash', 'flash', 'pro'];
function readStore(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function writeStore(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 무시 */ } }

function refreshKeyState() {
  const k = readStore(KEY_STORE);
  $('#keyState').innerHTML = k
    ? `저장됨 · <code>${esc(k.slice(0, 6))}…${esc(k.slice(-4))}</code> · 모델 <b>${esc(readStore(MODEL_STORE) || DEFAULT_MODEL)}</b>`
    : '아직 저장된 키가 없습니다.';
}
$('#saveKey').addEventListener('click', () => {
  const k = $('#apiKey').value.trim();
  if (!k) { alert('API 키를 입력하세요.'); return; }
  writeStore(KEY_STORE, k);
  writeStore(MODEL_STORE, $('#model').value);
  refreshKeyState();
});
$('#clearKey').addEventListener('click', () => {
  try { localStorage.removeItem(KEY_STORE); } catch (e) { /* 무시 */ }
  $('#apiKey').value = '';
  refreshKeyState();
});
$('#model').addEventListener('change', () => {
  if (readStore(KEY_STORE)) writeStore(MODEL_STORE, $('#model').value);
  refreshKeyState();
});
$('#loadModels').addEventListener('click', async () => {
  const key = $('#apiKey').value.trim() || readStore(KEY_STORE);
  if (!key) { alert('먼저 API 키를 입력하세요.'); return; }
  const btn = $('#loadModels');
  btn.disabled = true; btn.textContent = '불러오는 중…';
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(key));
    const j = await r.json();
    if (!r.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + r.status));
    const names = (j.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((n) => !/embedding|aqa|imagen|veo|tts/i.test(n))
      .sort();
    if (!names.length) throw new Error('사용 가능한 모델이 없습니다.');
    const cur = $('#model').value;
    $('#model').innerHTML = names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    let pick = names.includes(cur) ? cur : '';
    for (const want of MODEL_FALLBACK) {
      if (pick) break;
      pick = names.find((n) => n.includes(want)) || '';
    }
    $('#model').value = pick || names[0];
    refreshKeyState();
  } catch (e) {
    alert('모델 목록을 불러오지 못했습니다.\n' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '모델 목록 불러오기';
  }
});

/* ── 개인정보 자동 마스킹 ─────────────────────────
   생기부 원문에는 주민등록번호·주소·학교명 같은 식별 정보가 그대로 들어 있다.
   외부(Gemini)로 나가기 전에 브라우저 안에서 먼저 지운다. 원문은 어디로도 보내지 않는다. */

/* 호칭 앞에 오지만 사람 이름이 아닌 말들 */
const NOT_A_NAME = new Set([
  '담임', '지도', '우리', '저희', '학교', '학년', '교과', '전공', '진로', '상담', '보건',
  '국어', '수학', '영어', '과학', '사회', '체육', '음악', '미술', '정보', '역사', '윤리',
  '물리', '화학', '생명', '지구', '기술', '가정', '한문', '중국어', '일본어', '프랑스어',
  '해당', '여러', '모든', '많은', '다른', '같은', '그때', '당시', '이때',
]);

const PII_RULES = [
  /* ── 나이스 출력물 머리말 ──
     '○○고등학교/2025.10.29 13:27/211.206.***.47/황윤정' 처럼
     출력 시각·IP·출력자 이름이 쪽마다 찍혀 나온다. */
  { id: 'stamp', label: '출력 정보(IP · 출력자)',
    re: /(\d{1,3}\.\d{1,3}\.[\d*]{1,3}\.[\d*]{1,3})\s*\/\s*[가-힣]{2,4}/g,
    to: '***.***.***.***/○○○' },
  { id: 'ip', label: 'IP 주소',
    re: /\d{1,3}\.\d{1,3}\.[\d*]{1,3}\.[\d*]{1,3}/g, to: '***.***.***.***' },

  /* ── 담임성명 표 ──
     '학년 반 번호 담임성명' 아래로 '1  3  16  강유진' 처럼 이어진다. */
  { id: 'homeroom', label: '담임 성명',
    // '담임성명' 바로 뒤 표 안에서만 이름을 가린다.
    // 본문의 '12 24 36 시간을' 같은 숫자 나열까지 건드리지 않도록 범위를 묶는다.
    re: /(담임\s*성명)([\s\S]{0,200})/g,
    to: (whole, lab, rest) => {
      const masked = rest.replace(
        /(\d{1,2}\s+\d{1,2}\s+\d{1,3}\s+)([가-힣]{2,4})(?=\s|$)/g,
        (w, nums, nm) => (NOT_A_NAME.has(nm) ? w : nums + '○○○'));
      return masked === rest ? null : lab + masked;
    } },

  { id: 'rrn', label: '주민등록번호',
    re: /\b(\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01]))\s*[-–—]\s*[1-8]\d{6}\b/g,
    to: '******-*******' },
  { id: 'rrn2', label: '주민등록번호',
    re: /\b\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[1-8]\d{6}\b/g,
    to: '*************' },
  { id: 'phone', label: '휴대전화',
    re: /\b01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, to: '010-****-****' },
  { id: 'tel', label: '전화번호',
    re: /\b0\d{1,2}[-.\s]\d{3,4}[-.\s]\d{4}\b/g, to: '0**-***-****' },
  { id: 'email', label: '이메일',
    re: /[\w.+-]+@[\w-]+\.[\w.-]+/g, to: '****@****' },
  { id: 'sns', label: 'SNS 계정',
    re: /(?:^|[\s(])@[A-Za-z0-9_.]{3,}/g, to: ' @****' },

  /* ── 지역 ── 광역 지자체 + 그 아래 행정구역까지 한 번에 가린다.
     '서울대학교' 처럼 대학 이름의 일부는 건드리지 않는다. */
  { id: 'region', label: '지역명',
    re: /(서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|제주특별자치도|강원특별자치도|전북특별자치도|경기도|강원도|충청북도|충청남도|전라북도|전라남도|경상북도|경상남도)(\s*[가-힣]{1,7}(?:시|군))?(\s*[가-힣]{1,7}구)?(\s*[가-힣]{1,7}(?:읍|면))?/g,
    to: '○○' },
  { id: 'region2', label: '지역명',
    re: /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)(?=\s*(?:지역|출신|권역|권|소재|시내|시립|도립))/g,
    to: '○○' },
  { id: 'region3', label: '지역명',
    re: /[가-힣]{2,6}(?:시|군)\s*[가-힣]{2,6}(?:구|읍|면)/g, to: '○○' },
  { id: 'addr2', label: '주소',
    re: /[가-힣A-Za-z0-9]{1,12}(?:아파트|빌라|오피스텔|맨션)(?:\s*\d{1,3}\s*동)?(?:\s*\d{1,4}\s*호)?/g,
    to: '○○ (주소 삭제)' },
  { id: 'addr3', label: '주소',
    re: /\d{1,4}\s*동\s*\d{1,4}\s*호|\d{1,5}(?:-\d{1,5})?\s*번지/g, to: '○○○' },

  /* ── 학교 ── 지원 대학교 이름은 분석에 필요하므로 건드리지 않는다 */
  { id: 'school', label: '출신 학교명',
    re: /[가-힣A-Za-z]{1,10}(초등학교|중학교|고등학교|여자중학교|여자고등학교)/g, to: '○○$1' },
  { id: 'school2', label: '출신 학교명',
    re: /[가-힣]{1,8}(여고|남고|과학고|외국어고|외고|국제고|자사고|예술고|체육고|마이스터고|영재학교)(?![등])/g,
    to: '○○$1' },

  /* ── 사람 이름 ── 라벨이 붙은 것과 호칭이 따라오는 것 */
  { id: 'name', label: '성명(인적사항)',
    re: /(성\s*명|이\s*름|학생\s*명|지원자\s*명|담임\s*성명|담임|담임\s*교사|지도\s*교사|출력자)(\s*[:：]\s*|\s{2,})([가-힣]{2,5})/g,
    to: '$1$2○○○' },
  /* 호칭이 뒤에 오는 경우: '김철수 선생님', '김철수 담임선생님', '김철수 쌤' */
  { id: 'name2', label: '교사 이름',
    re: /([가-힣]{2,4})(\s*(?:담임\s*)?(?:선생님|선생|교사님|교사|쌤|샘))/g,
    to: (whole, nm, tail) => (NOT_A_NAME.has(nm) ? null : '○○○' + tail) },

  /* 호칭이 앞에 오는 경우: '담임교사 김철수', '지도교사 : 김철수' — 뒤에 조사가 붙지 않은 것만 */
  { id: 'name3', label: '교사 이름',
    // 라벨 뒤에 반드시 공백이나 콜론이 와야 한다 — '담임선생님께서' 의 '께서' 를 이름으로 잡지 않도록
    re: /(담임\s*선생님|담임\s*교사|담임\s*쌤|담임\s*샘|담임|지도\s*교사|담당\s*교사|상담\s*교사|부장\s*선생님)(\s*[:：]\s*|\s+)(?!선생|교사|쌤|샘)([가-힣]{2,4})(의|은|는|이|가|와|과|께|께서|에게|님)?(?=[\s,.)·]|$)/g,
    to: (whole, lab, sep, nm, josa) => (NOT_A_NAME.has(nm) ? null : lab + sep + '○○○' + (josa || '')) },

  /* 괄호 표기: '상담교사(임수정)' */
  { id: 'name4', label: '교사 이름',
    re: /(담임\s*선생님|담임\s*교사|담임|지도\s*교사|담당\s*교사|상담\s*교사)\s*\(\s*([가-힣]{2,4})\s*\)/g,
    to: (whole, lab, nm) => (NOT_A_NAME.has(nm) ? null : lab + '(○○○)') },

  { id: 'exam', label: '수험번호 · 학번',
    re: /(수험\s*번호|학\s*번|지원\s*번호|접수\s*번호|고유\s*번호)(\s*[:：]\s*|\s{2,})([A-Za-z0-9-]{3,})/g,
    to: '$1$2********' },
  { id: 'birth', label: '생년월일',
    re: /(생년월일|생\s*일)(\s*[:：]\s*|\s{2,})([^\n]{4,20})/g, to: '$1$2****-**-**' },
  { id: 'addr', label: '주소',
    re: /(주\s*소|거주지|본적)(\s*[:：]\s*|\s{2,})([^\n]{4,})/g, to: '$1$2○○○ (주소 삭제)' },
  { id: 'classno', label: '반 · 번호',
    re: /(\d)\s*학년\s*\d{1,2}\s*반\s*\d{1,3}\s*번/g, to: '$1학년 ○반 ○번' },
];

/** 인적·학적사항 표는 분석에 쓰이지 않으므로 통째로 덜어낸다 */
const PERSONAL_BLOCK =
  /(^|\n)[^\n]{0,10}인적\s*[·․ㆍ,]?\s*학적\s*사항[\s\S]*?(?=\n[^\n]{0,10}(?:출결\s*상황|수상\s*경력|창의적\s*체험활동)|$)/;

function maskPII(text, myName) {
  const hits = new Map();
  const bump = (label, n) => { if (n) hits.set(label, (hits.get(label) || 0) + n); };
  let out = String(text);

  const m = out.match(PERSONAL_BLOCK);
  if (m && m[0].length < 1200) {
    out = out.replace(PERSONAL_BLOCK, '$1[인적·학적사항 삭제]\n');
    bump('인적·학적사항 블록', 1);
  }

  PII_RULES.forEach((r) => {
    if (typeof r.to === 'function') {
      let n = 0;
      out = out.replace(r.re, (...args) => {
        const rep = r.to(...args);
        if (rep == null) return args[0];        // 이름이 아니라고 판단 — 그대로 둔다
        n += 1;
        return rep;
      });
      if (n) bump(r.label, n);
      return;
    }
    const found = out.match(r.re);
    if (found) { bump(r.label, found.length); out = out.replace(r.re, r.to); }
  });

  String(myName || '').split(/[,·/]|\s+/).map((x) => x.trim())
    .filter((nm) => nm.length >= 2)
    .forEach((nm) => {
      const re = new RegExp(nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const found = out.match(re);
      if (found) { bump('직접 지정한 이름', found.length); out = out.replace(re, '○○○'); }
    });
  return { text: out, hits: Array.from(hits.entries()) };
}

/** 전송 직전 최종 점검 — 마스킹 규칙보다 느슨하게 훑어 놓친 것을 잡는 2차 방어선 */
const CRITICAL_RULES = [
  { label: '주민등록번호 형태', re: /\d{6}\s*[-–—]\s*\d{7}/g },
  { label: '13자리 연속 숫자', re: /\b\d{13}\b/g },
  { label: '휴대전화 형태', re: /\b01\d[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g },
  { label: '11자리 연속 숫자', re: /\b\d{11}\b/g },
  { label: '이메일 형태', re: /[\w.+-]+@[\w-]+\.[\w.-]+/g },
];
function scanCritical(text) {
  return CRITICAL_RULES
    .map((r) => ({ label: r.label, n: (text.match(r.re) || []).length }))
    .filter((x) => x.n > 0);
}

function applyMask() {
  const before = $('#record').value;
  if (!before.trim()) { $('#maskReport').innerHTML = ''; return; }
  const { text, hits } = maskPII(before, $('#myName').value);
  $('#record').value = text;
  $('#record').dispatchEvent(new Event('input'));
  $('#maskReport').innerHTML = hits.length
    ? `<div class="masked">
         <b>🛡 개인정보 ${hits.reduce((a, h) => a + h[1], 0)}건을 가렸습니다</b>
         <span class="chips">${hits.map(([k, v]) =>
           `<span class="badge g">${esc(k)} ${v}</span>`).join('')}</span>
         <small>위 입력창의 내용이 실제로 전송되는 전부입니다. 남은 개인정보가 있으면 직접 지워 주세요.</small>
       </div>`
    : `<div class="masked ok"><b>🛡 자동 검사 완료 — 가릴 개인정보를 찾지 못했습니다</b>
         <small>패턴에 걸리지 않는 정보(친구 이름, 기관명 등)가 있을 수 있으니 눈으로도 한 번 확인해 주세요.</small></div>`;
}

/* 파일 읽기 */
$('#maskBtn').addEventListener('click', applyMask);
$('#myName').addEventListener('change', () => { if ($('#record').value.trim()) applyMask(); });
$('#record').addEventListener('input', () => {
  $('#recCount').textContent = $('#record').value.length.toLocaleString() + '자';
});
$('#recFile').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const done = (txt) => {
    $('#record').value = stripCtrl(txt).trim();
    $('#record').dispatchEvent(new Event('input'));
    applyMask();                       // 화면에 보이기 전에 먼저 가린다
  };
  if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
    $('#recCount').textContent = 'PDF 읽는 중…';
    try { done(await pdfToText(f)); }
    catch (err) { alert('PDF에서 글자를 읽지 못했습니다. 내용을 직접 붙여넣어 주세요.\n' + err.message); $('#recCount').textContent = '0자'; }
  } else {
    done(await f.text());
  }
});
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('스크립트 로드 실패'));
    document.head.appendChild(s);
  });
}
async function pdfToText(file) {
  if (!window.pdfjsLib) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const buf = await file.arrayBuffer();
  const doc = await window.pdfjsLib.getDocument({ data: buf }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    out.push(tc.items.map((it) => it.str).join(' '));
  }
  const txt = out.join('\n').trim();
  if (!txt) throw new Error('텍스트 레이어가 없는 스캔본으로 보입니다.');
  return txt;
}

/* 유사 기출 검색 (프롬프트 근거로 사용) */
async function pickReference(univName, deptName) {
  let rows;
  try { rows = await loadQIndex(); } catch (e) { return []; }
  const nameBySlug = {};
  state.index.universities.forEach((u) => { nameBySlug[u.slug] = u.name; });
  const norm = (s) => (s || '').replace(/\s/g, '');
  const u = norm(univName), d = norm(deptName);

  const scored = rows.map((r) => {
    const un = norm(nameBySlug[r[0]]), dn = norm(r[2]);
    let s = 0;
    if (u && un && (un.includes(u) || u.includes(un))) s += 3;
    if (d && dn && (dn.includes(d) || d.includes(dn))) s += 3;
    else if (d && dn && dn.slice(0, 2) === d.slice(0, 2)) s += 1;
    return { s, univ: nameBySlug[r[0]], dept: r[2], q: r[3] };
  }).filter((x) => x.s > 0);

  scored.sort((a, b) => b.s - a.s);
  const seen = new Set(), out = [];
  for (const x of scored) {
    const k = x.q.slice(0, 25);
    if (seen.has(k)) continue;
    seen.add(k); out.push(x);
    if (out.length >= 30) break;
  }
  return out;
}

function buildPrompt(rec, meta, refs, count) {
  const n = count || 12;
  const share = (r) => Math.max(1, Math.round(n * r));
  return `당신은 대한민국 대학 학생부종합전형의 면접위원이자 입학사정관입니다.
아래 학생의 학교생활기록부를 읽고, 실제 면접에서 나올 법한 질문을 설계하세요.

[지원 정보]
- 지원 대학: ${meta.univ || '미기재'}
- 지원 학과: ${meta.dept || '미기재'}
- 전형: ${meta.jh || '미기재'}

[해당 대학·학과에서 실제로 출제된 문항 (문체와 난이도의 참고용)]
${refs.length ? refs.map((r, i) => `${i + 1}. (${r.univ}${r.dept ? ' ' + r.dept : ''}) ${r.q}`).join('\n') : '(참고 문항 없음)'}

[학생부 원문]
"""
${rec.slice(0, 40000)}
"""

[작성 지침]
1. 반드시 학생부에 실제로 적힌 활동·개념·표현에 근거해 질문을 만드세요. 기록에 없는 내용을 지어내지 마세요.
2. 질문은 정확히 ${n}개만, 다음 유형을 고르게 포함하세요.
   - 지원동기/진로: ${share(0.17)}개
   - 활동 심화(동아리·자율·진로 활동): ${share(0.22)}개
   - 교과 세특 개념 확인(전공 관련 학업역량): ${share(0.28)}개
   - 공동체역량·인성: ${share(0.17)}개
   - 진로계획·학업계획: ${share(0.11)}개
   - 압박·돌발: 1개
3. 각 질문에는 면접관이 왜 묻는지(why, 한 문장), 답변에서 짚어야 할 포인트 2~3개(points, 각 한 줄),
   이어질 수 있는 꼬리질문 1개(followups)를 쓰세요. 문장을 길게 늘이지 마세요.
4. 개념 확인 질문은 학생부에 등장한 구체적 용어를 그대로 인용하세요.
5. 모든 서술은 한국어 존댓말로, 실제 면접관의 말투로 작성하세요.

[출력 형식] 아래 JSON 스키마만 출력하세요. 설명이나 마크다운 코드펜스를 붙이지 마세요.
{
  "summary": { "keywords": ["핵심 키워드 6~10개"], "positioning": "이 학생을 한 문장으로 규정한 평가" },
  "strengths": [ { "title": "강점", "evidence": "학생부의 어떤 기록에서 드러나는지" } ],
  "gaps": [ { "title": "보완이 필요한 지점", "risk": "면접에서 어떻게 공격받을 수 있는지", "fix": "무엇을 준비해야 하는지" } ],
  "questions": [ { "category": "유형", "q": "질문", "why": "출제 의도", "points": ["답변 포인트"], "followups": ["꼬리질문"] } ],
  "closing": { "lastWord": "이 학생에게 어울리는 '마지막으로 하고 싶은 말' 초안 3문장" }
}`;
}

/* 모델 과부하(429/503)는 구글 쪽 일시적 상황이라 잠깐 쉬었다 다시 부르면 대개 풀린다 */
const BUSY_RE = /high demand|overloaded|unavailable|quota|rate limit|try again later|잠시 후/i;
const isBusy = (status, msg) => status === 429 || status === 500 || status === 503
  || (status >= 500 && status < 600) || BUSY_RE.test(msg || '');

function onRetry(msg) {                      // 재시도 상황을 화면에 알린다
  const out = $('#analyzeOut');
  if (out) out.innerHTML = '<div class="progress"><i></i></div><p class="hint">' + esc(msg) + '</p>';
}

async function callGemini(key, model, prompt, attempt) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);
  let r;
  try {
    r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8,
        responseMimeType: 'application/json',
        maxOutputTokens: 32768,         // 한국어 JSON 은 토큰을 많이 먹어 넉넉히 잡는다
      },
    }),
    });
  } catch (e) {                              // 네트워크가 끊겼거나 일시적으로 실패한 경우
    const tries = attempt || 1;
    if (tries < 3) {
      onRetry(`연결이 불안정합니다. 5초 뒤 다시 시도합니다… (${tries}/2)`);
      await new Promise((res) => setTimeout(res, 5000));
      return callGemini(key, model, prompt, tries + 1);
    }
    throw new Error('네트워크 연결을 확인해 주세요.' + String.fromCharCode(10) + e.message);
  }
  const j = await r.json();
  if (!r.ok) {
    const msg = (j.error && j.error.message) || ('HTTP ' + r.status);
    const tries = attempt || 1;
    if (isBusy(r.status, msg) && tries < 4) {
      const wait = [3, 8, 15][tries - 1] || 15;
      onRetry(`모델이 혼잡합니다. ${wait}초 뒤 다시 시도합니다… (${tries}/3)`);
      await new Promise((res) => setTimeout(res, wait * 1000));
      return callGemini(key, model, prompt, tries + 1);
    }
    if (isBusy(r.status, msg)) {
      throw new Error([
        '지금 이 모델에 요청이 몰려 있습니다. (구글 서버 쪽 상황이며 API 키 문제가 아닙니다)',
        '3번까지 자동으로 다시 시도했지만 계속 거절당했습니다.',
        '',
        '· 잠시 뒤 다시 눌러 보시거나,',
        '· [모델 목록 불러오기] 에서 다른 모델(예: 2.5-flash)을 골라 보세요.',
        '',
        msg,
      ].join(String.fromCharCode(10)));
    }
    if (r.status === 404 || /not found|not supported|unsupported/i.test(msg)) {
      throw new Error([
        '‘' + model + '’ 모델을 이 API 키로 쓸 수 없습니다.',
        '위의 [모델 목록 불러오기] 를 눌러 사용 가능한 모델을 고른 뒤 다시 시도하세요.',
        '',
        msg,
      ].join(String.fromCharCode(10)));
    }
    throw new Error(msg);
  }
  const cand = (j.candidates || [])[0];
  if (!cand) throw new Error('응답이 비어 있습니다. 모델을 바꾸거나 잠시 후 다시 시도하세요.');
  const text = ((cand.content && cand.content.parts) || []).map((p) => p.text || '').join('');
  if (!text.trim()) {
    if (cand.finishReason === 'MAX_TOKENS')
      throw new Error('응답이 출력 한도에 걸렸습니다. 생기부 분량을 줄이거나 다른 모델을 선택해 보세요.');
    if (cand.finishReason === 'SAFETY')
      throw new Error('안전 필터에 걸렸습니다. 민감한 표현을 덜어내고 다시 시도해 보세요.');
    throw new Error('응답 본문이 비었습니다 (' + (cand.finishReason || '사유 불명') + ').');
  }
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const parsed = parseLooseJSON(cleaned);
  if (parsed) {
    if (cand.finishReason === 'MAX_TOKENS') parsed._truncated = true;
    parsed._usage = j.usageMetadata || null;
    return parsed;
  }
  if (cand.finishReason === 'MAX_TOKENS') {
    throw new Error([
      '응답이 출력 한도에 걸려 중간에 잘렸습니다.',
      '생기부 분량을 줄여서(세특·창체 위주로) 다시 시도하거나,',
      '[모델 목록 불러오기] 에서 더 긴 응답이 가능한 모델을 골라 보세요.',
    ].join(String.fromCharCode(10)));
  }
  throw new Error('JSON 형식으로 해석하지 못했습니다.'
    + String.fromCharCode(10, 10) + cleaned.slice(0, 500));
}

/** 잘리거나 살짝 어긋난 JSON 도 최대한 살려서 읽는다 */
const BACKSLASH = String.fromCharCode(92);

function parseLooseJSON(src) {
  const tryParse = (t) => { try { return JSON.parse(t); } catch (e) { return null; } };

  let out = tryParse(src);
  if (out) return out;

  const first = src.indexOf('{');
  const last = src.lastIndexOf('}');
  if (first >= 0 && last > first) {
    out = tryParse(src.slice(first, last + 1));
    if (out) return out;
  }
  if (first < 0) return null;

  // 잘린 경우: 값이 온전히 끝난 마지막 지점까지만 남기고 괄호를 닫아 준다
  const s = src.slice(first);
  const stack = [];
  let inStr = false, esc = false, safe = -1, safeStack = null;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === BACKSLASH) esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') { stack.pop(); safe = i; safeStack = stack.slice(); }
    else if (c === ',') { safe = i - 1; safeStack = stack.slice(); }
  }
  if (safe < 0 || !safeStack) return null;
  const closed = s.slice(0, safe + 1).replace(/,\s*$/, '') + safeStack.reverse().join('');
  return tryParse(closed);
}

/* ── 모의 면접 연습 (카메라·마이크 녹화) ───────────────
   영상과 음성은 브라우저 메모리에만 존재한다. 어디로도 업로드되지 않는다. */
const rh = { qs: [], i: 0, stream: null, rec: null, chunks: [], url: null,
             sec: 0, timer: null, running: false };

const canRecord = () => window.isSecureContext
  && navigator.mediaDevices && navigator.mediaDevices.getUserMedia
  && typeof MediaRecorder !== 'undefined';

function rhFmt(s) {
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
function rhStopTimer() {
  clearInterval(rh.timer); rh.timer = null; rh.running = false;
  const b = $('#rhTimerBtn'); if (b) b.textContent = '타이머 시작';
}

/* 녹화를 시작·정지하면 그 화면의 타이머도 함께 움직인다 */
function camTimerStart() {
  if (cam.p === 'pc') { pracReset(); $('#pracToggle').click(); return; }
  if ($('#rhTimer')) { rhResetTimer(); rhStartTimer(); }
}
function camTimerStop() {
  if (cam.p === 'pc') { pracStop(); return; }
  if ($('#rhTimer')) rhStopTimer();
}
function rhResetTimer() {
  rhStopTimer(); rh.sec = 0;
  const t = $('#rhTimer'); if (t) { t.textContent = '00:00'; t.classList.remove('over'); }
}
function rhStartTimer() {
  if (rh.running) { rhStopTimer(); return; }
  if (!$('#rhTimer')) return;
  rh.running = true; $('#rhTimerBtn').textContent = '일시정지';
  rh.timer = setInterval(() => {
    rh.sec += 1;
    const t = $('#rhTimer');
    t.textContent = rhFmt(rh.sec);
    t.classList.toggle('over', rh.sec > 90);
  }, 1000);
}

function rhShow(i) {
  if (!rh.qs.length) return;
  rh.i = (i + rh.qs.length) % rh.qs.length;
  const q = rh.qs[rh.i];
  $('#rhMeta').textContent = `문항 ${rh.i + 1} / ${rh.qs.length}` + (q.category ? ' · ' + q.category : '');
  $('#rhQ').textContent = q.q;
  const pts = (q.points || []).concat(q.followups || []);
  $('#rhPoints').innerHTML = pts.length
    ? `<summary>답변 포인트 · 꼬리질문 보기 <span class="hint" style="font-weight:400">(연습이 끝난 뒤에 펴 보세요)</span></summary>
       <ul>${pts.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`
    : '';
  rhResetTimer();
}

/* 카메라·마이크는 한 번에 하나만 쓰므로 상태는 공유하고, 화면 요소만 접두어로 구분한다 */
const cam = { p: 'rh' };
const camEl = (name) => $('#' + cam.p + name);

/** 두 탭(공통 문항 연습 · 생기부 분석)이 함께 쓰는 카메라 블록 */
function cameraBlock(p) {
  return `
    <video id="${p}Live" autoplay muted playsinline hidden></video>
    <div class="row" style="justify-content:center">
      <button class="btn sub" id="${p}Cam">📹 카메라 + 마이크</button>
      <button class="btn sub" id="${p}Mic">🎙 마이크만</button>
      <button class="btn sub" id="${p}Off">끄기</button>
    </div>
    <div class="row" style="justify-content:center;margin-top:8px">
      <button class="btn" id="${p}RecBtn" disabled>● 녹화 시작</button>
      <a class="btn sub" id="${p}Download" hidden download>⬇ 내려받기</a>
    </div>
    <div id="${p}State"></div>
    <video id="${p}Play" controls hidden></video>`;
}

function bindCamera(p) {
  if (!canRecord()) {
    $('#' + p + 'State').innerHTML = `<div class="notice">이 환경에서는 녹화를 쓸 수 없습니다.
      카메라·마이크는 보안 연결에서만 열립니다 — <b>index.html 을 파일로 여는 대신</b>
      <code>py -m http.server 8765</code> 로 실행하거나 https 주소로 접속하면 사용할 수 있습니다.
      문항 연습과 타이머는 그대로 쓸 수 있습니다.</div>`;
    ['Cam', 'Mic', 'Off'].forEach((k) => { $('#' + p + k).disabled = true; });
    return;
  }
  $('#' + p + 'Cam').addEventListener('click', () => { cam.p = p; rhOpen(true); });
  $('#' + p + 'Mic').addEventListener('click', () => { cam.p = p; rhOpen(false); });
  $('#' + p + 'Off').addEventListener('click', () => {
    cam.p = p; rhClose(); $('#' + p + 'State').innerHTML = '';
  });
  $('#' + p + 'RecBtn').addEventListener('click', () => { cam.p = p; rhToggleRecord(); });
}

async function rhOpen(video) {
  rhClose();
  try {
    rh.stream = await navigator.mediaDevices.getUserMedia(
      video ? { video: { width: 640, height: 480 }, audio: true } : { audio: true });
  } catch (e) {
    camEl('State').innerHTML = `<div class="err">장치를 열지 못했습니다. ${esc(e.message)}</div>`;
    return;
  }
  const live = camEl('Live');
  live.hidden = !video;
  if (video) { live.srcObject = rh.stream; live.play().catch(() => {}); }
  camEl('State').innerHTML = `<div class="masked ok"><b>${video ? '📹 카메라 · 마이크 준비됨' : '🎙 마이크 준비됨'}</b>
    <small>녹화물은 이 브라우저 안에만 있습니다. 저장하려면 아래 내려받기를 누르세요.</small></div>`;
  camEl('RecBtn').disabled = false;
  rh.isVideo = video;
}

function rhClose() {
  if (rh.rec && rh.rec.state !== 'inactive') { try { rh.rec.stop(); } catch (e) { /* 무시 */ } }
  if (rh.stream) rh.stream.getTracks().forEach((t) => t.stop());
  rh.stream = null; rh.rec = null;
  ['rh', 'pc'].forEach((p) => {
    const live = $('#' + p + 'Live');
    if (live) { live.srcObject = null; live.hidden = true; }
    const b = $('#' + p + 'RecBtn');
    if (b) { b.disabled = true; b.textContent = '● 녹화 시작'; b.classList.remove('rec'); }
  });
}

function rhToggleRecord() {
  if (!rh.stream) return;
  if (rh.rec && rh.rec.state === 'recording') { rh.rec.stop(); return; }

  const types = rh.isVideo
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t));
  const p = cam.p;                       // 녹화가 끝날 때까지 어느 화면인지 기억
  rh.chunks = [];
  rh.rec = new MediaRecorder(rh.stream, mimeType ? { mimeType } : undefined);
  rh.rec.ondataavailable = (e) => { if (e.data.size) rh.chunks.push(e.data); };
  rh.rec.onstop = () => {
    const blob = new Blob(rh.chunks, { type: rh.chunks[0] ? rh.chunks[0].type : 'video/webm' });
    if (rh.url) URL.revokeObjectURL(rh.url);
    rh.url = URL.createObjectURL(blob);
    const play = $('#' + p + 'Play');
    play.hidden = false; play.src = rh.url;
    const dl = $('#' + p + 'Download');
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    dl.hidden = false; dl.href = rh.url;
    dl.download = `면접연습_${new Date().toISOString().slice(0, 10)}.${ext}`;
    const b = $('#' + p + 'RecBtn');
    b.textContent = '● 녹화 시작';
    b.classList.remove('rec');
    camTimerStop();
  };
  rh.rec.start();
  camEl('RecBtn').textContent = '■ 녹화 정지';
  camEl('RecBtn').classList.add('rec');
  camTimerStart();
}

function rehearsePanel(qs) {
  if (!qs.length) return '';
  return `
  <div class="panel pad" id="rehearse" style="margin-bottom:18px">
    <h3 style="margin:0 0 4px;font-size:17px">🎥 모의 면접 연습</h3>
    <p class="hint" style="margin:0 0 14px">
      방금 만든 예상 문항으로 실제처럼 소리 내어 답해 보세요.
      카메라를 켜면 시선 · 표정 · 말버릇까지 확인할 수 있습니다.
      <b>영상과 음성은 이 브라우저 안에만 있고 어디로도 전송되지 않습니다.</b>
    </p>
    <div class="rh-grid">
      <div class="rh-stage">
        <div class="badge" id="rhMeta">문항</div>
        <div class="rh-q" id="rhQ"></div>
        <div class="timer" id="rhTimer">00:00</div>
        <div class="hint">권장 답변 시간 60초 · 90초를 넘기면 빨간색으로 바뀝니다</div>
        <div class="row" style="justify-content:center;margin-top:12px">
          <button class="btn sub" id="rhPrev">← 이전</button>
          <button class="btn" id="rhTimerBtn">타이머 시작</button>
          <button class="btn sub" id="rhNext">다음 →</button>
          <button class="btn sub" id="rhRand">랜덤</button>
        </div>
        <details class="rh-points" id="rhPoints"></details>
      </div>
      <div class="rh-cam">
        ${cameraBlock('rh')}
    </div>
  </div>`;
}

function bindRehearse(qs) {
  rh.qs = qs;
  if (!qs.length) return;
  bindCamera('rh');
  $('#rhPrev').addEventListener('click', () => rhShow(rh.i - 1));
  $('#rhNext').addEventListener('click', () => rhShow(rh.i + 1));
  $('#rhRand').addEventListener('click', () => rhShow(Math.floor(Math.random() * rh.qs.length)));
  $('#rhTimerBtn').addEventListener('click', rhStartTimer);
  rhShow(0);
}
window.addEventListener('pagehide', rhClose);

function renderAnalysis(a, refs) {
  const u = a._usage || {};
  const usageLine = u.totalTokenCount
    ? ` (입력 ${u.promptTokenCount || 0} · 생각 ${u.thoughtsTokenCount || 0} · 답변 ${u.candidatesTokenCount || 0} 토큰)`
    : '';
  const truncNote = a._truncated
    ? `<div class="notice" style="margin-bottom:14px"><b>⚠ 응답이 끝까지 오지 못했습니다.</b>
        출력 한도에 걸려 뒤부분이 잘렸고, 받은 데까지만 보여 드립니다.
        생기부를 나누어 넣으면 더 많은 문항을 받을 수 있습니다.${usageLine}</div>`
    : '';

  const box = $('#analyzeOut');
  const s = a.summary || {}, qs = a.questions || [];
  const byCat = new Map();
  qs.forEach((q) => {
    const c = q.category || '기타';
    if (!byCat.has(c)) byCat.set(c, []);
    byCat.get(c).push(q);
  });

  box.innerHTML = `
    <div class="panel pad" style="margin-bottom:18px">
      <h3 style="margin:0 0 10px;font-size:17px">분석 요약</h3>
      ${s.positioning ? `<div class="acard"><h4>한 줄 평가</h4><p>${esc(s.positioning)}</p></div>` : ''}
      ${(s.keywords || []).length ? `<div class="chips" style="margin:10px 0 4px">${
        s.keywords.map((k) => `<span class="chip" style="cursor:default">${esc(k)}</span>`).join('')}</div>` : ''}
      <div class="cols" style="border:0;margin-top:8px">
        <div style="padding-left:0">
          <h5>강점</h5>
          ${(a.strengths || []).map((x) => `<div class="acard"><h4>${esc(x.title)}</h4><p>${esc(x.evidence)}</p></div>`).join('') || '<p class="hint">항목 없음</p>'}
        </div>
        <div>
          <h5>보완이 필요한 지점</h5>
          ${(a.gaps || []).map((x) => `<div class="acard"><h4>${esc(x.title)}</h4>
            <p><b style="color:var(--warn)">예상 공격</b> ${esc(x.risk)}</p>
            <p style="margin-top:5px"><b style="color:var(--good)">준비</b> ${esc(x.fix)}</p></div>`).join('') || '<p class="hint">항목 없음</p>'}
        </div>
      </div>
    </div>

    ${truncNote}
    ${rehearsePanel(qs)}

    <div class="panel pad" style="margin-bottom:18px">
      <div class="row" style="justify-content:space-between;margin-bottom:12px">
        <h3 style="margin:0;font-size:17px">예상 면접 문항 ${qs.length}개</h3>
        <div class="row">
          <button class="btn sub" id="copyQs">문항만 복사</button>
          <button class="btn sub" onclick="window.print()">인쇄 · PDF 저장</button>
        </div>
      </div>
      ${Array.from(byCat.entries()).map(([cat, list]) => `
        <h4 style="margin:16px 0 8px;font-size:13px;color:var(--ink-3)">${esc(cat)}</h4>
        ${list.map((q) => `
          <article class="qitem">
            <header>
              <span class="badge">${esc(q.category || '')}</span>
              <h4>${esc(q.q)}</h4>
            </header>
            <div class="body">
              ${q.why ? `<p class="why-line">출제 의도 · ${esc(q.why)}</p>` : ''}
              ${(q.points || []).length ? `<b style="color:var(--ink)">답변 포인트</b><ul>${q.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
              ${(q.followups || []).length ? `<b style="color:var(--ink);display:block;margin-top:9px">예상 꼬리질문</b><ul>${q.followups.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
            </div>
          </article>`).join('')}`).join('')}
    </div>

    ${a.closing && a.closing.lastWord ? `<div class="panel pad" style="margin-bottom:18px">
      <h3 style="margin:0 0 8px;font-size:17px">‘마지막으로 하고 싶은 말’ 초안</h3>
      <p style="margin:0;color:var(--ink-2);font-size:14px;white-space:pre-wrap">${esc(a.closing.lastWord)}</p>
      <p class="hint">그대로 외우지 말고, 본인의 표현으로 바꿔 3~4문장으로 다듬으세요.</p>
    </div>` : ''}

    ${refs.length ? `<div class="panel pad">
      <h3 style="margin:0 0 8px;font-size:17px">이 문항 설계에 참고한 실제 기출 ${refs.length}개</h3>
      <ul style="margin:0;padding-left:18px;font-size:13.3px;color:var(--ink-2)">
        ${refs.slice(0, 15).map((r) => `<li style="margin-bottom:5px">${esc(r.q)}<small style="display:block;color:var(--ink-3);font-size:11.5px">${esc(r.univ)}${r.dept ? ' · ' + esc(r.dept) : ''}</small></li>`).join('')}
      </ul>
    </div>` : ''}`;

  bindRehearse(qs);

  const copy = $('#copyQs');
  if (copy) copy.addEventListener('click', () => {
    const txt = qs.map((q, i) => (i + 1) + '. ' + q.q).join('\n');
    navigator.clipboard.writeText(txt)
      .then(() => { copy.textContent = '복사됨'; setTimeout(() => { copy.textContent = '문항만 복사'; }, 1500); })
      .catch(() => alert('복사에 실패했습니다.'));
  });
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('#analyzeBtn').addEventListener('click', async () => {
  const key = $('#apiKey').value.trim() || readStore(KEY_STORE);
  const model = $('#model').value || readStore(MODEL_STORE) || DEFAULT_MODEL;
  const rec = $('#record').value.trim();
  const out = $('#analyzeOut');

  if (!key) { out.innerHTML = '<div class="err">먼저 Gemini API 키를 등록하세요.</div>'; return; }
  if (rec.length < 200) { out.innerHTML = '<div class="err">생기부 내용이 너무 짧습니다. 200자 이상 입력하세요.</div>'; return; }

  applyMask();                          // 붙여넣기로 들어온 내용도 여기서 한 번 더 가린다
  const safe = $('#record').value.trim();
  const left = scanCritical(safe);
  if (left.length) {
    out.innerHTML = `<div class="err"><b>전송을 멈췄습니다.</b>
      아직 남아 있는 개인정보가 있습니다 — ${left.map((x) => esc(x.label) + ' ' + x.n + '건').join(', ')}.
      입력창에서 직접 지운 뒤 다시 눌러 주세요.</div>`;
    return;
  }

  const meta = { univ: $('#inUniv').value.trim(), dept: $('#inDept').value.trim(), jh: $('#inJh').value.trim() };
  const btn = $('#analyzeBtn');
  btn.disabled = true; btn.textContent = '분석 중…';
  out.innerHTML = `<div class="panel pad">
      <div class="progress"><i></i></div>
      <p class="hint">생기부를 읽고 예상 문항을 설계하는 중입니다. 20~60초 정도 걸립니다.</p>
    </div>`;

  try {
    const refs = await pickReference(meta.univ, meta.dept);
    let data = await callGemini(key, model, buildPrompt(safe, meta, refs, 12));
    // 그래도 잘렸다면 문항 수를 줄여 한 번 더 — 대개 이쪽이 온전히 들어온다
    if (data._truncated) {
      out.innerHTML = '<div class="progress"><i></i></div>'
        + '<p class="hint">응답이 길어 잘렸습니다. 문항 수를 줄여 다시 요청하는 중…</p>';
      try {
        const retry = await callGemini(key, model, buildPrompt(safe, meta, refs, 8));
        if (!retry._truncated) { retry._retried = true; data = retry; }
      } catch (e) { /* 재시도 실패 시 처음 결과를 그대로 쓴다 */ }
    }
    renderAnalysis(data, refs);
  } catch (e) {
    out.innerHTML = `<div class="err"><b>분석에 실패했습니다.</b>\n${esc(e.message)}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = '분석하고 예상 문항 만들기';
  }
});

/* ══════════ 부팅 ══════════ */
(async function boot() {
  try {
    if (!window.IV || !window.IV.index || !window.IV.common)
      throw new Error('data/index.js · data/common.js 를 읽지 못했습니다.');
    const idx = window.IV.index, common = window.IV.common;
    state.index = idx; state.common = common;
    renderStats();
    renderUnivSelect();
    renderUnivList('');
    renderCommon(null);
    $('#univOptions').innerHTML = idx.universities.map((u) => `<option value="${esc(u.name)}">`).join('');
    const k = readStore(KEY_STORE);
    if (k) $('#apiKey').value = k;
    const m = readStore(MODEL_STORE);
    if (m) { $('#model').innerHTML = `<option value="${esc(m)}">${esc(m)}</option>`; $('#model').value = m; }
    refreshKeyState();
    const h = location.hash.slice(1);
    if (['reviews', 'common', 'jesimun', 'analyze'].includes(h)) showView(h);
  } catch (e) {
    document.querySelector('main').insertAdjacentHTML('afterbegin',
      `<div class="err">데이터를 불러오지 못했습니다.\n${esc(e.message)}\n\nindex.html 과 같은 폴더에 data 폴더가 함께 있어야 합니다.</div>`);
  }
})();
