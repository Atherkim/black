"use strict";
/* ============================================================
   펠트 · 멀티플레이 블랙잭
   Firebase Realtime Database를 공유 상태 저장소로 사용합니다.

   설계 방식 (README.md "동작 원리" 참고):
   - 별도 서버 없이, 방에 있는 브라우저들이 같은 DB 경로를 구독합니다.
   - "누구 차례인가"에 따라 그 사람의 브라우저가 상태를 씁니다.
   - 라운드 전환처럼 동시에 여러 명이 트리거할 수 있는 지점은
     Firebase transaction()으로 한 번만 실행되도록 보호합니다.
   ============================================================ */

// ---------------- 카드 유틸 ----------------
const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const SUITS = ["S","H","D","C"];
const SUIT_GLYPH = { S:"♠", H:"♥", D:"♦", C:"♣" };

function makeDeck(){
  const deck = [];
  for(const s of SUITS) for(const r of RANKS) deck.push(r+s);
  return deck;
}
function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}
function rankOf(code){ return code.slice(0,-1); }
function suitOf(code){ return code.slice(-1); }
function handValue(hand){
  let total=0, aces=0;
  (hand||[]).forEach(code=>{
    const r = rankOf(code);
    if(r==="A"){ aces++; total+=11; }
    else if(r==="K"||r==="Q"||r==="J") total+=10;
    else total += parseInt(r,10);
  });
  while(total>21 && aces>0){ total-=10; aces--; }
  return total;
}
function isBlackjack(hand){ return (hand||[]).length===2 && handValue(hand)===21; }
function findFirstPlayable(order, players, fromIndex){
  for(let i=fromIndex;i<order.length;i++){
    const p = players[order[i]];
    if(p && p.status==="playing") return order[i];
  }
  return null;
}
function randomCode(){
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s=""; for(let i=0;i<5;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

// ---------------- 플레이어 식별 (로컬 브라우저 기준) ----------------
function getPlayerId(){
  let id = localStorage.getItem("bj_pid");
  if(!id){
    id = "p" + Math.random().toString(36).slice(2,10);
    localStorage.setItem("bj_pid", id);
  }
  return id;
}
const myId = getPlayerId();

// ---------------- DOM 참조 ----------------
const landing = document.getElementById("landing");
const table = document.getElementById("table");
const playerNameInput = document.getElementById("playerName");
const roomCodeInput = document.getElementById("roomCode");
const btnCreate = document.getElementById("btnCreate");
const btnJoin = document.getElementById("btnJoin");
const landingError = document.getElementById("landingError");

const roomCodeDisplay = document.getElementById("roomCodeDisplay");
const btnCopyRoom = document.getElementById("btnCopyRoom");
const btnLeave = document.getElementById("btnLeave");
const btnNextRound = document.getElementById("btnNextRound");

const dealerHandEl = document.getElementById("dealerHand");
const dealerTotalEl = document.getElementById("dealerTotal");
const phaseLabelEl = document.getElementById("phaseLabel");
const logEl = document.getElementById("log");
const seatsEl = document.getElementById("seats");

const betControls = document.getElementById("betControls");
const betInput = document.getElementById("betInput");
const btnBet = document.getElementById("btnBet");

const turnControls = document.getElementById("turnControls");
const btnHit = document.getElementById("btnHit");
const btnStand = document.getElementById("btnStand");

const hostControls = document.getElementById("hostControls");
const btnStartRound = document.getElementById("btnStartRound");

const waitingHint = document.getElementById("waitingHint");

playerNameInput.value = localStorage.getItem("bj_name") || "";

// ---------------- 상태 ----------------
let currentRoomCode = null;
let latestState = null;

function showError(msg){ landingError.textContent = msg; }

// ---------------- 방 만들기 / 참가하기 ----------------
btnCreate.addEventListener("click", async () => {
  const name = playerNameInput.value.trim();
  if(!name){ showError("닉네임을 입력해주세요."); return; }
  localStorage.setItem("bj_name", name);
  btnCreate.disabled = true;
  try{
    const code = (roomCodeInput.value.trim().toUpperCase()) || randomCode();
    const ref = db.ref("rooms/"+code);
    const snap = await ref.get();
    if(snap.exists()){
      showError("이미 존재하는 방 코드예요. '기존 테이블 참가'를 이용해주세요.");
      return;
    }
    await ref.set({
      hostId: myId,
      phase: "lobby",
      deck: shuffle(makeDeck()),
      dealer: { hand: [], holeHidden: true },
      players: {
        [myId]: { name, chips: 1000, hand: [], bet: 0, status: "waiting", joinedAt: Date.now() }
      },
      turnOrder: [],
      currentTurn: null
    });
    await pushLogMsgFor(code, `${name}님이 테이블 [${code}]를 만들었어요.`);
    enterRoom(code);
  } catch(err){
    console.error(err);
    showError("방을 만들지 못했어요. firebase-config.js 설정을 확인해주세요.");
  } finally {
    btnCreate.disabled = false;
  }
});

btnJoin.addEventListener("click", async () => {
  const name = playerNameInput.value.trim();
  const code = roomCodeInput.value.trim().toUpperCase();
  if(!name){ showError("닉네임을 입력해주세요."); return; }
  if(!code){ showError("참가할 방 코드를 입력해주세요."); return; }
  localStorage.setItem("bj_name", name);
  btnJoin.disabled = true;
  try{
    const ref = db.ref("rooms/"+code);
    const snap = await ref.get();
    if(!snap.exists()){ showError("존재하지 않는 방 코드예요."); return; }
    const state = snap.val();
    if(state.players && state.players[myId]){
      await ref.child(`players/${myId}/name`).set(name);
    } else {
      await ref.child(`players/${myId}`).set({
        name, chips: 1000, hand: [], bet: 0, status: "waiting", joinedAt: Date.now()
      });
      await pushLogMsgFor(code, `${name}님이 테이블에 참가했어요.`);
    }
    enterRoom(code);
  } catch(err){
    console.error(err);
    showError("참가하지 못했어요. firebase-config.js 설정을 확인해주세요.");
  } finally {
    btnJoin.disabled = false;
  }
});

function enterRoom(code){
  currentRoomCode = code;
  landing.hidden = true;
  table.hidden = false;
  roomCodeDisplay.textContent = code;
  db.ref("rooms/"+code).on("value", snap => {
    const state = snap.val();
    if(!state) return;
    latestState = state;
    render(state);
    maybeTriggerDeal(state);
    maybeTriggerDealer(state);
  });
}

btnLeave.addEventListener("click", () => {
  if(currentRoomCode) db.ref("rooms/"+currentRoomCode).off();
  currentRoomCode = null;
  latestState = null;
  table.hidden = true;
  landing.hidden = false;
});

btnCopyRoom.addEventListener("click", () => {
  if(!currentRoomCode) return;
  navigator.clipboard.writeText(currentRoomCode).then(() => {
    btnCopyRoom.textContent = "복사됨!";
    setTimeout(() => (btnCopyRoom.textContent = "복사"), 1200);
  });
});

// ---------------- 로그 ----------------
function pushLogMsgFor(code, msg){
  return db.ref(`rooms/${code}/log`).push({ msg, ts: Date.now() });
}
function pushLogMsg(msg){
  if(!currentRoomCode) return Promise.resolve();
  return pushLogMsgFor(currentRoomCode, msg);
}

// ---------------- 라운드 시작 (로비 → 베팅) ----------------
btnStartRound.addEventListener("click", async () => {
  if(!currentRoomCode) return;
  await db.ref(`rooms/${currentRoomCode}/phase`).transaction(cur => cur === "lobby" ? "betting" : undefined);
  await pushLogMsg("베팅 라운드가 시작됐어요.");
});

// ---------------- 베팅 ----------------
btnBet.addEventListener("click", async () => {
  const amt = parseInt(betInput.value, 10);
  if(!amt || amt < 10){ alert("최소 10칩 이상 베팅해주세요."); return; }
  const ref = db.ref(`rooms/${currentRoomCode}`);
  const snap = await ref.get();
  const state = snap.val();
  const me = state.players[myId];
  if(!me) return;
  if(amt > me.chips){ alert("보유 칩보다 많이 베팅할 수 없어요."); return; }
  await ref.update({
    [`players/${myId}/bet`]: amt,
    [`players/${myId}/chips`]: me.chips - amt,
    [`players/${myId}/status`]: "betPlaced"
  });
  await pushLogMsg(`${me.name}님이 ${amt}칩 베팅했어요.`);
});

// 모든 플레이어가 베팅을 마치면, 그 순간을 감지한 클라이언트 중
// 하나만 딜링 권한을 획득해 카드를 돌립니다.
function maybeTriggerDeal(state){
  if(state.phase !== "betting") return;
  const ids = Object.keys(state.players || {});
  if(ids.length === 0) return;
  const allBet = ids.every(id => state.players[id].status === "betPlaced");
  if(!allBet) return;
  claimAndDeal();
}
async function claimAndDeal(){
  const res = await db.ref(`rooms/${currentRoomCode}/phase`).transaction(cur => cur === "betting" ? "dealing" : undefined);
  if(res.committed && res.snapshot.val() === "dealing"){
    await performDeal();
  }
}
async function performDeal(){
  const ref = db.ref(`rooms/${currentRoomCode}`);
  const snap = await ref.get();
  const state = snap.val();
  const playerIds = Object.keys(state.players).sort((a,b) => state.players[a].joinedAt - state.players[b].joinedAt);

  let deck = state.deck ? state.deck.slice() : [];
  const need = playerIds.length * 2 + 2;
  if(deck.length < need + 15) deck = shuffle(makeDeck());

  const players = {};
  playerIds.forEach(pid => { players[pid] = { ...state.players[pid], hand: [], status: "playing" }; });
  let dealerHand = [];
  for(let round=0; round<2; round++){
    playerIds.forEach(pid => { players[pid].hand = [...players[pid].hand, deck.pop()]; });
    dealerHand = [...dealerHand, deck.pop()];
  }
  playerIds.forEach(pid => {
    if(isBlackjack(players[pid].hand)) players[pid].status = "blackjack";
  });
  const firstTurn = findFirstPlayable(playerIds, players, 0);

  await ref.update({
    deck,
    players,
    dealer: { hand: dealerHand, holeHidden: true },
    turnOrder: playerIds,
    currentTurn: firstTurn,
    phase: "playing"
  });
  await pushLogMsg("카드를 딜링했어요. 각자 차례에 히트/스탠드를 선택하세요.");
}

// ---------------- 히트 / 스탠드 ----------------
function isMyTurn(){
  return latestState && latestState.phase === "playing" && latestState.currentTurn === myId;
}
function nextTurnId(state, afterId){
  const order = state.turnOrder || [];
  return findFirstPlayable(order, state.players, order.indexOf(afterId) + 1);
}

btnHit.addEventListener("click", async () => {
  if(!isMyTurn()) return;
  const ref = db.ref(`rooms/${currentRoomCode}`);
  const snap = await ref.get();
  const state = snap.val();
  const deck = state.deck.slice();
  const card = deck.pop();
  const me = state.players[myId];
  const newHand = [...me.hand, card];
  const val = handValue(newHand);
  const status = val > 21 ? "bust" : (val === 21 ? "stand" : "playing");

  const updates = {
    [`players/${myId}/hand`]: newHand,
    [`players/${myId}/status`]: status,
    deck
  };
  if(status !== "playing") updates.currentTurn = nextTurnId(state, myId);

  await ref.update(updates);
  await pushLogMsg(`${me.name}님이 히트 → 합계 ${val}${status === "bust" ? " (버스트!)" : ""}`);
});

btnStand.addEventListener("click", async () => {
  if(!isMyTurn()) return;
  const ref = db.ref(`rooms/${currentRoomCode}`);
  const snap = await ref.get();
  const state = snap.val();
  const me = state.players[myId];
  await ref.update({
    [`players/${myId}/status`]: "stand",
    currentTurn: nextTurnId(state, myId)
  });
  await pushLogMsg(`${me.name}님이 스탠드 (합계 ${handValue(me.hand)})`);
});

// ---------------- 딜러 자동 진행 + 정산 ----------------
// 마지막 플레이어가 끝나 currentTurn이 null이 되면, 그 순간을 감지한
// 클라이언트 중 하나만 딜러 진행 권한을 획득합니다.
function maybeTriggerDealer(state){
  if(state.phase === "playing" && state.currentTurn === null){
    claimAndRunDealer();
  }
}
async function claimAndRunDealer(){
  const res = await db.ref(`rooms/${currentRoomCode}/phase`).transaction(cur => cur === "playing" ? "dealer" : undefined);
  if(res.committed && res.snapshot.val() === "dealer"){
    await runDealerAndSettle();
  }
}
async function runDealerAndSettle(){
  const ref = db.ref(`rooms/${currentRoomCode}`);
  const snap = await ref.get();
  const state = snap.val();
  let deck = state.deck.slice();
  let dealerHand = state.dealer.hand.slice();
  const playerIds = state.turnOrder;
  const players = { ...state.players };

  const anyoneLeftStanding = playerIds.some(pid => players[pid].status === "stand" || players[pid].status === "blackjack");
  if(anyoneLeftStanding){
    while(handValue(dealerHand) < 17) dealerHand.push(deck.pop());
  }
  const dealerTotal = handValue(dealerHand);
  const dealerBJ = isBlackjack(dealerHand);
  const dealerBust = dealerTotal > 21;

  playerIds.forEach(pid => {
    const p = players[pid];
    let result, chipsDelta = 0;
    if(p.status === "bust"){
      result = "lose";
    } else if(p.status === "blackjack"){
      if(dealerBJ){ result = "push"; chipsDelta = p.bet; }
      else { result = "blackjack-win"; chipsDelta = Math.floor(p.bet * 2.5); }
    } else {
      const val = handValue(p.hand);
      if(dealerBust || val > dealerTotal){ result = "win"; chipsDelta = p.bet * 2; }
      else if(val === dealerTotal){ result = "push"; chipsDelta = p.bet; }
      else { result = "lose"; }
    }
    players[pid] = { ...p, result, chips: p.chips + chipsDelta };
  });

  await ref.update({
    deck,
    dealer: { hand: dealerHand, holeHidden: false },
    players,
    phase: "results",
    currentTurn: null
  });
  await pushLogMsg(`딜러 합계 ${dealerTotal}${dealerBust ? " (버스트!)" : ""} — 정산 완료`);
}

// ---------------- 다음 라운드 ----------------
btnNextRound.addEventListener("click", async () => {
  const res = await db.ref(`rooms/${currentRoomCode}/phase`).transaction(cur => cur === "results" ? "resetting" : undefined);
  if(!(res.committed && res.snapshot.val() === "resetting")) return;

  const ref = db.ref(`rooms/${currentRoomCode}`);
  const snap = await ref.get();
  const state = snap.val();
  const players = {};
  Object.keys(state.players).forEach(pid => {
    players[pid] = { ...state.players[pid], hand: [], bet: 0, status: "waiting", result: null };
  });
  let deck = state.deck || [];
  if(deck.length < 20) deck = shuffle(makeDeck());

  await ref.update({
    players,
    deck,
    dealer: { hand: [], holeHidden: true },
    turnOrder: [],
    currentTurn: null,
    phase: "betting"
  });
  await pushLogMsg("새 라운드를 시작합니다 — 베팅해주세요.");
});

// ---------------- 렌더링 ----------------
function cardEl(code, faceDown){
  const div = document.createElement("div");
  if(faceDown){ div.className = "card card--back"; return div; }
  const rank = rankOf(code), suit = suitOf(code);
  const isRed = suit === "H" || suit === "D";
  div.className = "card" + (isRed ? " is-red" : "");
  div.innerHTML =
    `<span class="card__corner">${rank}${SUIT_GLYPH[suit]}</span>` +
    `<span class="card__glyph">${SUIT_GLYPH[suit]}</span>` +
    `<span class="card__corner card__corner--bottom">${rank}${SUIT_GLYPH[suit]}</span>`;
  return div;
}
function renderHandInto(container, hand, hideIndex){
  container.innerHTML = "";
  (hand || []).forEach((code, i) => container.appendChild(cardEl(code, i === hideIndex)));
}

function statusLabel(p, phase){
  if(phase === "results" && p.result){
    switch(p.result){
      case "win": return { text: `승리 +${p.bet}`, cls: "win" };
      case "blackjack-win": return { text: `블랙잭! +${Math.floor(p.bet*1.5)}`, cls: "win" };
      case "push": return { text: "푸시 (베팅 반환)", cls: "" };
      case "lose": return { text: "패배", cls: "bust" };
    }
  }
  switch(p.status){
    case "waiting": return { text: "대기 중", cls: "" };
    case "betPlaced": return { text: "베팅 완료", cls: "" };
    case "playing": return { text: "진행 중", cls: "" };
    case "blackjack": return { text: "블랙잭!", cls: "win" };
    case "stand": return { text: `스탠드 (${handValue(p.hand)})`, cls: "" };
    case "bust": return { text: "버스트", cls: "bust" };
    default: return { text: "", cls: "" };
  }
}
function phaseLabelText(state){
  const count = Object.keys(state.players || {}).length;
  switch(state.phase){
    case "lobby": return `참가자를 기다리는 중… (${count}명)`;
    case "betting": return "베팅 라운드";
    case "dealing": return "카드를 딜링하는 중…";
    case "playing": {
      const p = state.players[state.currentTurn];
      return p ? `${p.name}님의 차례` : "진행 중…";
    }
    case "dealer": return "딜러가 카드를 진행하는 중…";
    case "resetting": return "다음 라운드를 준비하는 중…";
    case "results": return "라운드 결과";
    default: return "";
  }
}

function render(state){
  // 딜러
  const hidden = state.dealer && state.dealer.holeHidden;
  renderHandInto(dealerHandEl, state.dealer ? state.dealer.hand : [], hidden ? 1 : -1);
  dealerTotalEl.textContent = hidden ? "?" : handValue(state.dealer ? state.dealer.hand : []);

  // 상태 라벨 + 로그
  phaseLabelEl.textContent = phaseLabelText(state);
  const logEntries = Object.values(state.log || {}).sort((a,b) => a.ts - b.ts).slice(-20);
  logEl.innerHTML = logEntries.map(e => `<div>${escapeHtml(e.msg)}</div>`).join("");
  logEl.scrollTop = logEl.scrollHeight;

  // 좌석
  const order = (state.turnOrder && state.turnOrder.length)
    ? state.turnOrder
    : Object.keys(state.players || {}).sort((a,b) => state.players[a].joinedAt - state.players[b].joinedAt);

  seatsEl.innerHTML = "";
  order.forEach(pid => {
    const p = state.players[pid];
    if(!p) return;
    const seat = document.createElement("div");
    seat.className = "seat" +
      (pid === state.currentTurn ? " seat--active" : "") +
      (pid === myId ? " seat--you" : "");

    const nameRow = document.createElement("div");
    nameRow.className = "seat__name";
    nameRow.innerHTML = `${escapeHtml(p.name || "???")} ${pid === myId ? '<span class="badge-you">나</span>' : ""}`;

    const chips = document.createElement("div");
    chips.className = "seat__chips";
    chips.textContent = `${p.chips}칩` + (p.bet ? ` · 베팅 ${p.bet}` : "");

    const handEl = document.createElement("div");
    handEl.className = "hand";
    renderHandInto(handEl, p.hand, -1);

    const label = statusLabel(p, state.phase);
    const statusEl = document.createElement("div");
    statusEl.className = "seat__status" + (label.cls ? ` seat__status--${label.cls}` : "");
    statusEl.textContent = label.text;

    seat.append(nameRow, chips, handEl, statusEl);
    seatsEl.appendChild(seat);
  });

  // 컨트롤 표시
  betControls.hidden = true;
  turnControls.hidden = true;
  hostControls.hidden = true;
  waitingHint.hidden = true;
  btnNextRound.hidden = true;

  const me = state.players ? state.players[myId] : null;

  if(state.phase === "lobby"){
    hostControls.hidden = false;
    const count = Object.keys(state.players || {}).length;
    btnStartRound.disabled = count < 2;
  } else if(state.phase === "betting"){
    if(me && me.status !== "betPlaced") betControls.hidden = false;
    else { waitingHint.hidden = false; waitingHint.textContent = "베팅 완료 — 다른 참가자를 기다리는 중…"; }
  } else if(state.phase === "dealing"){
    waitingHint.hidden = false; waitingHint.textContent = "카드를 섞고 딜링하는 중…";
  } else if(state.phase === "playing"){
    if(state.currentTurn === myId) turnControls.hidden = false;
    else {
      waitingHint.hidden = false;
      const n = state.players[state.currentTurn] ? state.players[state.currentTurn].name : "";
      waitingHint.textContent = n ? `${n}님의 차례를 기다리는 중…` : "진행 중…";
    }
  } else if(state.phase === "dealer"){
    waitingHint.hidden = false; waitingHint.textContent = "딜러가 카드를 진행하는 중…";
  } else if(state.phase === "results"){
    btnNextRound.hidden = false;
    waitingHint.hidden = false; waitingHint.textContent = '다음 라운드를 원하면 "다음 라운드" 버튼을 눌러주세요.';
  }
}
