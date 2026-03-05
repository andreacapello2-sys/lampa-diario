// ── STATE ────────────────────────────────────────────────────────────────────
let accessToken = null;
let spreadsheetId = null;
let fotoBase64 = null;
let datiRaccolti = {};
let faseCorrente = 0;
let archivioEsistente = [];

// ── AUTH (redirect flow) ──────────────────────────────────────────────────────
function handleLogin() {
  const params = new URLSearchParams({
    client_id: CONFIG.CLIENT_ID,
    redirect_uri: CONFIG.REDIRECT_URI,
    response_type: "token",
    scope: CONFIG.SCOPES,
    include_granted_scopes: "true"
  });
  window.location.href = "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString();
}

function handleLogout() {
  accessToken = null; spreadsheetId = null;
  sessionStorage.removeItem("gtoken");
  mostraSchermata("screen-login");
}

function leggiTokenDaURL() {
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  const token = params.get("access_token");
  if (token) {
    accessToken = token;
    sessionStorage.setItem("gtoken", token);
    // Pulisci l'URL
    history.replaceState(null, "", window.location.pathname);
    return true;
  }
  // Controlla sessionStorage
  const saved = sessionStorage.getItem("gtoken");
  if (saved) { accessToken = saved; return true; }
  return false;
}

// ── INIT ──────────────────────────────────────────────────────────────────────
window.addEventListener("load", async () => {
  if (leggiTokenDaURL()) {
    mostraSchermata("screen-main");
    window.scrollTo(0, 0);
    await inizializzaFoglio();
    caricaArchivio();
  }
});

// ── UTILS UI ─────────────────────────────────────────────────────────────────
function mostraSchermata(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function showTab(id) {
  document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  event.target.classList.add("active");
  if (id === "tab-archivio") caricaArchivio();
}

function aggiungiMessaggio(testo, tipo) {
  const div = document.getElementById("chat-messages");
  const msg = document.createElement("div");
  msg.className = "msg " + tipo;
  msg.innerHTML = testo.replace(/\n/g, "<br>");
  div.appendChild(msg);
  div.scrollTop = div.scrollHeight;
  return msg;
}

function rimuoviLoading() {
  const loading = document.querySelector(".msg.loading");
  if (loading) loading.remove();
}

// ── GOOGLE SHEETS ─────────────────────────────────────────────────────────────
async function sheetsRequest(method, url, body) {
  const resp = await fetch(url, {
    method,
    headers: {
      "Authorization": "Bearer " + accessToken,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return resp.json();
}

async function inizializzaFoglio() {
  // Cerca foglio esistente
  const q = encodeURIComponent(`name='${CONFIG.SPREADSHEET_TITLE}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
    headers: { "Authorization": "Bearer " + accessToken }
  });
  const data = await res.json();

  if (data.files && data.files.length > 0) {
    spreadsheetId = data.files[0].id;
  } else {
    // Crea nuovo foglio
    const nuovo = await sheetsRequest("POST", "https://sheets.googleapis.com/v4/spreadsheets", {
      properties: { title: CONFIG.SPREADSHEET_TITLE },
      sheets: [{ properties: { title: CONFIG.SHEET_NAME } }]
    });
    spreadsheetId = nuovo.spreadsheetId;
    // Intestazioni
    await sheetsRequest("PUT",
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${CONFIG.SHEET_NAME}!A1?valueInputOption=RAW`,
      { values: [CONFIG.COLONNE] }
    );
  }
}

async function leggiArchivio() {
  const res = await sheetsRequest("GET",
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${CONFIG.SHEET_NAME}`
  );
  const rows = res.values || [];
  if (rows.length <= 1) return [];
  return rows.slice(1); // salta intestazioni
}

async function aggiungiRiga(riga) {
  await sheetsRequest("POST",
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${CONFIG.SHEET_NAME}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { values: [riga] }
  );
}

// ── ARCHIVIO UI ───────────────────────────────────────────────────────────────
async function caricaArchivio() {
  if (!spreadsheetId) return;
  document.getElementById("archivio-loading").style.display = "block";
  document.getElementById("archivio-table").style.display = "none";
  document.getElementById("btn-export").style.display = "none";

  archivioEsistente = await leggiArchivio();
  const tbody = document.getElementById("archivio-body");
  tbody.innerHTML = "";

  if (archivioEsistente.length === 0) {
    document.getElementById("archivio-loading").textContent = "Nessuna lampada ancora archiviata.";
    return;
  }

  archivioEsistente.forEach(row => {
    const tr = document.createElement("tr");
    CONFIG.COLONNE.forEach((_, i) => {
      const td = document.createElement("td");
      td.textContent = row[i] || "";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  document.getElementById("archivio-loading").style.display = "none";
  document.getElementById("archivio-table").style.display = "table";
  document.getElementById("btn-export").style.display = "inline-block";
}

function esportaExcel() {
  const rows = [CONFIG.COLONNE, ...archivioEsistente];
  let csv = rows.map(r => r.map(c => `"${(c||"").replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "archivio_lampade.csv";
  a.click();
}

// ── FOTO ──────────────────────────────────────────────────────────────────────
function onFotoCaricata(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (ev) => {
    fotoBase64 = ev.target.result.split(",")[1];
    document.getElementById("foto-preview").src = ev.target.result;
    document.getElementById("preview-container").style.display = "block";
    document.getElementById("upload-area").style.display = "none";
    document.getElementById("chat-container").style.display = "block";
    document.getElementById("chat-messages").innerHTML = "";
    datiRaccolti = {};
    faseCorrente = 0;
    await avviaFlusso();
  };
  reader.readAsDataURL(file);
}

// ── FLUSSO CONVERSAZIONALE ────────────────────────────────────────────────────
async function avviaFlusso() {
  aggiungiMessaggio("Immagine ricevuta! Iniziamo la catalogazione.", "bot");
  await chiediStile();
}

async function chiediStile() {
  const lista = Object.entries(CONFIG.STILI).map(([k,v]) => `${k} — ${v}`).join("\n");
  aggiungiMessaggio(`Qual è lo <strong>stile</strong> della lampada?\n\n${lista}\n\nPuoi rispondere con il codice o il nome.`, "bot");
  faseCorrente = 0;
}

async function chiediTipo() {
  const lista = Object.entries(CONFIG.TIPI).map(([k,v]) => `${k} — ${v}`).join("\n");
  aggiungiMessaggio(`Qual è il <strong>tipo</strong> di lampada?\n\n${lista}\n\nPuoi rispondere con il codice o il nome.`, "bot");
  faseCorrente = 1;
}

function chiediCampo(fase) {
  const domande = {
    2: "Qual è il <strong>colore</strong> della lampada?",
    3: "Qual è il <strong>luogo di acquisto</strong>?",
    4: "Qual è la <strong>data di acquisto</strong>? (formato MM/AAAA, es. 01/2025)",
    5: "Qual è il <strong>prezzo di acquisto</strong>?",
    7: "Ci sono <strong>interventi da effettuare</strong>? (scrivi 'nessuno' se non ce ne sono)"
  };
  aggiungiMessaggio(domande[fase], "bot");
  faseCorrente = fase;
}

async function chiediDescrizione() {
  aggiungiMessaggio("Inserisci una <strong>descrizione</strong> della lampada (materiali, forma, caratteristiche principali).", "bot");
  faseCorrente = 6;
}

// ── INPUT UTENTE ──────────────────────────────────────────────────────────────
async function inviaRisposta() {
  const input = document.getElementById("chat-input");
  const testo = input.value.trim();
  if (!testo) return;
  input.value = "";
  aggiungiMessaggio(testo, "user");
  await elaboraRisposta(testo);
}

async function elaboraRisposta(testo) {
  switch (faseCorrente) {
    case 0: // stile
      const stile = interpretaCodice(testo, CONFIG.STILI);
      if (!stile) { aggiungiMessaggio("Non ho riconosciuto lo stile. Riprova con il codice o il nome.", "bot"); return; }
      datiRaccolti.stile = stile;
      aggiungiMessaggio(`Stile: <strong>${stile.nome}</strong>. Procediamo.`, "bot");
      await chiediTipo();
      break;

    case 1: // tipo
      const tipo = interpretaCodice(testo, CONFIG.TIPI);
      if (!tipo) { aggiungiMessaggio("Non ho riconosciuto il tipo. Riprova con il codice o il nome.", "bot"); return; }
      datiRaccolti.tipo = tipo;
      aggiungiMessaggio(`Tipo: <strong>${tipo.nome}</strong>. Procediamo.`, "bot");
      chiediCampo(2);
      break;

    case 2: datiRaccolti.colore = testo; chiediCampo(3); break;
    case 3: datiRaccolti.luogo = testo; chiediCampo(4); break;

    case 4: // data
      const data = interpretaData(testo);
      if (!data) { aggiungiMessaggio("Formato data non riconosciuto. Usa MM/AAAA (es. 03/2025).", "bot"); return; }
      datiRaccolti.data = data;
      chiediCampo(5);
      break;

    case 5: datiRaccolti.prezzo = testo; await chiediDescrizione(); break;

    case 6: // descrizione
      datiRaccolti.descrizione = testo;
      chiediCampo(7);
      break;

    case 7: // interventi
      datiRaccolti.interventi = testo;
      await salvaRecord();
      break;
  }
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function interpretaCodice(testo, mappa) {
  const t = testo.trim().toLowerCase();
  // Cerca per codice
  for (const [k, v] of Object.entries(mappa)) {
    if (t === k) return { codice: k, nome: v };
  }
  // Cerca per nome
  for (const [k, v] of Object.entries(mappa)) {
    if (t === v.toLowerCase() || v.toLowerCase().includes(t)) return { codice: k, nome: v };
  }
  return null;
}

function interpretaData(testo) {
  // Già in formato MM/AAAA
  if (/^\d{2}\/\d{4}$/.test(testo)) return testo;
  // Testo tipo "gennaio 2025"
  const mesi = ["gennaio","febbraio","marzo","aprile","maggio","giugno",
                 "luglio","agosto","settembre","ottobre","novembre","dicembre"];
  const t = testo.toLowerCase();
  for (let i = 0; i < mesi.length; i++) {
    if (t.includes(mesi[i])) {
      const match = testo.match(/\d{4}/);
      if (match) return String(i+1).padStart(2,"0") + "/" + match[0];
    }
  }
  return null;
}

function generaID(stileCodice, tipoCodice) {
  const prefisso = `${stileCodice}_${tipoCodice}_`;
  let max = 0;
  archivioEsistente.forEach(row => {
    const id = row[0] || "";
    if (id.startsWith(prefisso)) {
      const num = parseInt(id.replace(prefisso, "")) || 0;
      if (num > max) max = num;
    }
  });
  return prefisso + String(max + 1).padStart(3, "0");
}

// ── VOCE ──────────────────────────────────────────────────────────────────────
let recognition = null;
let isRecording = false;

function inizializzaVoce() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    document.getElementById("btn-mic").style.display = "none";
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = "it-IT";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onresult = (e) => {
    const testo = e.results[0][0].transcript;
    document.getElementById("chat-input").value = testo;
    stopVoce();
    inviaRisposta();
  };
  recognition.onerror = () => stopVoce();
  recognition.onend = () => stopVoce();
}

function toggleVoce() {
  if (!recognition) inizializzaVoce();
  if (!recognition) return;
  isRecording ? stopVoce() : startVoce();
}

function startVoce() {
  isRecording = true;
  document.getElementById("btn-mic").classList.add("recording");
  document.getElementById("btn-mic").textContent = "⏹";
  recognition.start();
}

function stopVoce() {
  isRecording = false;
  const btn = document.getElementById("btn-mic");
  if (btn) { btn.classList.remove("recording"); btn.textContent = "🎤"; }
  try { recognition.stop(); } catch(e) {}
}

// ── ANALISI IMMAGINE — disabilitata, descrizione manuale ──────────────────────

// ── SALVATAGGIO ───────────────────────────────────────────────────────────────
async function salvaRecord() {
  aggiungiMessaggio("Salvataggio in corso...", "loading");
  archivioEsistente = await leggiArchivio();

  const id = generaID(datiRaccolti.stile.codice, datiRaccolti.tipo.codice);
  const riga = [
    id,
    datiRaccolti.stile.nome,
    datiRaccolti.tipo.nome,
    datiRaccolti.colore,
    datiRaccolti.luogo,
    datiRaccolti.data,
    datiRaccolti.prezzo,
    datiRaccolti.descrizione,
    datiRaccolti.interventi
  ];

  await aggiungiRiga(riga);
  archivioEsistente.push(riga);

  rimuoviLoading();
  aggiungiMessaggio(`✅ Lampada archiviata con ID <strong>${id}</strong>!\n\nVuoi catalogare un'altra lampada?`, "bot");

  // Pulsante nuova lampada
  const btn = document.createElement("button");
  btn.textContent = "📷 Nuova lampada";
  btn.style.cssText = "margin-top:12px;padding:10px 20px;background:#1a1a2e;color:white;border:none;border-radius:8px;cursor:pointer;font-size:0.95rem;";
  btn.onclick = resetFlusso;
  document.getElementById("chat-messages").appendChild(btn);
}

function resetFlusso() {
  datiRaccolti = {}; faseCorrente = 0; fotoBase64 = null;
  document.getElementById("upload-area").style.display = "block";
  document.getElementById("preview-container").style.display = "none";
  document.getElementById("chat-container").style.display = "none";
  document.getElementById("chat-messages").innerHTML = "";
  document.getElementById("foto-input").value = "";
}
