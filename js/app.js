/**
 * 政策脈搏｜JRE 筆試升級 Demo
 * 筆試導向：懶人包、GSMEAC、答題骨架（問題—取捨—方案—指標）
 * CSRADAR 風格：本週焦點長文、決策者延伸題、本週必記一鍵匯出
 * JREHK 風格：先落判斷、正反論點、可行建議閘門、11 大議題、換題測試
 */
(function () {
  "use strict";

  const CAT_CLASS = {
    "房屋土地": "badge-housing",
    "環境生態": "badge-env",
    "醫療衞生": "badge-health",
    "社會福利": "badge-welfare",
    "勞工就業": "badge-labour",
    "經濟財政": "badge-econ",
    "創新科技": "badge-inno",
    "交通運輸": "badge-transport",
    "教育": "badge-edu",
    "治安保安": "badge-security",
    "公共管治": "badge-gov"
  };

  /** 溫習量模式：每日少量 vs 考前密集 */
  const STUDY_MODES = {
    daily: {
      id: "daily",
      label: "每日少量",
      desc: "每日 3 則精選懶人包，骨架精簡，適合持續溫習",
      packCount: 3,
      showFullGsmeac: false,
      questionCount: 3,
      memoryCount: 3,
      compareHint: "建議每週比較 1 組相關政策"
    },
    intensive: {
      id: "intensive",
      label: "考前密集",
      desc: "考前 8 則高分政策，完整 GSMEAC 角度與答題骨架，適合衝刺",
      packCount: 8,
      showFullGsmeac: true,
      questionCount: 5,
      memoryCount: 99,
      compareHint: "建議一次比較 2–3 組相近議題"
    }
  };

  const state = {
    view: "home",
    category: "全部",
    query: "",
    selectedId: null,
    compareA: null,
    compareB: null,
    practiceId: null,
    practiceStep: 0,
    practiceAnswers: {},
    practiceChecks: {},
    timerOn: false,
    timerSec: 25 * 60,
    timerId: null,
    flashIndex: 0,
    flashDeck: [],
    studyMode: "daily",
    briefingIds: [],
    showMd: false,
    focusId: null,
    briefingMode: "pack" // pack | must
  };

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2200);
  }

  function catBadge(cat) {
    return `<span class="badge ${CAT_CLASS[cat] || "badge-soft"}">${esc(cat)}</span>`;
  }

  /** 先落判斷 + 01 支持／02 風險／03 建議（含閘門） */
  function debateBlock(policy) {
    if (!policy || !policy.judgment) return "";
    const cols = [
      { n: "01", title: "支持理據", items: policy.pros || [], cls: "debate-pro" },
      { n: "02", title: "風險反駁", items: policy.cons || [], cls: "debate-con" },
      { n: "03", title: "可行建議", items: policy.suggestions || [], cls: "debate-sug" }
    ];
    return `
      <section class="debate-block" aria-label="正反論點">
        <div class="judgment-banner">
          <p class="judgment-kicker">先落判斷</p>
          <p class="judgment-text">${esc(policy.judgment)}</p>
        </div>
        <div class="debate-grid">
          ${cols.map((col) => `
            <article class="debate-col ${col.cls}">
              <h3><span class="debate-num">${col.n}</span> · ${col.title}</h3>
              <ol>${col.items.map((item) => `<li>${esc(item)}</li>`).join("")}</ol>
            </article>
          `).join("")}
        </div>
      </section>`;
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtDate(d) {
    try {
      return new Date(d + "T00:00:00").toLocaleDateString("zh-HK", {
        year: "numeric", month: "short", day: "numeric"
      });
    } catch {
      return d;
    }
  }

  function byId(id) {
    return POLICY_DATA.find((p) => p.id === id);
  }

  function filtered() {
    const q = state.query.trim().toLowerCase();
    return POLICY_DATA.filter((p) => {
      if (state.category !== "全部" && p.category !== state.category) return false;
      if (!q) return true;
      const blob = [p.title, p.summary, p.department, ...(p.keyTerms || []), ...(p.tags || [])]
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    }).sort((a, b) => b.importanceScore - a.importanceScore || b.date.localeCompare(a.date));
  }

  function relatedOf(policy) {
    if (!policy) return [];
    const tags = new Set(policy.tags || []);
    return POLICY_DATA
      .filter((p) => p.id !== policy.id)
      .map((p) => {
        const overlap = (p.tags || []).filter((t) => tags.has(t)).length;
        const sameCat = p.category === policy.category ? 1 : 0;
        return { p, score: overlap * 2 + sameCat };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || b.p.importanceScore - a.p.importanceScore)
      .slice(0, 4)
      .map((x) => x.p);
  }

  function topForMode() {
    const mode = STUDY_MODES[state.studyMode];
    return [...POLICY_DATA]
      .sort((a, b) => b.importanceScore - a.importanceScore || b.date.localeCompare(a.date))
      .slice(0, mode.packCount);
  }

  function weeklyBundle() {
    return (typeof WEEKLY_BUNDLE !== "undefined" && WEEKLY_BUNDLE) ? WEEKLY_BUNDLE : null;
  }

  /** 本週焦點候選：策展包優先，否則用近兩週高重要性 */
  function weeklyFocusCandidates() {
    const wb = weeklyBundle();
    if (wb && Array.isArray(wb.focusPolicyIds) && wb.focusPolicyIds.length) {
      const list = wb.focusPolicyIds.map(byId).filter(Boolean);
      if (list.length) return list;
    }
    const end = wb?.weekEnd || "2026-10-12";
    const start = wb?.weekStart || "2026-09-28";
    const inWindow = POLICY_DATA.filter((p) => p.date >= start && p.date <= end);
    const pool = inWindow.length >= 2 ? inWindow : POLICY_DATA;
    return [...pool]
      .sort((a, b) => b.importanceScore - a.importanceScore || b.date.localeCompare(a.date))
      .slice(0, 6);
  }

  /** 本週必記 5–8 則 */
  function mustRememberPolicies() {
    const wb = weeklyBundle();
    if (wb && Array.isArray(wb.mustRememberIds) && wb.mustRememberIds.length) {
      const list = wb.mustRememberIds.map(byId).filter(Boolean).slice(0, 8);
      if (list.length >= 5) return list;
    }
    return [...POLICY_DATA]
      .sort((a, b) => b.importanceScore - a.importanceScore || b.date.localeCompare(a.date))
      .slice(0, 8);
  }

  /**
   * 若你係決策者會點做 — 置於懶人包 GSMEAC／骨架之前
   * 優先用 interviewQuestions 改寫成決策者語氣，否則由政策欄位推導。
   */
  function policymakerQuestions(policy) {
    if (!policy) return [];
    if (Array.isArray(policy.policymakerQuestions) && policy.policymakerQuestions.length) {
      return policy.policymakerQuestions.slice(0, 3);
    }
    const qs = (policy.interviewQuestions || []).slice(0, 3);
    if (qs.length >= 2) {
      return qs.map((q) => {
        const s = String(q).trim();
        if (/^(若你係決策者|假如你是決策者|作為決策者)/.test(s)) return s;
        return `若你係決策者會點做：${s}`;
      });
    }
    const term = (policy.keyTerms && policy.keyTerms[0]) || policy.category;
    const point = (policy.policyPoints && policy.policyPoints[0]) || "核心措施";
    const mem = (policy.memoryPoints && policy.memoryPoints[0]) || "關鍵風險未緩解";
    return [
      `若你係決策者會點做：面對「${policy.category}」下「${term}」爭議，你會優先守護邊個持份者？點解？`,
      `若你係決策者會點做：資源只夠推進其中一項時，你會唔會優先「${String(point).slice(0, 28)}」？用咩指標向公眾解釋？`,
      `若你係決策者會點做：推行六個月後若「${String(mem).slice(0, 36)}」仍未改善，你會點調整、加碼定叫停？`
    ].slice(0, 3);
  }

  /** 長文分析：策展優先，否則由政策欄位推導（背景→爭議→取捨→指標→練習題） */
  function longFormFor(policy) {
    const wb = weeklyBundle();
    const curated = wb && wb.longForm && policy && wb.longForm[policy.id];
    if (curated) return curated;
    if (!policy) {
      return { 背景: [], 爭議: [], 取捨: [], 指標: [], 練習題: [] };
    }
    const sk = sampleSkeleton(policy, (policy.interviewQuestions || [])[0] || policy.title, "G");
    return {
      背景: [
        policy.summary,
        `主導部門：${policy.department}；階段：${policy.policyStage}；來源：${policy.source}。`,
        ...(policy.policyPoints || []).slice(0, 2)
      ],
      爭議: (policy.interviewQuestions || []).slice(0, 3).map((q) => q.replace(/？$/, "——這正是本週值得爭辯的焦點。")),
      取捨: sk.取捨.concat([
        `執行主體（${policy.department}）集中推進 vs 跨局協同與透明度`
      ]),
      指標: sk.指標.concat([
        `公開檢討：建議就「${(policy.keyTerms || [])[0] || policy.category}」每季公布 1–2 個可驗證數字`
      ]),
      練習題: policymakerQuestions(policy)
    };
  }

  function modeToggleHtml() {
    const m = STUDY_MODES[state.studyMode];
    return `
      <div class="mode-toggle-wrap" style="display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin-bottom:1rem">
        <span style="font-size:.78rem;font-weight:700;color:#6b8b7d;letter-spacing:.08em">溫習量</span>
        <div class="chip-filters" role="group" aria-label="溫習量模式">
          ${Object.values(STUDY_MODES).map((x) => `
            <button type="button" class="chip mode-chip ${state.studyMode === x.id ? "active" : ""}" data-mode="${x.id}">${x.label}</button>
          `).join("")}
        </div>
        <span style="font-size:.78rem;color:var(--text-muted)">${esc(m.desc)}</span>
      </div>`;
  }

  /** 筆試導向 GSMEAC 角度要點（由政策內容推導，非口語提示） */
  function gsmeacAngles(policy, full) {
    const dims = full ? GSMEAC : GSMEAC.slice(0, 5);
    const hooks = {
      G: `主導：${policy.department}；階段：${policy.policyStage}。書面宜先交代決策層級與目標可量度性。`,
      S: `持份者可從「服務對象／執行部門／業界或地區持份者」三層書寫，並點出至少一組利益張力。`,
      M: `執行工具見政策重點；書面應指出 1 個落地瓶頸（人手、跨局、資訊或財政）。`,
      E: `成效宜寫「輸入—產出—結果」；可引用重要性評分邏輯，自訂 1–2 個可驗證指標。`,
      A: `問責線：${policy.department} 對外交代；協同須點名至少一個相關局／署或政策。`,
      C: `優化建議須含試點範圍、資源約束與退出／擴展條件，避免空泛口號。`
    };
    return dims.map((d) => ({
      ...d,
      angle: hooks[d.id] || d.prompt
    }));
  }

  /** 筆試答題骨架樣本（結構化要點，非完整論文） */
  function sampleSkeleton(policy, question, dim) {
    const tradeoffs = [
      ["效率／速度", "公平／質素"],
      ["短期民生紓緩", "中長期財政或制度可持續"],
      ["部門集中決策", "跨局協同與透明度"]
    ];
    const t = tradeoffs[Math.abs(hash(policy.id + (dim || ""))) % tradeoffs.length];
    return {
      問題: `核心矛盾：在「${policy.category}」議題下，如何回應「${shortQ(question)}」所涉及的目標衝突。`,
      取捨: [
        `${t[0]} vs ${t[1]}`,
        `以${policy.department}為執行主體時，須同時顧及服務對象負擔與公共資源約束`
      ],
      方案: [
        `立場：支持在清晰指標下分階段推進「${policy.keyTerms[0] || policy.category}」相關措施`,
        `措施一：由${policy.department}牽頭，就「${(policy.policyPoints[0] || "").slice(0, 28)}…」訂立公開時間表`,
        `措施二：設立跨單位聯席，處理持份者異議並定期匯報風險`
      ],
      指標: [
        `過程指標：措施按時啟動率／跨局會議落實跟進比例（建議每季檢討）`,
        `結果指標：與政策目標直接相關的服務或財政結果（建議 12 個月對照基線）`
      ]
    };
  }

  function shortQ(q) {
    const s = String(q || "");
    return s.length > 36 ? s.slice(0, 36) + "…" : s;
  }

  function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
    return h;
  }

  function setView(view, opts = {}) {
    state.view = view;
    if (opts.id) state.selectedId = opts.id;
    if (opts.practiceId) {
      state.practiceId = opts.practiceId;
      state.practiceStep = 0;
      state.practiceAnswers = {};
      state.practiceChecks = {};
      stopTimer();
      state.timerSec = 25 * 60;
    }
    if (opts.compareA) state.compareA = opts.compareA;
    if (opts.compareB) state.compareB = opts.compareB;
    if (opts.briefingIds) state.briefingIds = opts.briefingIds;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function stopTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
    state.timerOn = false;
  }

  function startTimer() {
    stopTimer();
    state.timerOn = true;
    state.timerId = setInterval(() => {
      if (state.timerSec <= 0) {
        stopTimer();
        toast("時間到。請完成自我評核清單。");
        render();
        return;
      }
      state.timerSec -= 1;
      const el = $("#timer-display");
      if (el) el.textContent = formatTime(state.timerSec);
    }, 1000);
    render();
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  /* ---------- Views ---------- */

  function renderNav() {
    const items = [
      { id: "focus", label: "本週焦點", icon: "🎯", featured: true },
      { id: "lazy", label: "懶人包", icon: "⚡" },
      { id: "home", label: "搜尋同脈絡", icon: "🔍" },
      { id: "practice", label: "JRE 練習模式", icon: "✍️" },
      { id: "compare", label: "政策比較", icon: "⚖️" },
      { id: "flash", label: "閃卡溫習", icon: "🃏" },
      { id: "briefing", label: "本週必記", icon: "📄" }
    ];
    return items.map((it) => `
      <button type="button" class="nav-btn ${it.featured ? "featured" : ""} ${state.view === it.id || (it.id === "lazy" && state.view === "pack") || (it.id === "briefing" && state.briefingMode === "must" && state.view === "briefing") ? "active" : ""}" data-nav="${it.id}">
        <span class="icon">${it.icon}</span>${it.label}
      </button>
    `).join("");
  }

  function renderHome() {
    const rows = filtered();
    return `
      <div class="topbar">
        <div>
          <h2 class="serif">搜尋同脈絡</h2>
          <p class="sub">關鍵詞搜尋、分類篩選、相關政策連結 — 服務 JRE 筆試備試</p>
        </div>
      </div>
      ${lazyEntryStrip()}
      <div class="filters">
        <div class="search-box">
          <span aria-hidden="true">🔎</span>
          <input id="search-input" type="search" placeholder="搜尋標題、摘要、關鍵詞、部門…" value="${esc(state.query)}" />
        </div>
        <div class="chip-filters" id="cat-filters">
          ${CATEGORIES.map((c) => `
            <button type="button" class="chip ${state.category === c ? "active" : ""}" data-cat="${esc(c)}">${esc(c)}</button>
          `).join("")}
        </div>
      </div>
      <div class="layout-2">
        <div class="card">
          <div class="card-hd">
            <div>
              <p class="kicker">POLICY DESK</p>
              <h3>政策列表（${rows.length}）</h3>
            </div>
          </div>
          <div class="policy-list">
            ${rows.length ? rows.map(policyRow).join("") : `<div class="empty">沒有符合條件的政策。請調整關鍵詞或分類。</div>`}
          </div>
        </div>
        <div class="card">
          <div class="card-hd"><div><p class="kicker">TIPS</p><h3>筆試用法</h3></div></div>
          <div class="card-bd" style="font-size:.88rem;color:var(--text-muted);line-height:1.65">
            <p style="margin-top:0">先開<strong>懶人包</strong>掌握一則政策的 GSMEAC 角度與記憶點，再用「問題—取捨—方案—指標」骨架練習書面答題。</p>
            <p>搜尋時可留意<strong>相關政策</strong>標籤重疊，方便在筆試比較兩項措施的異同。</p>
            <button type="button" class="btn btn-primary" data-nav="lazy" style="width:100%;margin-top:.5rem">開啟懶人包</button>
          </div>
        </div>
      </div>`;
  }

  function lazyEntryStrip() {
    const tops = topForMode().slice(0, 3);
    return `
      <div class="lazy-hero">
        <h3>⚡ JRE 筆試懶人包</h3>
        <p>一鍵展開：GSMEAC 角度、記憶點、關鍵詞、筆試題與答題骨架。可切換「每日少量」或「考前密集」溫習量。</p>
        ${modeToggleHtml()}
        <div class="lazy-quick">
          ${tops.map((p) => `
            <button type="button" class="lazy-chip" data-open-pack="${p.id}">
              <div class="t">${esc(p.title)}</div>
              <div class="m">${esc(p.category)} · 重要性 ${p.importanceScore}</div>
            </button>
          `).join("")}
          <button type="button" class="lazy-chip" data-nav="lazy" style="border-style:dashed">
            <div class="t">查看本模式全部懶人包 →</div>
            <div class="m">${STUDY_MODES[state.studyMode].label} · ${STUDY_MODES[state.studyMode].packCount} 則</div>
          </button>
        </div>
      </div>`;
  }

  function policyRow(p) {
    return `
      <div class="policy-row" style="cursor:default">
        <div class="policy-row-top">
          <div class="min-w-0" style="min-width:0">
            <div class="policy-meta">
              ${catBadge(p.category)}
              <span class="date">${fmtDate(p.date)} · ${esc(p.department)}</span>
            </div>
            <h4>${esc(p.title)}</h4>
            <p class="sum">${esc(p.summary)}</p>
            <div class="policy-row-actions">
              <button type="button" class="btn btn-amber btn-sm" data-open-pack="${p.id}">懶人包</button>
              <button type="button" class="btn btn-outline btn-sm" data-open-detail="${p.id}">詳情</button>
              <button type="button" class="btn btn-outline btn-sm" data-start-practice="${p.id}">筆試練習</button>
              <button type="button" class="btn btn-outline btn-sm" data-compare-add="${p.id}">加入比較</button>
            </div>
          </div>
          <span class="badge-score">${p.importanceScore}</span>
        </div>
      </div>`;
  }

  function renderFocus() {
    const wb = weeklyBundle();
    const candidates = weeklyFocusCandidates();
    if (!state.focusId || !byId(state.focusId)) {
      state.focusId = candidates[0] ? candidates[0].id : (POLICY_DATA[0] && POLICY_DATA[0].id);
    }
    const policy = byId(state.focusId);
    const lf = longFormFor(policy);
    const weekLabel = wb ? wb.weekLabel : "本週";
    const title = wb ? wb.title : "本週焦點長文分析";
    const summary = wb ? wb.executiveSummary : "揀選高重要性政策，按背景→爭議→取捨→指標→練習題作長文掃描。";

    const sections = [
      { key: "背景", cls: "bg-background", tag: "1", title: "背景" },
      { key: "爭議", cls: "bg-dispute", tag: "2", title: "爭議" },
      { key: "取捨", cls: "bg-tradeoff", tag: "3", title: "取捨" },
      { key: "指標", cls: "bg-metric", tag: "4", title: "指標" },
      { key: "練習題", cls: "bg-practice", tag: "5", title: "練習題" }
    ];

    return `
      <div class="topbar">
        <div>
          <h2 class="serif">本週焦點</h2>
          <p class="sub">長文分析（背景→爭議→取捨→指標→練習題）· 彩色區塊閱讀 · ${esc(weekLabel)}</p>
        </div>
        <div style="display:flex;gap:.4rem;flex-wrap:wrap">
          <button type="button" class="btn btn-primary btn-sm" data-export-must>一鍵本週必記</button>
          <button type="button" class="btn btn-outline btn-sm" data-open-pack="${policy ? policy.id : ""}">開懶人包</button>
          <button type="button" class="btn btn-outline btn-sm" onclick="window.print()">列印本頁</button>
        </div>
      </div>
      <div class="focus-hero">
        <p class="kicker">WEEKLY FOCUS · ${esc(weekLabel)}</p>
        <h2>${esc(title)}</h2>
        <p>${esc(summary)}</p>
      </div>
      <p style="font-size:.78rem;font-weight:700;color:#6b8b7d;letter-spacing:.08em;margin:0 0 .5rem">揀選本週焦點篇</p>
      <div class="focus-pick" role="tablist" aria-label="本週焦點政策">
        ${candidates.map((p) => `
          <button type="button" class="${state.focusId === p.id ? "active" : ""}" data-focus-id="${p.id}">
            <span class="t">${esc(p.title.length > 36 ? p.title.slice(0, 36) + "…" : p.title)}</span>
            <span class="m">${esc(p.category)} · 重要性 ${p.importanceScore}</span>
          </button>
        `).join("")}
      </div>
      ${policy ? `
        <article class="focus-longform sheet" style="padding:1.25rem">
          <header class="sheet-header" style="margin-bottom:1rem">
            <div class="policy-meta">
              ${catBadge(policy.category)}
              <span class="badge badge-soft">${esc(policy.department)}</span>
              <span class="badge badge-soft">${esc(policy.policyStage)}</span>
              <span class="date">${fmtDate(policy.date)}</span>
            </div>
            <h2 style="font-size:1.35rem">${esc(policy.title)}</h2>
            ${debateBlock(policy)}
            <p style="margin:.5rem 0 0;font-size:.82rem">
              重要性 <strong style="color:var(--green-deep)">${policy.importanceScore}</strong>
              · <a href="${esc(policy.canonicalUrl)}" target="_blank" rel="noopener">官方原文</a>
              · <button type="button" class="btn btn-amber btn-sm" data-start-practice="${policy.id}" style="margin-left:.25rem">筆試練習</button>
            </p>
          </header>
          ${sections.map((sec) => {
            const items = lf[sec.key] || [];
            if (sec.key === "練習題") {
              return `
                <section class="focus-section ${sec.cls}">
                  <h3><span class="step-tag">${sec.tag}</span>${sec.title}</h3>
                  <ul style="list-style:none;padding:0;margin:0">
                    ${items.map((q, i) => `<li class="q-item"><strong>${i + 1}.</strong> ${esc(q)}</li>`).join("")}
                  </ul>
                </section>`;
            }
            return `
              <section class="focus-section ${sec.cls}">
                <h3><span class="step-tag">${sec.tag}</span>${sec.title}</h3>
                <ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
              </section>`;
          }).join("")}
        </article>
      ` : `<div class="empty">未有本週焦點政策。</div>`}`;
  }

  function renderLazyHub() {
    const mode = STUDY_MODES[state.studyMode];
    const list = topForMode();
    return `
      <div class="topbar">
        <div>
          <h2 class="serif">懶人包</h2>
          <p class="sub">JRE 筆試一頁掃描：角度、要點、詞彙、試題 — 無需口述，專注書面結構</p>
        </div>
        <button type="button" class="btn btn-primary" data-open-daily-pack>生成本模式溫習包簡報</button>
      </div>
      ${modeToggleHtml()}
      <div class="daily-pack-banner">
        <div>
          <strong>${esc(mode.label)}溫習包</strong>
          <div style="font-size:.82rem;color:var(--text-muted);margin-top:.25rem">
            共 ${list.length} 則高重要性政策 · ${esc(mode.desc)}
          </div>
        </div>
        <div style="display:flex;gap:.4rem;flex-wrap:wrap">
          <button type="button" class="btn btn-amber btn-sm" data-export-must>本週必記</button>
          <button type="button" class="btn btn-outline btn-sm" data-open-daily-pack>一頁簡報</button>
          <button type="button" class="btn btn-outline btn-sm" data-flash-from-mode>轉閃卡</button>
          <button type="button" class="btn btn-outline btn-sm" data-nav="focus">本週焦點</button>
        </div>
      </div>
      <div class="card">
        <div class="policy-list">
          ${list.map((p) => `
            <div class="policy-row">
              <div class="policy-row-top">
                <div style="min-width:0">
                  <div class="policy-meta">${catBadge(p.category)}<span class="date">${fmtDate(p.date)}</span></div>
                  <h4>${esc(p.title)}</h4>
                  <p class="sum">${esc(p.summary)}</p>
                  <div class="policy-row-actions">
                    <button type="button" class="btn btn-amber btn-sm" data-open-pack="${p.id}">開啟懶人包</button>
                    <button type="button" class="btn btn-outline btn-sm" data-start-practice="${p.id}">按此筆試練習</button>
                  </div>
                </div>
                <span class="badge-score">${p.importanceScore}</span>
              </div>
            </div>
          `).join("")}
        </div>
      </div>`;
  }

  function renderPack(policy) {
    if (!policy) return `<div class="empty">找不到政策。</div>`;
    const mode = STUDY_MODES[state.studyMode];
    const angles = gsmeacAngles(policy, mode.showFullGsmeac);
    const mems = (policy.memoryPoints || []).slice(0, mode.memoryCount);
    const qs = (policy.interviewQuestions || []).slice(0, mode.questionCount);
    const related = relatedOf(policy);

    return `
      <div class="topbar">
        <div>
          <h2 class="serif">懶人包</h2>
          <p class="sub">${esc(mode.label)}深度 · 書面筆試掃描頁</p>
        </div>
        <button type="button" class="btn btn-outline" data-nav="lazy">← 返回列表</button>
      </div>
      ${modeToggleHtml()}
      <div class="pack-toolbar">
        <button type="button" class="btn btn-primary btn-sm" data-start-practice="${policy.id}">開始筆試練習</button>
        <button type="button" class="btn btn-amber btn-sm" data-export-must>本週必記</button>
        <button type="button" class="btn btn-outline btn-sm" data-brief-one="${policy.id}">一頁簡報</button>
        <button type="button" class="btn btn-outline btn-sm" data-copy-pack-md="${policy.id}">複製 Markdown</button>
        <button type="button" class="btn btn-outline btn-sm" data-compare-add="${policy.id}">加入比較</button>
        <button type="button" class="btn btn-outline btn-sm" onclick="window.print()">列印本頁</button>
      </div>
      <article class="sheet" id="lazy-pack-sheet">
        <header class="sheet-header">
          <div class="policy-meta">
            ${catBadge(policy.category)}
            <span class="badge badge-soft">${esc(policy.department)}</span>
            <span class="badge badge-soft">${esc(policy.policyStage)}</span>
            <span class="date">${fmtDate(policy.date)} · ${esc(policy.source)}</span>
          </div>
          <h2>${esc(policy.title)}</h2>
          <p style="margin:.65rem 0 0;color:var(--text-muted);font-size:.9rem">${esc(policy.summary)}</p>
          <p style="margin:.5rem 0 0;font-size:.8rem">重要性 <strong style="color:var(--green-deep)">${policy.importanceScore}</strong>
            · <a href="${esc(policy.canonicalUrl)}" target="_blank" rel="noopener">官方原文（示範連結）</a></p>
        </header>

        ${debateBlock(policy)}

        ${(() => {
          const pmQs = policymakerQuestions(policy);
          return `
        <aside class="pm-box" aria-label="決策者延伸題">
          <p class="pm-kicker">POLICYMAKER EXTENSION</p>
          <h3>若你係決策者會點做</h3>
          <p class="pm-hint">先用決策者視角想清楚優先次序，再進入下方 GSMEAC 與「問題—取捨—方案—指標」骨架。</p>
          ${pmQs.map((q, i) => `
            <div class="pm-q"><span class="n">${i + 1}</span><span>${esc(q)}</span></div>
          `).join("")}
        </aside>`;
        })()}

        <div class="section-label">📌 政策重點</div>
        <ul class="mem-list">${(policy.policyPoints || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>

        <div class="section-label">🧠 記憶點（筆試可默寫）</div>
        <ul class="mem-list">${mems.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>

        <div class="section-label">🏷️ 關鍵詞</div>
        <div class="term-cloud">${(policy.keyTerms || []).map((t) => `<span class="badge badge-soft">${esc(t)}</span>`).join("")}</div>

        <div class="section-label">📐 GSMEAC 書面角度 ${mode.showFullGsmeac ? "（完整）" : "（精簡五維）"}</div>
        <p style="font-size:.78rem;color:var(--text-muted);margin:.25rem 0 .75rem">治理、持份者、執行、成效、問責／協同 — 用於組織筆試段落，而非口述提詞。</p>
        <div class="gsmeac-grid">
          ${angles.map((d) => `
            <div class="gsmeac-card">
              <div class="letter">${esc(d.id)}</div>
              <h5>${esc(d.name)} <span style="font-weight:500;color:var(--text-faint);font-size:.75rem">${esc(d.nameEn)}</span></h5>
              <p>${esc(d.angle)}</p>
            </div>
          `).join("")}
        </div>

        <div class="section-label">✍️ JRE 筆試思考題</div>
        <ol class="q-list" style="list-style:none;padding:0">
          ${qs.map((q, i) => {
            const sk = sampleSkeleton(policy, q, GSMEAC[i % GSMEAC.length].id);
            return `
              <li>
                <div style="font-weight:650;margin-bottom:.5rem">${i + 1}. ${esc(q)}</div>
                <div class="skeleton-panel" style="margin:0">
                  <h4>答題骨架示例（問題—取捨—方案—指標）</h4>
                  <div class="skel-block"><div class="lab">問題</div><ul><li>${esc(sk.問題)}</li></ul></div>
                  <div class="skel-block"><div class="lab">取捨</div><ul>${sk.取捨.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
                  <div class="skel-block"><div class="lab">方案</div><ul>${sk.方案.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
                  <div class="skel-block"><div class="lab">指標</div><ul>${sk.指標.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
                </div>
              </li>`;
          }).join("")}
        </ol>

        ${related.length ? `
          <div class="section-label">🔗 相關政策</div>
          <div style="display:flex;flex-direction:column;gap:.4rem">
            ${related.map((r) => `
              <button type="button" class="btn btn-outline" style="justify-content:space-between" data-open-pack="${r.id}">
                <span style="text-align:left;font-size:.82rem">${esc(r.title)}</span>
                <span class="badge-score" style="font-size:.95rem">${r.importanceScore}</span>
              </button>
            `).join("")}
          </div>
        ` : ""}
      </article>`;
  }

  function renderDetail(policy) {
    if (!policy) return `<div class="empty">找不到政策。</div>`;
    const related = relatedOf(policy);
    return `
      <div class="topbar">
        <div><h2 class="serif">政策詳情</h2><p class="sub">${esc(policy.source)}</p></div>
        <div style="display:flex;gap:.4rem;flex-wrap:wrap">
          <button type="button" class="btn btn-amber" data-open-pack="${policy.id}">懶人包</button>
          <button type="button" class="btn btn-primary" data-start-practice="${policy.id}">筆試練習</button>
          <button type="button" class="btn btn-outline" data-nav="home">← 返回</button>
        </div>
      </div>
      <div class="sheet">
        <div class="policy-meta">${catBadge(policy.category)}<span class="date">${fmtDate(policy.date)} · ${esc(policy.department)}</span></div>
        <h2 class="serif" style="margin:.5rem 0;font-size:1.4rem">${esc(policy.title)}</h2>
        <p style="color:var(--text-muted)">${esc(policy.summary)}</p>
        ${debateBlock(policy)}
        <div class="section-label">政策重點</div>
        <ul class="mem-list">${policy.policyPoints.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        <div class="section-label">關鍵詞</div>
        <div class="term-cloud">${policy.keyTerms.map((t) => `<span class="badge badge-soft">${esc(t)}</span>`).join("")}</div>
        ${related.length ? `
          <div class="section-label">相關政策</div>
          ${related.map((r) => `<div style="margin-bottom:.35rem"><button type="button" class="btn btn-outline btn-sm" data-open-detail="${r.id}">${esc(r.title)}</button></div>`).join("")}
        ` : ""}
      </div>`;
  }

  function renderPractice() {
    const policy = byId(state.practiceId) || filtered()[0] || POLICY_DATA[0];
    if (!policy) return `<div class="empty">沒有可練習的政策。</div>`;
    if (!state.practiceId) state.practiceId = policy.id;

    const step = GSMEAC[state.practiceStep] || GSMEAC[0];
    const qList = policy.interviewQuestions || [];
    const focusQ = qList[state.practiceStep % Math.max(qList.length, 1)] || "請就本政策書寫一段結構完整的分析。";
    const sk = sampleSkeleton(policy, focusQ, step.id);
    const answer = state.practiceAnswers[step.id] || "";

    const checks = [
      { id: "c1", label: "已用一句話界定問題／核心矛盾" },
      { id: "c2", label: "已寫出至少一組明確取捨（對立價值或約束）" },
      { id: "c3", label: "方案含執行主體與可操作措施（非空泛原則）" },
      { id: "c4", label: "指標可驗證，並有檢討時點" },
      { id: "c5", label: "段落呼應本步 GSMEAC 維度" }
    ];
    const swapChecks = [
      { id: "swap-data", label: "已寫入本題專屬數據或政策工具，不能原句搬去另一題" },
      { id: "swap-stake", label: "已點名本題持份者，以及他們之間的利益張力" },
      { id: "swap-inst", label: "已寫明制度限制：法例、部門權責、資源或時間閘門" }
    ];
    const allChecks = checks.concat(swapChecks);
    const checked = allChecks.filter((c) => state.practiceChecks[c.id]).length;
    const anchors = (policy.keyTerms || []).slice(0, 3).join("、");

    return `
      <div class="topbar">
        <div>
          <h2 class="serif">JRE 練習模式</h2>
          <p class="sub">筆試書寫 · GSMEAC 逐步引導 · 答題骨架：問題—取捨—方案—指標</p>
        </div>
      </div>
      <div class="filters" style="margin-bottom:1rem">
        <label style="font-size:.82rem;color:var(--text-muted)">選擇政策
          <select id="practice-select" style="display:block;margin-top:.3rem;padding:.5rem .7rem;border-radius:10px;border:1px solid var(--green-border);min-width:280px;max-width:100%">
            ${POLICY_DATA.map((p) => `<option value="${p.id}" ${p.id === policy.id ? "selected" : ""}>${esc(p.title.slice(0, 42))}…</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="card" style="margin-bottom:1rem">
        <div class="card-bd">
          <div class="policy-meta">${catBadge(policy.category)}<span class="date">${esc(policy.department)}</span></div>
          <h3 class="serif" style="margin:.4rem 0;font-size:1.15rem">${esc(policy.title)}</h3>
          <button type="button" class="btn btn-amber btn-sm" data-open-pack="${policy.id}">先看懶人包</button>
        </div>
      </div>
      <div class="practice-layout">
        <aside>
          <div class="timer-box">
            <div>
              <div style="font-size:.7rem;color:#9ed4be">可選計時（建議 25 分鐘）</div>
              <div class="time" id="timer-display">${formatTime(state.timerSec)}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:.3rem">
              ${state.timerOn
                ? `<button type="button" class="btn btn-ghost btn-sm" id="timer-stop">暫停</button>`
                : `<button type="button" class="btn btn-white btn-sm" id="timer-start">開始</button>`}
              <button type="button" class="btn btn-ghost btn-sm" id="timer-reset">重設</button>
            </div>
          </div>
          <div class="step-rail">
            ${GSMEAC.map((d, i) => `
              <button type="button" class="step-item ${i === state.practiceStep ? "active" : ""} ${state.practiceAnswers[d.id] ? "done" : ""}" data-step="${i}">
                <span class="n">${d.id}</span>
                <span><div class="lab">${esc(d.name)}</div><div class="sub">${esc(d.nameEn)}</div></span>
              </button>
            `).join("")}
          </div>
        </aside>
        <div class="card">
          <div class="card-bd">
            <div class="prompt-box">
              <h4>${esc(step.id)} · ${esc(step.name)} — 書寫提示</h4>
              <p>${esc(step.prompt)}</p>
              <div class="tips-row">${(step.tips || []).map((t) => `<span class="tip-pill">${esc(t)}</span>`).join("")}</div>
            </div>
            <div class="section-label">本步對應筆試題</div>
            <p style="font-size:.9rem;margin:.25rem 0 0.85rem">${esc(focusQ)}</p>
            <div class="section-label">你的書面要點（可用條列）</div>
            <div class="answer-area">
              <textarea id="practice-answer" placeholder="按「問題—取捨—方案—指標」自行書寫要點…">${esc(answer)}</textarea>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.65rem">
              <button type="button" class="btn btn-primary btn-sm" id="save-answer">儲存本步</button>
              <button type="button" class="btn btn-outline btn-sm" id="show-skeleton">顯示答題骨架示例</button>
              <button type="button" class="btn btn-outline btn-sm" id="prev-step" ${state.practiceStep === 0 ? "disabled" : ""}>上一步</button>
              <button type="button" class="btn btn-outline btn-sm" id="next-step" ${state.practiceStep >= GSMEAC.length - 1 ? "disabled" : ""}>下一步</button>
            </div>
            <div id="skeleton-slot" class="hidden">
              <div class="skeleton-panel">
                <h4>答題骨架示例（非範文全文）</h4>
                <div class="skel-block"><div class="lab">問題</div><ul><li>${esc(sk.問題)}</li></ul></div>
                <div class="skel-block"><div class="lab">取捨</div><ul>${sk.取捨.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
                <div class="skel-block"><div class="lab">方案</div><ul>${sk.方案.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
                <div class="skel-block"><div class="lab">指標</div><ul>${sk.指標.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
              </div>
            </div>
            <div class="section-label">自我評核清單</div>
            <div class="checklist">
              ${checks.map((c) => `
                <label class="check-item">
                  <input type="checkbox" data-check="${c.id}" ${state.practiceChecks[c.id] ? "checked" : ""} />
                  <span>${esc(c.label)}</span>
                </label>
              `).join("")}
            </div>
            <section class="swap-test" aria-label="換題測試">
              <p class="swap-kicker">換題測試</p>
              <p class="swap-quote">若成段換去另一題仍完全成立，就代表內容太通用。</p>
              <p class="swap-hint">請核對答案是否寫入本題的數據、持份者及制度限制。${anchors ? `本題錨點：${esc(anchors)}。` : ""}</p>
              <div class="checklist">
                ${swapChecks.map((c) => `
                  <label class="check-item">
                    <input type="checkbox" data-check="${c.id}" ${state.practiceChecks[c.id] ? "checked" : ""} />
                    <span>${esc(c.label)}</span>
                  </label>
                `).join("")}
              </div>
            </section>
            <div class="score-out">自評完成度：${checked} / ${allChecks.length}${checked === allChecks.length ? " · 可進入下一維度或另一則懶人包" : ""}</div>
          </div>
        </div>
      </div>`;
  }

  function renderCompare() {
    const a = byId(state.compareA) || POLICY_DATA[0];
    const b = byId(state.compareB) || POLICY_DATA[1];
    state.compareA = a.id;
    state.compareB = b.id;
    const rows = [
      ["分類", a.category, b.category],
      ["部門", a.department, b.department],
      ["階段", a.policyStage, b.policyStage],
      ["日期", fmtDate(a.date), fmtDate(b.date)],
      ["重要性", String(a.importanceScore), String(b.importanceScore)],
      ["摘要", a.summary, b.summary],
      ["先落判斷", a.judgment || "—", b.judgment || "—"],
      ["政策重點", (a.policyPoints || []).map((x) => "• " + x).join("\n"), (b.policyPoints || []).map((x) => "• " + x).join("\n")],
      ["關鍵詞", (a.keyTerms || []).join("、"), (b.keyTerms || []).join("、")],
      ["標籤重疊", overlapTags(a, b), overlapTags(a, b)]
    ];
    return `
      <div class="topbar">
        <div>
          <h2 class="serif">政策比較</h2>
          <p class="sub">並排差異表 — 適合筆試「比較兩項措施」類題</p>
        </div>
      </div>
      ${modeToggleHtml()}
      <p style="font-size:.82rem;color:var(--text-muted);margin:-.5rem 0 1rem">${esc(STUDY_MODES[state.studyMode].compareHint)}</p>
      <div class="compare-selects">
        <select id="cmp-a">${POLICY_DATA.map((p) => `<option value="${p.id}" ${p.id === a.id ? "selected" : ""}>${esc(p.title.slice(0, 40))}…</option>`).join("")}</select>
        <select id="cmp-b">${POLICY_DATA.map((p) => `<option value="${p.id}" ${p.id === b.id ? "selected" : ""}>${esc(p.title.slice(0, 40))}…</option>`).join("")}</select>
      </div>
      <div class="card" style="overflow:auto">
        <table class="compare-table">
          <thead><tr><th>項目</th><th>政策 A</th><th>政策 B</th></tr></thead>
          <tbody>
            ${rows.map((r, idx) => `
              <tr>
                <th>${esc(r[0])}</th>
                <td style="white-space:pre-wrap">${esc(r[0] === "標籤重疊" ? overlapTags(a, b) : r[1])}</td>
                <td style="white-space:pre-wrap">${esc(r[0] === "標籤重疊" ? "← 相同" : r[2])}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <div style="margin-top:1rem;display:flex;gap:.5rem;flex-wrap:wrap">
        <button type="button" class="btn btn-amber btn-sm" data-open-pack="${a.id}">A 懶人包</button>
        <button type="button" class="btn btn-amber btn-sm" data-open-pack="${b.id}">B 懶人包</button>
        <button type="button" class="btn btn-primary btn-sm" data-brief-ids="${a.id},${b.id}">兩則一頁簡報</button>
      </div>`;
  }

  function overlapTags(a, b) {
    const s = new Set(a.tags || []);
    const o = (b.tags || []).filter((t) => s.has(t));
    return o.length ? o.join("、") : "（無共同標籤）";
  }

  function buildFlashDeck() {
    const src = state.view === "flash" && state.flashDeck.length
      ? null
      : null;
    const policies = topForMode();
    const deck = [];
    policies.forEach((p) => {
      if (p.judgment) {
        deck.push({
          front: `【先落判斷】${p.category} · ${(p.title || "").slice(0, 22)}`,
          back: p.judgment,
          source: p.title
        });
      }
      (p.memoryPoints || []).forEach((m, i) => {
        deck.push({
          front: `【記憶點】${p.category} · ${p.keyTerms[0] || p.department}`,
          back: m,
          source: p.title
        });
      });
      (p.policyPoints || []).slice(0, 2).forEach((m) => {
        deck.push({
          front: `【政策重點】${p.title.slice(0, 28)}…`,
          back: m,
          source: p.department
        });
      });
    });
    return deck;
  }

  function renderFlash() {
    if (!state.flashDeck.length) state.flashDeck = buildFlashDeck();
    const deck = state.flashDeck;
    if (!deck.length) return `<div class="empty">沒有閃卡資料。</div>`;
    if (state.flashIndex >= deck.length) state.flashIndex = 0;
    const card = deck[state.flashIndex];
    return `
      <div class="topbar">
        <div>
          <h2 class="serif">閃卡溫習</h2>
          <p class="sub">由記憶點／政策重點生成 — 對應目前溫習量模式</p>
        </div>
      </div>
      ${modeToggleHtml()}
      <div class="flash-controls">
        <button type="button" class="btn btn-outline btn-sm" id="flash-rebuild">依目前模式重建牌組</button>
        <span class="flash-count">${state.flashIndex + 1} / ${deck.length}</span>
      </div>
      <div class="flashcard ${state.flashFlipped ? "flipped" : ""}" id="flashcard">
        <div class="flash-inner">
          <div class="flash-face front">
            <div class="tag">點擊翻面 · ${esc(card.source || "")}</div>
            <p class="q">${esc(card.front)}</p>
          </div>
          <div class="flash-face back">
            <div class="tag">答案／要點</div>
            <p class="a">${esc(card.back)}</p>
          </div>
        </div>
      </div>
      <div class="flash-nav">
        <button type="button" class="btn btn-outline" id="flash-prev">上一張</button>
        <button type="button" class="btn btn-primary" id="flash-flip">翻面</button>
        <button type="button" class="btn btn-outline" id="flash-next">下一張</button>
      </div>`;
  }

  function briefingMarkdown(policies) {
    const mode = STUDY_MODES[state.studyMode];
    let md = `# 政策脈搏｜JRE 筆試簡報（${mode.label}）\n\n`;
    md += `> 示範資料 · 非即時官方匯入 · ${new Date().toLocaleDateString("zh-HK")}\n\n`;
    policies.forEach((p, idx) => {
      const qs = (p.interviewQuestions || []).slice(0, mode.questionCount);
      const mems = (p.memoryPoints || []).slice(0, mode.memoryCount);
      const angles = gsmeacAngles(p, mode.showFullGsmeac);
      md += `## ${idx + 1}. ${p.title}\n\n`;
      md += `- 分類：${p.category}｜部門：${p.department}｜${p.date}｜重要性 ${p.importanceScore}\n`;
      md += `- 摘要：${p.summary}\n`;
      if (p.judgment) md += `- 先落判斷：${p.judgment}\n`;
      md += `\n`;
      if ((p.pros || []).length) {
        md += `### 01 · 支持理據\n${p.pros.map((x) => `- ${x}`).join("\n")}\n\n`;
        md += `### 02 · 風險反駁\n${(p.cons || []).map((x) => `- ${x}`).join("\n")}\n\n`;
        md += `### 03 · 可行建議\n${(p.suggestions || []).map((x) => `- ${x}`).join("\n")}\n\n`;
      }
      md += `### 政策重點\n${(p.policyPoints || []).map((x) => `- ${x}`).join("\n")}\n\n`;
      md += `### 記憶點\n${mems.map((x) => `- ${x}`).join("\n")}\n\n`;
      md += `### 關鍵詞\n${(p.keyTerms || []).map((t) => `\`${t}\``).join(" ")}\n\n`;
      md += `### GSMEAC 書面角度\n${angles.map((d) => `- **${d.id} ${d.name}**：${d.angle}`).join("\n")}\n\n`;
      md += `### 筆試題與答題骨架\n`;
      qs.forEach((q, i) => {
        const sk = sampleSkeleton(p, q, GSMEAC[i % GSMEAC.length].id);
        md += `**${i + 1}. ${q}**\n`;
        md += `- 問題：${sk.問題}\n`;
        md += `- 取捨：${sk.取捨.join("；")}\n`;
        md += `- 方案：${sk.方案.join("；")}\n`;
        md += `- 指標：${sk.指標.join("；")}\n\n`;
      });
      md += `---\n\n`;
    });
    return md;
  }

  /** 本週必記 Markdown（5–8 則 + 必記要點） */
  function mustRememberMarkdown(policies) {
    const wb = weeklyBundle();
    const weekLabel = wb ? wb.weekLabel : new Date().toLocaleDateString("zh-HK");
    let md = `# 本週必記｜政策脈搏\n\n`;
    md += `> ${weekLabel} · ${policies.length} 則 · ${new Date().toLocaleDateString("zh-HK")} · 示範樣本\n\n`;
    if (wb && wb.executiveSummary) {
      md += `## 本週一句\n\n${wb.executiveSummary}\n\n`;
    }
    md += `## 必記清單\n\n`;
    policies.forEach((p, idx) => {
      const mems = (p.memoryPoints || []).slice(0, 3);
      md += `### ${idx + 1}. ${p.title}\n\n`;
      md += `- ${p.category}｜${p.department}｜重要性 ${p.importanceScore}｜${p.date}\n`;
      if (p.judgment) md += `- 先落判斷：${p.judgment}\n`;
      md += `- 摘要：${p.summary}\n`;
      md += `- **必記要點**：\n`;
      mems.forEach((m) => { md += `  - ${m}\n`; });
      if ((p.keyTerms || []).length) {
        md += `- 關鍵詞：${(p.keyTerms || []).slice(0, 5).join("、")}\n`;
      }
      md += `\n`;
    });
    md += `---\n\n*由政策脈搏 Demo 一鍵匯出 · 非即時官方匯入*\n`;
    return md;
  }

  function renderBriefing() {
    const isMust = state.briefingMode === "must";
    const policies = isMust
      ? mustRememberPolicies()
      : (state.briefingIds.length ? state.briefingIds : topForMode().map((p) => p.id)).map(byId).filter(Boolean);
    const mode = STUDY_MODES[state.studyMode];
    const wb = weeklyBundle();
    const md = isMust ? mustRememberMarkdown(policies) : briefingMarkdown(policies);

    if (isMust) {
      return `
      <div class="topbar">
        <div>
          <h2 class="serif">本週必記</h2>
          <p class="sub">一鍵週報 · 5–8 則精選 + 必記要點 · 可列印／複製 Markdown</p>
        </div>
      </div>
      <div class="must-banner">
        <h3>📋 ${esc(wb ? wb.weekLabel : "本週")} · 必記 ${policies.length} 則</h3>
        <p>${esc(wb ? wb.executiveSummary : "按重要性精選本週必記政策，方便考前快速默寫。")}</p>
      </div>
      <div class="briefing-actions">
        <button type="button" class="btn btn-primary btn-sm" onclick="window.print()">列印／匯出 PDF</button>
        <button type="button" class="btn btn-outline btn-sm" id="copy-md">複製 Markdown</button>
        <button type="button" class="btn btn-outline btn-sm" id="toggle-md">${state.showMd ? "隱藏" : "預覽"} Markdown</button>
        <button type="button" class="btn btn-outline btn-sm" data-briefing-mode="pack">切換完整懶人包簡報</button>
        <button type="button" class="btn btn-amber btn-sm" data-nav="focus">返回本週焦點</button>
      </div>
      <pre class="md-preview ${state.showMd ? "show" : ""}" id="md-block">${esc(md)}</pre>
      <div class="briefing-doc" id="briefing-doc">
        <h1>本週必記｜政策脈搏</h1>
        <div class="meta">${esc(wb ? wb.weekLabel : "")} · ${policies.length} 則 · ${new Date().toLocaleDateString("zh-HK")} · 示範樣本（非即時官方匯入）</div>
        ${wb && wb.executiveSummary ? `<p style="font-size:.9rem;line-height:1.65">${esc(wb.executiveSummary)}</p>` : ""}
        ${policies.map((p, idx) => {
          const mems = (p.memoryPoints || []).slice(0, 3);
          return `
            <div class="must-item">
              <h4>${idx + 1}. ${esc(p.title)}</h4>
              <div class="meta">${esc(p.category)} · ${esc(p.department)} · ${fmtDate(p.date)} · 重要性 ${p.importanceScore}</div>
              <p style="font-size:.88rem;margin:.35rem 0;color:#3d574b">${esc(p.summary)}</p>
              <p style="font-size:.78rem;font-weight:700;color:var(--green-mid);margin:.5rem 0 .2rem">必記要點</p>
              <ul class="must-points">${mems.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
              <p style="font-size:.78rem;color:var(--text-faint);margin:.45rem 0 0">${(p.keyTerms || []).slice(0, 5).map(esc).join(" · ")}</p>
            </div>`;
        }).join("")}
      </div>`;
    }

    return `
      <div class="topbar">
        <div>
          <h2 class="serif">一頁簡報</h2>
          <p class="sub">列印友好 · 可複製 Markdown — ${esc(mode.label)}</p>
        </div>
      </div>
      ${modeToggleHtml()}
      <div class="briefing-actions">
        <button type="button" class="btn btn-amber btn-sm" data-export-must>一鍵本週必記</button>
        <button type="button" class="btn btn-primary btn-sm" onclick="window.print()">列印／匯出 PDF</button>
        <button type="button" class="btn btn-outline btn-sm" id="copy-md">複製 Markdown</button>
        <button type="button" class="btn btn-outline btn-sm" id="toggle-md">${state.showMd ? "隱藏" : "預覽"} Markdown</button>
        <button type="button" class="btn btn-outline btn-sm" data-nav="lazy">由懶人包選取</button>
      </div>
      <pre class="md-preview ${state.showMd ? "show" : ""}" id="md-block">${esc(md)}</pre>
      <div class="briefing-doc" id="briefing-doc">
        <h1>政策脈搏｜JRE 筆試簡報</h1>
        <div class="meta">${esc(mode.label)} · ${policies.length} 則 · ${new Date().toLocaleDateString("zh-HK")} · 示範樣本（非即時官方匯入）</div>
        ${policies.map((p, idx) => {
          const qs = (p.interviewQuestions || []).slice(0, mode.questionCount);
          const mems = (p.memoryPoints || []).slice(0, mode.memoryCount);
          const angles = gsmeacAngles(p, mode.showFullGsmeac);
          return `
            <section style="margin-bottom:1.75rem;page-break-inside:avoid">
              <h2 style="font-size:1.15rem;margin:0 0 .35rem">${idx + 1}. ${esc(p.title)}</h2>
              <div class="meta">${esc(p.category)} · ${esc(p.department)} · ${fmtDate(p.date)} · 重要性 ${p.importanceScore}</div>
              <p style="font-size:.9rem">${esc(p.summary)}</p>
              <h3>政策重點</h3>
              <ul>${(p.policyPoints || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
              <h3>記憶點</h3>
              <ul>${mems.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
              <h3>關鍵詞</h3>
              <p style="font-size:.85rem">${(p.keyTerms || []).map(esc).join(" · ")}</p>
              <h3>GSMEAC 書面角度</h3>
              <ul>${angles.map((d) => `<li><strong>${esc(d.id)} ${esc(d.name)}</strong>：${esc(d.angle)}</li>`).join("")}</ul>
              <h3>筆試題（骨架見懶人包）</h3>
              <ol>${qs.map((q) => `<li>${esc(q)}</li>`).join("")}</ol>
            </section>`;
        }).join("")}
      </div>`;
  }

  function renderHomeLandingStats() {
    const wb = weeklyBundle();
    return `
      <div class="hero">
        <p class="hero-kicker">JRE 筆試 · 政策脈搏升級 DEMO</p>
        <h2>把官方政策，變成可默寫的答題結構。</h2>
        <p>專為公務員考試 JRE 筆試而設：先落判斷、正反論點與建議閘門，加上本週焦點、決策者延伸題、GSMEAC 與本週必記。分類對齊 11 大議題。本頁為本地示範，不含即時政府資料匯入。</p>
        <div class="hero-actions">
          <button type="button" class="btn btn-white" data-nav="focus">打開本週焦點</button>
          <button type="button" class="btn btn-ghost" data-nav="lazy">懶人包</button>
          <button type="button" class="btn btn-ghost" data-export-must>本週必記</button>
          <button type="button" class="btn btn-ghost" data-nav="practice">筆試練習</button>
        </div>
      </div>
      <div class="grid-stats">
        <div class="stat-card"><p class="label">樣本政策</p><p class="value">${POLICY_DATA.length}</p><p class="cap">近一年撮要</p></div>
        <div class="stat-card"><p class="label">本週焦點</p><p class="value">${weeklyFocusCandidates().length}</p><p class="cap">${esc(wb ? wb.weekLabel : "長文分析")}</p></div>
        <div class="stat-card"><p class="label">本週必記</p><p class="value">${mustRememberPolicies().length}</p><p class="cap">一鍵匯出</p></div>
        <div class="stat-card"><p class="label">答題骨架</p><p class="value">4</p><p class="cap">問題·取捨·方案·指標</p></div>
      </div>`;
  }

  function render() {
    $("#nav").innerHTML = renderNav();
    const main = $("#main");
    let body = "";
    switch (state.view) {
      case "focus":
        body = renderFocus();
        break;
      case "lazy":
        body = renderLazyHub();
        break;
      case "pack":
        body = renderPack(byId(state.selectedId));
        break;
      case "detail":
        body = renderDetail(byId(state.selectedId));
        break;
      case "practice":
        body = renderPractice();
        break;
      case "compare":
        body = renderCompare();
        break;
      case "flash":
        body = renderFlash();
        break;
      case "briefing":
        body = renderBriefing();
        break;
      case "home":
      default:
        body = renderHomeLandingStats() + renderHome();
        break;
    }
    main.innerHTML = body;
    bind();
  }

  function bind() {
    $$("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const v = btn.getAttribute("data-nav");
        if (v === "practice" && !state.practiceId) state.practiceId = POLICY_DATA[0].id;
        if (v === "flash") {
          state.flashDeck = [];
          state.flashIndex = 0;
          state.flashFlipped = false;
        }
        if (v === "briefing") {
          state.briefingMode = "must";
          state.briefingIds = mustRememberPolicies().map((p) => p.id);
        }
        if (v === "focus" && !state.focusId) {
          const c = weeklyFocusCandidates();
          state.focusId = c[0] ? c[0].id : null;
        }
        setView(v);
      });
    });

    $$(".mode-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.studyMode = btn.getAttribute("data-mode");
        state.flashDeck = [];
        state.flashIndex = 0;
        if (state.view === "briefing") {
          state.briefingIds = topForMode().map((p) => p.id);
        }
        toast(STUDY_MODES[state.studyMode].label + " 已套用");
        render();
      });
    });

    $$("[data-open-pack]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedId = btn.getAttribute("data-open-pack");
        setView("pack", { id: state.selectedId });
      });
    });

    $$("[data-open-detail]").forEach((btn) => {
      btn.addEventListener("click", () => setView("detail", { id: btn.getAttribute("data-open-detail") }));
    });

    $$("[data-start-practice]").forEach((btn) => {
      btn.addEventListener("click", () => setView("practice", { practiceId: btn.getAttribute("data-start-practice") }));
    });

    $$("[data-compare-add]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-compare-add");
        if (!state.compareA || state.compareA === id) state.compareA = id;
        else state.compareB = id;
        toast("已加入比較");
        setView("compare");
      });
    });

    $$("[data-brief-one]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.briefingMode = "pack";
        state.briefingIds = [btn.getAttribute("data-brief-one")];
        setView("briefing");
      });
    });

    $$("[data-brief-ids]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.briefingIds = btn.getAttribute("data-brief-ids").split(",");
        setView("briefing");
      });
    });

    const daily = $("[data-open-daily-pack]");
    if (daily) {
      daily.addEventListener("click", () => {
        state.briefingMode = "pack";
        state.briefingIds = topForMode().map((p) => p.id);
        setView("briefing");
      });
    }

    const flashMode = $("[data-flash-from-mode]");
    if (flashMode) {
      flashMode.addEventListener("click", () => {
        state.flashDeck = [];
        setView("flash");
      });
    }

    $$("[data-copy-pack-md]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const p = byId(btn.getAttribute("data-copy-pack-md"));
        const md = briefingMarkdown([p]);
        try {
          await navigator.clipboard.writeText(md);
          toast("已複製 Markdown");
        } catch {
          state.showMd = true;
          state.briefingIds = [p.id];
          setView("briefing");
          toast("請在簡報頁手動複製");
        }
      });
    });

    $$("[data-cat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.category = btn.getAttribute("data-cat");
        render();
      });
    });

    const search = $("#search-input");
    if (search) {
      search.addEventListener("input", () => {
        state.query = search.value;
        clearTimeout(state._qT);
        state._qT = setTimeout(() => {
          const pos = search.selectionStart;
          render();
          const again = $("#search-input");
          if (again) {
            again.focus();
            try { again.setSelectionRange(pos, pos); } catch (e) {}
          }
        }, 180);
      });
    }

    const psel = $("#practice-select");
    if (psel) {
      psel.addEventListener("change", () => setView("practice", { practiceId: psel.value }));
    }

    $$("[data-step]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ta = $("#practice-answer");
        if (ta) state.practiceAnswers[GSMEAC[state.practiceStep].id] = ta.value;
        state.practiceStep = Number(btn.getAttribute("data-step"));
        render();
      });
    });

    const saveAns = $("#save-answer");
    if (saveAns) {
      saveAns.addEventListener("click", () => {
        const ta = $("#practice-answer");
        state.practiceAnswers[GSMEAC[state.practiceStep].id] = ta.value;
        toast("已儲存本步要點");
        render();
      });
    }

    const showSk = $("#show-skeleton");
    if (showSk) {
      showSk.addEventListener("click", () => {
        $("#skeleton-slot")?.classList.toggle("hidden");
      });
    }

    const prev = $("#prev-step");
    if (prev) {
      prev.addEventListener("click", () => {
        const ta = $("#practice-answer");
        if (ta) state.practiceAnswers[GSMEAC[state.practiceStep].id] = ta.value;
        state.practiceStep = Math.max(0, state.practiceStep - 1);
        render();
      });
    }
    const next = $("#next-step");
    if (next) {
      next.addEventListener("click", () => {
        const ta = $("#practice-answer");
        if (ta) state.practiceAnswers[GSMEAC[state.practiceStep].id] = ta.value;
        state.practiceStep = Math.min(GSMEAC.length - 1, state.practiceStep + 1);
        render();
      });
    }

    $$("[data-check]").forEach((inp) => {
      inp.addEventListener("change", () => {
        state.practiceChecks[inp.getAttribute("data-check")] = inp.checked;
        render();
      });
    });

    $("#timer-start")?.addEventListener("click", startTimer);
    $("#timer-stop")?.addEventListener("click", () => { stopTimer(); render(); });
    $("#timer-reset")?.addEventListener("click", () => {
      stopTimer();
      state.timerSec = 25 * 60;
      render();
    });

    $("#cmp-a")?.addEventListener("change", (e) => { state.compareA = e.target.value; render(); });
    $("#cmp-b")?.addEventListener("change", (e) => { state.compareB = e.target.value; render(); });

    $("#flashcard")?.addEventListener("click", () => {
      state.flashFlipped = !state.flashFlipped;
      render();
    });
    $("#flash-flip")?.addEventListener("click", () => {
      state.flashFlipped = !state.flashFlipped;
      render();
    });
    $("#flash-prev")?.addEventListener("click", () => {
      state.flashIndex = (state.flashIndex - 1 + state.flashDeck.length) % state.flashDeck.length;
      state.flashFlipped = false;
      render();
    });
    $("#flash-next")?.addEventListener("click", () => {
      state.flashIndex = (state.flashIndex + 1) % state.flashDeck.length;
      state.flashFlipped = false;
      render();
    });
    $("#flash-rebuild")?.addEventListener("click", () => {
      state.flashDeck = buildFlashDeck();
      state.flashIndex = 0;
      state.flashFlipped = false;
      toast("已重建閃卡");
      render();
    });

    $("#copy-md")?.addEventListener("click", async () => {
      const policies = state.briefingMode === "must"
        ? mustRememberPolicies()
        : (state.briefingIds.length ? state.briefingIds : topForMode().map((p) => p.id)).map(byId).filter(Boolean);
      const md = state.briefingMode === "must" ? mustRememberMarkdown(policies) : briefingMarkdown(policies);
      try {
        await navigator.clipboard.writeText(md);
        toast("已複製 Markdown");
      } catch {
        toast("複製失敗，請改用預覽選取");
        state.showMd = true;
        render();
      }
    });
    $("#toggle-md")?.addEventListener("click", () => {
      state.showMd = !state.showMd;
      render();
    });

    $$("[data-focus-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.focusId = btn.getAttribute("data-focus-id");
        setView("focus");
      });
    });

    $$("[data-export-must]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.briefingMode = "must";
        state.briefingIds = mustRememberPolicies().map((p) => p.id);
        state.showMd = false;
        setView("briefing");
        toast("已生成本週必記");
      });
    });

    $$("[data-briefing-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.briefingMode = btn.getAttribute("data-briefing-mode") || "pack";
        if (state.briefingMode === "pack") {
          state.briefingIds = topForMode().map((p) => p.id);
        } else {
          state.briefingIds = mustRememberPolicies().map((p) => p.id);
        }
        render();
      });
    });

    $("#menu-toggle")?.addEventListener("click", () => {
      $("#sidebar")?.classList.toggle("collapsed");
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    // Default landing emphasizes lazy packs
    state.view = "home";
    render();
  });
})();
