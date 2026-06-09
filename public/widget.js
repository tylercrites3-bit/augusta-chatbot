(function () {
  const WIDGET_ID = "augusta-concierge";
  if (document.getElementById(WIDGET_ID)) return;

  const SUGGESTIONS = [
    "What's happening this weekend?",
    "Plan my Saturday in Elkins",
    "Tell me about Bluegrass Week",
    "Where should I eat after a concert?",
  ];

  const root = document.createElement("div");
  root.id = WIDGET_ID;
  root.innerHTML = `
    <button class="aug-fab" aria-label="Open Augusta concierge">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
      </svg>
    </button>
    <div class="aug-panel" role="dialog" aria-label="Augusta concierge">
      <div class="aug-header">
        <div>
          <div class="aug-header-title">Augusta Concierge</div>
          <div class="aug-header-sub">Your guide to Elkins arts & events</div>
        </div>
        <button class="aug-header-close" aria-label="Close">&times;</button>
      </div>
      <div class="aug-messages"></div>
      <div class="aug-suggestions"></div>
      <div class="aug-input-row">
        <textarea class="aug-input" rows="1" placeholder="Ask about workshops, artists, lodging..."></textarea>
        <button class="aug-send">Send</button>
      </div>
      <div class="aug-footer">Powered by Gemini · Augusta Heritage Center</div>
    </div>
  `;
  document.body.appendChild(root);

  const fab = root.querySelector(".aug-fab");
  const panel = root.querySelector(".aug-panel");
  const closeBtn = root.querySelector(".aug-header-close");
  const messagesEl = root.querySelector(".aug-messages");
  const suggestionsEl = root.querySelector(".aug-suggestions");
  const input = root.querySelector(".aug-input");
  const sendBtn = root.querySelector(".aug-send");

  const history = [];
  let opened = false;

  function renderSuggestions() {
    suggestionsEl.innerHTML = "";
    SUGGESTIONS.forEach((s) => {
      const b = document.createElement("button");
      b.className = "aug-suggestion";
      b.textContent = s;
      b.onclick = () => {
        input.value = s;
        send();
      };
      suggestionsEl.appendChild(b);
    });
  }

  function addMessage(role, text) {
    const el = document.createElement("div");
    el.className = `aug-msg ${role}`;
    el.innerHTML = renderInline(text);
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function renderInline(text) {
    const esc = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return esc
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(
        /\[([^\]]+)\]\(([^)\s]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
      )
      .replace(/\n/g, "<br>");
  }

  function showTyping() {
    const el = document.createElement("div");
    el.className = "aug-msg bot aug-typing-wrap";
    el.innerHTML = `<div class="aug-typing"><span></span><span></span><span></span></div>`;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    addMessage("user", text);
    history.push({ role: "user", content: text });
    suggestionsEl.style.display = "none";
    sendBtn.disabled = true;
    const typing = showTyping();
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const data = await r.json();
      typing.remove();
      if (!r.ok) throw new Error(data.error || "Server error");
      addMessage("bot", data.reply);
      history.push({ role: "assistant", content: data.reply });
    } catch (err) {
      typing.remove();
      addMessage("bot", `Sorry, something went wrong: ${err.message}`);
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  }

  function open() {
    if (opened) return;
    opened = true;
    panel.classList.add("open");
    if (history.length === 0) {
      addMessage(
        "bot",
        "Welcome to Augusta Heritage Center! I can help you find upcoming workshops and concerts, connect you with local artists, suggest places to stay and eat in Elkins, and plan your visit. What can I help you with?"
      );
      renderSuggestions();
    }
    setTimeout(() => input.focus(), 100);
  }

  function close() {
    opened = false;
    panel.classList.remove("open");
  }

  fab.onclick = () => (opened ? close() : open());
  closeBtn.onclick = close;
  sendBtn.onclick = send;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
})();
