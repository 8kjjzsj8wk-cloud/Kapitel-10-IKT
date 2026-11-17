/* =========================================================================
   Kapitel 10 · Sicher recherchieren – interaktives Arbeitsheft
   Lehrmittel Kommunikation, Kapitel 10 «Sicherheit bei Recherchen im Internet»
   Keine externen Abhängigkeiten: Icons, Illustrationen und Töne entstehen im Code.
   ========================================================================= */
(() => {
  'use strict';

  /* =====================================================================
   * 1. HILFSFUNKTIONEN
   * ===================================================================== */
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const hash = (str) => [...String(str)].reduce((h, c) => ((h << 5) + h + c.charCodeAt(0)) >>> 0, 5381);
  const reducedMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function seeded(seed) { // mulberry32 – liefert pro Tag dieselbe Zufallsfolge
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), s | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rnd = Math.random) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const dateLong = (d = new Date()) => d.toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' });

  function timeAgo(ts) {
    const min = Math.max(0, Math.round((Date.now() - ts) / 60000));
    if (min < 1) return 'gerade eben';
    if (min < 60) return `vor ${min} Min`;
    const h = Math.floor(min / 60);
    return `vor ${h} Std`;
  }

  function untilMidnight() {
    const ms = Math.max(0, startOfDay() + 864e5 - Date.now());
    const h = Math.floor(ms / 36e5), m = Math.floor((ms % 36e5) / 6e4);
    return h ? `${h} Std ${m} Min` : `${m} Min`;
  }

  /* =====================================================================
   * 2. SPEICHER (localStorage, absturzsicher)
   * ===================================================================== */
  const KEYS = { profile: 'k10:profile:v1', board: 'k10:board:v1', sound: 'k10:sound:v1', player: 'k10:player:v1', mine: 'k10:mine:v1' };
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
    },
    remove(key) { try { localStorage.removeItem(key); } catch { /* Speicher nicht verfügbar */ } },
  };

  /* =====================================================================
   * 3. SOUND-ENGINE (Web Audio API, keine Audiodateien)
   * ===================================================================== */
  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.enabled = store.get(KEYS.sound, true) !== false;
    }

    // AudioContext erst bei der ersten Nutzer-Interaktion erzeugen (Autoplay-Regeln der Browser)
    ensure() {
      if (!this.enabled) return null;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!this.ctx) {
        try {
          this.ctx = new AC();
          const comp = this.ctx.createDynamicsCompressor();
          comp.threshold.value = -20; comp.knee.value = 18; comp.ratio.value = 4;
          this.master = this.ctx.createGain();
          this.master.gain.value = 0.5;
          this.master.connect(comp);
          comp.connect(this.ctx.destination);
        } catch { this.ctx = null; return null; }
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.ctx;
    }

    setEnabled(on) {
      this.enabled = !!on;
      store.set(KEYS.sound, this.enabled);
      if (!this.enabled && this.ctx) this.ctx.suspend().catch(() => {});
    }

    tone({ type = 'sine', from, to = from, start = 0, dur = 0.2, gain = 0.15, attack = 0.006, lowpass = null }) {
      const ctx = this.ensure();
      if (!ctx) return;
      const t0 = ctx.currentTime + start + 0.005;
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(from, t0);
      if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(gain, t0 + attack);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      let node = osc;
      if (lowpass) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = lowpass; f.Q.value = 0.6;
        osc.connect(f); node = f;
      }
      node.connect(env);
      env.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    }

    // weicher, hölzerner «Pop» (150 → 300 Hz) mit feinem Obertön-Tick, damit er auch auf Handy-Lautsprechern hörbar ist
    click() {
      this.tone({ type: 'triangle', from: 150, to: 300, dur: 0.04, gain: 0.3, attack: 0.002, lowpass: 1600 });
      this.tone({ type: 'sine', from: 1200, to: 900, dur: 0.025, gain: 0.035, attack: 0.001 });
    }

    // Karte umdrehen: kurzer Wisch nach oben, dann leiser Ausklang
    flip() {
      this.tone({ type: 'triangle', from: 220, to: 460, dur: 0.08, gain: 0.18, attack: 0.003, lowpass: 2200 });
      this.tone({ type: 'sine', from: 900, to: 620, start: 0.05, dur: 0.1, gain: 0.04, lowpass: 2400 });
    }

    // warme grosse Terz C5 + E5
    correct() {
      this.tone({ type: 'sine', from: 523.25, dur: 0.6, gain: 0.15, attack: 0.008 });
      this.tone({ type: 'triangle', from: 659.25, start: 0.06, dur: 0.75, gain: 0.1, attack: 0.01 });
      this.tone({ type: 'sine', from: 1046.5, start: 0.06, dur: 0.3, gain: 0.02 });
    }

    // gedämpfter, nicht strafender «Plopp»
    wrong() {
      this.tone({ type: 'sine', from: 180, to: 130, dur: 0.3, gain: 0.3, attack: 0.012, lowpass: 420 });
      this.tone({ type: 'triangle', from: 360, to: 260, dur: 0.24, gain: 0.06, attack: 0.012, lowpass: 900 });
    }

    // aufsteigendes 4-Ton-Arpeggio
    fanfare() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        const last = i === 3;
        this.tone({ type: 'triangle', from: f, start: i * 0.11, dur: last ? 0.95 : 0.24, gain: last ? 0.13 : 0.1, attack: 0.008 });
        this.tone({ type: 'sine', from: f / 2, start: i * 0.11, dur: last ? 0.95 : 0.24, gain: 0.035 });
      });
    }
  }
  const sound = new SoundEngine();

  /* =====================================================================
   * 4. ICONS (eigene Inline-SVGs)
   * ===================================================================== */
  const ICONS = {
    home: '<path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2z"/><path d="M4 20a2 2 0 0 0 2 1h13v-3"/><path d="M8.5 7.5h6"/>',
    cards: '<rect x="3" y="7.5" width="13" height="13" rx="2"/><path d="M8 4.5h11a2 2 0 0 1 2 2V17"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    award: '<circle cx="12" cy="9" r="5.5"/><path d="M8.6 13.4 7.5 21l4.5-2.6 4.5 2.6-1.1-7.6"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>',
    unlock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 6.6-1.6"/>',
    shield: '<path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.2 7.5 9.5 4.4-1.3 7.5-5.1 7.5-9.5V6z"/><path d="m9 12 2.2 2.2L15.2 10"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.2 8.8-1.9 4.5-4.5 1.9 1.9-4.5z"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    left: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.7-4.4L4 8"/><path d="M4 3.5V8h4.5"/><path d="M4 13a8 8 0 0 0 14.7 4.4L20 16"/><path d="M20 20.5V16h-4.5"/>',
    rotate: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/>',
    flame: '<path d="M12 3c.9 3.6 5 5.3 5 10a5 5 0 0 1-10 0c0-2 .9-3.4 2-4.4.3 1.5 1.2 2.4 2.4 2.4C11 8.6 11 6 12 3z"/>',
    volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11"/>',
    mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
    trophy: '<path d="M8 4h8v5.5a4 4 0 0 1-8 0z"/><path d="M8 6H5.5a2.5 2.5 0 0 0 2.8 3.9M16 6h2.5a2.5 2.5 0 0 1-2.8 3.9"/><path d="M12 13.5V17M8.5 20.5h7M9.5 17h5v3.5h-5z"/>',
    download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.2M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
    spark: '<path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M6 6l2.6 2.6M15.4 15.4 18 18M6 18l2.6-2.6M15.4 8.6 18 6"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.8 3.2 2.8 13.8 0 17M12 3.5c-2.8 3.2-2.8 13.8 0 17"/>',
    server: '<rect x="4" y="4" width="16" height="7" rx="1.6"/><rect x="4" y="13" width="16" height="7" rx="1.6"/><path d="M8 7.5h.01M8 16.5h.01"/>',
    laptop: '<path d="M6 5h12a1 1 0 0 1 1 1v9H5V6a1 1 0 0 1 1-1z"/><path d="M3 18.5h18"/>',
    key: '<circle cx="7" cy="12" r="4"/><path d="M11 12h10M17.5 12v3.2M20.5 12v2.4"/>',
    star: '<path d="m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8z" fill="currentColor"/>',
    repeat: '<path d="M4 11V9a4 4 0 0 1 4-4h11"/><path d="m16 2 3 3-3 3"/><path d="M20 13v2a4 4 0 0 1-4 4H5"/><path d="m8 22-3-3 3-3"/>',
    bank: '<path d="M3 9.5 12 4l9 5.5"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18"/>',
    health: '<path d="M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6z"/>',
    plane: '<path d="M21 4 3 11l7 2.5L12.5 21z"/><path d="M10 13.5 21 4"/>',
    bed: '<path d="M3 18V7M3 13.5h18V18M21 13.5V12a3 3 0 0 0-3-3h-7v4.5"/><circle cx="7" cy="10.5" r="1.6"/>',
    suitcase: '<rect x="3.5" y="7.5" width="17" height="12.5" rx="2"/><path d="M9 7.5V5.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3.5 12.5h17"/>',
    ticket: '<path d="M3.5 8.5a2 2 0 0 0 2-2h13a2 2 0 0 0 2 2v1.5a2 2 0 0 0 0 4v1.5a2 2 0 0 0-2 2h-13a2 2 0 0 0-2-2V14a2 2 0 0 0 0-4z"/><path d="M12 7v1.5M12 11v2M12 15.5V17"/>',
    bag: '<path d="M5 8h14l-1.2 12.5H6.2z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
    gavel: '<path d="m13.5 4.5 6 6M11 7l6 6M12.2 5.8 6 12l6 6 6.2-6.2"/><path d="M8.5 15.5 3.5 20.5"/>',
    chat: '<path d="M4 5h16v11H9.5L5 20v-4H4z"/><path d="M8 9.5h8M8 12.5h5"/>',
    newspaper: '<path d="M4 5h13v14a1.5 1.5 0 0 0 3 0V9h-3"/><path d="M4 5v14a1.5 1.5 0 0 0 1.5 1.5H18.5"/><path d="M7.5 9h6M7.5 12.5h6M7.5 16h4"/>',
    tv: '<rect x="3" y="6" width="18" height="12.5" rx="2"/><path d="m8.5 2.5 3.5 3.5 3.5-3.5"/>',
    radio: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M7 8 17 3.5"/><circle cx="15.5" cy="14" r="2.5"/><path d="M6.5 12.5h4M6.5 15.5h4"/>',
    people: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9.5" r="2.5"/><path d="M15.5 14.4a4.5 4.5 0 0 1 5.5 4.6"/>',
    phone: '<rect x="6.5" y="3" width="11" height="18" rx="2.2"/><path d="M11 17.5h2"/>',
    pen: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="m14.5 7.5 3 3"/>',
    hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v7.5c0 4-2.5 7-6.2 7-2.7 0-4.3-1.4-5.6-3.6L3.6 13.6a1.5 1.5 0 0 1 2.5-1.7L8 14.5"/>',
    flip: '<path d="M4 8h12a4 4 0 0 1 0 8H9"/><path d="m7 5-3 3 3 3"/>',
  };

  const icon = (name, cls = '') =>
    `<svg class="ic ${cls}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;

  /* =====================================================================
   * 5. INHALT – KAPITEL 10
   * ===================================================================== */
  const CRITERIA = [
    {
      key: 'url', name: 'URL', icon: 'globe',
      checks: 'Wo ist die Homepage-Adresse zu Hause? Lässt sich erkennen, ob eine staatliche Organisation, eine politische Organisation, eine Non-Profit-Organisation oder eine Privatperson mit Machtgehabe dahintersteht? Steht https am Anfang der Adresse?',
      warn: 'Getarnte Adresse wie «meine-bank.ch.konto-entsperren.com»',
      good: 'Klare Domain, die zum Absender passt – z. B. admin.ch für den Bund',
      aha: 'Lies die Domain immer direkt vor dem ersten «/» nach «https://». Alles, was links davon steht, kann eine Tarnung sein.',
    },
    {
      key: 'author', name: 'Autor & Datum', icon: 'user',
      checks: 'Sind bei einem Artikel der Autor und das Erstellungsdatum sichtbar? Findest du im Internet weitere konstruktive und sachliche Artikel oder einen Lebenslauf des Autors? Wie seriös ist dieser Autor? Sind Kontaktdaten des Autors vorhanden?',
      warn: 'Kein Name, kein Datum, keine Kontaktmöglichkeit',
      good: 'Name, Datum, kurze Biografie und eine Kontaktadresse',
      aha: 'Ein «Experte», zu dem du online nichts weiter findest – keine Artikel, keinen Lebenslauf –, ist ein Warnsignal.',
    },
    {
      key: 'style', name: 'Stil/Qualität', icon: 'eye',
      checks: 'Kommt die Seite in einem durchdachten Design mit professionellen Schriften daher? Gibt es viele Wiederholungen und Rechtschreibfehler? Sind alle Links gültig? Sind Bilder und Fotos scharf und in guter Qualität?',
      warn: 'Tippfehler, tote Links, verpixelte Bilder',
      good: 'Sauberes Layout, gepflegte Texte, funktionierende Links',
      aha: 'Klicke testweise ein paar Links an. Landen mehrere im Nichts, wird die Seite offensichtlich nicht gepflegt.',
    },
    {
      key: 'motive', name: 'Motive', icon: 'compass',
      checks: 'Gibt es werbende (kommerzielle, politische, manipulative) Absichten auf der Seite? Gibt es die gleichen Informationen auch im Internet auf anderen Websites mit der gleichen Aussage oder gibt es Widersprüche?',
      warn: 'Der «unabhängige Test» stammt vom Hersteller selbst',
      good: 'Mehrere unabhängige Websites bestätigen die Aussage',
      aha: 'Frag dich: Wer profitiert davon, dass ich das glaube? Und erzählen andere Quellen dasselbe?',
    },
  ];
  const CRITERIA_NAMES = CRITERIA.map((c) => c.name);

  const HTTPS_AREAS = [
    { icon: 'bank', name: 'E-Banking', ex: 'Login mit Code, Kontostand, Zahlungen' },
    { icon: 'health', name: 'Krankenkassen-Websites', ex: 'Versichertennummer, Arztrechnungen, Gesundheitsdaten' },
    { icon: 'plane', name: 'Fluggesellschaften', ex: 'Passdaten, Buchung, Kreditkarte' },
    { icon: 'bed', name: 'Hotels', ex: 'Reservation mit Kreditkarte als Garantie' },
    { icon: 'suitcase', name: 'Reisebüros', ex: 'Personalien aller Mitreisenden, Anzahlung' },
    { icon: 'ticket', name: 'Online-Tickets', ex: 'Konzerte, Messen, Veranstaltungen, Kino, Theater' },
    { icon: 'bag', name: 'Versandhandel & Online-Marktplätze', ex: 'Lieferadresse, Bestellung, Zahlung' },
    { icon: 'gavel', name: 'Online-Auktionshäuser', ex: 'Gebote, Konto, Zahlungsdaten' },
    { icon: 'chat', name: 'Soziale Medien', ex: 'Login, private Nachrichten, Fotos' },
  ];

  const SOURCES = [
    ['newspaper', 'Zeitungen'], ['book', 'Zeitschriften'], ['chat', 'Soziale Medien'], ['globe', 'Internetseiten'],
    ['tv', 'TV'], ['radio', 'Radio'], ['people', 'Privates Umfeld'],
  ];

  const GRUNDFRAGEN = [
    { q: 'Sind die Informationen aktuell?', ex: 'Ein «Vergleich der besten Handy-Abos» von 2016 hilft dir heute kaum weiter – Preise und Angebote haben sich längst geändert.' },
    { q: 'Sind sie seriös oder steht eine Absicht dahinter?', ex: 'Absichten können politisch, werbetechnisch, rassistisch oder diskriminierend sein. Beispiel: ein «Ratgeber», der nur die Produkte eines einzigen Herstellers lobt.' },
    { q: 'Werden viele Aspekte berücksichtigt oder nur einzelne?', ex: 'Ein Bericht über ein neues Stadion, in dem nur Gegner zu Wort kommen, zeigt dir nur eine Seite der Geschichte.' },
  ];

  const TLS_STEPS = [
    { title: 'Verbindung aufbauen', text: 'Dein Computer, Laptop, Tablet oder Smartphone – in der Praxis «Client» genannt – baut eine Verbindung zum Server auf.', terms: ['Client', 'Server'] },
    { title: 'Zertifikat prüfen', text: 'Der Server weist sich mit einem Zertifikat aus. Dein Gerät prüft, ob das X.509-Zertifikat vertrauenswürdig ist und ob der Servername mit dem Zertifikat übereinstimmt. Optional kann sich auch der Client mit einem eigenen Zertifikat ausweisen.', terms: ['X.509-Zertifikat'] },
    { title: 'Schlüssel austauschen', text: 'Der Client schickt dem Server eine geheime Zufallszahl, die mit dem öffentlichen Schlüssel des Servers verschlüsselt ist. Daraus berechnen beide ein gemeinsames Geheimnis – und leiten davon einen kryptografischen Schlüssel ab.', terms: ['öffentlicher Schlüssel', 'Schlüsselaustausch'] },
    { title: 'Verschlüsselt kommunizieren', text: 'Mit diesem Schlüssel werden alle Nachrichten symmetrisch verschlüsselt. Ein Message Authentication Code (MAC) schützt zusätzlich die Integrität und Authentizität der Nachrichten.', terms: ['symmetrische Verschlüsselung', 'MAC'] },
  ];

  const NOTES = [
    'Schloss heisst: Die Verbindung ist verschlüsselt. Ob die Seite seriös ist, prüfst du mit den vier Kriterien.',
    'Vor dem Weiterleiten immer: aktuell? seriös? viele Aspekte?',
    'Die Domain direkt vor dem ersten «/» verrät, wo eine Seite wirklich zu Hause ist.',
    'Spätestens bei Kartennummer, Code oder Passwort muss «https://» vor der Adresse stehen.',
    'Kein Autor, kein Datum, keine Kontaktdaten? Dann ist Vorsicht angesagt.',
  ];

  /* ---------- Fragenbank (Kurz-Checks, Fallbeispiele, Quiz, Fehler-Trainer) ---------- */
  const TLS_ORDER_LONG = [
    'Dein Gerät (Client) baut eine Verbindung zum Server auf.',
    'Der Server weist sich mit seinem X.509-Zertifikat aus – dein Gerät prüft es.',
    'Der Client schickt eine geheime Zufallszahl, verschlüsselt mit dem öffentlichen Schlüssel des Servers.',
    'Mit dem gemeinsamen Schlüssel wird alles symmetrisch verschlüsselt und per MAC geschützt.',
  ];

  const QUESTIONS = {
    /* Kurz-Checks in der Theorie */
    'cp-tls': {
      type: 'tf', ref: 'Kap. 10 / 10.1',
      q: 'TLS ist der heutige Name für die Technik, die früher SSL hiess.',
      answer: true,
      explain: 'SSL (Secure Sockets Layer) war das ursprüngliche Verschlüsselungsprotokoll. Sein sichererer Nachfolger heisst TLS – Transport Layer Security, auf Deutsch «Transportschichtsicherheit».',
    },
    'cp-steps': {
      type: 'order', ref: 'Kap. 10.1',
      q: 'Bring den TLS-Ablauf in die richtige Reihenfolge. Tippe die Schritte nacheinander an.',
      items: TLS_ORDER_LONG,
      explain: 'Zuerst baut dein Gerät die Verbindung auf. Dann weist sich der Server mit seinem X.509-Zertifikat aus. Danach wird über eine verschlüsselte Zufallszahl ein gemeinsames Geheimnis vereinbart. Mit dem daraus abgeleiteten Schlüssel läuft alles symmetrisch verschlüsselt – geschützt durch einen MAC.',
    },
    'cp-lock': {
      type: 'choice', ref: 'Kap. 10.1',
      q: 'Du willst im Onlineshop deine Kreditkartennummer eingeben. Was prüfst du spätestens jetzt?',
      options: ['Dass die Adresse mit https:// beginnt und das Schloss-Symbol angezeigt wird', 'Dass die Seite viele Farben verwendet', 'Dass der Shop auch eine App anbietet', 'Dass die Seite besonders schnell lädt'],
      correct: 0,
      explain: 'Spätestens beim Eingeben persönlicher Daten wie Kreditkartennummern, Codes oder Schlüsseln sollte das Sicherheitsschloss eingeschnappt sein und die Adresse mit https:// beginnen.',
    },
    'cp-areas': {
      type: 'multi', ref: 'Kap. 10.1',
      q: 'Bei welchen Angeboten gibst du laut Kapitel 10 nur mit https Daten ein? Wähle alle passenden aus.',
      options: ['E-Banking', 'Krankenkassen-Website', 'Hotelbuchung', 'Soziale Medien', 'Gedruckte Zeitung im Briefkasten', 'Plakat am Bahnhof'],
      correct: [0, 1, 2, 3],
      explain: 'E-Banking, Krankenkassen, Hotels und soziale Medien stehen alle auf der Liste – zusammen mit Fluggesellschaften, Reisebüros, Online-Tickets, Versandhandel und Online-Marktplätzen sowie Online-Auktionshäusern. Zeitung und Plakat sind keine Websites: Dort wird gar nichts übertragen.',
    },
    'cp-questions': {
      type: 'choice', ref: 'Kap. 10.2',
      q: 'Welche Frage gehört NICHT zu den 3 Grundfragen?',
      options: ['Sind die Informationen aktuell?', 'Sind sie seriös oder steht eine Absicht dahinter?', 'Werden viele Aspekte berücksichtigt oder nur einzelne?', 'Hat der Beitrag viele Likes?'],
      correct: 3,
      explain: 'Die 3 Grundfragen lauten: aktuell? – seriös oder mit Absicht dahinter? – viele Aspekte oder nur einzelne? Likes sagen nichts über die Qualität einer Information aus.',
    },
    'cp-criteria': {
      type: 'match', ref: 'Kap. 10.2.1',
      q: 'Ordne jede Prüffrage dem passenden Verifizierungs-Kriterium zu.',
      rows: [
        { t: 'Gibt es Kontaktdaten der Autorin?', cat: 1 },
        { t: 'Ist der Text voller Rechtschreibfehler?', cat: 2 },
        { t: 'Gehört die Domain einer politischen Partei?', cat: 0 },
        { t: 'Will dir die Seite vor allem etwas verkaufen?', cat: 3 },
      ],
      explain: 'Kontaktdaten gehören zu «Autor & Datum», Rechtschreibfehler zu «Stil/Qualität», die Frage nach dem Betreiber der Domain zu «URL» und Verkaufsabsichten zu «Motive».',
    },

    /* Fallbeispiele (Etappe 2) */
    'case-phish': {
      type: 'domain', ref: 'Kap. 10.2.1 · URL',
      scenario: 'Du bekommst eine SMS: «Dein Bankkonto wurde gesperrt. Entsperre es jetzt hier:»',
      q: 'Tippe auf den Teil der Adresse, der verrät, wo diese Seite wirklich zu Hause ist.',
      parts: ['https://', 'meine-bank.ch.', 'konto-entsperren.com', '/login'],
      correct: 2,
      explain: 'Die eigentliche Domain steht direkt vor dem ersten «/» nach «https://»: konto-entsperren.com. «meine-bank.ch.» ist nur eine Tarnung davor. Und: Auch eine Phishing-Seite kann https verwenden – das Schloss sagt nichts darüber, wem die Seite gehört.',
    },
    'case-checkout': {
      type: 'choice', ref: 'Kap. 10.1',
      visual: { secure: false, url: 'http://sneaker-deal24.ch/checkout' },
      scenario: 'Du bist im Checkout eines Sneaker-Shops und sollst deine Kreditkartendaten eingeben. Der Browser zeigt «Nicht sicher».',
      q: 'Was machst du?',
      options: ['Abbrechen – ohne https und Schloss gebe ich keine Zahlungsdaten ein', 'Eingeben, der Preis ist ja gut', 'Nur die Hälfte der Kartennummer eingeben', 'Die Seite neu laden, dann wird sie sicher'],
      correct: 0,
      explain: 'Ohne TLS werden deine Daten unverschlüsselt übertragen – wer mithört, kann sie lesen. Bestellungen und Zahlungen gehören nur auf Seiten mit https und Schloss-Symbol.',
    },
    'case-wlan': {
      type: 'tf', ref: 'Kap. 10.1 · Vereinfacht',
      scenario: 'Du loggst dich im Zug-WLAN mit https ins E-Banking ein. Eine Person im selben WLAN schneidet den Datenverkehr mit.',
      q: 'Diese Person kann deine Kontonummer und deinen Login-Code im Klartext lesen.',
      answer: false,
      explain: 'Dank TLS werden die Daten nur verschlüsselt übertragen. Statt deiner Kontodaten sieht die Drittperson nur «Datensalat» aus Sonderzeichen, Buchstaben und Zahlen.',
    },
    'case-gemeinde': {
      type: 'choice', ref: 'Kap. 10.1',
      visual: { secure: false, url: 'http://www.beispielgemeinde.ch/anmeldung' },
      scenario: 'Die Website einer Gemeinde läuft noch ohne https.',
      q: 'Wie wirkt das heute?',
      options: ['Unseriös – auch Websites von Gemeinden, kleinen Firmen und Privaten ohne Verschlüsselung gelten mittlerweile als unseriös', 'Völlig normal – Gemeinden brauchen keine Verschlüsselung', 'Besonders sicher, weil nichts verschlüsselt werden muss', 'Egal, solange die Seite schön aussieht'],
      correct: 0,
      explain: 'Kapitel 10 sagt es deutlich: Mittlerweile gelten auch Websites von Privaten, kleinen Firmen und Gemeinden, die keine verschlüsselte Übertragung haben, als unseriös.',
    },
    'case-lockfake': {
      type: 'choice', ref: 'Kap. 10.1 & 10.2.1',
      visual: { secure: true, url: 'https://markenschuhe-minus90.shop/angebot' },
      scenario: 'Ein Shop verkauft Markenschuhe 90 % günstiger. Im Browser siehst du das Schloss-Symbol.',
      q: 'Was sagt dir das Schloss?',
      options: ['Die Verbindung ist verschlüsselt – ob der Shop seriös ist, prüfst du mit den Verifizierungs-Kriterien', 'Der Shop ist garantiert seriös', 'Der Shop wurde vom Staat geprüft', 'Die Preise sind echt'],
      correct: 0,
      explain: 'Das Schloss zeigt eine verschlüsselte Verbindung (TLS). Ob hinter der Seite ein seriöser Anbieter steckt, beantwortet es nicht – dafür brauchst du URL, Autor & Datum, Stil/Qualität und Motive.',
    },
    'case-author': {
      type: 'choice', ref: 'Kap. 10.2.1',
      scenario: 'Ein Artikel behauptet, Energydrinks steigerten die Konzentration um 60 %. Es gibt keinen Namen, kein Datum und keine Kontaktdaten.',
      q: 'Welches Verifizierungs-Kriterium schlägt hier am deutlichsten Alarm?',
      options: CRITERIA_NAMES,
      optionOrder: 'fixed',
      correct: 1,
      explain: '«Autor & Datum»: Sind Autor und Erstellungsdatum sichtbar? Gibt es Kontaktdaten? Fehlt all das, kannst du weder die Person noch die Aktualität überprüfen.',
    },
    'case-style': {
      type: 'choice', ref: 'Kap. 10.2.1',
      scenario: 'Ein Gesundheits-Blog: viele Wiederholungen, zahlreiche Rechtschreibfehler, unscharfe Bilder – und mehrere Links führen ins Leere.',
      q: 'Welches Kriterium prüfst du hier?',
      options: CRITERIA_NAMES,
      optionOrder: 'fixed',
      correct: 2,
      explain: '«Stil/Qualität der Website»: durchdachtes Design? Viele Wiederholungen und Rechtschreibfehler? Gültige Links? Scharfe Bilder? Hier fallen gleich mehrere Punkte durch.',
    },
    'case-motive': {
      type: 'choice', ref: 'Kap. 10.2.1 · Motive',
      scenario: 'Eine Website präsentiert «unabhängige Fakten» zu einer Abstimmung – betrieben von einem Komitee, das für ein Ja kämpft.',
      q: 'Was ist der beste nächste Schritt?',
      options: ['Prüfen, ob andere Websites dieselbe Aussage machen oder ob es Widersprüche gibt', 'Sofort teilen – Fakten sind Fakten', 'Nur die Überschriften lesen', 'Die Seite ignorieren, weil Politik langweilig ist'],
      correct: 0,
      explain: 'Hinter der Seite steht eine politische Absicht. Das Kriterium «Motive» verlangt, die Aussagen mit anderen Websites zu vergleichen: Sagen sie dasselbe – oder widersprechen sie sich?',
    },
    'case-aktuell': {
      type: 'choice', ref: 'Kap. 10.2',
      scenario: 'Für deinen Vortrag über Handy-Abos findest du einen tollen Vergleich – veröffentlicht 2016.',
      q: 'Welche Grundfrage ist hier zuerst kritisch?',
      options: ['Sind die Informationen aktuell?', 'Werden viele Aspekte berücksichtigt?', 'Steht eine Absicht dahinter?', 'Keine – Preise ändern sich nie'],
      correct: 0,
      explain: 'Bei Preisen und Angeboten ist Aktualität entscheidend. Ein Vergleich von 2016 ist für eine heutige Entscheidung nicht mehr verlässlich.',
    },
    'case-aspekte': {
      type: 'choice', ref: 'Kap. 10.2',
      scenario: 'Ein Video über ein geplantes Stadion zeigt nur Interviews mit Anwohnenden, die dagegen sind.',
      q: 'Welche Grundfrage deckt das Problem auf?',
      options: ['Werden viele Aspekte berücksichtigt oder nur einzelne?', 'Sind die Informationen aktuell?', 'Beginnt die Adresse mit https?', 'Ist das Video lang genug?'],
      correct: 0,
      explain: 'Kommt nur eine Seite zu Wort, fehlen wichtige Aspekte. Eine verlässliche Information beleuchtet ein Thema von mehreren Seiten.',
    },

    /* Das grosse Kapitel-10-Quiz (Etappe 3) */
    'qz-https': {
      type: 'choice', ref: 'Kap. 10.1',
      q: 'Wofür steht HTTPS?',
      options: ['Hypertext Transfer Protocol Secure', 'High Tech Transfer Protection System', 'Hypertext Transport Privacy Service', 'Home Text Transfer Protocol Standard'],
      correct: 0,
      explain: 'HTTPS heisst «Hypertext Transfer Protocol Secure». Du erkennst die gesicherte Verbindung am https:// vor der Adresse und am Schloss-Symbol.',
    },
    'qz-order': {
      type: 'order', ref: 'Kap. 10.1',
      q: 'In welcher Reihenfolge läuft eine TLS-Verbindung ab?',
      items: ['Verbindung aufbauen', 'X.509-Zertifikat prüfen', 'Schlüssel austauschen', 'Symmetrisch verschlüsselt kommunizieren'],
      explain: 'Verbindung → Zertifikat prüfen → Schlüsselaustausch über den öffentlichen Schlüssel → symmetrisch verschlüsselte Kommunikation mit MAC.',
    },
    'qz-domain': {
      type: 'domain', ref: 'Kap. 10.2.1 · URL',
      scenario: 'Du suchst Konzerttickets und landest auf dieser Adresse.',
      q: 'Tippe auf den Teil, der zeigt, wo die Seite wirklich zu Hause ist.',
      parts: ['https://', 'tickets-arena.ch.', 'ticket-sofort.net', '/konzerte'],
      correct: 2,
      explain: 'Entscheidend ist die Domain direkt vor dem ersten «/»: ticket-sofort.net. Der Teil davor ist nur eine Subdomain, die vertrauenswürdig aussehen soll.',
    },
    'qz-multi': {
      type: 'multi', ref: 'Kap. 10.1',
      q: 'Bei welchen Tätigkeiten achtest du unbedingt auf https? Wähle alle passenden aus.',
      options: ['Ein Konzertticket online kaufen', 'Dich bei der Krankenkasse einloggen', 'Bei einem Online-Auktionshaus mitbieten', 'Den Wetterbericht lesen', 'Fussballresultate anschauen', 'Ein Wort im Online-Wörterbuch nachschlagen'],
      correct: [0, 1, 2],
      explain: 'Dateneingaben, Bestellungen und Transaktionen – etwa bei Online-Tickets, Krankenkassen und Auktionshäusern – nur mit https. Beim reinen Lesen gibst du keine Daten ein; trotzdem gelten Seiten ganz ohne Verschlüsselung heute als unseriös.',
    },
    'qz-eaves': {
      type: 'tf', ref: 'Kap. 10.1 · Vereinfacht',
      q: 'Wer eine TLS-Verbindung zwischen dir und deiner Bank belauscht, sieht nur unleserlichen «Datensalat».',
      answer: true,
      explain: 'Genau: Weil beide Geräte nur noch verschlüsselte Daten übertragen, sieht eine Drittperson statt Kontodaten und Codes nur Smileys, Sonderzeichen und einen Salat aus Buchstaben und Zahlen.',
    },
    'qz-mac': {
      type: 'choice', ref: 'Kap. 10.1',
      q: 'Wofür sorgt der Message Authentication Code (MAC) bei TLS?',
      options: ['Er schützt die Integrität und Authentizität der Nachrichten', 'Er beschleunigt den Download', 'Er blockiert Werbung auf der Website', 'Er speichert deine Passwörter'],
      correct: 0,
      explain: 'Der MAC schützt die Nachrichten vor unbemerkter Veränderung (Integrität) und bestätigt, dass sie vom richtigen Absender stammen (Authentizität).',
    },
    'qz-x509': {
      type: 'choice', ref: 'Kap. 10.1',
      q: 'Was prüft dein Gerät beim X.509-Zertifikat des Servers?',
      options: ['Ob das Zertifikat vertrauenswürdig ist und der Servername übereinstimmt', 'Ob die Website schön gestaltet ist', 'Wie viele Besucherinnen und Besucher die Seite hat', 'Ob die Seite Werbung anzeigt'],
      correct: 0,
      explain: 'Der Client überprüft die Vertrauenswürdigkeit des X.509-Zertifikats und ob der Servername mit dem Zertifikat übereinstimmt.',
    },
    'qz-match': {
      type: 'match', ref: 'Kap. 10.2.1',
      q: 'Ordne jede Prüffrage dem richtigen Kriterium zu.',
      rows: [
        { t: 'Ist das Erstellungsdatum sichtbar?', cat: 1 },
        { t: 'Sind alle Links gültig?', cat: 2 },
        { t: 'Steht eine staatliche Organisation hinter der Adresse?', cat: 0 },
        { t: 'Gibt es manipulative Absichten?', cat: 3 },
      ],
      explain: 'Datum → Autor & Datum. Gültige Links → Stil/Qualität. Wer hinter der Adresse steht → URL. Manipulative Absichten → Motive.',
    },
    'qz-sym': {
      type: 'choice', ref: 'Kap. 10.1',
      q: 'Nach dem Schlüsselaustausch werden alle Nachrichten …',
      options: ['symmetrisch verschlüsselt – beide nutzen denselben abgeleiteten Schlüssel', 'gar nicht mehr verschlüsselt', 'nur noch als Bilder übertragen', 'mit einem Passwort verschlüsselt, das du eintippst'],
      correct: 0,
      explain: 'Der aus dem gemeinsamen Geheimnis abgeleitete Schlüssel wird für ein symmetrisches Verschlüsselungsverfahren genutzt: Beide Seiten verwenden denselben Schlüssel.',
    },
    'qz-aspects': {
      type: 'choice', ref: 'Kap. 10.2',
      q: 'Ein Beitrag über ein neues Gesetz zitiert nur Gegner, keine Befürworter. Welche Grundfrage deckt das auf?',
      options: ['Werden viele Aspekte berücksichtigt oder nur einzelne?', 'Sind die Informationen aktuell?', 'Beginnt die Adresse mit https?', 'Hat der Beitrag viele Kommentare?'],
      correct: 0,
      explain: 'Wenn nur eine Seite zu Wort kommt, werden nicht viele Aspekte berücksichtigt. Bevor du so etwas weiterleitest, suchst du weitere Perspektiven.',
    },
  };

  const CASE_IDS = ['case-phish', 'case-checkout', 'case-wlan', 'case-gemeinde', 'case-lockfake', 'case-author', 'case-style', 'case-motive', 'case-aktuell', 'case-aspekte'];
  const QUIZ_IDS = ['qz-https', 'qz-order', 'qz-domain', 'qz-multi', 'qz-eaves', 'qz-mac', 'qz-x509', 'qz-match', 'qz-sym', 'qz-aspects'];

  /* ---------- Karteikarten ---------- */
  const FLASHCARDS = [
    { id: 'fc-ssl', kicker: 'Abkürzung', term: 'SSL', def: 'Secure Sockets Layer – das ursprüngliche Verschlüsselungsprotokoll für sichere Datenübertragung im Internet.', ex: 'Heute abgelöst durch den sichereren Nachfolger TLS.' },
    { id: 'fc-tls', kicker: 'Abkürzung', term: 'TLS', def: 'Transport Layer Security, auf Deutsch «Transportschichtsicherheit» – der heutige Standard für verschlüsselte Verbindungen.', ex: 'Ermöglicht ein abhör- und fälschungssicheres Übertragen.' },
    { id: 'fc-https', kicker: 'Abkürzung', term: 'HTTPS', def: 'Hypertext Transfer Protocol Secure – zeigt eine gesicherte Verbindung an. Die Adresse beginnt mit https://.', ex: 'Daneben erscheint das Schloss-Symbol in der Adressleiste.' },
    { id: 'fc-lock', kicker: 'Symbol', term: 'Schloss-Symbol', def: 'Zeigt in der Adressleiste, dass die Verbindung verschlüsselt ist. Ein Klick darauf liefert Infos zur Website-Identifizierung.', ex: 'Spätestens bei Kartennummern, Codes und Schlüsseln muss es eingeschnappt sein.' },
    { id: 'fc-client', kicker: 'Begriff', term: 'Client', def: 'Dein Gerät – Computer, Laptop, Tablet oder Smartphone –, das eine Verbindung zum Server aufbaut.', ex: 'Der Server ist der Rechner, auf dem die Website liegt.' },
    { id: 'fc-x509', kicker: 'Begriff', term: 'X.509-Zertifikat', def: 'Damit authentifiziert sich der Server. Der Client prüft, ob es vertrauenswürdig ist und ob der Servername übereinstimmt.', ex: 'Optional kann sich auch der Client mit einem eigenen Zertifikat ausweisen.' },
    { id: 'fc-public', kicker: 'Begriff', term: 'Öffentlicher Schlüssel', def: 'Mit dem öffentlichen Schlüssel des Servers verschlüsselt der Client eine geheime Zufallszahl.', ex: 'Daraus berechnen beide ein gemeinsames Geheimnis (Schlüsselaustausch).' },
    { id: 'fc-sym', kicker: 'Begriff', term: 'Symmetrische Verschlüsselung', def: 'Beide Seiten verwenden denselben, aus dem gemeinsamen Geheimnis abgeleiteten Schlüssel für alle Nachrichten.', ex: 'So läuft die ganze weitere Kommunikation verschlüsselt.' },
    { id: 'fc-mac', kicker: 'Abkürzung', term: 'MAC', def: 'Message Authentication Code – schützt die Integrität und Authentizität der Nachrichten.', ex: 'Veränderte oder untergeschobene Nachrichten fallen auf.' },
    { id: 'fc-salad', kicker: 'Vereinfacht', term: 'Datensalat', def: 'Was eine Drittperson bei einer TLS-Verbindung sieht: Smileys, Sonderzeichen und einen unerkennbaren Salat aus Buchstaben und Zahlen.', ex: 'Statt Kontonummer und Code – nur Zeichenwirrwarr.' },
    { id: 'fc-areas', kicker: 'Liste', term: 'Nur mit HTTPS', def: 'E-Banking, Krankenkassen, Fluggesellschaften, Hotels, Reisebüros, Online-Tickets, Versandhandel & Online-Marktplätze, Online-Auktionshäuser, soziale Medien.', ex: 'Websites ganz ohne Verschlüsselung gelten heute als unseriös.' },
    { id: 'fc-three', kicker: '10.2', term: 'Die 3 Grundfragen', def: 'Sind die Informationen aktuell? Sind sie seriös oder steht eine Absicht dahinter? Werden viele Aspekte berücksichtigt oder nur einzelne?', ex: 'Gilt für Zeitungen, Social Media, Internet, TV, Radio und das private Umfeld.' },
    { id: 'fc-url', kicker: 'Kriterium 1', term: 'URL', def: 'Wo ist die Homepage-Adresse zu Hause? Staat, politische Organisation, Non-Profit-Organisation oder Privatperson mit Machtgehabe? Gibt es https?', ex: 'Die Domain direkt vor dem ersten «/» zählt.' },
    { id: 'fc-author', kicker: 'Kriterium 2', term: 'Autor & Datum', def: 'Sind Autor und Erstellungsdatum sichtbar? Gibt es weitere sachliche Artikel oder einen Lebenslauf? Wie seriös ist der Autor? Gibt es Kontaktdaten?', ex: 'Ohne Namen und Datum lässt sich nichts überprüfen.' },
    { id: 'fc-style', kicker: 'Kriterium 3', term: 'Stil/Qualität', def: 'Durchdachtes Design mit professionellen Schriften? Viele Wiederholungen und Rechtschreibfehler? Gültige Links? Scharfe Bilder in guter Qualität?', ex: 'Tote Links zeigen: Die Seite wird nicht gepflegt.' },
    { id: 'fc-motive', kicker: 'Kriterium 4', term: 'Motive', def: 'Gibt es werbende (kommerzielle, politische, manipulative) Absichten? Gibt es die gleichen Infos auf anderen Websites – oder Widersprüche?', ex: 'Frag dich: Wer profitiert, wenn ich das glaube?' },
  ];
  const CARD_BY_ID = Object.fromEntries(FLASHCARDS.map((c) => [c.id, c]));

  /* ---------- Lektionen (Etappe 1) ---------- */
  const LESSONS = [
    { id: 'l-ssl', nr: '10', title: 'Von SSL zu TLS', checkpoint: 'cp-tls' },
    { id: 'l-tls', nr: '10.1', title: 'So funktioniert TLS', checkpoint: 'cp-steps' },
    { id: 'l-https', nr: '10.1', title: 'HTTPS und das Schloss', checkpoint: 'cp-lock' },
    { id: 'l-areas', nr: '10.1', title: 'Wann ist HTTPS wichtig?', checkpoint: 'cp-areas' },
    { id: 'l-three', nr: '10.2', title: 'Die 3 Grundfragen', checkpoint: 'cp-questions' },
    { id: 'l-criteria', nr: '10.2.1', title: 'Die 4 Verifizierungs-Kriterien', checkpoint: 'cp-criteria' },
  ];

  /* ---------- Punkte ---------- */
  const BASE_POINTS = 100;
  const MAX_BONUS = 50;   // Tempo-Bonus pro richtige Antwort
  const multiplierFor = (streak) => (streak >= 5 ? 2 : streak >= 3 ? 1.5 : 1);
  // Volle Bonuspunkte bis «full» Sekunden, danach sinkt der Bonus gleichmässig bis 0 bei «zero» Sekunden
  const TEMPO = {
    choice: { full: 10, zero: 40 }, tf: { full: 8, zero: 35 },
    multi: { full: 15, zero: 50 }, domain: { full: 15, zero: 50 },
    order: { full: 25, zero: 70 }, match: { full: 25, zero: 70 },
  };
  function tempoBonus(type, seconds) {
    const t = TEMPO[type] || TEMPO.choice;
    if (!Number.isFinite(seconds) || seconds <= t.full) return MAX_BONUS;
    if (seconds >= t.zero) return 0;
    return Math.round(MAX_BONUS * (1 - (seconds - t.full) / (t.zero - t.full)));
  }
  const pointsFor = (streak, bonus) => Math.round((BASE_POINTS + bonus) * multiplierFor(streak));
  const MAX_POINTS = QUIZ_IDS.reduce((sum, _, i) => sum + pointsFor(i + 1, MAX_BONUS), 0); // 2550

  /* ---------- Simulierte Tages-Mitspielende ---------- */
  const BOT_NAMES = ['Lena', 'Noah', 'Mia', 'Luca', 'Elin', 'Jonas', 'Sara', 'Leon', 'Alina', 'Nico', 'Emma', 'Gian', 'Lia', 'Matteo', 'Zoe', 'Elias', 'Nora', 'Ben', 'Lara', 'Timo', 'Aylin', 'Samuel', 'Chiara', 'Levin'];
  const AVATAR_COLORS = ['#2D6A4F', '#E07A5F', '#B7791F', '#6B705C', '#9C6644', '#577590', '#1B4332', '#C2583E'];
  const BOTS_PER_DAY = 18;

  /* =====================================================================
   * 6. ZUSTAND
   * ===================================================================== */
  const LESSON_IDS = new Set(LESSONS.map((l) => l.id));
  const CARD_IDS = new Set(FLASHCARDS.map((c) => c.id));
  const validWeak = (k) => typeof k === 'string' && ((k.startsWith('q:') && QUESTIONS[k.slice(2)]) || (k.startsWith('c:') && CARD_IDS.has(k.slice(2))));

  const defaults = () => ({ name: '', lessons: [], cards: {}, cases: {}, weak: [], mastered: 0, bestStreak: 0, quiz: { attempts: 0, best: null }, claimed: false });

  // Gespeicherte Daten streng prüfen – kaputte oder alte Werte werden einfach verworfen
  function sanitize(raw) {
    const d = defaults();
    if (!raw || typeof raw !== 'object') return d;
    const int = (v, max = 1e6) => (Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0);
    d.name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 24) : '';
    d.lessons = Array.isArray(raw.lessons) ? [...new Set(raw.lessons.filter((id) => LESSON_IDS.has(id)))] : [];
    if (raw.cards && typeof raw.cards === 'object') {
      for (const [id, v] of Object.entries(raw.cards)) if (CARD_IDS.has(id) && (v === 'known' || v === 'again')) d.cards[id] = v;
    }
    if (raw.cases && typeof raw.cases === 'object') {
      for (const [id, v] of Object.entries(raw.cases)) if (CASE_IDS.includes(id) && typeof v === 'boolean') d.cases[id] = v;
    }
    d.weak = Array.isArray(raw.weak) ? [...new Set(raw.weak.filter(validWeak))] : [];
    d.mastered = int(raw.mastered);
    d.bestStreak = int(raw.bestStreak, QUIZ_IDS.length);
    if (raw.quiz && typeof raw.quiz === 'object') {
      d.quiz.attempts = int(raw.quiz.attempts);
      const b = raw.quiz.best;
      if (b && typeof b === 'object' && Number.isFinite(b.correct) && Number.isFinite(b.points)) {
        d.quiz.best = {
          correct: int(b.correct, QUIZ_IDS.length),
          total: QUIZ_IDS.length,
          points: int(b.points, MAX_POINTS),
          streak: int(b.streak, QUIZ_IDS.length),
          date: typeof b.date === 'string' && !Number.isNaN(Date.parse(b.date)) ? b.date : new Date().toISOString(),
        };
      }
    }
    d.claimed = raw.claimed === true;
    return d;
  }

  const profile = sanitize(store.get(KEYS.profile, null));
  const save = () => store.set(KEYS.profile, profile);

  const ui = {
    route: 'home',
    param: '',
    animate: true,
    lesson: 0,
    tab: 'cards',
    q: null,          // aktive Frage-Session
    deck: null,       // Karteikarten-Durchgang
    cases: null,      // Fallbeispiele-Durchgang
    trainer: null,    // Fehler-Trainer-Durchgang
    quiz: null,       // Quiz-Durchgang
    tls: 0,
    tlsSeen: new Set([0]),
    lockOpen: null,
    open: new Set(),  // aufgeklappte Aha-Karten, Kacheln usw.
    salad: 'Kontonummer CH93 0076 2011 6238 5295 7 · Code 4821',
    highlight: null,
    flipped: false,
  };

  const addWeak = (key) => { if (validWeak(key) && !profile.weak.includes(key)) profile.weak.push(key); };
  const removeWeak = (key) => {
    const i = profile.weak.indexOf(key);
    if (i >= 0) { profile.weak.splice(i, 1); return true; }
    return false;
  };

  /* ---------- Fortschritt ---------- */
  function stageProgress() {
    const s1 = profile.lessons.length / LESSONS.length;
    const known = FLASHCARDS.filter((c) => profile.cards[c.id] === 'known').length;
    const casesDone = Object.keys(profile.cases).length;
    const s2 = (known + casesDone) / (FLASHCARDS.length + CASE_IDS.length);
    const s3 = profile.quiz.best ? 1 : 0;
    const s4 = profile.claimed ? 1 : profile.quiz.best ? 0.5 : 0;
    return [s1, s2, s3, s4];
  }

  /* =====================================================================
   * 7. TAGES-RANGLISTE
   * ===================================================================== */
  function loadBoard() {
    const b = store.get(KEYS.board, null);
    if (!b || b.date !== todayKey() || !Array.isArray(b.entries)) return { date: todayKey(), entries: [] };
    b.entries = b.entries.filter((e) => e && typeof e.name === 'string' && Number.isFinite(e.score) && Number.isFinite(e.ts) && typeof e.id === 'string')
      .map((e) => ({ id: e.id, name: e.name.slice(0, 24), score: Math.max(0, Math.min(MAX_POINTS, Math.round(e.score))), ts: e.ts }));
    return b;
  }

  function botEntries() {
    const rnd = seeded(hash(`k10-${todayKey()}`));
    const midnight = startOfDay();
    return shuffle(BOT_NAMES, rnd).slice(0, BOTS_PER_DAY).map((name, i) => {
      const minute = i < 3 ? 8 + rnd() * 70 : 420 + rnd() * 960;               // drei Frühaufstehende, Rest 07–23 Uhr
      const share = i % 7 === 3 ? 0.8 + rnd() * 0.14 : 0.28 + Math.pow(rnd(), 1.15) * 0.5;
      const score = Math.round(MAX_POINTS * share);
      return { id: `bot-${i}`, name, score, ts: midnight + Math.floor(minute) * 6e4, bot: true };
    }).filter((b) => b.ts <= Date.now());
  }

  /* ---------- Live-Rangliste (Netlify Function) ---------- */
  const API_URL = '/.netlify/functions/leaderboard';
  const NAME_MAX = 20;
  const REFRESH_MS = 45000;

  // status: idle → loading → online | offline   (offline = Server nicht erreichbar → lokale Rangliste)
  const net = { status: 'idle', entries: [], day: '', at: 0, busy: false, posting: false, formError: '', pendingRender: false };

  function playerId() {
    let id = store.get(KEYS.player, null);
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
      const bytes = new Uint8Array(18);
      try { crypto.getRandomValues(bytes); } catch { for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256); }
      id = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
      store.set(KEYS.player, id);
    }
    return id;
  }

  const mine = () => { const m = store.get(KEYS.mine, null); return m && typeof m.id === 'string' && typeof m.day === 'string' ? m : null; };
  const isMine = (e) => { const m = mine(); return !!m && m.day === net.day && m.id === e.id; };

  // Spiegelbild der Server-Regeln, damit Fehler schon vor dem Absenden sichtbar sind
  function cleanName(raw) {
    const name = String(raw || '').normalize('NFC').replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
    if (!name) return { error: 'Bitte gib einen Namen ein.' };
    if ([...name].length > NAME_MAX) return { error: `Dein Name darf höchstens ${NAME_MAX} Zeichen lang sein.` };
    if (!/^[\p{L}\p{M}\p{N} .'’_-]+$/u.test(name)) return { error: 'Bitte nur Buchstaben, Zahlen, Leerzeichen und . - _ \' verwenden.' };
    if (!/[\p{L}\p{N}]/u.test(name)) return { error: 'Dein Name braucht mindestens einen Buchstaben oder eine Zahl.' };
    if (/(https?|www\.|\.(ch|com|net|org|de|io|app)\b)/i.test(name)) return { error: 'Bitte keine Web-Adressen als Namen.' };
    return { name };
  }

  class ApiError extends Error {
    constructor(kind, message, status = 0) { super(message); this.kind = kind; this.status = status; }
  }

  // kind «offline»: kein Server (lokal getestet, Netz weg, Function fehlt) → lokaler Fallback
  // kind «server»:  Server hat geantwortet, aber den Eintrag abgelehnt (Validierung, Spam-Schutz)
  async function api(method, body) {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl && setTimeout(() => ctrl.abort(), 8000);
    let res;
    try {
      res = await fetch(API_URL, {
        method,
        headers: body ? { 'content-type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
        signal: ctrl ? ctrl.signal : undefined,
      });
    } catch {
      throw new ApiError('offline', 'Keine Verbindung zur Klassen-Rangliste.');
    } finally { if (timer) clearTimeout(timer); }
    const type = res.headers.get('content-type') || '';
    if (!type.includes('application/json')) throw new ApiError('offline', 'Die Klassen-Rangliste ist hier nicht verfügbar.', res.status);
    let data;
    try { data = await res.json(); } catch { throw new ApiError('offline', 'Antwort der Rangliste war unlesbar.', res.status); }
    if (!res.ok || !data || data.ok !== true) {
      if (res.status >= 500 || res.status === 404) throw new ApiError('offline', (data && data.error) || 'Die Klassen-Rangliste ist gerade nicht erreichbar.', res.status);
      throw new ApiError('server', (data && data.error) || 'Dein Eintrag wurde nicht angenommen.', res.status);
    }
    return data;
  }

  function applyServer(data) {
    const list = Array.isArray(data.entries) ? data.entries : [];
    net.entries = list
      .filter((e) => e && typeof e.id === 'string' && typeof e.name === 'string' && Number.isFinite(e.score) && Number.isFinite(e.ts))
      .map((e) => ({
        id: e.id.slice(0, 40),
        name: e.name.slice(0, NAME_MAX),
        score: Math.max(0, Math.min(MAX_POINTS, Math.round(e.score))),
        accuracy: Number.isFinite(e.accuracy) ? Math.max(0, Math.min(100, Math.round(e.accuracy))) : null,
        ts: Math.min(e.ts, Date.now()),
      }))
      .sort((a, b) => b.score - a.score || a.ts - b.ts);
    net.day = typeof data.day === 'string' ? data.day : todayKey();
    net.status = 'online';
    net.at = Date.now();
  }

  // Nur die Ansichten mit Rangliste neu zeichnen – Eingaben und Fokus bleiben erhalten
  function softRender() {
    if (ui.route !== 'abschluss' && ui.route !== 'home') return;
    const active = document.activeElement;
    const focus = active && active.id && active.matches('#app input') ? { id: active.id, a: active.selectionStart, b: active.selectionEnd } : null;
    const values = [...document.querySelectorAll('#app input[id]')].map((el) => [el.id, el.value]);
    render({ keepScroll: true });
    values.forEach(([id, v]) => { const el = document.getElementById(id); if (el) el.value = v; });
    if (focus) {
      const el = document.getElementById(focus.id);
      if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(focus.a, focus.b); } catch { /* egal */ } }
    }
  }

  async function loadRemote({ manual = false } = {}) {
    if (net.busy) return;
    net.busy = true;
    if (net.status === 'idle') net.status = 'loading';
    softRender();
    try {
      applyServer(await api('GET'));
      if (manual) toast(net.entries.length ? `Aktualisiert – ${net.entries.length} ${net.entries.length === 1 ? 'Eintrag' : 'Einträge'} heute.` : 'Aktualisiert – heute noch keine Einträge.', 'refresh');
    } catch (err) {
      net.status = 'offline';
      net.at = Date.now();
      if (manual) toast('Klassen-Rangliste nicht erreichbar – du siehst die lokale Rangliste.', 'info');
    } finally {
      net.busy = false;
      softRender();
    }
  }

  const needsRefresh = () => net.status === 'idle' || Date.now() - net.at > 15000;

  // online: echte Einträge (simulierte nur, solange heute noch niemand eingetragen ist)
  // offline/laden: lokale Rangliste dieses Geräts wie bisher
  function boardMode() {
    if (net.status === 'online') return net.entries.length ? 'live' : 'demo';
    if (net.status === 'offline') return 'local';
    return 'loading';
  }

  function leaderboard() {
    const mode = boardMode();
    if (mode === 'live') return net.entries.map((e) => ({ ...e, you: isMine(e) }));
    if (mode === 'demo') return botEntries();
    const own = loadBoard().entries.map((e) => ({ ...e, you: true }));
    return [...botEntries(), ...own].sort((a, b) => b.score - a.score || a.ts - b.ts);
  }

  const avatarColor = (name) => AVATAR_COLORS[hash(name) % AVATAR_COLORS.length];

  /* =====================================================================
   * 8. FRAGEN-ENGINE
   * ===================================================================== */
  function newSession(id, ctx) {
    const q = QUESTIONS[id];
    const s = { id, ctx, revealed: false, correct: null, sel: null, order: null, pool: null, startedAt: performance.now(), seconds: null };
    if (q.type === 'choice' || q.type === 'multi') {
      const idx = q.options.map((_, i) => i);
      s.order = q.optionOrder === 'fixed' ? idx : shuffle(idx);
      if (q.type === 'multi') s.sel = [];
    }
    if (q.type === 'order') {
      let pool = shuffle(q.items.map((_, i) => i));
      if (pool.every((v, i) => v === i)) pool = [...pool.slice(1), pool[0]];   // nie schon richtig sortiert starten
      s.pool = pool;
      s.sel = [];
    }
    if (q.type === 'match') s.sel = q.rows.map(() => null);
    return s;
  }

  function evaluate(q, sel) {
    switch (q.type) {
      case 'choice': case 'domain': return sel === q.correct;
      case 'tf': return sel === q.answer;
      case 'multi': return sel.length === q.correct.length && q.correct.every((i) => sel.includes(i));
      case 'order': return sel.length === q.items.length && sel.every((v, i) => v === i);
      case 'match': return q.rows.every((r, i) => sel[i] === r.cat);
      default: return false;
    }
  }

  const readyToCheck = (q, s) =>
    (q.type === 'multi' && s.sel.length > 0) ||
    (q.type === 'order' && s.sel.length === q.items.length) ||
    (q.type === 'match' && s.sel.every((v) => v !== null));

  function urlBar(v) {
    const lockIcon = v.secure ? icon('lock') : icon('unlock');
    return `
      <div class="browser" aria-hidden="true">
        <div class="browser__bar">
          <div class="browser__dots"><span></span><span></span><span></span></div>
          <div class="browser__url">
            <span class="lock-btn ${v.secure ? '' : 'lock-btn--open'}">${lockIcon}</span>
            <span class="browser__url-text">${v.secure ? '' : '<span>Nicht sicher · </span>'}<b>${esc(v.url)}</b></span>
          </div>
        </div>
      </div>`;
  }

  function renderOptions(q, s) {
    const multi = q.type === 'multi';
    return `<div class="options" role="${multi ? 'group' : 'radiogroup'}">${s.order.map((i, pos) => {
      let cls = '', mark = '';
      const chosen = multi ? s.sel.includes(i) : s.sel === i;
      if (s.revealed) {
        const isRight = multi ? q.correct.includes(i) : i === q.correct;
        if (isRight && chosen) { cls = 'is-correct'; mark = icon('check', 'option__mark'); }
        else if (isRight) { cls = multi ? 'is-missed' : 'is-correct'; mark = icon('check', 'option__mark'); }
        else if (chosen) { cls = 'is-wrong'; mark = icon('x', 'option__mark'); }
        else cls = 'is-dim';
      }
      return `
        <button type="button" class="option ${cls}" data-action="${multi ? 'q-toggle' : 'q-pick'}" data-i="${i}"
          ${multi && !s.revealed ? `aria-pressed="${chosen}"` : ''} ${s.revealed ? 'disabled' : ''}>
          <span class="option__key">${'ABCDEF'[pos]}</span>
          <span class="option__text">${esc(q.options[i])}</span>${mark}
        </button>`;
    }).join('')}</div>`;
  }

  function renderTF(q, s) {
    return `<div class="tf" role="radiogroup">${[[true, 'Richtig'], [false, 'Falsch']].map(([val, label], pos) => {
      let cls = '';
      if (s.revealed) {
        if (val === q.answer) cls = 'is-correct';
        else if (s.sel === val) cls = 'is-wrong';
        else cls = 'is-dim';
      }
      return `<button type="button" class="option ${cls}" data-action="q-pick" data-i="${val ? 1 : 0}" ${s.revealed ? 'disabled' : ''}>
        <span class="option__key">${pos + 1}</span><span>${label}</span></button>`;
    }).join('')}</div>`;
  }

  function renderDomain(q, s) {
    return `<div class="urlpick" role="group" aria-label="Adresse in Teilen">${q.parts.map((p, i) => {
      let cls = '';
      if (s.revealed) cls = i === q.correct ? 'is-correct' : s.sel === i ? 'is-wrong' : '';
      return `<button type="button" class="urlpick__part ${cls}" data-action="q-pick" data-i="${i}" ${s.revealed ? 'disabled' : ''}>${esc(p)}</button>`;
    }).join('')}</div>`;
  }

  function renderOrder(q, s) {
    const slots = q.items.map((_, pos) => {
      const item = s.sel[pos];
      if (item === undefined) return `<div class="order__slot"><span class="order__n">${pos + 1}</span><span>…</span></div>`;
      const state = s.revealed ? (item === pos ? 'order__slot--ok' : 'order__slot--bad') : '';
      return `<div class="order__slot order__slot--filled ${state}"><span class="order__n">${pos + 1}</span><span>${esc(q.items[item])}</span></div>`;
    }).join('');
    const pool = s.revealed ? '' : `
      <div class="order__pool">${s.pool.map((i) => `
        <button type="button" class="order__chip" data-action="q-order" data-i="${i}" ${s.sel.includes(i) ? 'disabled' : ''}>${esc(q.items[i])}</button>`).join('')}
      </div>
      ${s.sel.length ? `<div><button type="button" class="btn btn--text btn--sm" data-action="q-order-undo">${icon('rotate')} Letzten Schritt zurücknehmen</button></div>` : ''}`;
    const solution = s.revealed && !s.correct
      ? `<div class="small muted"><strong>Richtige Reihenfolge:</strong> ${q.items.map((t, i) => `${i + 1}. ${esc(t)}`).join(' · ')}</div>` : '';
    return `<div class="order">${slots}</div>${pool}${solution}`;
  }

  function renderMatch(q, s) {
    return `<div class="match">${q.rows.map((r, ri) => {
      const chosen = s.sel[ri];
      const rowCls = s.revealed ? (chosen === r.cat ? 'is-correct' : 'is-wrong') : '';
      return `
        <div class="match__row ${rowCls}">
          <div class="match__text">${esc(r.t)}</div>
          <div class="match__cats" role="radiogroup" aria-label="Kriterium für: ${esc(r.t)}">
            ${CRITERIA_NAMES.map((name, ci) => {
              const pressed = chosen === ci;
              let cls = '';
              if (s.revealed) cls = ci === r.cat ? 'is-solution' : pressed ? 'is-wrong-pick' : 'is-dim';
              return `<button type="button" class="match__cat ${cls}" data-action="q-match" data-row="${ri}" data-cat="${ci}"
                ${s.revealed ? '' : `aria-pressed="${pressed}"`} ${s.revealed ? 'disabled' : ''}>${esc(name)}</button>`;
            }).join('')}
          </div>
          ${s.revealed && chosen !== r.cat ? `<div class="match__fix">Richtig wäre: ${esc(CRITERIA_NAMES[r.cat])}</div>` : ''}
        </div>`;
    }).join('')}</div>`;
  }

  const NEXT_LABEL = {
    checkpoint: (last) => (last ? 'Weiter zu Etappe 2' : 'Nächste Lektion'),
    case: (last) => (last ? 'Auswertung ansehen' : 'Nächster Fall'),
    quiz: (last) => (last ? 'Resultat ansehen' : 'Nächste Frage'),
    trainer: () => 'Weiter',
  };

  function renderQuestion(s, { label = '', last = false, nextAction = 'q-next' } = {}) {
    const q = QUESTIONS[s.id];
    let body = '';
    if (q.type === 'choice' || q.type === 'multi') body = renderOptions(q, s);
    else if (q.type === 'tf') body = renderTF(q, s);
    else if (q.type === 'domain') body = renderDomain(q, s);
    else if (q.type === 'order') body = renderOrder(q, s);
    else if (q.type === 'match') body = renderMatch(q, s);

    const hint = { multi: 'Mehrere Antworten möglich', order: 'Reihenfolge antippen', match: 'Zuordnen', domain: 'Adresse antippen', tf: 'Richtig oder falsch?' }[q.type];
    const check = !s.revealed && ['multi', 'order', 'match'].includes(q.type)
      ? `<button type="button" class="btn btn--primary" data-action="q-check" ${readyToCheck(q, s) ? '' : 'disabled'}>Antwort prüfen ${icon('check')}</button>` : '';
    const feedback = s.revealed ? `
      <div class="feedback ${s.correct ? 'feedback--ok' : 'feedback--bad'}" role="status">
        <div class="feedback__title">${icon(s.correct ? 'check' : 'info')} ${s.correct ? pickPraise() : 'Noch nicht ganz – kein Problem.'}</div>
        <p class="feedback__text">${q.explain}</p>
        ${!s.correct && s.ctx !== 'trainer' ? '<p class="feedback__ref">Diese Aufgabe wandert in deinen Fehler-Trainer.</p>' : ''}
        <p class="feedback__ref">Lehrmittel · ${esc(q.ref)}</p>
      </div>
      <div class="row"><button type="button" class="btn btn--primary" data-action="${nextAction}" id="q-next">${NEXT_LABEL[s.ctx](last)} ${icon('right')}</button></div>` : '';

    return `
      <div class="qbox" data-qid="${s.id}">
        <div class="qbox__meta">
          <span class="kicker kicker--forest">${label}</span>
          ${hint ? `<span class="chip">${hint}</span>` : ''}
        </div>
        ${q.scenario ? `<p class="qbox__scenario">${esc(q.scenario)}</p>` : ''}
        ${q.visual ? urlBar(q.visual) : ''}
        <h3 class="qbox__q" id="q-title">${q.type === 'tf' ? `«${esc(q.q)}»` : esc(q.q)}</h3>
        ${body}
        ${check}
        ${feedback}
      </div>`;
  }

  let praiseIdx = 0;
  const PRAISE = ['Richtig – sauber erkannt.', 'Genau so.', 'Treffer.', 'Stark, das sitzt.', 'Richtig – du denkst wie eine Prüferin.'];
  const pickPraise = () => PRAISE[praiseIdx++ % PRAISE.length];

  // Antwort auswerten – einzige Stelle, an der Punkte, Fehler-Trainer und Fortschritt verändert werden
  function submit() {
    const s = ui.q;
    if (!s || s.revealed) return;
    const q = QUESTIONS[s.id];
    s.correct = evaluate(q, s.sel);
    s.seconds = (performance.now() - s.startedAt) / 1000;   // Zeit läuft nur bis zur Antwort
    s.revealed = true;
    if (s.correct) sound.correct(); else sound.wrong();
    onAnswered(s);
    save();
    render({ keepScroll: true });
    requestAnimationFrame(() => $('#q-next')?.focus({ preventScroll: true }));
  }

  function onAnswered(s) {
    const key = `q:${s.id}`;
    if (s.correct) {
      if (removeWeak(key) && s.ctx === 'trainer') profile.mastered += 1;
    } else {
      addWeak(key);
    }

    if (s.ctx === 'checkpoint') {
      const lesson = LESSONS.find((l) => l.checkpoint === s.id);
      if (lesson && !profile.lessons.includes(lesson.id)) {
        profile.lessons.push(lesson.id);
        if (profile.lessons.length === LESSONS.length) {
          setTimeout(() => { sound.fanfare(); toast('Etappe 1 geschafft – die ganze Theorie sitzt!', 'award'); }, 650);
        }
      }
    }

    if (s.ctx === 'case') {
      profile.cases[s.id] = s.correct;
      ui.cases.results[s.id] = s.correct;
    }

    if (s.ctx === 'quiz') {
      const run = ui.quiz;
      if (!run || run.answered[run.idx] !== undefined) return;   // nie doppelt zählen
      run.answered[run.idx] = s.correct;
      if (s.correct) {
        run.streak += 1;
        run.bestStreak = Math.max(run.bestStreak, run.streak);
        const bonus = tempoBonus(QUESTIONS[s.id].type, s.seconds);
        const gained = pointsFor(run.streak, bonus);
        run.correct += 1;
        run.points += gained;
        run.lastGain = gained;
        run.lastBonus = bonus;
      } else {
        run.streak = 0;
        run.lastGain = 0;
        run.lastBonus = 0;
      }
    }

    if (s.ctx === 'trainer') {
      const t = ui.trainer;
      if (t) {
        if (s.correct) t.cleared += 1;
        else t.queue.push(`q:${s.id}`);   // falsch → später nochmal
      }
    }
  }

  /* =====================================================================
   * 9. ILLUSTRATIONEN
   * ===================================================================== */
  function heroArt() {
    return `
      <svg viewBox="0 0 520 440" role="img" aria-label="Illustration: Browserfenster mit Schloss-Symbol, Prüfliste, Lupe und Prüfstempel">
        <defs>
          <pattern id="hg" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M22 0H0V22" fill="none" stroke="#E5E2DC" stroke-width="1"/></pattern>
        </defs>
        <rect x="26" y="36" width="452" height="370" rx="26" fill="url(#hg)" transform="rotate(-3 252 221)"/>
        <g transform="rotate(1.2 260 210)">
          <rect x="58" y="66" width="384" height="290" rx="20" fill="#FFFFFF" stroke="#D3CEC4"/>
          <path d="M58 86a20 20 0 0 1 20-20h344a20 20 0 0 1 20 20v28H58z" fill="#F3F1EB"/>
          <circle cx="82" cy="90" r="5" fill="#E07A5F"/><circle cx="98" cy="90" r="5" fill="#D3CEC4"/><circle cx="114" cy="90" r="5" fill="#D3CEC4"/>
          <rect x="132" y="77" width="290" height="27" rx="8" fill="#FFFFFF" stroke="#E5E2DC"/>
          <g transform="translate(142 83)" fill="none" stroke="#2D6A4F" stroke-width="2" stroke-linecap="round">
            <rect x="0" y="6.5" width="11" height="8.5" rx="1.8"/><path d="M2.6 6.5V4.4a2.9 2.9 0 0 1 5.8 0v2.1"/>
          </g>
          <text x="162" y="95" font-family="ui-monospace,Consolas,monospace" font-size="12.5" fill="#1C1917" font-weight="600">https://</text>
          <text x="221" y="95" font-family="ui-monospace,Consolas,monospace" font-size="12.5" fill="#6B655E">quelle.ch/artikel</text>

          <rect x="86" y="138" width="170" height="14" rx="7" fill="#1C1917"/>
          <rect x="86" y="164" width="200" height="8" rx="4" fill="#E5E2DC"/>
          <rect x="86" y="180" width="184" height="8" rx="4" fill="#E5E2DC"/>
          <rect x="86" y="196" width="196" height="8" rx="4" fill="#E5E2DC"/>
          <rect x="86" y="220" width="200" height="104" rx="12" fill="#FBECE6"/>
          <path d="M100 306l38-40 26 26 22-18 46 32z" fill="#E07A5F" opacity=".55"/>
          <circle cx="248" cy="246" r="10" fill="#D97706" opacity=".55"/>

          <g font-family="Avenir Next,Segoe UI,Helvetica,Arial,sans-serif" font-size="13" font-weight="700" fill="#1C1917">
            ${['URL', 'Autor & Datum', 'Stil/Qualität', 'Motive'].map((t, i) => `
              <g transform="translate(306 ${144 + i * 38})">
                <circle cx="10" cy="10" r="10" fill="${i < 3 ? '#2D6A4F' : '#FFFFFF'}" stroke="#2D6A4F" stroke-width="1.6"/>
                ${i < 3 ? '<path d="M5.5 10.2l3 3 6-6.4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' : ''}
                <text x="28" y="14.5">${esc(t)}</text>
              </g>`).join('')}
          </g>
        </g>

        <g transform="translate(398 326)">
          <circle r="54" fill="#FAF9F6" fill-opacity=".55" stroke="#1B4332" stroke-width="10"/>
          <path d="M38 38 76 76" stroke="#1B4332" stroke-width="16" stroke-linecap="round"/>
          <path d="M-20 0l12 12 26-26" fill="none" stroke="#2D6A4F" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
        </g>

        <g transform="translate(108 362) rotate(-12)">
          <circle r="46" fill="#FAF9F6" stroke="#E07A5F" stroke-width="3"/>
          <circle r="38" fill="none" stroke="#E07A5F" stroke-width="1.4" stroke-dasharray="3 4"/>
          <text y="-2" text-anchor="middle" font-family="Avenir Next,Segoe UI,Helvetica,Arial,sans-serif" font-size="14" font-weight="800" letter-spacing="2" fill="#E07A5F">GEPRÜFT</text>
          <text y="16" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="10" fill="#C2583E">KAPITEL 10</text>
        </g>

        <g transform="translate(372 34) rotate(5)">
          <rect width="122" height="104" rx="4" fill="#FFF7DD" stroke="#F0E2B4"/>
          <rect x="34" y="-9" width="54" height="17" fill="#E07A5F" opacity=".3"/>
          <g font-family="Iowan Old Style,Georgia,serif" font-style="italic" font-size="14" fill="#1C1917">
            <text x="14" y="34">aktuell?</text>
            <text x="14" y="58">seriös?</text>
            <text x="14" y="82">viele Aspekte?</text>
          </g>
        </g>
      </svg>`;
  }

  // Schlüssel-Glyphe: runder Griff, waagrechter Bart mit zwei Zähnen
  const keyGlyph = (x, y, color = '#D97706', s = 1) => `
    <g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="6" cy="8" r="5"/><circle cx="6" cy="8" r="1.4" fill="${color}" stroke="none"/><path d="M11 8h13M19 8v4M23 8v3"/>
    </g>`;

  function tlsDiagram(step) {
    const display = 'font-family="Avenir Next,Segoe UI,Helvetica,Arial,sans-serif"';
    const mono = 'font-family="ui-monospace,Consolas,monospace"';
    const client = `
      <g transform="translate(14 54)">
        <rect x="0" y="0" width="108" height="72" rx="10" fill="#FFFFFF" stroke="#1C1917" stroke-width="2.2"/>
        <rect x="9" y="9" width="90" height="46" rx="4" fill="#E7F0EA"/>
        <path d="M-8 82h124" stroke="#1C1917" stroke-width="3.4" stroke-linecap="round"/>
        <text x="54" y="114" text-anchor="middle" ${display} font-size="18" font-weight="700" fill="#1C1917">Client</text>
        <text x="54" y="134" text-anchor="middle" ${display} font-size="14" fill="#6B655E">dein Gerät</text>
      </g>`;
    const server = `
      <g transform="translate(380 44)">
        <rect x="0" y="0" width="84" height="40" rx="7" fill="#FFFFFF" stroke="#1C1917" stroke-width="2.2"/>
        <rect x="0" y="48" width="84" height="40" rx="7" fill="#FFFFFF" stroke="#1C1917" stroke-width="2.2"/>
        <circle cx="16" cy="20" r="4" fill="#2D6A4F"/><circle cx="16" cy="68" r="4" fill="#2D6A4F"/>
        <path d="M32 20h36M32 68h36" stroke="#D3CEC4" stroke-width="3.4" stroke-linecap="round"/>
        <text x="42" y="124" text-anchor="middle" ${display} font-size="18" font-weight="700" fill="#1C1917">Server</text>
        <text x="42" y="144" text-anchor="middle" ${display} font-size="14" fill="#6B655E">die Website</text>
      </g>`;
    const line = '<path d="M136 90H372" stroke="#D3CEC4" stroke-width="2.4" stroke-dasharray="6 7"/>';
    let packet = '', extra = '';
    if (step === 0) {
      packet = `<g class="tls__packet" style="--dx:150px"><g transform="translate(142 72)">
        <rect width="84" height="36" rx="18" fill="#1B4332"/><text x="42" y="24" text-anchor="middle" ${display} font-size="16" font-weight="700" fill="#fff">Hallo!</text></g></g>`;
      extra = `<text x="254" y="232" text-anchor="middle" ${display} font-size="15" fill="#6B655E">Der Client meldet sich beim Server.</text>`;
    } else if (step === 1) {
      packet = `<g class="tls__packet" style="--dx:-160px"><g transform="translate(296 62)">
        <rect width="74" height="56" rx="7" fill="#FFFFFF" stroke="#2D6A4F" stroke-width="2.4"/>
        <text x="37" y="24" text-anchor="middle" ${mono} font-size="15" font-weight="700" fill="#1B4332">X.509</text>
        <path d="M14 36h46M14 45h28" stroke="#D3CEC4" stroke-width="3" stroke-linecap="round"/>
        <circle cx="62" cy="50" r="9" fill="#E07A5F"/></g></g>`;
      extra = `
        <g transform="translate(112 40)"><circle r="16" fill="#2D6A4F"/><path d="M-7 1l4.5 4.5 9-9.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>
        <text x="254" y="232" text-anchor="middle" ${display} font-size="15" fill="#6B655E">Zertifikat vertrauenswürdig? Servername passt?</text>`;
    } else if (step === 2) {
      packet = `<g class="tls__packet" style="--dx:128px"><g transform="translate(142 68)">
        <rect width="92" height="44" rx="9" fill="#FDF1DE" stroke="#D97706" stroke-width="2.4"/>
        ${keyGlyph(10, 14)}
        <text x="66" y="28" text-anchor="middle" ${mono} font-size="14" font-weight="700" fill="#9A5A06">#7Q</text></g></g>`;
      extra = `<text x="254" y="232" text-anchor="middle" ${display} font-size="15" fill="#6B655E">geheime Zufallszahl – mit dem öffentlichen Schlüssel verschlüsselt</text>`;
    } else {
      packet = `<g class="tls__packet" style="--dx:130px"><g transform="translate(142 74)">
        <rect width="112" height="32" rx="16" fill="#1C1917"/>
        <text x="56" y="22" text-anchor="middle" ${mono} font-size="16" fill="#F9E1A8">§%Ω#7k¤</text></g></g>`;
      extra = `
        <g transform="translate(68 18)"><circle r="17" fill="#FDF1DE" stroke="#D97706" stroke-width="1.8"/>${keyGlyph(-13, -8, '#D97706', 0.95)}</g>
        <g transform="translate(422 18)"><circle r="17" fill="#FDF1DE" stroke="#D97706" stroke-width="1.8"/>${keyGlyph(-13, -8, '#D97706', 0.95)}</g>
        <g transform="translate(254 150)"><rect x="-52" y="-17" width="104" height="32" rx="16" fill="#E7F0EA" stroke="#2D6A4F" stroke-width="1.6"/><text y="5" text-anchor="middle" ${display} font-size="15" font-weight="700" fill="#1B4332">MAC geprüft</text></g>
        <text x="254" y="232" text-anchor="middle" ${display} font-size="15" fill="#6B655E">Beide haben denselben Schlüssel – symmetrisch</text>`;
    }
    return `
      <svg viewBox="0 0 480 244" role="img" aria-label="Schema: ${esc(TLS_STEPS[step].title)} zwischen Client und Server">
        ${line}${client}${server}${extra}${packet}
      </svg>`;
  }

  // «Datensalat»: aus Klartext wird reproduzierbares Zeichenwirrwarr
  function scramble(text) {
    const pool = '§%Ω#&@¤µ∆◊※☺☻7k9QxZ2bR+=?!*^~';
    const rnd = seeded(hash(text || ' '));
    let out = '';
    for (let i = 0; i < Math.max(12, text.length); i++) out += pool[Math.floor(rnd() * pool.length)];
    return out;
  }

  /* =====================================================================
   * 10. ANSICHTEN
   * ===================================================================== */
  const NAV = [
    { key: 'home', href: '#/', label: 'Start', icon: 'home' },
    { key: 'theorie', href: '#/theorie', label: 'Theorie', icon: 'book', nr: '01' },
    { key: 'ueben', href: '#/ueben', label: 'Üben', icon: 'cards', nr: '02' },
    { key: 'quiz', href: '#/quiz', label: 'Quiz', icon: 'target', nr: '03' },
    { key: 'abschluss', href: '#/abschluss', label: 'Abschluss', icon: 'award', nr: '04' },
  ];

  function renderChrome() {
    $('#topnav').innerHTML = NAV.slice(1).map((n) => `
      <a class="topnav__link" href="${n.href}" ${ui.route === n.key ? 'aria-current="page"' : ''}><span class="topnav__num">${n.nr}</span>${n.label}</a>`).join('');
    $('#bottomnav').innerHTML = NAV.map((n) => `
      <a class="bottomnav__link" href="${n.href}" ${ui.route === n.key ? 'aria-current="page"' : ''}>${icon(n.icon)}<span>${n.label}</span></a>`).join('');
    const weak = profile.weak.length;
    $('#tools').innerHTML = `
      <a class="icon-btn" href="#/ueben/fehler" aria-label="Fehler-Trainer${weak ? `: ${weak} offene Aufgaben` : ''}" title="Fehler-Trainer">
        ${icon('repeat')}${weak ? `<span class="badge-dot">${weak}</span>` : ''}
      </a>
      <button type="button" class="icon-btn" data-action="toggle-sound" aria-pressed="${!sound.enabled}" aria-label="${sound.enabled ? 'Ton ausschalten' : 'Ton einschalten'}" title="${sound.enabled ? 'Ton aus' : 'Ton an'}">
        ${icon(sound.enabled ? 'volume' : 'mute')}
      </button>`;
  }

  const anim = (cls = 'enter') => (ui.animate ? cls : '');

  /* ---------- Start ---------- */
  function viewHome() {
    const prog = stageProgress();
    const nextStage = prog.findIndex((p) => p < 1);
    const stages = [
      { nr: '01', title: 'Spielerische Theorie', text: 'TLS, HTTPS und die Kriterien in sechs kurzen Lektionen – mit Aha-Karten und Kurz-Checks.', href: '#/theorie', meta: `${profile.lessons.length} / ${LESSONS.length} Lektionen` },
      { nr: '02', title: 'Üben', text: 'Karteikarten zum Umdrehen, echte Fallbeispiele und dein persönlicher Fehler-Trainer.', href: '#/ueben', meta: `${FLASHCARDS.filter((c) => profile.cards[c.id] === 'known').length} Karten sitzen · ${Object.keys(profile.cases).length}/${CASE_IDS.length} Fälle` },
      { nr: '03', title: 'Das grosse Quiz', text: `${QUIZ_IDS.length} abwechslungsreiche Aufgaben mit Serien-Multiplikator und Erklärung zu jeder Antwort.`, href: '#/quiz', meta: profile.quiz.best ? `Bestes Resultat: ${profile.quiz.best.correct}/${QUIZ_IDS.length}` : 'Noch nicht gespielt' },
      { nr: '04', title: 'Urkunde & Rangliste', text: 'Deine persönliche Urkunde – und ein Platz in der heutigen Tages-Rangliste.', href: '#/abschluss', meta: profile.claimed ? 'Eingetragen' : profile.quiz.best ? 'Bereit zum Eintragen' : 'Nach dem Quiz' },
    ];
    const list = leaderboard();
    const leader = list[0];
    const note = NOTES[hash(todayKey()) % NOTES.length];
    const ctaHref = nextStage === -1 ? '#/abschluss' : stages[nextStage].href;
    const ctaLabel = nextStage === -1 ? 'Zur Urkunde' : `Weiter mit Etappe ${stages[nextStage].nr}`;

    return `
      <section class="wrap">
        <div class="hero">
          <div class="${anim()}">
            <div class="hero__chapter"><span class="hero__chapter-num">10</span><span class="kicker">Lehrmittel Kommunikation · Kapitel 10</span></div>
            <h1 class="display" style="margin-top:18px">Sicher <span class="marker">recherchieren</span>.</h1>
            <p class="lead" style="margin-top:18px">Woran erkennst du eine verschlüsselte Verbindung – und woran eine verlässliche Information? In vier Etappen vom Schloss-Symbol bis zur eigenen Urkunde.</p>
            <div style="margin-top:28px">
              ${profile.name ? `
                <p class="muted">Willkommen zurück, <strong style="color:var(--ink)">${esc(profile.name)}</strong>.</p>
                <div class="row" style="margin-top:14px">
                  <a class="btn btn--primary" href="${ctaHref}">${ctaLabel} ${icon('right')}</a>
                  <button type="button" class="btn btn--text btn--sm" data-action="rename">Name ändern</button>
                </div>` : `
                <form class="hero__form" id="name-form" autocomplete="off">
                  <label class="sr-only" for="name-input">Dein Vorname</label>
                  <input class="input" id="name-input" name="name" maxlength="24" placeholder="Dein Vorname" required>
                  <button class="btn btn--primary" type="submit">Los geht's ${icon('right')}</button>
                </form>
                <p class="small muted" style="margin-top:10px">Dein Name erscheint auf deiner Urkunde. In die Klassen-Rangliste kommt er erst, wenn du dich nach dem Quiz selbst einträgst.</p>`}
            </div>
          </div>
          <div class="hero__art ${anim('enter-2')}">${heroArt()}</div>
        </div>
      </section>

      <section class="wrap section">
        <div class="row row--between" style="align-items:flex-end; margin-bottom:22px">
          <div>
            <p class="kicker">Deine Route</p>
            <h2 class="h2" style="margin-top:6px">Vier Etappen, ein Kapitel</h2>
          </div>
        </div>
        <div class="route stagger">
          ${stages.map((st, i) => `
            <a class="card stage ${prog[i] >= 1 ? 'stage--done' : ''}" href="${st.href}">
              <div class="stage__top">
                <span class="stage__num">${st.nr}</span>
                ${prog[i] >= 1 ? `<span class="chip chip--forest">${icon('check')} Erledigt</span>` : i === nextStage ? '<span class="chip chip--terra">Als Nächstes</span>' : ''}
              </div>
              <h3 class="stage__title">${st.title}</h3>
              <p class="stage__text">${st.text}</p>
              <div>
                <div class="meter"><div class="meter__fill ${i === 3 ? 'meter__fill--terra' : ''}" data-progress="${Math.round(prog[i] * 100)}"></div></div>
                <p class="small muted" style="margin-top:8px">${st.meta}</p>
              </div>
            </a>`).join('')}
        </div>
      </section>

      <section class="wrap" style="padding-bottom:64px">
        <div class="grid grid--3">
          <a class="card card--pad" href="#/ueben/fehler" style="text-decoration:none;color:inherit">
            <p class="kicker kicker--terra">Fehler-Trainer</p>
            <p class="h2 tnum" style="margin-top:10px">${profile.weak.length}</p>
            <p class="muted small">${profile.weak.length ? 'offene Aufgaben warten auf dich – trainiere sie, bis alles sitzt.' : 'offene Aufgaben. Alles, was du falsch beantwortest, landet automatisch hier.'}</p>
            ${profile.mastered ? `<p class="small" style="margin-top:10px;color:var(--forest-2);font-weight:600">${profile.mastered} schon gemeistert</p>` : ''}
          </a>
          <a class="card card--pad" href="#/abschluss" style="text-decoration:none;color:inherit">
            <p class="kicker kicker--forest">Tages-Rangliste</p>
            ${boardMode() === 'loading' ? `
              <p class="lb-loading lb-loading--inline" role="status" style="margin-top:12px"><span class="spinner" aria-hidden="true"></span>Lade Klassen-Rangliste …</p>`
              : boardMode() === 'demo' ? `
              <p class="h3" style="margin-top:12px">Heute noch niemand aus deiner Klasse.</p>
              <p class="muted small">Hol dir den ersten Platz in der Live-Rangliste!</p>`
              : leader ? `
              <p class="h3" style="margin-top:12px">Heute vorne: ${esc(leader.name)}</p>
              <p class="muted small">${leader.score} Punkte · ${list.length} ${list.length === 1 ? 'Eintrag' : 'Einträge'} heute${boardMode() === 'live' ? ' · <span class="live-dot">live</span>' : ''}</p>` : '<p class="h3" style="margin-top:12px">Noch niemand heute.</p><p class="muted small">Hol dir den ersten Platz!</p>'}
            <p class="small" style="margin-top:12px;font-weight:600;color:var(--forest-2)">Zur Rangliste →</p>
          </a>
          <div class="note">
            <p class="note__label">Merksatz des Tages</p>
            <p class="note__text">${esc(note)}</p>
          </div>
        </div>
      </section>`;
  }

  /* ---------- Etappe 1: Theorie ---------- */
  function aha(id, title, text, iconName = 'spark') {
    const open = ui.open.has(id);
    return `
      <button type="button" class="aha" data-action="toggle-open" data-id="${id}" aria-expanded="${open}">
        <span class="aha__head">
          <span class="aha__icon">${icon(iconName)}</span>
          <span class="aha__title">${title}</span>
          ${icon('plus', 'aha__chev')}
        </span>
        <span class="aha__body"><span class="aha__inner"><span class="aha__text" style="display:block">${text}</span></span></span>
      </button>`;
  }

  function lessonBody(id) {
    if (id === 'l-ssl') {
      return `
        <div class="margin-row">
          <div class="margin-row__label">Worum es geht</div>
          <div class="margin-row__body">Wer im Internet recherchiert, braucht zwei Dinge: eine <strong>sichere Verbindung</strong> und <strong>verlässliche Informationen</strong>. Beim Thema Sicherheit bei Recherchen geht es darum, wie du beurteilen kannst, ob gefundene Informationen verlässlich und aktuell sind.</div>
        </div>
        <div class="margin-row">
          <div class="margin-row__label">SSL und TLS</div>
          <div class="margin-row__body">
            <p><span class="term">Secure Sockets Layer (SSL)</span> ist ein Verschlüsselungsprotokoll zur sicheren Datenübertragung im Internet. Heute ist diese Technik unter dem Namen <span class="term">TLS</span> bekannt – <em>Transport Layer Security</em>, auf Deutsch «Transportschichtsicherheit».</p>
            <div class="table-scroll" style="margin-top:18px">
              <table class="compare">
                <thead><tr><th></th><th>SSL</th><th>TLS</th></tr></thead>
                <tbody>
                  <tr><th scope="row">Steht für</th><td>Secure Sockets Layer</td><td class="hl">Transport Layer Security</td></tr>
                  <tr><th scope="row">Rolle</th><td>Vorgänger</td><td class="hl">heutiger Nachfolger, noch sicherer</td></tr>
                  <tr><th scope="row">Wozu?</th><td colspan="2">Abhör- und fälschungssicheres Übertragen mit Verschlüsselung – z. B. beim E-Shopping oder E-Banking, wo heikle Daten bekanntgegeben werden.</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="margin-row">
          <div class="margin-row__label">Aha!</div>
          <div class="margin-row__body stack" style="--gap:10px">
            ${aha('a-ssl-1', 'Wo begegnet dir TLS im Alltag?', 'Jedes Mal, wenn in der Adressleiste ein Schloss erscheint: beim Login in die Schul-Plattform, beim E-Banking, beim Bestellen im Onlineshop oder beim Einloggen in soziale Medien.')}
            ${aha('a-ssl-2', 'Warum sagen viele immer noch «SSL»?', 'Der alte Name hat sich eingebürgert – etwa in «SSL-Zertifikat». Technisch ist heute fast immer TLS gemeint.', 'info')}
          </div>
        </div>`;
    }

    if (id === 'l-tls') {
      const st = TLS_STEPS[ui.tls];
      return `
        <div class="margin-row">
          <div class="margin-row__label">Funktionsweise</div>
          <div class="margin-row__body">
            <div class="tls">
              <div class="tls__steps" role="tablist" aria-label="TLS-Schritte">
                ${TLS_STEPS.map((s, i) => `<button type="button" role="tab" class="tls__dot ${ui.tlsSeen.has(i) ? 'tls__dot--seen' : ''}" data-action="tls-step" data-i="${i}" aria-selected="${i === ui.tls}" ${i === ui.tls ? 'aria-current="step"' : ''}>${i + 1}</button>`).join('')}
              </div>
              <div class="tls__diagram">${tlsDiagram(ui.tls)}</div>
              <div class="tls__caption" aria-live="polite">
                <p class="kicker kicker--terra">Schritt ${ui.tls + 1} von 4</p>
                <h4 class="h3" style="margin-top:4px">${st.title}</h4>
                <p style="margin-top:6px">${st.text}</p>
                <div class="row" style="margin-top:10px;gap:6px">${st.terms.map((t) => `<span class="chip chip--forest">${esc(t)}</span>`).join('')}</div>
              </div>
              <div class="row row--between">
                <button type="button" class="btn btn--ghost btn--sm" data-action="tls-step" data-i="${Math.max(0, ui.tls - 1)}" ${ui.tls === 0 ? 'disabled' : ''}>${icon('left')} Zurück</button>
                <button type="button" class="btn btn--primary btn--sm" data-action="tls-step" data-i="${Math.min(3, ui.tls + 1)}" ${ui.tls === 3 ? 'disabled' : ''}>Nächster Schritt ${icon('right')}</button>
              </div>
            </div>
          </div>
        </div>
        <div class="margin-row">
          <div class="margin-row__label">Vereinfacht</div>
          <div class="margin-row__body">
            <p>Weil beide Geräte – deines und der Server – die Daten nur noch verschlüsselt übertragen, würde eine Drittperson, die die Verbindung zu deiner Bank anschaut, statt Kontoangaben und Codes nur Smileys, Sonderzeichen und einen unerkennbaren Salat aus Buchstaben und Zahlen sehen. Probier's aus:</p>
            <div class="salad" style="margin-top:16px">
              <div class="salad__panel salad__panel--plain">
                <label class="kicker" for="salad-input">Was du sendest</label>
                <input class="input" id="salad-input" style="margin-top:8px;width:100%" maxlength="80" value="${esc(ui.salad)}">
              </div>
              <div class="salad__panel salad__panel--cipher" aria-live="polite">
                <p class="kicker">Was eine Drittperson sieht</p>
                <p class="salad__out" id="salad-out">${esc(scramble(ui.salad))}</p>
              </div>
            </div>
          </div>
        </div>`;
    }

    if (id === 'l-https') {
      const secureOpen = ui.lockOpen === 'secure';
      const insecureOpen = ui.lockOpen === 'insecure';
      return `
        <div class="margin-row">
          <div class="margin-row__label">https und Schloss</div>
          <div class="margin-row__body">Wird das TLS-Protokoll verwendet, siehst du das beim Surfen im Protokoll vor der Website-Adresse und am Schloss-Symbol. <span class="term">HTTPS</span> heisst <em>Hypertext Transfer Protocol Secure</em> – eine gesicherte Verbindung beginnt mit <span class="mono">https://</span>.</div>
        </div>
        <div class="margin-row">
          <div class="margin-row__label">Ausprobieren</div>
          <div class="margin-row__body stack" style="--gap:14px">
            <p class="small muted">Klicke auf das Symbol links in der Adresse – genau wie im echten Browser.</p>
            <div class="browser">
              <div class="browser__bar">
                <div class="browser__dots"><span></span><span></span><span></span></div>
                <div class="browser__url">
                  <button type="button" class="lock-btn" data-action="lock" data-which="secure" aria-expanded="${secureOpen}" aria-label="Infos zur Verbindung anzeigen">${icon('lock')}</button>
                  <span class="browser__url-text"><b>https://</b><span>www.meine-bank.ch/login</span></span>
                  ${secureOpen ? `
                    <div class="popover" role="dialog" aria-label="Infos zu meine-bank.ch">
                      <div class="popover__head">Info zu meine-bank.ch</div>
                      <div class="popover__row popover__row--ok">${icon('lock')} Verbindung ist sicher</div>
                      <div class="popover__row">${icon('shield')} Zertifikat (X.509) ist gültig</div>
                      <div class="popover__row">${icon('key')} Berechtigungen für diese Website</div>
                      <div class="popover__row">${icon('info')} Cookies und Websitedaten</div>
                    </div>` : ''}
                </div>
              </div>
              <div class="browser__body"><p class="small muted">E-Banking · Login</p><p class="h3" style="margin-top:4px">Bitte Vertragsnummer und Code eingeben</p></div>
            </div>
            <div class="browser">
              <div class="browser__bar">
                <div class="browser__dots"><span></span><span></span><span></span></div>
                <div class="browser__url">
                  <button type="button" class="lock-btn lock-btn--open" data-action="lock" data-which="insecure" aria-expanded="${insecureOpen}" aria-label="Infos zur Verbindung anzeigen">${icon('unlock')}</button>
                  <span class="browser__url-text"><span>Nicht sicher · </span><b>http://</b><span>ferienwohnung-angebot.ch/buchen</span></span>
                  ${insecureOpen ? `
                    <div class="popover" role="dialog" aria-label="Infos zu ferienwohnung-angebot.ch">
                      <div class="popover__head">ferienwohnung-angebot.ch</div>
                      <div class="popover__row popover__row--bad">${icon('alert')} Die Verbindung ist nicht sicher</div>
                      <div class="popover__row">${icon('x')} Keine Verschlüsselung (kein TLS)</div>
                      <div class="popover__row">${icon('info')} Gib hier keine Passwörter, Codes oder Kartennummern ein</div>
                    </div>` : ''}
                </div>
              </div>
              <div class="browser__body"><p class="small muted">Buchung · Zahlung</p><p class="h3" style="margin-top:4px">Kreditkartennummer eingeben</p></div>
            </div>
          </div>
        </div>
        <div class="margin-row">
          <div class="margin-row__label">Aha!</div>
          <div class="margin-row__body stack" style="--gap:10px">
            ${aha('a-https-1', 'Spätestens wann muss das Schloss da sein?', 'Spätestens beim Eingeben persönlicher Daten wie Kreditkartennummern, Codes und Schlüsseln sollte das Sicherheitsschloss eingeschnappt sein.', 'lock')}
            ${aha('a-https-2', 'Was verrät ein Klick aufs Schloss?', 'Du erhältst Informationen zur Website-Identifizierung – zum Beispiel, ob die Verbindung sicher ist und für wen das Zertifikat ausgestellt wurde.', 'search')}
            ${aha('a-https-3', 'Heisst Schloss automatisch «seriös»?', 'Nein. Das Schloss zeigt nur, dass die Verbindung verschlüsselt ist. Auch eine betrügerische Seite kann https haben. Ob der Inhalt verlässlich ist, prüfst du mit den Grundfragen und den Verifizierungs-Kriterien (Kapitel 10.2).', 'alert')}
          </div>
        </div>`;
    }

    if (id === 'l-areas') {
      return `
        <div class="margin-row">
          <div class="margin-row__label">Wann ist HTTPS wichtig?</div>
          <div class="margin-row__body">Auf diesen Websites solltest du nur dann Dateneingaben, Bestellungen und Transaktionen tätigen, wenn du zuvor das <span class="mono">https</span>-Protokoll festgestellt hast. Tippe auf eine Kachel für ein Beispiel.</div>
        </div>
        <div class="tiles stagger" style="margin-top:6px">
          ${HTTPS_AREAS.map((a, i) => {
            const open = ui.open.has(`tile-${i}`);
            return `<button type="button" class="tile" data-action="toggle-open" data-id="tile-${i}" aria-expanded="${open}">
              ${icon(a.icon)}<span class="tile__name">${a.name}</span><span class="tile__ex">${a.ex}</span></button>`;
          }).join('')}
        </div>
        <div class="margin-row" style="margin-top:12px">
          <div class="margin-row__label">Gut zu wissen</div>
          <div class="margin-row__body">Mittlerweile gelten auch Websites von <strong>Privaten, kleinen Firmen und Gemeinden</strong>, die keine verschlüsselte Übertragung haben, als <strong>unseriös</strong>.</div>
        </div>`;
    }

    if (id === 'l-three') {
      return `
        <div class="margin-row">
          <div class="margin-row__label">Kritisch beurteilen</div>
          <div class="margin-row__body">
            <p>Bevor Informationen verarbeitet werden, müssen sie sehr kritisch beurteilt werden. Dabei spielt es keine Rolle, woher sie stammen:</p>
            <div class="row" style="margin-top:12px;gap:6px">${SOURCES.map(([ic, s]) => `<span class="chip">${icon(ic)}${s}</span>`).join('')}</div>
          </div>
        </div>
        <div class="margin-row">
          <div class="margin-row__label">Immer fragen</div>
          <div class="margin-row__body">
            <p>Diese Fragen stellst du immer, bevor du Informationen sammelst und vor allem weiterleitest. Tippe auf eine Karte für ein Beispiel.</p>
            <div class="questions3 stagger" style="margin-top:16px">
              ${GRUNDFRAGEN.map((g, i) => {
                const open = ui.open.has(`q3-${i}`);
                return `<button type="button" class="qcard" data-action="toggle-open" data-id="q3-${i}" aria-expanded="${open}">
                  <span class="qcard__nr">${i + 1}</span>
                  <span class="qcard__q">${g.q}</span>
                  <span class="qcard__hint">Beispiel ansehen →</span>
                  <span class="qcard__ex">${g.ex}</span>
                </button>`;
              }).join('')}
            </div>
          </div>
        </div>`;
    }

    if (id === 'l-criteria') {
      return `
        <div class="margin-row">
          <div class="margin-row__label">Verifizierungs-Kriterien</div>
          <div class="margin-row__body">Diese vier Kriterien solltest du bei Informationen aus dem Internet beachten:</div>
        </div>
        <table class="compare compare--stack" style="margin-top:4px">
          <thead><tr><th>Kriterium</th><th>Das prüfst du</th><th>Warnsignal</th><th>Gutes Zeichen</th></tr></thead>
          <tbody>
            ${CRITERIA.map((c) => `
              <tr>
                <th scope="row"><span class="row" style="gap:8px">${icon(c.icon)}${c.name}</span></th>
                <td data-label="Das prüfst du">${c.checks}</td>
                <td data-label="Warnsignal">${c.warn}</td>
                <td data-label="Gutes Zeichen">${c.good}</td>
              </tr>`).join('')}
          </tbody>
        </table>
        <div class="margin-row">
          <div class="margin-row__label">Aha!</div>
          <div class="margin-row__body grid grid--2" style="gap:10px">
            ${CRITERIA.map((c) => aha(`a-crit-${c.key}`, `Profi-Trick: ${c.name}`, c.aha, c.icon)).join('')}
          </div>
        </div>`;
    }
    return '';
  }

  function viewTheory() {
    const idx = Math.max(0, Math.min(LESSONS.length - 1, ui.lesson));
    const lesson = LESSONS[idx];
    const done = profile.lessons.includes(lesson.id);
    const key = `cp:${lesson.id}`;
    if (!ui.q || ui.q.key !== key) { ui.q = newSession(lesson.checkpoint, 'checkpoint'); ui.q.key = key; }
    const last = idx === LESSONS.length - 1;

    return `
      <section class="wrap view">
        <div class="${anim()}">
          <p class="kicker">Etappe 01 · Spielerische Theorie</p>
          <div class="row row--between" style="margin-top:6px">
            <h1 class="h2">Das Arbeitsheft</h1>
            <span class="chip ${profile.lessons.length === LESSONS.length ? 'chip--forest' : ''}">${profile.lessons.length} / ${LESSONS.length} Lektionen</span>
          </div>
        </div>
        <div class="workbook" style="margin-top:24px">
          <nav class="toc" aria-label="Lektionen">
            ${LESSONS.map((l, i) => `
              <button type="button" class="toc__item ${profile.lessons.includes(l.id) ? 'toc__item--done' : ''}" data-action="lesson" data-i="${i}" aria-current="${i === idx}">
                <span class="toc__nr">${l.nr}</span><span class="toc__label">${l.title}</span>
                <span class="toc__check">${profile.lessons.includes(l.id) ? icon('check') : ''}</span>
              </button>`).join('')}
          </nav>
          <article class="card lesson ${anim('enter-2')}" aria-labelledby="lesson-title">
            <header class="lesson__head">
              <span class="lesson__nr">${lesson.nr}</span>
              <h2 class="lesson__title" id="lesson-title">${lesson.title}</h2>
            </header>
            ${lessonBody(lesson.id)}
            <div class="card card--tint card--pad" style="margin-top:28px" id="checkpoint">
              ${renderQuestion(ui.q, { label: `Kurz-Check ${done && !ui.q.revealed ? '· bereits gelöst' : ''}`, last })}
            </div>
            <div class="row row--between" style="margin-top:24px">
              <button type="button" class="btn btn--text" data-action="lesson" data-i="${idx - 1}" ${idx === 0 ? 'disabled' : ''}>${icon('left')} Zurück</button>
              ${last
                ? `<a class="btn btn--ghost" href="#/ueben">Zu Etappe 02 ${icon('right')}</a>`
                : `<button type="button" class="btn btn--ghost" data-action="lesson" data-i="${idx + 1}">Nächste Lektion ${icon('right')}</button>`}
            </div>
          </article>
        </div>
      </section>`;
  }

  /* ---------- Etappe 2: Üben ---------- */
  function buildDeck(onlyAgain = false) {
    let ids = FLASHCARDS.map((c) => c.id);
    if (onlyAgain) ids = ids.filter((id) => profile.cards[id] === 'again');
    // Unbekannte und «Nochmal»-Karten zuerst
    const rank = (id) => (profile.cards[id] === 'again' ? 0 : profile.cards[id] ? 2 : 1);
    ids = shuffle(ids).sort((a, b) => rank(a) - rank(b));
    return { order: ids, idx: 0, flipped: false, onlyAgain, seen: 0 };
  }

  function flashcard(card, flipped, extraActions = '') {
    return `
      <div class="flip ${flipped ? 'is-flipped' : ''}" id="flip">
        <div class="flip__inner" data-action="flip" role="button" tabindex="0" aria-pressed="${flipped}" aria-label="Karte umdrehen: ${esc(card.term)}">
          <div class="flip__face flip__face--front" aria-hidden="${flipped}">
            <p class="kicker kicker--terra">${esc(card.kicker)}</p>
            <p class="flip__term">${esc(card.term)}</p>
            <p class="flip__hint">${icon('flip')} Tippen oder Leertaste zum Umdrehen</p>
          </div>
          <div class="flip__face flip__face--back" aria-hidden="${!flipped}">
            <p class="kicker kicker--forest">${esc(card.term)}</p>
            <p class="flip__def">${esc(card.def)}</p>
            <p class="flip__ex">${esc(card.ex)}</p>
          </div>
        </div>
      </div>
      ${extraActions}`;
  }

  function viewCards() {
    if (!ui.deck) ui.deck = buildDeck();
    const d = ui.deck;
    const known = FLASHCARDS.filter((c) => profile.cards[c.id] === 'known').length;
    if (d.idx >= d.order.length) {
      const again = FLASHCARDS.filter((c) => profile.cards[c.id] === 'again').length;
      return `
        <div class="card card--pad ${anim()}" style="max-width:640px;margin:0 auto;text-align:center">
          <p class="kicker kicker--forest">Stapel durch</p>
          <h2 class="h2" style="margin-top:8px">${known === FLASHCARDS.length ? 'Alle Karten sitzen perfekt.' : 'Gut gemacht!'}</h2>
          <p class="muted" style="margin-top:10px">${known} von ${FLASHCARDS.length} Karten sitzen${again ? `, ${again} willst du nochmal üben` : ''}.</p>
          <div class="row" style="justify-content:center;margin-top:20px">
            ${again ? `<button type="button" class="btn btn--accent" data-action="deck-restart" data-only="1">${icon('repeat')} Nur «Nochmal»-Karten</button>` : ''}
            <button type="button" class="btn btn--ghost" data-action="deck-restart" data-only="0">${icon('rotate')} Ganzen Stapel mischen</button>
          </div>
        </div>`;
    }
    const card = CARD_BY_ID[d.order[d.idx]];
    return `
      <div class="${anim()}">
        <div class="row" style="justify-content:center;margin-bottom:14px">
          <span class="chip">Karte ${d.idx + 1} von ${d.order.length}</span>
          <span class="chip chip--forest">${known} / ${FLASHCARDS.length} sitzen</span>
        </div>
        <div class="deck-dots" aria-hidden="true" style="margin-bottom:18px">
          ${FLASHCARDS.map((c) => `<span class="${profile.cards[c.id] === 'known' ? 'is-known' : profile.cards[c.id] === 'again' ? 'is-again' : ''} ${c.id === card.id ? 'is-current' : ''}"></span>`).join('')}
        </div>
        ${flashcard(card, d.flipped, `
          <div class="flip-actions">
            <button type="button" class="btn btn--ghost" data-action="card-rate" data-rate="again">${icon('repeat')} Nochmal üben</button>
            <button type="button" class="btn btn--primary" data-action="card-rate" data-rate="known">${icon('check')} Sitzt perfekt</button>
          </div>`)}
      </div>`;
  }

  function viewCases() {
    if (!ui.cases) ui.cases = { idx: 0, results: {} };
    const c = ui.cases;
    if (c.idx >= CASE_IDS.length) {
      const right = Object.values(c.results).filter(Boolean).length;
      return `
        <div class="card card--pad ${anim()}" style="max-width:680px;margin:0 auto;text-align:center">
          <p class="kicker kicker--forest">Fallbeispiele abgeschlossen</p>
          <h2 class="h2" style="margin-top:8px">${right} von ${CASE_IDS.length} Fällen richtig gelöst</h2>
          <p class="muted" style="margin-top:10px">${right === CASE_IDS.length ? 'Perfekt – du wendest die Regeln aus Kapitel 10 sicher an.' : 'Die verpassten Fälle warten im Fehler-Trainer auf dich.'}</p>
          <div class="row" style="justify-content:center;margin-top:20px">
            ${right < CASE_IDS.length ? `<a class="btn btn--accent" href="#/ueben/fehler">${icon('repeat')} Zum Fehler-Trainer</a>` : `<a class="btn btn--primary" href="#/quiz">Zum grossen Quiz ${icon('right')}</a>`}
            <button type="button" class="btn btn--ghost" data-action="cases-restart">${icon('rotate')} Nochmal von vorn</button>
          </div>
        </div>`;
    }
    const id = CASE_IDS[c.idx];
    const key = `case:${id}:${c.idx}`;
    if (!ui.q || ui.q.key !== key) { ui.q = newSession(id, 'case'); ui.q.key = key; }
    return `
      <div class="card card--pad ${anim()}" style="max-width:760px;margin:0 auto">
        <div class="meter" style="margin-bottom:22px"><div class="meter__fill" style="width:${(c.idx / CASE_IDS.length) * 100}%"></div></div>
        ${renderQuestion(ui.q, { label: `Fall ${c.idx + 1} von ${CASE_IDS.length}`, last: c.idx === CASE_IDS.length - 1 })}
      </div>`;
  }

  function startTrainer() {
    ui.trainer = { queue: shuffle(profile.weak), idx: 0, cleared: 0, start: profile.weak.length, flipped: false };
  }

  function viewTrainer() {
    if (!ui.trainer || (ui.trainer.start === 0 && profile.weak.length)) startTrainer();
    const t = ui.trainer;
    // Eine gerade beantwortete Aufgabe bleibt mit Erklärung stehen – auch wenn sie schon aus der Liste raus ist
    const pinned = ui.q && ui.q.ctx === 'trainer' && ui.q.revealed && ui.q.key === `trainer:${t.queue[t.idx]}:${t.idx}`;
    // erledigte Einträge (z. B. inzwischen anderswo richtig gelöst) überspringen
    if (!pinned) while (t.idx < t.queue.length && !profile.weak.includes(t.queue[t.idx])) t.idx += 1;
    const remaining = profile.weak.length;

    if (!remaining && !pinned) {
      return `
        <div class="card card--pad ${anim()}" style="max-width:640px;margin:0 auto;text-align:center">
          <p class="kicker kicker--forest">Fehler-Trainer</p>
          <h2 class="h2" style="margin-top:8px">${t.start ? '100 % gemeistert.' : 'Keine Schwachstellen.'}</h2>
          <p class="muted" style="margin-top:10px">${t.start ? `Du hast ${t.start} offene ${t.start === 1 ? 'Aufgabe' : 'Aufgaben'} aufgearbeitet – stark.` : 'Alles, was du in Kurz-Checks, Fallbeispielen, Karteikarten oder im Quiz verpasst, landet automatisch hier.'}</p>
          <div class="row" style="justify-content:center;margin-top:20px">
            <a class="btn btn--primary" href="#/quiz">Zum Quiz ${icon('right')}</a>
          </div>
        </div>`;
    }
    if (t.idx >= t.queue.length) {
      return `
        <div class="card card--pad ${anim()}" style="max-width:640px;margin:0 auto;text-align:center">
          <p class="kicker kicker--terra">Runde beendet</p>
          <h2 class="h2" style="margin-top:8px">Noch ${remaining} ${remaining === 1 ? 'Aufgabe' : 'Aufgaben'} offen</h2>
          <p class="muted" style="margin-top:10px">Dranbleiben lohnt sich – eine weitere Runde und es sitzt.</p>
          <div class="row" style="justify-content:center;margin-top:20px">
            <button type="button" class="btn btn--accent" data-action="trainer-restart">${icon('repeat')} Nächste Runde</button>
          </div>
        </div>`;
    }

    const entry = t.queue[t.idx];
    const pct = t.start ? Math.round(((t.start - remaining) / t.start) * 100) : 0;
    const head = `
      <div class="row row--between" style="margin-bottom:16px">
        <span class="chip chip--terra">${icon('repeat')} ${remaining} offen</span>
        <span class="small muted">${Math.max(0, pct)} % gemeistert</span>
      </div>
      <div class="meter" style="margin-bottom:22px"><div class="meter__fill meter__fill--terra" style="width:${Math.max(0, pct)}%"></div></div>`;

    if (entry.startsWith('c:')) {
      const card = CARD_BY_ID[entry.slice(2)];
      return `
        <div class="${anim()}" style="max-width:640px;margin:0 auto">
          ${head}
          ${flashcard(card, t.flipped, `
            <div class="flip-actions">
              <button type="button" class="btn btn--ghost" data-action="trainer-card" data-rate="again">${icon('repeat')} Noch nicht</button>
              <button type="button" class="btn btn--primary" data-action="trainer-card" data-rate="known">${icon('check')} Sitzt jetzt</button>
            </div>`)}
        </div>`;
    }
    const id = entry.slice(2);
    const key = `trainer:${entry}:${t.idx}`;
    if (!ui.q || ui.q.key !== key) { ui.q = newSession(id, 'trainer'); ui.q.key = key; }
    return `<div class="card card--pad ${anim()}" style="max-width:760px;margin:0 auto">${head}${renderQuestion(ui.q, { label: 'Fehler-Trainer' })}</div>`;
  }

  function viewPractice() {
    const tab = ['cards', 'cases', 'trainer'].includes(ui.tab) ? ui.tab : 'cards';
    const weak = profile.weak.length;
    const body = tab === 'cards' ? viewCards() : tab === 'cases' ? viewCases() : viewTrainer();
    return `
      <section class="wrap view">
        <div class="${anim()}">
          <p class="kicker">Etappe 02 · Interaktive Übungs-Modi</p>
          <h1 class="h2" style="margin-top:6px">Üben, bis es sitzt</h1>
        </div>
        <div class="tabs" role="tablist" aria-label="Übungs-Modi" style="margin:22px 0 28px">
          <button type="button" role="tab" class="tab" data-action="tab" data-tab="cards" aria-selected="${tab === 'cards'}">${icon('cards')}<span>Karteikarten</span></button>
          <button type="button" role="tab" class="tab" data-action="tab" data-tab="cases" aria-selected="${tab === 'cases'}">${icon('search')}<span>Fälle</span></button>
          <button type="button" role="tab" class="tab" data-action="tab" data-tab="trainer" aria-selected="${tab === 'trainer'}">${icon('repeat')}<span>Fehler</span>${weak ? `<span class="tab__count">${weak}</span>` : ''}</button>
        </div>
        <div role="tabpanel">${body}</div>
      </section>`;
  }

  /* ---------- Etappe 3: Quiz ---------- */
  function startQuiz() {
    ui.quiz = { ids: shuffle(QUIZ_IDS), idx: 0, correct: 0, points: 0, streak: 0, bestStreak: 0, answered: [], lastGain: 0, lastBonus: 0, finished: false };
    ui.q = null;
  }

  function finishQuiz() {
    const run = ui.quiz;
    if (!run || run.finished) return;
    run.finished = true;
    profile.quiz.attempts += 1;
    profile.bestStreak = Math.max(profile.bestStreak, run.bestStreak);
    const best = profile.quiz.best;
    const isBest = !best || run.points > best.points || (run.points === best.points && run.correct > best.correct);
    run.isBest = isBest;
    if (isBest) {
      profile.quiz.best = { correct: run.correct, total: QUIZ_IDS.length, points: run.points, streak: run.bestStreak, date: new Date().toISOString() };
    }
    save();
    setTimeout(() => {
      sound.fanfare();
      if (run.correct / QUIZ_IDS.length >= 0.8) confetti();
    }, 250);
  }

  function viewQuiz() {
    const run = ui.quiz;
    if (!run) {
      const best = profile.quiz.best;
      return `
        <section class="wrap view">
          <div class="card card--pad ${anim()}" style="max-width:760px;margin:0 auto">
            <p class="kicker">Etappe 03 · Abschluss-Prüfung</p>
            <h1 class="h2" style="margin-top:6px">Das grosse Kapitel-10-Quiz</h1>
            <p class="lead" style="margin-top:12px">${QUIZ_IDS.length} Aufgaben quer durch das ganze Kapitel – Multiple Choice, Richtig/Falsch, URL-Detektiv, Reihenfolge und Zuordnen.</p>
            <div class="grid grid--3" style="margin-top:22px;gap:12px">
              <div class="stat"><div class="stat__v">${BASE_POINTS}<span style="font-size:.6em"> + ${MAX_BONUS}</span></div><div class="stat__l">Punkte pro richtige Antwort + Tempo-Bonus</div></div>
              <div class="stat"><div class="stat__v">×1.5</div><div class="stat__l">ab 3 richtigen in Serie</div></div>
              <div class="stat"><div class="stat__v">×2</div><div class="stat__l">ab 5 richtigen in Serie</div></div>
            </div>
            <p class="small muted" style="margin-top:16px">Kein Zeitlimit – aber wer zügig richtig antwortet, holt bis zu ${MAX_BONUS} Bonuspunkte pro Frage. Die Zeit läuft nur bis zu deiner Antwort, die Erklärung danach liest du in Ruhe. Höchstpunktzahl: ${MAX_POINTS}. Verpasste Aufgaben landen im Fehler-Trainer. ${best ? `Dein Bestwert: <strong>${best.points} Punkte</strong> (${best.correct}/${QUIZ_IDS.length}).` : ''}</p>
            <div class="row" style="margin-top:24px">
              <button type="button" class="btn btn--primary" data-action="quiz-start">Quiz starten ${icon('right')}</button>
              ${profile.lessons.length < LESSONS.length ? '<a class="btn btn--text" href="#/theorie">Zuerst die Theorie anschauen</a>' : ''}
            </div>
          </div>
        </section>`;
    }

    if (run.finished) {
      const acc = Math.round((run.correct / QUIZ_IDS.length) * 100);
      const r = 96, circ = 2 * Math.PI * r;
      const wrong = run.ids.filter((_, i) => run.answered[i] === false).length;
      const verdict = acc === 100 ? 'Makellos.' : acc >= 80 ? 'Ausgezeichnet!' : acc >= 60 ? 'Solide Leistung.' : 'Guter Anfang – trainier die Lücken.';
      return `
        <section class="wrap view">
          <div class="card card--pad ${anim()}" style="max-width:860px;margin:0 auto">
            <div class="result">
              <div class="ring" role="img" aria-label="Trefferquote ${acc} Prozent">
                <svg viewBox="0 0 220 220"><circle class="ring__track" cx="110" cy="110" r="${r}" fill="none" stroke-width="14"/>
                  <circle class="ring__value" cx="110" cy="110" r="${r}" fill="none" stroke-width="14" stroke-dasharray="${circ}" stroke-dashoffset="${circ}" data-ring="${circ * (1 - acc / 100)}"/></svg>
                <div class="ring__label"><span class="ring__pct tnum">${acc}%</span><span class="small muted">Trefferquote</span></div>
              </div>
              <div>
                <p class="kicker kicker--forest">Quiz abgeschlossen ${run.isBest ? '· Neuer Bestwert' : ''}</p>
                <h1 class="h2" style="margin-top:6px">${verdict}</h1>
                <div class="stats" style="margin-top:18px">
                  <div class="stat"><div class="stat__v tnum">${run.correct}/${QUIZ_IDS.length}</div><div class="stat__l">richtig</div></div>
                  <div class="stat"><div class="stat__v tnum">${run.points}</div><div class="stat__l">Punkte</div></div>
                  <div class="stat"><div class="stat__v tnum">${run.bestStreak}</div><div class="stat__l">längste Serie</div></div>
                </div>
                ${wrong ? `<p class="small muted" style="margin-top:14px">${wrong} ${wrong === 1 ? 'Aufgabe ist' : 'Aufgaben sind'} jetzt in deinem Fehler-Trainer.</p>` : ''}
                <div class="row" style="margin-top:22px">
                  <a class="btn btn--primary" href="#/abschluss">${icon('award')} Urkunde & Rangliste</a>
                  ${wrong ? `<a class="btn btn--accent" href="#/ueben/fehler">${icon('repeat')} Fehler trainieren</a>` : ''}
                  <button type="button" class="btn btn--ghost" data-action="quiz-start">${icon('rotate')} Nochmal</button>
                </div>
              </div>
            </div>
          </div>
        </section>`;
    }

    const id = run.ids[run.idx];
    const key = `quiz:${id}:${run.idx}`;
    if (!ui.q || ui.q.key !== key) { ui.q = newSession(id, 'quiz'); ui.q.key = key; }
    const answeredCount = run.answered.filter((v) => v !== undefined).length;
    const mult = multiplierFor(run.streak + 1);
    return `
      <section class="wrap view">
        <div style="max-width:780px;margin:0 auto">
          <div class="quizbar ${anim()}">
            <span class="small muted tnum" style="min-width:52px">${run.idx + 1} / ${QUIZ_IDS.length}</span>
            <div class="meter meter--lg" role="progressbar" aria-valuemin="0" aria-valuemax="${QUIZ_IDS.length}" aria-valuenow="${answeredCount}"><div class="meter__fill" style="width:${(answeredCount / QUIZ_IDS.length) * 100}%"></div></div>
          </div>
          <div class="row row--between" style="margin:16px 0 18px">
            <span class="row" style="gap:8px">
              <span class="streak ${run.streak >= 2 ? 'streak--hot' : ''}">${icon('flame')} Serie ${run.streak}${mult > 1 && !ui.q.revealed ? ` <span class="mult">×${mult}</span>` : ''}</span>
              ${ui.q.revealed && run.lastGain ? `<span class="tempo ${run.lastBonus >= MAX_BONUS ? 'tempo--max' : ''}" title="Antwortzeit ${Math.round(ui.q.seconds)} s">${icon('spark')} Tempo +${run.lastBonus}</span>` : ''}
            </span>
            <span class="score-pill" style="position:relative" aria-live="polite">${icon('star')} <span id="score" class="tnum">${run.points}</span> Punkte
              ${ui.q.revealed && run.lastGain ? `<span class="points-pop">+${run.lastGain}</span>` : ''}</span>
          </div>
          <div class="card card--pad">
            ${renderQuestion(ui.q, { label: `Frage ${run.idx + 1}`, last: run.idx === QUIZ_IDS.length - 1 })}
          </div>
        </div>
      </section>`;
  }

  /* ---------- Etappe 4: Urkunde & Rangliste ---------- */
  function certificateSVG() {
    const b = profile.quiz.best;
    const acc = Math.round((b.correct / QUIZ_IDS.length) * 100);
    const grade = acc >= 90 ? 'mit Auszeichnung' : acc >= 70 ? 'gut bestanden' : 'bestanden';
    const name = profile.name || 'Unbekannt';
    const id = `K10-${hash(name + b.date).toString(36).toUpperCase().padStart(6, '0').slice(0, 6)}`;
    const display = "Avenir Next, Segoe UI, Helvetica Neue, Arial, sans-serif";
    const serif = "Iowan Old Style, Georgia, serif";
    const nameAttrs = name.length > 16 ? 'font-size="60" textLength="560" lengthAdjust="spacingAndGlyphs"' : 'font-size="72"';
    const stat = (x, label, value) => `
      <text x="${x}" y="560" font-family="${display}" font-size="13" font-weight="700" letter-spacing="2.5" fill="#6B655E">${label}</text>
      <text x="${x}" y="604" font-family="${display}" font-size="38" font-weight="800" fill="#1C1917">${value}</text>`;
    return `
      <svg id="cert-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" role="img" aria-label="Urkunde für ${esc(name)}">
        <defs>
          <pattern id="cg" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="#EDEAE3" stroke-width="1"/></pattern>
          <path id="seal-path" d="M 0 -96 A 96 96 0 1 1 -0.1 -96"/>
        </defs>
        <rect width="1200" height="800" fill="#FAF9F6"/>
        <rect x="24" y="24" width="1152" height="752" rx="20" fill="url(#cg)"/>
        <rect x="24" y="24" width="1152" height="752" rx="20" fill="none" stroke="#1B4332" stroke-width="3"/>
        <rect x="40" y="40" width="1120" height="720" rx="12" fill="none" stroke="#D3CEC4" stroke-width="1"/>
        <rect x="80" y="96" width="70" height="4" fill="#E07A5F"/>
        <text x="80" y="136" font-family="${display}" font-size="15" font-weight="700" letter-spacing="3.5" fill="#6B655E">LEHRMITTEL KOMMUNIKATION · KAPITEL 10</text>
        <text x="78" y="238" font-family="${display}" font-size="96" font-weight="800" letter-spacing="-3" fill="#1B4332">Urkunde</text>
        <text x="80" y="290" font-family="${serif}" font-style="italic" font-size="24" fill="#44403C">Hiermit wird bestätigt, dass</text>
        <text x="78" y="378" font-family="${display}" font-weight="800" fill="#1C1917" ${nameAttrs}>${esc(name)}</text>
        <line x1="80" y1="400" x2="700" y2="400" stroke="#1C1917" stroke-width="1.5"/>
        <text x="80" y="446" font-family="${serif}" font-size="23" fill="#44403C">das interaktive Arbeitsheft «Sicherheit bei Recherchen im Internet»</text>
        <text x="80" y="478" font-family="${serif}" font-size="23" fill="#44403C">${grade} abgeschlossen hat.</text>
        ${stat(80, 'TREFFERQUOTE', `${acc} %`)}
        ${stat(300, 'PUNKTE', b.points)}
        ${stat(480, 'BESTE SERIE', b.streak)}
        ${stat(680, 'LEKTIONEN', `${profile.lessons.length}/${LESSONS.length}`)}
        <line x1="80" y1="676" x2="1120" y2="676" stroke="#E5E2DC" stroke-width="1.5"/>
        <text x="80" y="716" font-family="${display}" font-size="16" font-weight="600" fill="#6B655E">Ausgestellt am ${esc(dateLong(new Date(b.date)))}</text>
        <text x="1120" y="716" text-anchor="end" font-family="ui-monospace, Consolas, monospace" font-size="15" fill="#6B655E">ID ${id}</text>
        <g transform="translate(960 330)">
          <circle r="132" fill="#FFFFFF" stroke="#E5E2DC"/>
          <circle r="118" fill="#E07A5F"/>
          <circle r="108" fill="none" stroke="#FAF9F6" stroke-width="1.5" stroke-dasharray="2 6"/>
          <text font-family="${display}" font-size="14" font-weight="800" letter-spacing="4.2" fill="#FAF9F6"><textPath href="#seal-path">SICHER RECHERCHIERT · KAPITEL 10 · TLS · HTTPS · </textPath></text>
          <circle r="66" fill="#1B4332"/>
          <g transform="translate(-20 -26)" fill="none" stroke="#FAF9F6" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="0" y="20" width="40" height="30" rx="5"/><path d="M8 20v-8a12 12 0 0 1 24 0v8"/>
          </g>
        </g>
        <text x="960" y="520" text-anchor="middle" font-family="${display}" font-size="20" font-weight="800" fill="#1B4332">${grade.toUpperCase()}</text>
        <path d="M860 610 q 30 -26 60 0 t 60 0 t 60 0" fill="none" stroke="#1C1917" stroke-width="1.6"/>
        <text x="960" y="640" text-anchor="middle" font-family="${display}" font-size="13" font-weight="700" letter-spacing="2" fill="#6B655E">VISUM</text>
      </svg>`;
  }

  function viewFinish() {
    const best = profile.quiz.best;
    const mode = boardMode();
    const list = mode === 'loading' ? [] : leaderboard();
    const ownIdx = list.findIndex((e) => e.you && (!ui.highlight || e.id === ui.highlight || mode === 'live'));
    const own = ownIdx >= 0 ? { e: list[ownIdx], rank: ownIdx + 1 } : null;
    const top = list.slice(0, 3);
    const hasPodium = top.length === 3;

    const certBlock = best && !profile.name ? `
      <form class="card card--pad ${anim()}" id="cert-name-form" autocomplete="off">
        <p class="kicker kicker--forest">Fast geschafft</p>
        <h2 class="h2" style="margin-top:8px">Welcher Name soll auf deiner Urkunde stehen?</h2>
        <div class="hero__form" style="margin-top:18px">
          <label class="sr-only" for="cert-name">Dein Vorname</label>
          <input class="input" id="cert-name" name="name" maxlength="24" placeholder="Dein Vorname" required>
          <button class="btn btn--primary" type="submit">${icon('award')} Urkunde erstellen</button>
        </div>
      </form>` : best ? `
      <div class="card certificate ${anim()}">${certificateSVG()}</div>
      <div class="row" style="margin-top:16px">
        <button type="button" class="btn btn--primary" data-action="download">${icon('download')} Urkunde als Bild speichern</button>
        <a class="btn btn--ghost" href="#/quiz">${icon('rotate')} Quiz verbessern</a>
      </div>` : `
      <div class="card card--pad ${anim()}">
        <p class="kicker kicker--terra">Noch gesperrt</p>
        <h2 class="h2" style="margin-top:8px">Deine Urkunde wartet</h2>
        <p class="muted" style="margin-top:10px">Spiel zuerst das grosse Kapitel-10-Quiz. Danach erscheint hier deine persönliche Urkunde mit Trefferquote und Punkten.</p>
        <div class="row" style="margin-top:18px"><a class="btn btn--primary" href="#/quiz">Zum Quiz ${icon('right')}</a></div>
      </div>`;

    const posting = net.posting;
    const formError = net.formError ? `<p class="form-error" role="alert">${icon('alert')}<span>${esc(net.formError)}</span></p>` : '';
    let status;
    if (mode === 'loading') {
      status = `<div class="card card--pad"><p class="kicker kicker--forest">Dein Platz heute</p><p class="lb-loading lb-loading--inline" style="margin-top:10px"><span class="spinner" aria-hidden="true"></span>Einen Moment …</p></div>`;
    } else if (own) {
      const canImprove = best && best.points > own.e.score;
      status = `
        <div class="card card--pad card--tint">
          <p class="kicker kicker--forest">Dein Platz heute</p>
          <p class="h2" style="margin-top:6px">#${own.rank} <span class="muted" style="font-size:1rem;font-weight:600">von ${list.length}</span></p>
          <p class="small muted" style="margin-top:6px">${own.rank === 1 ? 'Du hältst den Tagessieg.' : `Mit ${(list[own.rank - 2].score - own.e.score) + 1} ${list[own.rank - 2].score - own.e.score === 0 ? 'Punkt' : 'Punkten'} mehr überholst du ${esc(list[own.rank - 2].name)}.`}</p>
          ${canImprove ? `
            <button type="button" class="btn btn--accent btn--sm" style="margin-top:14px" data-action="board-update" ${posting ? 'disabled' : ''}>
              ${posting ? '<span class="spinner spinner--btn" aria-hidden="true"></span> Wird gespeichert …' : `${icon('trophy')} Neuen Bestwert eintragen (${best.points})`}
            </button>` : ''}
          ${formError}
        </div>`;
    } else if (best) {
      status = `
        <form class="card card--pad" id="board-form" autocomplete="off" novalidate>
          <p class="kicker kicker--forest">${mode === 'local' ? 'Lokal eintragen' : 'In die Klassen-Rangliste eintragen'}</p>
          <p class="h3" style="margin-top:6px">${best.points} Punkte · ${Math.round((best.correct / QUIZ_IDS.length) * 100)} %</p>
          <div class="hero__form" style="margin-top:14px">
            <label class="sr-only" for="board-name">Name oder Spitzname</label>
            <input class="input" id="board-name" name="name" maxlength="${NAME_MAX}" value="${esc(profile.name.slice(0, NAME_MAX))}" placeholder="Name oder Spitzname" required ${net.formError ? 'aria-invalid="true"' : ''}>
            <button class="btn btn--accent" type="submit" ${posting ? 'disabled' : ''}>${posting ? '<span class="spinner spinner--btn" aria-hidden="true"></span> Speichern …' : `${icon('trophy')} Eintragen`}</button>
          </div>
          ${formError}
          <p class="small muted" style="margin-top:10px">${mode === 'local'
            ? 'Die Klassen-Rangliste ist gerade nicht erreichbar – dein Eintrag bleibt vorerst auf diesem Gerät.'
            : `Sichtbar für alle mit dem Link: Name, Punkte und Trefferquote. Ein Spitzname reicht völlig (max. ${NAME_MAX} Zeichen).`}</p>
        </form>`;
    } else {
      status = `<div class="card card--pad"><p class="kicker">Mitmachen</p><p class="muted" style="margin-top:8px">Nach dem Quiz kannst du dich hier mit deinen Punkten eintragen.</p></div>`;
    }

    const row = (e, rank) => `
      <li class="lb-row ${e.you ? 'lb-row--you' : ''} ${e.you && e.id === ui.highlight ? 'lb-row--fresh' : ''}">
        <span class="lb-rank ${rank === 1 ? 'lb-rank--1' : ''}">${rank}</span>
        <span class="lb-avatar" style="background:${e.you ? 'var(--forest)' : avatarColor(e.name)}">${esc(e.name.charAt(0).toUpperCase())}</span>
        <span style="min-width:0">
          <span class="lb-name">${e.you ? icon('star', 'lb-star') : ''}<span>${esc(e.name)}</span>${e.you ? '<span class="lb-you">Du</span>' : ''}</span>
          <span class="lb-time">${timeAgo(e.ts)}${Number.isFinite(e.accuracy) ? ` · ${e.accuracy} %` : ''}</span>
        </span>
        <span class="lb-score">${e.score}</span>
      </li>`;

    return `
      <section class="wrap view">
        <div class="${anim()}">
          <p class="kicker">Etappe 04 · Abschluss</p>
          <h1 class="h2" style="margin-top:6px">Urkunde & Tages-Rangliste</h1>
        </div>
        <div style="margin-top:24px">${certBlock}</div>

        <div class="board" style="margin-top:40px">
          <div class="card card--pad">
            <div class="lb-head">
              <div style="min-width:0">
                <p class="kicker kicker--forest">${mode === 'local' ? 'Tages-Rangliste · lokal' : 'Klassen-Rangliste · heute'}</p>
                <h2 class="h3" style="margin-top:4px">${esc(new Date().toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' }))}</h2>
              </div>
              <div class="lb-head__tools">
                ${mode === 'live' || mode === 'demo' ? '<span class="chip chip--live"><span class="live-dot">Live</span></span>' : mode === 'local' ? '<span class="chip chip--terra">Offline</span>' : ''}
                <button type="button" class="icon-btn icon-btn--sm ${net.busy ? 'is-spinning' : ''}" data-action="board-refresh" aria-label="Rangliste aktualisieren" title="Aktualisieren" ${net.busy ? 'aria-busy="true"' : ''}>${icon('refresh')}</button>
              </div>
            </div>
            <p class="small muted lb-meta">Neue Runde in ${untilMidnight()}${net.at && mode !== 'loading' ? ` · aktualisiert ${timeAgo(net.at)}` : ''}</p>
            ${mode === 'local' ? `
              <div class="lb-banner" role="status">
                ${icon('info')}
                <div><strong>Klassen-Rangliste gerade nicht erreichbar.</strong> Du siehst die lokale Rangliste auf diesem Gerät. Sobald die Verbindung klappt, erscheinen hier die Einträge deiner Klasse.
                  <button type="button" class="btn btn--text btn--sm" data-action="board-refresh">${icon('refresh')} Nochmals versuchen</button></div>
              </div>` : ''}
            ${mode === 'loading' ? `
              <div class="lb-loading" role="status"><span class="spinner" aria-hidden="true"></span>Lade Klassen-Rangliste …</div>` : `
            ${hasPodium ? `
              <div class="podium" style="margin-top:22px">
                ${[[top[1], 2], [top[0], 1], [top[2], 3]].map(([e, rank]) => `
                  <div class="podium__col">
                    <span class="lb-avatar" style="width:${rank === 1 ? 56 : 46}px;height:${rank === 1 ? 56 : 46}px;background:${e.you ? 'var(--forest)' : avatarColor(e.name)}">${esc(e.name.charAt(0).toUpperCase())}</span>
                    <span class="podium__name">${e.you ? '★ ' : ''}${esc(e.name)}</span>
                    <span class="small muted">${timeAgo(e.ts)}</span>
                    <div class="podium__block podium__block--${rank}"><span class="podium__medal">#${rank}</span><span>${e.score}</span></div>
                  </div>`).join('')}
              </div>` : ''}
            ${list.length ? `<ol class="lb-list" style="margin-top:12px">${(hasPodium ? list.slice(3) : list).map((e, i) => row(e, i + 1 + (hasPodium ? 3 : 0))).join('')}</ol>`
              : '<p class="muted" style="margin-top:16px">Heute hat noch niemand gespielt. Der erste Platz ist frei!</p>'}`}
            <p class="small muted" style="margin-top:16px;display:flex;gap:8px">${icon('info', '')}<span>${
              mode === 'live' ? 'Echte Einträge deiner Klasse – alle mit dem Link sehen dieselbe Liste. Sie startet jeden Tag um Mitternacht (Schweizer Zeit) neu. Dein eigener Eintrag ist mit ★ markiert.'
              : mode === 'demo' ? 'Heute hat sich noch niemand aus deiner Klasse eingetragen. Bis dahin siehst du simulierte Mitspielende – sie verschwinden, sobald der erste echte Eintrag da ist. Ein kleiner Quellenkritik-Test: Hättest du es gemerkt?'
              : mode === 'local' ? 'Diese Rangliste bleibt auf diesem Gerät und startet um Mitternacht neu. Einträge ohne ★ sind simulierte Mitspielende – ein kleiner Quellenkritik-Test: Hättest du es gemerkt?'
              : 'Die Rangliste wird geladen …'}</span></p>
          </div>
          <div class="stack" style="--gap:16px">
            ${status}
            <div class="note">
              <p class="note__label">Zum Mitnehmen</p>
              <p class="note__text">Erst prüfen, dann teilen: Schloss, Domain, Autor, Motive.</p>
            </div>
          </div>
        </div>
      </section>`;
  }

  /* =====================================================================
   * 11. RENDERN & ROUTING
   * ===================================================================== */
  const VIEWS = { home: viewHome, theorie: viewTheory, ueben: viewPractice, quiz: viewQuiz, abschluss: viewFinish };

  function render({ keepScroll = false } = {}) {
    renderChrome();
    const view = VIEWS[ui.route] || viewHome;
    const y = window.scrollY;
    $('#app').innerHTML = view();
    if (keepScroll) window.scrollTo(0, y);
    // Fortschrittsbalken und Ring sanft einblenden
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.querySelectorAll('[data-progress]').forEach((el) => { el.style.width = `${el.dataset.progress}%`; });
      document.querySelectorAll('[data-ring]').forEach((el) => { el.style.strokeDashoffset = el.dataset.ring; });
    }));
    ui.animate = false;
  }

  function parseRoute() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    const route = VIEWS[parts[0]] ? parts[0] : 'home';
    return { route, param: parts[1] || '' };
  }

  function onRoute() {
    const { route, param } = parseRoute();
    const changed = route !== ui.route;
    ui.route = route;
    ui.param = param;
    if (route === 'ueben') {
      if (param === 'fehler') { ui.tab = 'trainer'; startTrainer(); ui.q = null; }
      else if (param === 'faelle') ui.tab = 'cases';
    }
    if (route === 'theorie' && /^\d+$/.test(param)) ui.lesson = Math.min(LESSONS.length - 1, Number(param) - 1);
    if (route === 'theorie' && !param && changed) {
      const firstOpen = LESSONS.findIndex((l) => !profile.lessons.includes(l.id));
      ui.lesson = firstOpen === -1 ? 0 : firstOpen;
    }
    if (changed || route === 'theorie') ui.q = null;   // Kurz-Check beim Öffnen einer Lektion immer frisch
    ui.animate = true;
    ui.lockOpen = null;
    render();
    window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
    const h = $('#app h1');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    if (changed) net.formError = '';
    if ((route === 'abschluss' || route === 'home') && needsRefresh()) loadRemote();
  }

  /* =====================================================================
   * 12. INTERAKTIONEN
   * ===================================================================== */
  function rerender(scrollToEl = null) {
    render({ keepScroll: true });
    if (scrollToEl) {
      const el = $(scrollToEl);
      if (el) {
        const top = el.getBoundingClientRect().top + window.scrollY - 90;
        window.scrollTo({ top, behavior: reducedMotion() ? 'auto' : 'smooth' });
      }
    }
  }

  function nextAfterQuestion() {
    const s = ui.q;
    if (!s || !s.revealed) return;
    if (s.ctx === 'checkpoint') {
      if (ui.lesson >= LESSONS.length - 1) { location.hash = '#/ueben'; return; }
      ui.lesson += 1; ui.q = null; ui.animate = true; render();
      window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
      return;
    }
    if (s.ctx === 'case') { ui.cases.idx += 1; ui.q = null; ui.animate = true; rerender('.tabs'); return; }
    if (s.ctx === 'quiz') {
      const run = ui.quiz;
      if (run.idx >= QUIZ_IDS.length - 1) { finishQuiz(); ui.animate = true; render(); window.scrollTo({ top: 0 }); return; }
      run.idx += 1; ui.q = null; ui.animate = true; render();
      window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
      return;
    }
    if (s.ctx === 'trainer') { ui.trainer.idx += 1; ui.trainer.flipped = false; ui.q = null; ui.animate = true; rerender('.tabs'); }
  }

  function flipCurrent() {
    if (ui.route !== 'ueben') return;
    if (ui.tab === 'cards' && ui.deck) ui.deck.flipped = !ui.deck.flipped;
    else if (ui.tab === 'trainer' && ui.trainer) ui.trainer.flipped = !ui.trainer.flipped;
    else return;
    sound.flip();
    const flip = $('#flip');
    const flipped = ui.tab === 'cards' ? ui.deck.flipped : ui.trainer.flipped;
    if (flip) {   // nur Klasse umschalten, damit die 3D-Animation flüssig läuft
      flip.classList.toggle('is-flipped', flipped);
      const inner = flip.querySelector('.flip__inner');
      inner.setAttribute('aria-pressed', String(flipped));
      const [front, back] = flip.querySelectorAll('.flip__face');
      front.setAttribute('aria-hidden', String(flipped));
      back.setAttribute('aria-hidden', String(!flipped));
    }
  }

  function rateCard(rate) {
    const d = ui.deck;
    if (!d || d.idx >= d.order.length) return;
    const id = d.order[d.idx];
    if (rate === 'known') {
      profile.cards[id] = 'known';
      if (removeWeak(`c:${id}`)) profile.mastered += 1;
      sound.correct();
    } else {
      profile.cards[id] = 'again';
      addWeak(`c:${id}`);
      // «Nochmal» → kommt in diesem Durchgang noch einmal (höchstens einmal zusätzlich)
      if (d.order.filter((x) => x === id).length < 2) d.order.push(id);
      sound.click();
    }
    save();
    d.idx += 1;
    d.flipped = false;
    ui.animate = true;
    rerender();
  }

  function rateTrainerCard(rate) {
    const t = ui.trainer;
    if (!t) return;
    const entry = t.queue[t.idx];
    if (!entry || !entry.startsWith('c:')) return;
    const id = entry.slice(2);
    if (rate === 'known') {
      profile.cards[id] = 'known';
      if (removeWeak(entry)) profile.mastered += 1;
      t.cleared += 1;
      sound.correct();
    } else {
      t.queue.push(entry);
      sound.click();
    }
    save();
    t.idx += 1;
    t.flipped = false;
    ui.animate = true;
    rerender();
  }

  function celebrate(rank, prefix = 'Eingetragen') {
    if (rank === 1) { sound.fanfare(); confetti(); toast('Platz 1 – du hältst den Tagessieg!', 'trophy'); }
    else { sound.correct(); if (rank <= 3) confetti(); toast(`${prefix} – Platz ${rank} von heute.`, 'trophy'); }
  }

  async function submitBoard(rawName) {
    const best = profile.quiz.best;
    if (!best || net.posting) return;
    const { name, error } = cleanName(rawName);
    if (error) { net.formError = error; sound.wrong(); softRender(); $('#board-name')?.focus(); return; }
    net.formError = '';
    if (!profile.name) profile.name = name;

    net.posting = true;
    softRender();
    try {
      const data = await api('POST', {
        name,
        score: best.points,
        maxScore: MAX_POINTS,
        accuracy: Math.round((best.correct / QUIZ_IDS.length) * 100),
        player: playerId(),
      });
      applyServer(data);
      store.set(KEYS.mine, { day: net.day, id: data.you });
      profile.claimed = true;
      save();
      ui.highlight = data.you;
      net.posting = false;
      ui.animate = true;
      render({ keepScroll: true });
      const rank = net.entries.findIndex((e) => e.id === data.you) + 1;
      if (data.improved === false) { sound.click(); toast(`Dein Eintrag von heute ist schon gleich gut oder besser – Platz ${rank}.`, 'info'); }
      else celebrate(rank || net.entries.length);
    } catch (err) {
      net.posting = false;
      if (err instanceof ApiError && err.kind === 'server') {
        net.formError = err.message;
        sound.wrong();
        softRender();
        return;
      }
      // Kein Server erreichbar → wie bisher lokal speichern, damit nichts verloren geht
      net.status = 'offline';
      net.at = Date.now();
      submitLocal(name);
      toast('Klassen-Rangliste nicht erreichbar – dein Eintrag ist lokal auf diesem Gerät gespeichert.', 'info');
    }
  }

  function submitLocal(name) {
    const best = profile.quiz.best;
    const board = loadBoard();
    let entry = board.entries.find((e) => e.name.toLowerCase() === name.toLowerCase());
    if (entry) {
      if (best.points > entry.score) Object.assign(entry, { score: best.points, ts: Date.now() });
    } else {
      entry = { id: `p-${Date.now().toString(36)}`, name, score: best.points, ts: Date.now() };
      board.entries.push(entry);
    }
    store.set(KEYS.board, board);
    profile.claimed = true;
    save();
    ui.highlight = entry.id;
    const rank = leaderboard().findIndex((e) => e.id === entry.id) + 1;
    render({ keepScroll: true });
    setTimeout(() => celebrate(rank, 'Lokal eingetragen'), 300);
  }

  async function copyLink() {
    const url = location.href.split('#')[0];
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch {
      const ta = Object.assign(document.createElement('textarea'), { value: url });
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
    }
    toast(ok ? 'Link kopiert – teile das Arbeitsheft mit deiner Klasse.' : 'Kopieren nicht möglich – bitte die Adresse manuell kopieren.', ok ? 'link' : 'info');
  }

  function downloadCertificate() {
    const svg = $('#cert-svg');
    if (!svg) return;
    const clone = svg.cloneNode(true);
    clone.setAttribute('width', '2400');
    clone.setAttribute('height', '1600');
    const xml = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    img.onload = () => {
      const canvas = Object.assign(document.createElement('canvas'), { width: 2400, height: 1600 });
      canvas.getContext('2d').drawImage(img, 0, 0, 2400, 1600);
      canvas.toBlob((blob) => {
        if (!blob) { toast('Export fehlgeschlagen.', 'info'); return; }
        const a = Object.assign(document.createElement('a'), {
          href: URL.createObjectURL(blob),
          download: `Urkunde-Kapitel10-${(profile.name || 'Name').replace(/[^\p{L}\p{N}]+/gu, '-')}.png`,
        });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        toast('Urkunde gespeichert.', 'download');
      }, 'image/png');
    };
    img.onerror = () => toast('Export fehlgeschlagen.', 'info');
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  }

  function toast(message, iconName = 'check') {
    const root = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.innerHTML = `${icon(iconName)}<span>${esc(message)}</span>`;
    root.appendChild(el);
    setTimeout(() => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 260); }, 2800);
  }

  function confetti() {
    if (reducedMotion()) return;
    const root = document.createElement('div');
    root.className = 'confetti';
    root.setAttribute('aria-hidden', 'true');
    const colors = ['#1B4332', '#2D6A4F', '#E07A5F', '#D97706', '#F9E1A8', '#D3E5DA'];
    for (let i = 0; i < 70; i++) {
      const p = document.createElement('i');
      p.style.left = `${Math.random() * 100}vw`;
      p.style.background = colors[i % colors.length];
      p.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
      p.style.setProperty('--spin', `${360 + Math.random() * 540}deg`);
      p.style.animationDuration = `${2.2 + Math.random() * 1.8}s`;
      p.style.animationDelay = `${Math.random() * 0.4}s`;
      root.appendChild(p);
    }
    document.body.appendChild(root);
    setTimeout(() => root.remove(), 4800);
  }

  const ACTIONS = {
    'toggle-sound': () => {
      sound.setEnabled(!sound.enabled);
      if (sound.enabled) sound.click();
      renderChrome();
      toast(sound.enabled ? 'Ton an' : 'Ton aus', sound.enabled ? 'volume' : 'mute');
    },
    'copy-link': () => copyLink(),
    rename: () => { profile.name = ''; save(); ui.animate = true; render({ keepScroll: true }); $('#name-input')?.focus(); },
    'toggle-open': (el) => {
      const id = el.dataset.id;
      if (ui.open.has(id)) ui.open.delete(id); else ui.open.add(id);
      const open = ui.open.has(id);
      el.setAttribute('aria-expanded', String(open));   // ohne Neuaufbau, damit die Animation sichtbar bleibt
    },
    lesson: (el) => {
      const i = Number(el.dataset.i);
      if (!Number.isInteger(i) || i < 0 || i >= LESSONS.length) return;
      ui.lesson = i; ui.q = null; ui.lockOpen = null; ui.animate = true;
      render();
      const lessonEl = $('.lesson');
      if (lessonEl && window.innerWidth < 960) window.scrollTo({ top: lessonEl.getBoundingClientRect().top + window.scrollY - 80, behavior: reducedMotion() ? 'auto' : 'smooth' });
      else window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
    },
    'tls-step': (el) => {
      const i = Math.max(0, Math.min(3, Number(el.dataset.i)));
      ui.tls = i; ui.tlsSeen.add(i);
      rerender();
    },
    lock: (el) => { ui.lockOpen = ui.lockOpen === el.dataset.which ? null : el.dataset.which; rerender(); },
    tab: (el) => {
      ui.tab = el.dataset.tab; ui.q = null; ui.animate = true;
      if (ui.tab === 'trainer') startTrainer();
      history.replaceState(null, '', ui.tab === 'trainer' ? '#/ueben/fehler' : ui.tab === 'cases' ? '#/ueben/faelle' : '#/ueben');
      rerender();
    },
    'q-pick': (el) => {
      const s = ui.q;
      if (!s || s.revealed) return;
      const q = QUESTIONS[s.id];
      if (q.type === 'tf') s.sel = el.dataset.i === '1';
      else s.sel = Number(el.dataset.i);
      submit();
    },
    'q-toggle': (el) => {
      const s = ui.q;
      if (!s || s.revealed) return;
      const i = Number(el.dataset.i);
      s.sel = s.sel.includes(i) ? s.sel.filter((x) => x !== i) : [...s.sel, i];
      rerender();
    },
    'q-order': (el) => {
      const s = ui.q;
      if (!s || s.revealed) return;
      const i = Number(el.dataset.i);
      if (!s.sel.includes(i)) s.sel.push(i);
      rerender();
    },
    'q-order-undo': () => { const s = ui.q; if (s && !s.revealed) { s.sel.pop(); rerender(); } },
    'q-match': (el) => {
      const s = ui.q;
      if (!s || s.revealed) return;
      s.sel[Number(el.dataset.row)] = Number(el.dataset.cat);
      rerender();
    },
    'q-check': () => { const s = ui.q; if (s && readyToCheck(QUESTIONS[s.id], s)) submit(); },
    'q-next': () => nextAfterQuestion(),
    flip: () => flipCurrent(),
    'card-rate': (el) => rateCard(el.dataset.rate),
    'deck-restart': (el) => { ui.deck = buildDeck(el.dataset.only === '1'); ui.animate = true; rerender(); },
    'cases-restart': () => { ui.cases = { idx: 0, results: {} }; ui.q = null; ui.animate = true; rerender(); },
    'trainer-card': (el) => rateTrainerCard(el.dataset.rate),
    'trainer-restart': () => { startTrainer(); ui.q = null; ui.animate = true; rerender(); },
    'quiz-start': () => { startQuiz(); ui.animate = true; render(); window.scrollTo({ top: 0 }); },
    download: () => downloadCertificate(),
    'board-refresh': () => loadRemote({ manual: true }),
    'board-update': () => {
      const own = leaderboard().find((e) => e.you);
      submitBoard(own ? own.name : profile.name);
    },
  };

  // Aktionen mit eigenem Sound (kein zusätzlicher Klick-Ton)
  const OWN_SOUND = new Set(['q-pick', 'q-check', 'flip', 'card-rate', 'trainer-card', 'toggle-sound']);

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (el && !el.disabled) {
      const fn = ACTIONS[el.dataset.action];
      if (fn) {
        e.preventDefault();
        if (!OWN_SOUND.has(el.dataset.action)) sound.click();
        fn(el);
      }
      return;
    }
    const link = e.target.closest('a[href^="#"]');
    if (link) sound.click();
  });

  document.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = String(new FormData(e.target).get('name') || '').trim();
    if (e.target.id === 'board-form') { submitBoard(name); return; }
    if (!name) return;
    if (e.target.id === 'name-form') {
      profile.name = name.slice(0, 24);
      save();
      sound.correct();
      toast(`Willkommen, ${profile.name}! Los geht's mit Etappe 1.`, 'book');
      location.hash = '#/theorie';
    } else if (e.target.id === 'cert-name-form') {
      profile.name = name.slice(0, 24);
      save();
      sound.fanfare();
      ui.animate = true;
      render({ keepScroll: true });
      confetti();
    } else if (e.target.id === 'board-form') {
      submitBoard(name);
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'salad-input') {
      ui.salad = e.target.value;
      const out = $('#salad-out');
      if (out) out.textContent = scramble(ui.salad);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea') || e.altKey || e.ctrlKey || e.metaKey) return;
    // Karteikarten: Leertaste/Enter dreht um
    if ((e.key === ' ' || e.key === 'Enter') && e.target.closest?.('.flip__inner')) { e.preventDefault(); flipCurrent(); return; }
    const s = ui.q;
    if (s && $(`.qbox[data-qid="${s.id}"]`)) {
      const q = QUESTIONS[s.id];
      if (!s.revealed && /^[1-6]$/.test(e.key)) {
        const pos = Number(e.key) - 1;
        if ((q.type === 'choice' || q.type === 'multi') && s.order[pos] !== undefined) {
          e.preventDefault();
          if (q.type === 'choice') { s.sel = s.order[pos]; sound.click(); submit(); }
          else { const i = s.order[pos]; s.sel = s.sel.includes(i) ? s.sel.filter((x) => x !== i) : [...s.sel, i]; sound.click(); rerender(); }
        } else if (q.type === 'tf' && pos < 2) {
          e.preventDefault(); s.sel = pos === 0; submit();
        }
        return;
      }
      if (e.key === 'Enter' && !e.target.closest('button, a')) {
        if (s.revealed) { e.preventDefault(); sound.click(); nextAfterQuestion(); }
        else if (readyToCheck(q, s)) { e.preventDefault(); submit(); }
      }
    }
  });

  window.addEventListener('hashchange', onRoute);
  window.addEventListener('storage', (e) => { if ((e.key === KEYS.board || e.key === KEYS.mine) && ui.route === 'abschluss') softRender(); });
  // Live-Rangliste regelmässig nachladen, «vor X Min» und Countdown aktuell halten
  setInterval(() => {
    if (document.hidden || net.posting) return;
    if (ui.route === 'abschluss') loadRemote();
    else if (ui.route === 'home') softRender();
  }, REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && (ui.route === 'abschluss' || ui.route === 'home') && needsRefresh()) loadRemote();
  });

  /* =====================================================================
   * 13. START
   * ===================================================================== */
  onRoute();
})();
