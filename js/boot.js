// js/boot.js — 依存モジュールの読み込み状況を可視化してから main.js を起動
const V = (globalThis.V ?? "dev");
const files = [
  `./js/main.js?v=${encodeURIComponent(V)}`,
  `./js/rank.js?v=${encodeURIComponent(V)}`,
  `./js/bullets.js?v=${encodeURIComponent(V)}`,
  `./js/spawner.js?v=${encodeURIComponent(V)}`
];

// diag UI 準備
const diag = document.getElementById("diag") || (() => {
  const el = document.createElement("pre");
  el.id = "diag";
  Object.assign(el.style, {
    position:"fixed", left:"12px", top:"12px", zIndex: 9,
    background:"rgba(0,0,0,.6)", border:"1px solid #345", padding:"6px 8px",
    font:"12px/1.4 monospace", color:"#fff", whiteSpace:"pre-wrap",
    maxWidth:"60vw", maxHeight:"70vh", overflow:"auto"
  });
  el.textContent = "boot…";
  document.body.appendChild(el);
  return el;
})();
function log(s){ diag.textContent += `\n${s}`; }

// 1) まず HTTP で存在確認（MIME とサイズも見る）
async function probe(url){
  try {
    const r = await fetch(url, { cache: "no-store" });
    const ct = r.headers.get("content-type") || "";
    if (!r.ok) { log(`❌ ${url} -> HTTP ${r.status}`); return { ok:false, status:r.status }; }
    const txt = await r.text();
    log(`✅ ${url} -> 200 (${ct}) len=${txt.length}`);
    return { ok:true, text:txt, ct };
  } catch (e) {
    log(`❌ ${url} -> ${e.message}`);
    return { ok:false, error:e };
  }
}

// 2) 順に検査
for (const f of files) { /* eslint-disable no-await-in-loop */
  await probe(f);
}

// 3) main.js を import（ここで失敗すると原因とスタックを表示）
try {
  await import(`./js/main.js?v=${encodeURIComponent(V)}`);
  log("🚀 main.js imported. ゲーム初期化へ…");
} catch (e) {
  log("💥 import(main.js) 失敗");
  log(String(e && (e.stack || e.message || e)));
  log("→ 上の ❌ 行に 404 / 構文エラーがないか確認してください。");
}
