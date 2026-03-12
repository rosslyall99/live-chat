<script>
(() => {
  // ============================================================
  // ONLY RUN ON THIS PAGE (REMOVE THIS CHECK TO GO SITE-WIDE)
  // ============================================================
  const TEST_PATH = "/live-chat-test";
  if (location.pathname.replace(/\/+$/, "") !== TEST_PATH) return;

  // ============================================================
  // CONFIG
  // ============================================================
  const EDGE_BASE = "https://lkybwbuldybdeyjjqehm.functions.supabase.co";
  const FN_CREATE = "public_create_conversation";
  const FN_SEND   = "public_send_message";
  const FN_GET    = "public_get_messages";
  const FN_LEAVE  = "public_leave_message";
  const FN_STATUS = "public_chat_status";
  const LS_TOKEN  = "phil_customer_token";
  const LS_CONVO  = "phil_convo_id";
  const LS_TRANSCRIPT = "phil_transcript_v2";
  const LS_LASTSEEN   = "phil_last_seen_at_v1";
  const LS_ENDED  = "phil_chat_ended_v1";

  // ============================================================
  // STATE
  // ============================================================
  const state = {
    customer_token: localStorage.getItem(LS_TOKEN) || crypto.randomUUID(),
    convo_id: localStorage.getItem(LS_CONVO) || null,
    transcript: [],
    lastSeenAt: localStorage.getItem(LS_LASTSEEN) || null, // ISO timestamp
    ended: localStorage.getItem(LS_ENDED) === "1",
    offlineMode: false,
  };
  localStorage.setItem(LS_TOKEN, state.customer_token);

  try {
    state.transcript = JSON.parse(localStorage.getItem(LS_TRANSCRIPT) || "[]");
  } catch {
    state.transcript = [];
  }

  function saveTranscript() {
    localStorage.setItem(LS_TRANSCRIPT, JSON.stringify(state.transcript.slice(-300)));
  }
  function saveLastSeen() {
    if (state.lastSeenAt) localStorage.setItem(LS_LASTSEEN, state.lastSeenAt);
  }

  // ============================================================
  // STYLES
  // ============================================================
    const css = `
  :root{
    --phil-ink:#0b1220;
    --phil-ink2:#111827;
    --phil-bg:#f6f7f9;
    --phil-card:#ffffff;
    --phil-border:rgba(17,24,39,.12);
    --phil-muted:rgba(17,24,39,.65);
    --phil-shadow:0 18px 55px rgba(0,0,0,.22);
    --phil-radius:18px;
  }

  #phil-chat-bubble{
    position:fixed;
    right:18px;
    bottom:18px;

    height:64px;
    padding:0 18px;
    border-radius:40px;

    border:0;
    background:#000;
    color:#fff;

    display:flex;
    align-items:center;
    justify-content:center;

    cursor:pointer;
    box-shadow:0 18px 45px rgba(0,0,0,.35);

    z-index:999999;
    transition:transform .12s ease, box-shadow .12s ease;
  }

  #phil-chat-bubble:hover{
    transform:translateY(-2px);
    box-shadow:0 22px 55px rgba(0,0,0,.45);
  }

  .phil-bubble-inner{
    display:flex;
    align-items:center;
    gap:10px;
  }

  .phil-bubble-lion{
    height:26px;
    width:auto;
  }

  .phil-bubble-text{
    font:700 14px system-ui,-apple-system,Segoe UI,Roboto,Arial;
    letter-spacing:.3px;
  }

  /* Unread badge */
  #phil-chat-badge{
    position:absolute;top:-4px;right:-4px;
    min-width:18px;height:18px;border-radius:999px;
    background:#ef4444;color:#fff;
    display:none;align-items:center;justify-content:center;
    font:700 11px system-ui,-apple-system,Segoe UI,Roboto,Arial;
    padding:0 6px;
    box-shadow:0 8px 18px rgba(0,0,0,.18);
    border:2px solid var(--phil-card);
  }

  #phil-chat-panel{
    position:fixed;right:18px;bottom:86px;
    width:360px;max-width:calc(100vw - 36px);
    height:520px;max-height:calc(100vh - 130px);
    border-radius:var(--phil-radius);overflow:hidden;
    box-shadow:var(--phil-shadow);
    background:var(--phil-card);
    display:none;flex-direction:column;
    z-index:999999;border:1px solid var(--phil-border);

    /* animation */
    opacity:0;
    transform:translateY(10px) scale(.98);
    pointer-events:none;
    transition:opacity .16s ease, transform .16s ease;
  }
  #phil-chat-panel.phil-open{
    opacity:1;
    transform:translateY(0) scale(1);
    pointer-events:auto;
  }

  .phil-chat-header{
    position:relative;              /* ADD THIS */
    padding:14px 16px 18px 16px;    /* slightly more breathing room */
    background:linear-gradient(180deg, #0b1220, #0a1020);
    color:#fff;
    display:block;                  /* remove flex */
  }

  .phil-chat-title{
    font:700 14px system-ui,-apple-system,Segoe UI,Roboto,Arial;
    display:flex;flex-direction:column;
    letter-spacing:.2px;
  }
  .phil-chat-sub{
    font:500 12px system-ui,-apple-system,Segoe UI,Roboto,Arial;
    opacity:.82;margin-top:2px;
    display:flex;align-items:center;gap:8px;
  }
  .phil-status-pill{
    display:inline-flex;align-items:center;gap:6px;
    font:600 11px system-ui,-apple-system,Segoe UI,Roboto,Arial;
    padding:4px 8px;border-radius:999px;
    background:rgba(255,255,255,.12);
    opacity:.95;
  }
  .phil-dot{width:8px;height:8px;border-radius:999px;background:#22c55e;display:inline-block}
  .phil-dot.offline{background:#f59e0b}
  .phil-dot.dead{background:#ef4444}

  #phil-chat-close{
    position:absolute;
    top:12px;
    right:12px;
    border:0;
    background:rgba(255,255,255,.12);
    color:#fff;
    font-size:18px;
    line-height:18px;
    cursor:pointer;
    padding:6px 10px;
    border-radius:12px;
    transition:background .12s ease;
  }

  #phil-chat-close:hover{
    background:rgba(255,255,255,.18);
  }

  .phil-chat-body{
    flex:1;padding:12px;
    overflow:auto;background:var(--phil-bg);
  }

  .phil-secondary-btn{
    width:100%;
    height:38px;
    border-radius:12px;
    border:1px solid rgba(17,24,39,.14);
    background:#fff;
    font:700 13px system-ui,-apple-system,Segoe UI,Roboto,Arial;
    cursor:pointer;
  }

  .phil-secondary-btn:hover{background:#f9fafb}

  .phil-msg-row{display:flex;flex-direction:column;margin:10px 0}
  .phil-msg{
    max-width:85%;
    padding:10px 12px;border-radius:14px;
    font:400 13px system-ui,-apple-system,Segoe UI,Roboto,Arial;
    white-space:pre-wrap;line-height:1.35;
    box-shadow:0 1px 0 rgba(0,0,0,.03);
  }
  .phil-msg.customer{
    margin-left:auto;
    background:var(--phil-ink2);color:#fff;
    border-bottom-right-radius:8px;
  }
  .phil-msg.agent{
    margin-right:auto;
    background:#fff;
    border:1px solid var(--phil-border);
    border-bottom-left-radius:8px;
  }
  .phil-time{
    margin-top:4px;
    font:500 11px system-ui,-apple-system,Segoe UI,Roboto,Arial;
    color:var(--phil-muted);
    opacity:.9;
  }
  .phil-time.customer{margin-left:auto;text-align:right}
  .phil-time.agent{margin-right:auto;text-align:left}

  .phil-chat-footer{
    padding:14px 0; /* vertical only */
    border-top:1px solid var(--phil-border);
    background:#fff;
  }

  .phil-grid,
  .phil-row,
  .phil-note {
    padding:0 16px;
  }

  /* keep End Chat aligned with the row */
  #phil-chat-end{
    margin: 6px 16px 0 16px;
    width: calc(100% - 32px);
  }

  .phil-grid{
    display:grid;grid-template-columns:1fr;
    gap:8px;margin-bottom:8px;
  }
  .phil-field{
    display:flex;flex-direction:column;gap:6px;
  }
  .phil-label{
    font:600 12px system-ui,-apple-system,Segoe UI,Roboto,Arial;
    color:rgba(17,24,39,.72);
    padding-left:2px;
  }

  #phil-chat-input,#phil-name,#phil-email{
    height:40px;border-radius:12px;
    border:1px solid rgba(17,24,39,.14);
    padding-left:12px;
    font:400 13px system-ui,-apple-system,Segoe UI,Roboto,Arial;
    outline:none;
    background:#fff;
  }

  #phil-chat-input {
    width: 100%;
  }
    
  #phil-name,#phil-email{
    width:auto;
  }

  #phil-chat-input:focus,#phil-name:focus,#phil-email:focus{
    border-color:rgba(17,24,39,.35);
    box-shadow:0 0 0 3px rgba(17,24,39,.08);
  }

  .phil-chat-info {
    font: 500 12px system-ui,-apple-system,Segoe UI,Roboto,Arial;
    line-height: 1.35;
    opacity: .85;
    margin-top: 8px;
  }

  .phil-row{display:flex;gap:8px}

  #phil-chat-send{
    height:40px;padding:0 14px;border-radius:12px;border:0;
    background:var(--phil-ink);
    color:#fff;font:700 13px system-ui,-apple-system,Segoe UI,Roboto,Arial;
    cursor:pointer;white-space:nowrap;
    transition:opacity .12s ease, transform .12s ease;
  }
  #phil-chat-send:disabled{opacity:.5;cursor:not-allowed}
  #phil-chat-send:not(:disabled):active{transform:translateY(1px)}

  .phil-note{
    font:500 12px system-ui,-apple-system,Segoe UI,Roboto,Arial;
    color:rgba(17,24,39,.70);
    min-height:16px;
  }

  /* Compact End Chat button (full width like input+send row) */
  #phil-chat-end{
    display:none;                /* JS controls this */
    height:36px;
    min-height:24px;
    line-height:24px;

    border-radius:12px;
    border:1px solid rgba(17,24,39,.14);
    background: var(--phil-bg);

    font:700 12px system-ui,-apple-system,Segoe UI,Roboto,Arial;
    cursor:pointer;
    padding:0 12px;
    text-decoration:none;

    /* keep it visually “secondary” */
    opacity:.9;
  }

  #phil-chat-end:hover{
    background:#f9fafb;
    opacity:1;
  }
  
  .phil-ended-field {
  width:100%;
  height:38px;
  border-radius:12px;
  border:1px solid rgba(17,24,39,.14);
  padding:0 12px;
  font:500 13px system-ui,-apple-system,Segoe UI,Roboto,Arial;
  box-sizing:border-box;
}

.phil-ended-textarea {
  width:100%;
  min-height:100px;
  margin: 12px 0;
  border-radius:12px;
  border:1px solid rgba(17,24,39,.14);
  padding:10px 12px;
  font:500 13px system-ui,-apple-system,Segoe UI,Roboto,Arial;
  resize:vertical;
  box-sizing:border-box;
}

.phil-ended-primary {
  width:100%;
  height:38px;
  border-radius:12px;
  border:0;
  background:#0b1220;
  color:#fff;
  font:800 12px system-ui,-apple-system,Segoe UI,Roboto,Arial;
  cursor:pointer;
}`;

  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  // ============================================================
  // MARKUP
  // ============================================================
  const root = document.createElement("div");
  root.innerHTML = `
    <button id="phil-chat-bubble" aria-label="Open chat">
      <span class="phil-bubble-inner">
        <img src="https://images.squarespace-cdn.com/content/v1/5c9c84ab92441b2e0c2fd836/0bd52b7e-4a47-4bf9-9c70-586c7f9b94a7/whiteLion.png?format=300w 300w" class="phil-bubble-lion" />
        <span class="phil-bubble-text">Live Chat</span>
      </span>
      <span id="phil-chat-badge"></span>
    </button>

    <div id="phil-chat-panel" role="dialog" aria-label="Live chat">
      <div class="phil-chat-header">
        <div class="phil-chat-title">
          Live Chat
          <span class="phil-chat-sub">
            <span class="phil-status-pill" id="phil-status-pill">
              <span class="phil-dot" id="phil-status-dot"></span>
              <span id="phil-chat-status">Ask us anything</span>
            </span>
          </span>
          <div class="phil-chat-info" id="phil-chat-info">
            You are chatting with a sales advisor based in Glasgow<br>Replies may be delayed if busy with in-store customers
          </div>
        </div>
        <button id="phil-chat-close" aria-label="Close chat">×</button>
      </div>

      <div class="phil-chat-body" id="phil-chat-body"></div>

      <div class="phil-chat-body" id="phil-chat-offline" style="display:none;">
        <div style="padding:2px 0 8px 0;">
          <input id="phil-offline-name" placeholder="Your name" style="width:100%;height:40px;border-radius:12px;border:1px solid rgba(17,24,39,.14);padding:0 12px;font:400 13px system-ui,-apple-system,Segoe UI,Roboto,Arial;outline:none;box-sizing:border-box;" />
        </div>
        <div style="padding:0 0 8px 0;">
          <input id="phil-offline-email" placeholder="Email address" style="width:100%;height:40px;border-radius:12px;border:1px solid rgba(17,24,39,.14);padding:0 12px;font:400 13px system-ui,-apple-system,Segoe UI,Roboto,Arial;outline:none;box-sizing:border-box;" />
        </div>
        <div style="padding:0 0 10px 0;">
          <textarea id="phil-offline-message" placeholder="How can we help?" style="width:100%;min-height:140px;border-radius:12px;border:1px solid rgba(17,24,39,.14);padding:12px;font:400 13px system-ui,-apple-system,Segoe UI,Roboto,Arial;resize:vertical;box-sizing:border-box;"></textarea>
        </div>
        <button id="phil-offline-send" class="phil-ended-primary">Send message</button>
        <div id="phil-offline-note" style="margin-top:8px;font:500 12px system-ui,-apple-system,Segoe UI,Roboto,Arial;color:rgba(17,24,39,.75);min-height:16px;"></div>
      </div>

      <div class="phil-chat-body" id="phil-chat-ended" style="display:none;"></div>

      <div class="phil-chat-footer" id="phil-chat-footer">
        <div class="phil-grid" id="phil-details">
          <input id="phil-name" placeholder="Your name (required)" />
          <input id="phil-email" placeholder="Email (optional)" />
        </div>
        <div class="phil-row">
          <input id="phil-chat-input" placeholder="Type your message…" />
          <button id="phil-chat-send">Send</button>
        </div>
        <div class="phil-note" id="phil-chat-note"></div>
        <button id="phil-chat-end" class="phil-secondary-btn" style="display:none;">
          End chat
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  // ============================================================
  // UI HELPERS
  // ============================================================
  const bubble = document.getElementById("phil-chat-bubble");
  const panel  = document.getElementById("phil-chat-panel");
  const close  = document.getElementById("phil-chat-close");
  const bodyEl = document.getElementById("phil-chat-body");
  const input  = document.getElementById("phil-chat-input");
  const send   = document.getElementById("phil-chat-send");
  const nameEl = document.getElementById("phil-name");
  const emailEl= document.getElementById("phil-email");
  const note   = document.getElementById("phil-chat-note");
  const status = document.getElementById("phil-chat-status");
  const details = document.getElementById("phil-details");
  const endBtn = document.getElementById("phil-chat-end");
  const badge = document.getElementById("phil-chat-badge");
  const statusPill = document.getElementById("phil-status-pill");
  const statusDot = document.getElementById("phil-status-dot");
  const endedEl = document.getElementById("phil-chat-ended");
  const info = document.getElementById("phil-chat-info");
  const offlineEl = document.getElementById("phil-chat-offline");
  const footerEl = document.getElementById("phil-chat-footer");
  const offlineNameEl = document.getElementById("phil-offline-name");
  const offlineEmailEl = document.getElementById("phil-offline-email");
  const offlineMessageEl = document.getElementById("phil-offline-message");
  const offlineSendBtn = document.getElementById("phil-offline-send");
  const offlineNoteEl = document.getElementById("phil-offline-note");

  let pollTimer = null;
  let syncing = false;
  let sending = false;
  let unreadCount = 0;

  function endChatUI() {
    state.ended = true;
    localStorage.setItem(LS_ENDED, "1");

    // stop polling
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;

    // disable sending
    input.value = "";
    input.disabled = true;
    send.disabled = true;

    // hide “End chat” so it can’t be clicked twice
    endBtn.style.display = "none";

    showEndedScreen();
  }

  function showEndedScreen() {
    // Build a transcript string from current state (local)
    const transcriptText = state.transcript
      .map(m => `${m.sender === "customer" ? "You" : "Slanj"}: ${m.text}`)
      .join("\n");

    endedEl.innerHTML = `
      <div style="padding:14px;">
        <div style="font:800 14px system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#111827;">
          Thanks for chatting with us
        </div>
        <div style="margin-top:6px;font:500 12px system-ui,-apple-system,Segoe UI,Roboto,Arial;color:rgba(17,24,39,.75);line-height:1.35;">
          If you need anything else, don’t hesitate to get in touch.
        </div>

        <a href="/contact" style="display:inline-block;margin-top:10px;font:700 12px system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#0b1220;text-decoration:underline;">
          Go to our contact page
        </a>

        <div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(17,24,39,.12);">
          <div style="font:700 12px system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#111827;">
            Email me this transcript
          </div>
          <div style="display:flex;gap:8px;margin-top:8px;">
            <input id="phil-transcript-email" placeholder="Email address" style="flex:1;height:38px;border-radius:12px;border:1px solid rgba(17,24,39,.14);padding:0 12px;font:500 13px system-ui,-apple-system,Segoe UI,Roboto,Arial;outline:none;">
            <button id="phil-transcript-send" style="height:38px;border-radius:12px;border:0;background:#0b1220;color:#fff;font:800 12px system-ui,-apple-system,Segoe UI,Roboto,Arial;cursor:pointer;padding:0 12px;">
              Send
            </button>
          </div>
          <div id="phil-transcript-note" font:500 12px system-ui,-apple-system,Segoe UI,Roboto,Arial;color:rgba(17,24,39,.75);min-height:16px;"></div>
        </div>

        <div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(17,24,39,.12);">
          <div style="font:700 12px system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#111827;">
            Rate your chat
          </div>
          <div id="phil-rating" style="display:flex;gap:6px;margin-top:8px;">
            ${[1,2,3,4,5].map(n => `<button data-star="${n}" style="width:34px;height:34px;border-radius:10px;border:1px solid rgba(17,24,39,.14);background:#fff;cursor:pointer;font:800 13px system-ui,-apple-system,Segoe UI,Roboto,Arial;">★</button>`).join("")}
          </div>
          <textarea id="phil-rating-comment" class="phil-ended-textarea" placeholder="Any comments (optional)"></textarea>
          <button id="phil-rating-send" class="phil-ended-primary">
            Submit feedback
          </button>
          <div id="phil-rating-note" style="margin-top:6px;font:500 12px system-ui,-apple-system,Segoe UI,Roboto,Arial;color:rgba(17,24,39,.75);min-height:16px;"></div>
        </div>

        <div>
          <button id="phil-start-new" class="phil-secondary-btn">Start a new chat</button>
        </div>

        <textarea id="phil-transcript-hidden" style="display:none;"></textarea>
      </div>
    `;

    const emailInput = endedEl.querySelector("#phil-transcript-email");
    const sendBtn = endedEl.querySelector("#phil-transcript-send");
    const noteEl = endedEl.querySelector("#phil-transcript-note");
    const transcriptField = endedEl.querySelector("#phil-transcript-hidden");

    sendBtn.onclick = async () => {
      const email = emailInput.value.trim();
      if (!email) {
        noteEl.textContent = "Please enter your email";
        return;
      }

      sendBtn.disabled = true;
      noteEl.textContent = "Sending…";

      try {
        const r = await fetch(`${EDGE_BASE}/public_email_transcript`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email,
            transcript: transcriptField.value
          })
        });

        if (!r.ok) {
          noteEl.textContent = "Could not send transcript";
          sendBtn.disabled = false;
          return;
        }

        noteEl.textContent = "Transcript sent ✔";
        emailInput.value = "";
      } catch (e) {
        noteEl.textContent = "Could not send transcript";
        sendBtn.disabled = false;
      }
    };

    let rating = null;
    let ratingSubmitting = false;
    let ratingSubmitted = false;

    endedEl.querySelectorAll("#phil-rating button").forEach((btn) => {
      btn.onclick = () => {
        if (ratingSubmitted) return;

        rating = Number(btn.dataset.star);

        endedEl.querySelectorAll("#phil-rating button").forEach((b) => {
          b.style.background = "#fff";
          b.style.color = "#000";
        });

        btn.style.background = "#0b1220";
        btn.style.color = "#fff";
      };
    });

    endedEl.querySelector("#phil-rating-send").onclick = async () => {
      const comment = endedEl.querySelector("#phil-rating-comment").value;
      const note = endedEl.querySelector("#phil-rating-note");
      const sendBtn = endedEl.querySelector("#phil-rating-send");

      if (ratingSubmitted || ratingSubmitting) return;

      if (!rating) {
        note.textContent = "Please select a rating";
        return;
      }

      ratingSubmitting = true;
      sendBtn.disabled = true;
      note.textContent = "Submitting…";

      try {
        const r = await fetch(`${EDGE_BASE}/public_chat_rating`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            conversation_id: state.convo_id,
            rating,
            comment
          })
        });

        if (!r.ok) {
          note.textContent = "Could not submit feedback";
          sendBtn.disabled = false;
          ratingSubmitting = false;
          return;
        }

        ratingSubmitted = true;
        note.textContent = "Thanks for your feedback ✔";
        endedEl.querySelector("#phil-rating-comment").disabled = true;
      } catch {
        note.textContent = "Could not submit feedback";
        sendBtn.disabled = false;
        ratingSubmitting = false;
      }
    };

    // store transcript in a hidden field so it’s easy to grab
    endedEl.querySelector("#phil-transcript-hidden").value = transcriptText;

    // Switch views
    document.getElementById("phil-chat-body").style.display = "none";
    endedEl.style.display = "block";

    endedEl.querySelector("#phil-start-new").onclick = async () => {
      localStorage.removeItem(LS_CONVO);
      localStorage.removeItem(LS_TOKEN);
      localStorage.removeItem(LS_TRANSCRIPT);
      localStorage.removeItem(LS_LASTSEEN);
      localStorage.removeItem(LS_ENDED);

      state.ended = false;
      input.disabled = false;

      state.convo_id = null;
      state.customer_token = crypto.randomUUID();
      state.transcript = [];
      state.lastSeenAt = null;

      localStorage.setItem(LS_TOKEN, state.customer_token);

      endedEl.style.display = "none";
      document.getElementById("phil-chat-body").style.display = "block";

      const statusData = await getChatStatus();
      applyChatMode(statusData);

      render();
      setSendEnabled();
    };
  }

  function fmtTime(ts) {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
}

  function render() {
    bodyEl.innerHTML = "";

    state.transcript.forEach(m => {
      const row = document.createElement("div");
      row.className = "phil-msg-row";

      const d = document.createElement("div");
      d.className = "phil-msg " + m.sender;
      d.textContent = m.text;

      const t = document.createElement("div");
      t.className = "phil-time " + m.sender;
      t.textContent = fmtTime(m.at || Date.now());

      row.appendChild(d);
      row.appendChild(t);
      bodyEl.appendChild(row);
    });

    bodyEl.scrollTop = bodyEl.scrollHeight;

    // Hide name/email once we have a conversation
    details.style.display = state.convo_id ? "none" : "grid";

    // Show End Chat only for an active (not-ended) conversation
    endBtn.style.display = (state.convo_id && !state.ended) ? "block" : "none";

    // Input is disabled when ended
    input.disabled = !!state.ended;

    // keep badge up to date
    setUnread(unreadCount);

    // keep send button state correct (must respect state.ended)
    setSendEnabled();
    
    if (!state.offlineMode) {
      footerEl.style.display = state.ended ? "none" : "block";
    }        
  }

  function addMsg(sender, text, id) {
    // If we already have this server message id, skip
    if (id && state.transcript.some(x => x.id === id)) return;

    state.transcript.push({ id: id || null, sender, text, at: Date.now() });
    saveTranscript();
    render();
  }
  
  function setBusy(isBusy) {
    sending = !!isBusy;
    setSendEnabled();
  }

  function showLiveLayout() {
    bodyEl.style.display = "block";
    offlineEl.style.display = "none";
    endedEl.style.display = "none";
    footerEl.style.display = state.ended ? "none" : "block";
  }

  function showOfflineLayout() {
    bodyEl.style.display = "none";
    offlineEl.style.display = "block";
    endedEl.style.display = "none";
    footerEl.style.display = "none";
  }

  function showOfflineSuccessScreen() {
    state.ended = true;
    localStorage.setItem(LS_ENDED, "1");

    bodyEl.style.display = "none";
    offlineEl.style.display = "none";
    footerEl.style.display = "none";
    endedEl.style.display = "block";

    endedEl.innerHTML = `
      <div style="padding:14px;">
        <div style="font:800 14px system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#111827;">
          Thanks for your message
        </div>
        <div style="margin-top:6px;font:500 12px system-ui,-apple-system,Segoe UI,Roboto,Arial;color:rgba(17,24,39,.75);line-height:1.35;">
          Your message has been sent and a member of our team will get back to you by email.
        </div>
      </div>
    `;

    setTimeout(() => {
      panel.classList.remove("phil-open");
      setTimeout(() => {
        panel.style.display = "none";
        resetOfflineWidgetAfterSend();
      }, 160);
    }, 1800);
  }

  async function resetOfflineWidgetAfterSend() {
    localStorage.removeItem(LS_CONVO);
    localStorage.removeItem(LS_TRANSCRIPT);
    localStorage.removeItem(LS_LASTSEEN);
    localStorage.removeItem(LS_ENDED);

    state.ended = false;
    state.convo_id = null;
    state.transcript = [];
    state.lastSeenAt = null;

    offlineNameEl.value = "";
    offlineEmailEl.value = "";
    offlineMessageEl.value = "";
    offlineNoteEl.textContent = "";

    const statusData = await getChatStatus();
    applyChatMode(statusData);
    render();
    setSendEnabled();
  }

  function setStatus(mode) {
    // mode: "online" | "offline" | "error"
    if (mode === "online") {
      statusDot.className = "phil-dot";
      status.textContent = state.convo_id ? "You’re connected" : "Ask us anything";
      return;
    }
    if (mode === "offline") {
      statusDot.className = "phil-dot offline";
      status.textContent = "Leave us a message";
      return;
    }
    statusDot.className = "phil-dot dead";
    status.textContent = "Connection issue";
  }

  function setUnread(n) {
    unreadCount = n;
    if (!badge) return;
    if (unreadCount > 0 && panel.style.display !== "flex") {
      badge.style.display = "inline-flex";
      badge.textContent = unreadCount > 9 ? "9+" : String(unreadCount);
    } else {
      badge.style.display = "none";
      badge.textContent = "";
    }
  }

    function setSendEnabled() {
      if (state.ended) {
        send.disabled = true;
        input.disabled = true;
        return;
      }

      const hasText = !!input.value.trim();
      const hasName = !!nameEl.value.trim();
      const hasEmail = !!emailEl.value.trim();

      if (state.offlineMode) {
        send.disabled = sending || !hasText || !hasName || !hasEmail;
        return;
      }

      const needsName = !state.convo_id && !hasName;
      send.disabled = sending || !hasText || needsName;
    }

  // ============================================================
  // NETWORK (small helpers)
  // ============================================================
  async function fetchJsonText(url, payload) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
    const text = await r.text();
    return { r, text };
  }

  async function getChatStatus() {
    try {
      const r = await fetch(`${EDGE_BASE}/${FN_STATUS}`);
      const text = await r.text();

      if (!r.ok) {
        console.log("[PHiL] status check failed:", r.status, text);
        return { mode: "offline", reason: "status_error" };
      }

      return JSON.parse(text);
    } catch (e) {
      console.log("[PHiL] status check failed", e);
      return { mode: "offline", reason: "status_error" };
    }
  }

  function applyChatMode(data) {
    const mode = String(data?.mode || "").toLowerCase();

    if (mode === "live") {
      state.offlineMode = false;
      setStatus("online");
      note.textContent = "";
      input.placeholder = "Type your message…";
      send.textContent = "Send";
      if (info) {
        info.innerHTML = "You are chatting with a sales advisor based in Glasgow<br>Replies may be delayed if busy with in-store customers";
      }
      showLiveLayout();
      render();
      return;
    }

    state.offlineMode = true;
    setStatus("offline");
    note.textContent = "";
    if (info) {
      info.textContent = "Please leave your name, email address and message and we will get back to you.";
    }
    showOfflineLayout();
  }

  async function leaveOfflineMessage() {
    const name = offlineNameEl.value.trim();
    const email = offlineEmailEl.value.trim();
    const message = offlineMessageEl.value.trim();

    if (!name) {
      offlineNoteEl.textContent = "Please enter your name";
      return false;
    }

    if (!email) {
      offlineNoteEl.textContent = "Please enter your email";
      return false;
    }

    if (!message) {
      offlineNoteEl.textContent = "Please enter a message";
      return false;
    }

    offlineSendBtn.disabled = true;
    offlineNoteEl.textContent = "Sending…";

    const { r, text } = await fetchJsonText(`${EDGE_BASE}/${FN_LEAVE}`, {
      name,
      email,
      message,
    });

    if (!r.ok) {
      console.log("[PHiL] leave-message status:", r.status, "body:", text);
      offlineNoteEl.textContent = `Could not send message (HTTP ${r.status})`;
      offlineSendBtn.disabled = false;
      return false;
    }

    offlineSendBtn.disabled = false;
    offlineNoteEl.textContent = "";
    showOfflineSuccessScreen();
    return true;
  }

  async function createConversation(firstMessage) {
    const { r, text } = await fetchJsonText(`${EDGE_BASE}/${FN_CREATE}`, {
      customer_name: nameEl.value.trim(),
      customer_email: emailEl.value.trim() || null,
      message: firstMessage,
    });

    if (r.status === 409) {
      let data = null;
      try { data = JSON.parse(text); } catch {}

      applyChatMode({ mode: "offline" });
      setSendEnabled();
      return null;
    }

    if (!r.ok) {
      console.log("[PHiL] create status:", r.status, "body:", text);
      note.textContent = `Could not start chat (HTTP ${r.status})`;
      return null;
    }

    let data = null;
    try { data = JSON.parse(text); } catch {}
    if (!data?.conversation_id || !data?.customer_token) {
      note.textContent = "Could not start chat (bad response)";
      return null;
    }

    state.convo_id = data.conversation_id;
    state.customer_token = data.customer_token;

    localStorage.setItem(LS_CONVO, state.convo_id);
    localStorage.setItem(LS_TOKEN, state.customer_token);

    setStatus("online");
    note.textContent = "";
    render();

    // After creation, set lastSeenAt to now so polling only pulls new replies
    state.lastSeenAt = new Date().toISOString();
    saveLastSeen();

    return state.convo_id;
  }

  async function sendMessage(message) {
    const { r, text } = await fetchJsonText(`${EDGE_BASE}/${FN_SEND}`, {
      conversation_id: state.convo_id,
      customer_token: state.customer_token,
      message,
    });

    if (!r.ok) {
      console.log("[PHiL] send status:", r.status, "body:", text);
      note.textContent = `Could not send (HTTP ${r.status})`;
      return false;
    }

    note.textContent = "";
    return true;
  }

  async function getMessages(afterIso) {
    const { r, text } = await fetchJsonText(`${EDGE_BASE}/${FN_GET}`, {
      conversation_id: state.convo_id,
      customer_token: state.customer_token,
      after: afterIso || null,
      limit: 200,
    });

    if (!r.ok) {
      console.log("[PHiL] get status:", r.status, "body:", text);

      if (r.status === 403) {
        // Token mismatch or stale convo id: reset local session
        localStorage.removeItem(LS_CONVO);
        localStorage.removeItem(LS_TOKEN);
        localStorage.removeItem(LS_TRANSCRIPT);
        localStorage.removeItem(LS_LASTSEEN);

        state.convo_id = null;
        state.customer_token = crypto.randomUUID();
        state.lastSeenAt = null;
        state.transcript = [];

        localStorage.setItem(LS_TOKEN, state.customer_token);

        status.textContent = "Session reset";
        note.textContent = "Chat session expired — please send your first message again.";
        render();
      }

      return [];
    }

    let data = null;
    try { data = JSON.parse(text); } catch { return []; }
    return data?.messages || [];
  }

  async function syncFromServer() {
    if (syncing) return;
    if (!state.convo_id) return;

    syncing = true;
    try {
      const msgs = await getMessages(state.lastSeenAt);
      if (!msgs.length) return;

      for (const m of msgs) {
        const sender = String(m.sender_type || "").toLowerCase() === "customer" ? "customer" : "agent";

        // If we've already stored this server message, skip
        if (state.transcript.some(x => x.id === m.id)) {
          state.lastSeenAt = m.created_at;
          continue;
        }

        // If this is a customer message, try to "merge" it with the most recent local optimistic customer message
        if (sender === "customer") {
          for (let i = state.transcript.length - 1; i >= 0; i--) {
            const t = state.transcript[i];
            if (t.sender === "customer" && (!t.id || String(t.id).startsWith("local-")) && t.text === m.body) {
              // Replace local optimistic with real server id
              t.id = m.id;
              saveTranscript();
              render();
              state.lastSeenAt = m.created_at;
              break;
            }
            // stop searching once we hit an agent message
            if (t.sender === "agent") break;
          }

          // If it wasn't merged, add normally
          if (!state.transcript.some(x => x.id === m.id)) {
            addMsg("customer", m.body, m.id);
            state.lastSeenAt = m.created_at;
          }
          continue;
        }

        // Agent/staff message: add normally with id
        addMsg("agent", m.body, m.id);

        // If panel is closed, bump unread counter for agent messages
        if (panel.style.display !== "flex") {
          setUnread(unreadCount + 1);
        }

        state.lastSeenAt = m.created_at;
      }
      saveLastSeen();
    } finally {
      syncing = false;
    }
  }

  // ============================================================
  // EVENTS
  // ============================================================
  bubble.onclick = async () => {
    const opening = panel.style.display !== "flex";

    if (opening) {
      panel.style.display = "flex";
      // trigger transition
      requestAnimationFrame(() => panel.classList.add("phil-open"));

      // opening = user has seen messages
      setUnread(0);

      render();
      if (state.ended) {
        showEndedScreen();
        return;
      }
      
      const statusData = await getChatStatus();
      applyChatMode(statusData);

      if (!state.offlineMode) {
        await syncFromServer();
      }

      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;

      if (!state.ended) {
        pollTimer = setInterval(syncFromServer, 5000);
      }
    } else {
      panel.classList.remove("phil-open");
      // wait for transition before hiding
      setTimeout(() => {
        panel.style.display = "none";
      }, 160);

      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      render();

      if (state.ended) {
        // if ended, show the ended screen immediately
        showEndedScreen();
        return;
      }
    }
  };

  close.onclick = () => {
    panel.classList.remove("phil-open");
    setTimeout(() => {
      panel.style.display = "none";
    }, 160);

    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    render();
  };

  send.onclick = async () => {
    const text = input.value.trim();
    if (!text) return;

    // Require name for FIRST message only
    if (!state.convo_id && !nameEl.value.trim()) {
      note.textContent = "Please enter your name";
      return;
    }

    // optimistic UI
    addMsg("customer", text, "local-" + Date.now());
    input.value = "";
    note.textContent = "";
    setBusy(true);

    try {
    if (!state.convo_id) {
      const localId = state.transcript[state.transcript.length - 1]?.id;
      const convoId = await createConversation(text);

      if (!convoId) {
        state.transcript = state.transcript.filter((m) => m.id !== localId);
        saveTranscript();
        render();
        return;
      }

      return;
    }
      await sendMessage(text);
    } finally {
      setBusy(false);
    }
  };

  endBtn.onclick = () => {
    endChatUI();
  };

  // Enable/disable send button as user types
  input.addEventListener("input", setSendEnabled);

  // Also watch name field (for first message requirement)
  nameEl.addEventListener("input", setSendEnabled);
  emailEl.addEventListener("input", setSendEnabled);

  // Enter to send
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      send.click();
    }
  });

  offlineSendBtn.onclick = async () => {
    await leaveOfflineMessage();
  };

  offlineNameEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      offlineSendBtn.click();
    }
  });

  offlineEmailEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      offlineSendBtn.click();
    }
  });

  (async function initChatWidget() {
    render();
    const statusData = await getChatStatus();
    applyChatMode(statusData);
    setSendEnabled();
  })();
})();
</script>