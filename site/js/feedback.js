"use strict";
// ---------------------------------------------------------------- 의견 보내기
// 화면 맨 아래 '의견·수정 요청 보내기' → 이 화면 (사용자 2026-11-15: 수정 사항·의견을 모아서 텔레그램으로 받기).
// 저장소가 공개라 봇 열쇠(토큰)를 화면에 넣을 수 없어요. 두 가지 길:
//  1) FB_URL(클라우드플레어 무료 우체통, cloudflare/feedback-worker.js)이 있으면 '보내기'만 누르면 바로 텔레그램으로 가요.
//  2) 없거나 실패하면 글을 복사해 봇 대화창에 붙여 넣어요. 봇(bot.py)이 15분마다 읽어서 만든 사람 대화방으로 옮겨요.
const FB_URL = "https://easystock-feedback.thd051130.workers.dev";  // 우체통 주소 (예: https://easystock-feedback.<이름>.workers.dev). 비밀이 아니라 화면에 둬도 돼요
const FB_KINDS = ["수정 요청", "오류", "의견"];
const FB_MAX = 1500;
let fbKind = "수정 요청", fbText = "", fbBusy = false;
try { fbText = localStorage.getItem("fb_draft") || ""; } catch (e) { /* 이번만 */ }
const fbMessage = () => `💬 이지스톡 의견 · ${fbKind}\n${fbText.trim()}`;
function feedbackCard() {
  const bot = DATA && DATA.bot, direct = !!FB_URL;
  const steps = direct ? "" : `<ol class="fb-steps">
      <li><b>복사하고 텔레그램 열기</b>를 누르면 글이 복사되고 봇 대화창이 열려요.</li>
      <li>처음이면 <b>시작</b>을 누르고, 입력칸을 길게 눌러 <b>붙여넣기 → 보내기</b>.</li>
      <li>15분 안에 전달되고, 봇이 "전달했어요"라고 답해요.</li>
    </ol>`;
  const btn = direct ? `<button type="button" class="add fb-send" id="fb-send"${fbText.trim() ? "" : " disabled"}>보내기</button>`
    : bot ? `<button type="button" class="add fb-send" id="fb-send"${fbText.trim() ? "" : " disabled"}>복사하고 텔레그램 열기</button>`
      : `<p class="empty">봇 정보를 아직 못 받았어요. 잠시 뒤 다시 열어 주세요.</p>`;
  return `<section class="card" id="fb-card"><button type="button" class="back" data-back>‹ 뒤로</button><h2 class="stock-name">의견 보내기</h2>
    <p class="muted" style="margin:0">고쳐 줬으면 하는 곳, 오류, 바라는 기능을 적어 주세요. 만든 사람에게 텔레그램으로 가요.</p>
    <div class="chips" role="group" aria-label="종류">${FB_KINDS.map((k) => `<button type="button" data-fb-kind="${k}" aria-pressed="${k === fbKind}">${k}</button>`).join("")}</div>
    <label class="fb-field"><span class="sr">내용</span>
      <textarea id="fb-text" rows="6" maxlength="${FB_MAX}" placeholder="예: 차트 화면에서 글씨가 너무 작아요">${esc(fbText)}</textarea></label>
    <p class="fb-count muted"><span id="fb-n">${fbText.length}</span> / ${FB_MAX}자 · 보내기 전까지 이 폰에 임시로 남아요</p>
    <p class="fb-warn">욕설·비방·협박·타인의 개인정보는 적지 마세요. 보낸 글의 책임은 작성한 본인에게 있으며, 법에 어긋나는 글은 관련 법에 따라 처리될 수 있어요.</p>
    ${btn}
    <p class="fb-done muted" id="fb-done" role="status" hidden></p>
    ${direct && bot ? `<button type="button" class="linkish fb-alt" id="fb-alt" hidden>대신 텔레그램으로 보내기 (복사해서 붙여넣기)</button>` : ""}
    ${steps}
    <p class="muted note" style="margin:10px 0 0">${direct ? "로그인 없이 보낼 수 있어요. 이름·연락처는 받지 않고, 글 내용은 어디에도 공개되지 않아요. 도배를 막으려고 한 곳에서 하루 5통까지 받아요."
      : "텔레그램이 있어야 보낼 수 있어요. 텔레그램 이름이 같이 전달되고, 글 내용은 어디에도 공개되지 않아요. 도배를 막으려고 한 사람 하루 3통까지 받아요."}</p></section>`;
}
function bindFeedback() {
  const ta = $("#fb-text"), send = $("#fb-send"), n = $("#fb-n"), done = $("#fb-done");
  if (!ta) return;
  const say = (msg, ok) => { done.hidden = false; done.textContent = msg; done.classList.toggle("bad", !ok); };
  const saveDraft = () => { remember("fb_draft", fbText); };
  ta.addEventListener("input", () => {
    fbText = ta.value;
    n.textContent = fbText.length;
    if (send) send.disabled = !fbText.trim() || fbBusy;
    saveDraft();
  });
  // 종류는 버튼 불만 바꿔요 (다시 그리지 않아서 화면·입력칸 그대로)
  document.querySelectorAll("[data-fb-kind]").forEach((b) => b.addEventListener("click", () => {
    fbKind = b.dataset.fbKind;
    document.querySelectorAll("[data-fb-kind]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  }));
  if (!send) return;
  const alt = $("#fb-alt");
  if (alt) alt.addEventListener("click", () => viaBot());
  const viaBot = () => {
    // 복사는 누른 순간에 해야 폰 브라우저가 허락해요. 그다음 봇 대화창을 새 창으로 열어요
    const text = fbMessage();
    const copied = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text).then(() => true, () => false) : Promise.resolve(false);
    if (DATA && DATA.bot) window.open(`https://t.me/${encodeURIComponent(DATA.bot)}`, "_blank", "noopener");
    copied.then((ok) => say(ok ? "복사했어요. 텔레그램에서 붙여넣기 → 보내기를 눌러 주세요." : "복사가 안 됐어요. 위 글을 길게 눌러 직접 복사해 주세요.", ok));
  };
  send.addEventListener("click", () => {
    if (!FB_URL) { viaBot(); return; }
    fbBusy = true; send.disabled = true; send.textContent = "보내는 중…";
    fetch(FB_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ kind: fbKind, text: fbText.trim(), screen: stockFrom }) })
      .then((r) => r.json().catch(() => ({})).then((j) => ({ ok: r.ok && j.ok, msg: j.msg })))
      .catch(() => ({ ok: false }))
      .then(({ ok, msg }) => {
        fbBusy = false; send.textContent = "보내기";
        if (ok) { fbText = ""; ta.value = ""; n.textContent = "0"; saveDraft(); say("보냈어요. 고마워요!", true); }
        else {
          send.disabled = !fbText.trim();
          say(msg || "지금은 못 보냈어요. 잠시 뒤 다시 눌러 주세요. 적은 글은 그대로 있어요.", false);
          const alt = $("#fb-alt");
          if (alt) alt.hidden = false;  // 우체통이 안 되면 봇에 붙여 넣는 길로
        }
      });
  });
}
