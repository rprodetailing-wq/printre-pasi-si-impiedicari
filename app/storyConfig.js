/**
 * ============================================================================
 * STORY CONFIGURATION — SINGLE PLACE TO EDIT ALL TEXT, TIMINGS & SETTINGS
 * ============================================================================
 * Variation 3A — Darkroom Contact Sheet & Red Grease Pencil (Romanian Edition)
 * - 4-Act step-by-step Spotify-Wrapped storytelling with mood/color shifts
 * - Accelerating chat rush -> dead-stop on "in 7-10 noiembrie o sa fiu in Istanbul"
 *   -> dramatic slow 35mm morph into Istanbul + Gripin "Var Bir İhtimal"
 * - FaceTime Survival Contract & Instagram Verdict Handoff
 */

const metaConfig = {
  recipientName: "Cristiana",
  // Pune username-ul tău de Instagram fără '@', ex: "alex..." ca să deschidă direct DM cu tine (ig.me/m/username)
  instagramUsername: "",
  soundEnabledByDefault: true,
  soundtrackTitle: "Gripin · Var Bir İhtimal",
  soundtrackUrl: "/assets/gripin_var_bir_ihtimal.mp3",
  soundtrackFullOverrideUrl: "/assets/gripin_var_bir_ihtimal.m4a",
};

// Act 4 Contract Clauses (4 Clauses, minRequiredClauses = 1, none pre-checked)
const contractClauses = [
  {
    id: "casual_attire",
    text: "Ținuta fără efort, părul ciufulit și lumina proastă sunt 100% protejate prin legea tratatului 🦭",
    defaultChecked: false,
    title: "Ținută Fără Efort",
    desc: "Ținuta fără efort, părul ciufulit și lumina proastă sunt 100% protejate prin legea tratatului 🦭",
    tag: "casual_attire",
  },
  {
    id: "side_quest",
    text: "Privilegiul de „Side-Quest”: Ai voie să te ridici brusc, să-ți faci ceva de mâncare sau să-ți faci rutina de skincare în mijlocul conversației, fără să-ți ceri scuze.",
    defaultChecked: false,
    title: "Privilegiul de Side-Quest",
    desc: "Privilegiul de „Side-Quest”: Ai voie să te ridici brusc, să-ți faci ceva de mâncare sau să-ți faci rutina de skincare în mijlocul conversației, fără să-ți ceri scuze.",
    tag: "side_quest",
  },
  {
    id: "safe_word",
    text: "Cuvântul de ieșire de urgență: Alegem un cuvânt aleatoriu, iar în secunda în care unul dintre noi îl spune, apelul se închide instant, fără „pa” sau explicații 🦭",
    defaultChecked: false,
    title: "Cuvânt de Urgență",
    desc: "Cuvântul de ieșire de urgență: Alegem un cuvânt aleatoriu, iar în secunda în care unul dintre noi îl spune, apelul se închide instant, fără „pa” sau explicații 🦭",
    tag: "safe_word",
  },
  {
    id: "visual_pause",
    text: "Pauză vizuală: Ai voie să muți camera pe tavan sau pe orice obiect random din cameră 60 de secunde.",
    defaultChecked: false,
    title: "Pauză Vizuală",
    desc: "Pauză vizuală: Ai voie să muți camera pe tavan sau pe orice obiect random din cameră 60 de secunde.",
    tag: "visual_pause",
  },
];

const protestResponseList = [
  "Tentativă de evadare detectată. Nu merge așa 🦭",
  "A doua oară? Ok, am înțeles, îți pregătesc din timp un subiect bun ca să nu te plictisești 😭",
  "Bună încercare :) Ai ajuns până la Actul 4, alege-ți termenii și semnează 🦭",
];

const act4SetupBeats = [
  {
    text: "Cum distanța își spune cuvântul, vin cu o propunere indecentă 🦭...",
    subheading: "Distanța",
    mood: "velvet-sepia",
    delayMs: 550,
  },
  {
    text: "...pentru cineva care urăște tehnologia :))",
    subheading: "Zero Fricțiune",
    mood: "midnight-amber",
    delayMs: 4950,
  },
  {
    text: "Respiră adânc",
    subheading: "Pregătirea",
    mood: "crimson-suspense",
    delayMs: 3750,
  },
];

const nightmareTitleText = "Scena următoare";
const nightmareSubtitleText =
  "Un FaceTime scurt. Staaai! Nu fugi încă!! Pentru că FaceTime e cel mai mare coșmar al tău, tu stabilești termenii și condițiile 🦭";

const treatyTitleText = "Termenii și Condițiile";

const buildVerdictMessageFn = (selectedClauses, customNote, protestCount) => {
  const lines = [
    "Ok, am supraviețuit link-ului tău și am semnat Tratatul de FaceTime 🦭",
    "",
    "Clauzele mele nenegociabile:",
    ...selectedClauses.map((c) => `• ${c}`),
  ];
  if (protestCount > 0) {
    lines.push(
      `(Ca idee, am apăsat „Urăsc literalmente apelurile video” de ${protestCount}x înainte 😭)`
    );
  }
  if (customNote && customNote.trim()) {
    lines.push("", `Regulă proprie: ${customNote.trim()}`);
  }
  lines.push("", "Să vedem dacă supraviețuiești apelului :))");
  return lines.join("\n");
};

const act4Finale = {
  stampText: "APROBAT SUB PROTEST 🦭",
  stamp: "APROBAT SUB PROTEST 🦭",
  title: "S-a bătut palma.",
  signedTitle: "S-a bătut palma.",
  subtitle:
    "Fă un screenshot la dovadă dacă ai nevoie de acoperire legală, sau apasă mai jos ca să-mi trimiți verdictul oficial pe Instagram :))",
  signedBody:
    "Fă un screenshot la dovadă dacă ai nevoie de acoperire legală, sau apasă mai jos ca să-mi trimiți verdictul oficial pe Instagram :))",
  instagramButton: "Trimite Verdictul pe Instagram",
  whatsappButton: "Trimite Verdictul pe Instagram",
  buildVerdictMessage: buildVerdictMessageFn,
  buildWhatsappMessage: buildVerdictMessageFn,
};

const act4ProposalConfig = {
  chapterLabel: "Rola IV · Propunerea",
  warningBadge: "Propunerea",
  setupBeats: act4SetupBeats,
  proposalBeats: act4SetupBeats,
  beats: act4SetupBeats,
  unlockDelayAfterLastBeatMs: 2880,
  revealButton: "Continuă",
  revealEyebrow: "Propunerea",
  nightmareTitle: nightmareTitleText,
  nightmareSubtitle: nightmareSubtitleText,
  nightmareBox: {
    title: nightmareTitleText,
    subtitle: nightmareSubtitleText,
  },
  openContractButton: "Vezi Termenii și Condițiile",
  treatyTitle: treatyTitleText,

  contract: {
    headerCode: "Nr. 02 · Protocol Anti-Stânjeneală 🦭",
    title: treatyTitleText,
    instruction:
      "Ca să fii 100% acoperită legal, bifează cel puțin o clauză nenegociabilă:",
    minRequiredClauses: 1,
    clauses: contractClauses,
    customNotePlaceholder: "Opțional: adaugă propria regulă…",
    protestButton: "Urăsc literalmente apelurile video",
    protestExhaustedButton: "Bine, gata, am rămas fără scuze",
    protestResponses: protestResponseList,
    signButton: "Acceptă Termenii și Semnează Tratatul",
  },

  clauses: contractClauses,
  protestResponses: protestResponseList,

  finale: act4Finale,

  instagram: {
    username: metaConfig.instagramUsername,
    text: "Trimite Verdictul pe Instagram",
    buttonLabel: "Trimite Verdictul pe Instagram",
  },
  whatsApp: {
    phone: "",
    text: "Trimite Verdictul pe Instagram",
    buttonLabel: "Trimite Verdictul pe Instagram",
  },
};

window.STORY_CONFIG = {
  meta: metaConfig,

  // --------------------------------------------------------------------------
  // GATE 0: ENTRY SCREEN
  // --------------------------------------------------------------------------
  intro: {
    badge: "Rola I · Proiecție Privată",
    salutation: "Pentru",
    title: "Printre pași, împiedicări și povești",
    subtitle:
      "Fă-ți un ceai sau o cafea, pornește sunetul și acordă-i două minute liniștite 🦭",
    cta: "Începe",
  },

  // --------------------------------------------------------------------------
  // ACT 1: PRINTRE PAȘI, ÎMPIEDICĂRI ȘI POVEȘTI · ISTANBUL
  // --------------------------------------------------------------------------
  act1: {
    chapterLabel: "Rola I · Istanbul",
    heroPhoto: "/assets/istiklal_tram.jpg",
    heroFrameCode: "36A",
    heroTitle: "Printre pași, împiedicări și povești",
    heroLocationSubtitle: "Istanbul",
    heroSubtitle: "Mesajele s-au transformat, în sfârșit, în realitate.",
    pivotTimestamp: "01:42",
    pivotMessage: "in 7-10 noiembrie o sa fiu in Istanbul",
    floatingFragments: [
      "00:24",
      "late replies :))",
      "orașe diferite",
      "01:18",
      "ceaiul de musetel e super bun :))",
      "voice notes",
      "pink noise vs. peaky blinders 😭",
      "02:07",
      "did they notice tho",
      "🦭",
      "conversații neterminate",
      "erai misterios",
      "03:14",
      "arktick monkeys pe fundal 😭",
      ":))",
      "vintage digital camera",
      "will peaky blinders be a deal braker?",
      "04:02",
      "cartofi 🥔 :))",
      "B&W filters",
      "peaky blinders propaganda 😭",
      "04:49",
      "ore aleatorii",
      "nu vreau sa vina dimineata 😭",
      "despre orice și nimic",
      "05:36",
      "🦭 :))",
      "fusuri orare",
      "ceai târziu",
      "00:52",
      "prea multe mesaje",
      "mai ești trează?",
      "conversații lungi",
      "01:39",
    ],
    reelFrames: [
      {
        code: "35A",
        photo: "/assets/karakoy_lamps.jpg",
        pos: "center 52%",
        filter: "contrast(1.08) brightness(0.92)",
        subtitle: "Felinarele din Karaköy · Ore târzii",
      },
      {
        code: "36",
        photo: "/assets/tea_window.jpg",
        pos: "center 50%",
        filter: "contrast(1.06)",
        subtitle: "Ceai cald lângă fereastră",
      },
      {
        code: "36A",
        photo: "/assets/istiklal_tram.jpg",
        pos: "center 42%",
        filter: "contrast(1.1)",
        subtitle: "İstiklal Caddesi · Istanbul",
      },
      {
        code: "37",
        photo: "/assets/bosphorus_ferry.jpg",
        pos: "center 48%",
        filter: "contrast(1.12)",
        subtitle: "Traversând Bosforul · Vânt și pescăruși",
      },
      {
        code: "38",
        photo: "/assets/galata_dusk.jpg",
        pos: "center 45%",
        filter: "sepia(0.16) contrast(1.1)",
        subtitle: "Galata la apus · Cadru neterminat",
      },
    ],
    beats: [
      {
        subheading: "Distanța",
        text: "Am vorbit mult timp.",
        style: "body",
        mood: "midnight-amber",
        delayMs: 550,
      },
      {
        subheading: "Ecranul",
        text: "Doar mesaje pe un ecran, locuri diferite, ore aleatorii, discuții despre orice și nimic.",
        style: "body",
        mood: "velvet-sepia",
        delayMs: 2950,
      },
      {
        subheading: "Ocazia",
        text: "Când am avut ocazia să ajung în Istanbul, am știut că nu pot rata șansa să-mi satisfac curiozitatea :))",
        style: "body",
        mood: "istiklal-gold",
        delayMs: 5900,
      },
      {
        subheading: "Față în Față",
        text: "Am crezut că o întâlnire față în față îmi va potoli curiozitatea, măcar puțin.",
        style: "body",
        mood: "midnight-amber",
        delayMs: 6240,
      },
      {
        subheading: "Verdictul",
        text: "Nu s-a întâmplat. Cumva, am plecat și mai curios decât înainte :))",
        style: "emphasis",
        mood: "warm-dawn",
        delayMs: 5350,
      },
    ],
    unlockDelayAfterLastBeatMs: 4300,
    cta: "Continuă",
  },

  // --------------------------------------------------------------------------
  // ACT 2: CE N-AM ZIS ATUNCI (Locked Gate — Must Circle All 4 Frames)
  // --------------------------------------------------------------------------
  act2: {
    chapterLabel: "Rola II · Ce n-am zis",
    preludeText: "Atenție: urmează câteva complimente asumate :))",
    headline: "Nu lăsa o primă întâlnire scurtă să te păcălească.",
    subheadline:
      "Am vrut doar să știi că te-am observat mai mult decât am lăsat să se vadă. Încercuiește toate cele 4 cadre ca să continui :))",
    cards: [
      {
        id: "grija_detalii",
        tag: "OBSERVAȚIA #01",
        badge: "OBSERVAȚIA #01",
        frontTitle: "Grija pentru detalii",
        title: "Grija pentru detalii",
        frontHint: "Apasă ca să descoperi",
        frontNote: "Apasă ca să descoperi",
        backTitle: "Grija pentru detalii",
        backText:
          "N-ai comentat o secundă despre mersul pe jos, deși te durea burta. Probabil meriți o medalie pentru câtă răbdare ai avut cu mine :))",
        frameCode: "13A",
        photo: "/assets/bosphorus_ferry.jpg",
      },
      {
        id: "vibe_flow",
        tag: "OBSERVAȚIA #02",
        badge: "OBSERVAȚIA #02",
        frontTitle: "Vibe & flow",
        title: "Vibe & flow",
        frontHint: "Apasă ca să descoperi",
        frontNote: "Apasă ca să descoperi",
        backTitle: "Vibe & flow",
        backText:
          "A curs totul atât de firesc încât nici n-am simțit când a trecut timpul, ai știut să duci conversația mai departe :))",
        frameCode: "14A",
        photo: "/assets/karakoy_lamps.jpg",
      },
      {
        id: "istanbul_moment",
        tag: "OBSERVAȚIA #03",
        badge: "OBSERVAȚIA #03",
        frontTitle: "Curiozitatea ta",
        title: "Curiozitatea ta",
        frontHint: "Apasă ca să descoperi",
        frontNote: "Apasă ca să descoperi",
        backTitle: "Curiozitatea ta",
        backText:
          "M-a dat pe spate că ai învățat mitologie la vârsta la care eu încă mâncam pământ",
        frameCode: "15A",
        photo: "/assets/galata_dusk.jpg",
      },
      {
        id: "those_eyes",
        tag: "OBSERVAȚIA #04",
        badge: "OBSERVAȚIA #04",
        frontTitle: "Those eyes",
        title: "Those eyes",
        frontHint: "Apasă ca să descoperi",
        frontNote: "Apasă ca să descoperi",
        backTitle: "Those eyes",
        backText:
          "I know, I know, very cliché, de aia m-am abținut să zic ceva, probabil toată lumea îți spune mereu de ei",
        frameCode: "16A",
        photo: "/assets/tea_window.jpg",
      },
    ],
    cta: "Continuă",
  },

  // --------------------------------------------------------------------------
  // ACT 3: LĂSÂND GLUMA LA O PARTE (Focus Pull + Honesty + Inside Joke)
  // --------------------------------------------------------------------------
  act3: {
    chapterLabel: "Rola III · Sincer",
    reelFrames: [
      {
        code: "21",
        photo: "/assets/bosphorus_ferry.jpg",
        pos: "center 44%",
        filter: "blur(4.6px) brightness(0.9)",
        subtitle: "Focalizare difuză · Distanța dintre mesaje",
      },
      {
        code: "21A",
        photo: "/assets/bosphorus_ferry.jpg",
        pos: "center 48%",
        filter: "blur(3.8px) brightness(0.93)",
        subtitle: "Spațiile libere · O versiune din imaginație",
      },
      {
        code: "22",
        photo: "/assets/karakoy_lamps.jpg",
        pos: "center 48%",
        filter: "blur(3.0px) contrast(1.04)",
        subtitle: "Stradă în penumbră · Înainte de întâlnire",
      },
      {
        code: "22A",
        photo: "/assets/karakoy_lamps.jpg",
        pos: "center 52%",
        filter: "blur(2.3px) contrast(1.05)",
        subtitle: "Schițe în minte · Infinite variante",
      },
      {
        code: "23",
        photo: "/assets/istiklal_tram.jpg",
        pos: "center 42%",
        filter: "blur(1.7px) contrast(1.06)",
        subtitle: "Șanse practic zero · Realitatea față în față",
      },
      {
        code: "23A",
        photo: "/assets/istiklal_tram.jpg",
        pos: "center 38%",
        filter: "blur(1.2px) contrast(1.07)",
        subtitle: "Reglând claritatea · Gândul rămas în urmă",
      },
      {
        code: "24",
        photo: "/assets/tea_window.jpg",
        pos: "center 50%",
        filter: "blur(0.7px) contrast(1.08)",
        subtitle: "Dincolo de reguli inventate",
      },
      {
        code: "24A",
        photo: "/assets/tea_window.jpg",
        pos: "center 53%",
        filter: "blur(0.3px) contrast(1.09)",
        subtitle: "Abur și granulație de argint · Intuiție bună",
      },
      {
        code: "25",
        photo: "/assets/karakoy_lamps.jpg",
        pos: "center 52%",
        filter: "blur(0px) contrast(1.1)",
        subtitle: "Claritate · Fără jumătăți de măsură",
      },
      {
        code: "25A",
        photo: "/assets/galata_dusk.jpg",
        pos: "center 45%",
        filter: "blur(0px) sepia(0.15) contrast(1.12)",
        subtitle: "Cadru clar · Povestea merge mai departe",
      },
    ],
    beats: [
      {
        subheading: "Proiecția",
        text: "Să vorbești mult timp doar prin mesaje face ceva ciudat:",
        style: "body",
        mood: "bosphorus-silver",
        delayMs: 550,
      },
      {
        subheading: "Imaginația",
        text: "imaginația umple spațiile libere și îți desenează o versiune a celuilalt.",
        style: "body",
        mood: "bosphorus-silver",
        delayMs: 4400,
      },
      {
        subheading: "Întâlnirea",
        text: "Probabil versiunea aia din mintea ta te-a convins să accepți să ne vedem,",
        style: "body",
        mood: "velvet-sepia",
        delayMs: 4800,
      },
      {
        subheading: "Variantele",
        text: "iar din infinitele feluri în care mă puteai schița în minte,",
        style: "body",
        mood: "velvet-sepia",
        delayMs: 4950,
      },
      {
        subheading: "Șansele",
        text: "șansele ca eu să coincid fix cu varianta aia erau practic zero :))",
        style: "body",
        mood: "midnight-amber",
        delayMs: 4550,
      },
      {
        subheading: "Sincer",
        text: "În plus, recunosc că mi-a rămas în minte gândul că poate n-am reușit să exprim ce gândeam și cum mă simțeam,",
        style: "body",
        mood: "grounded-espresso",
        delayMs: 4800,
      },
      {
        subheading: "Reguli Inventate",
        text: "pentru că m-am blocat singur în niște reguli inventate de propria mea imaginație.",
        style: "body",
        mood: "grounded-espresso",
        delayMs: 6240,
      },
      {
        subheading: "Intuiția",
        text: "Așa că am să ascult sfatul unei fete cu intuiție bună:",
        style: "body",
        mood: "istiklal-gold",
        delayMs: 5200,
      },
      {
        subheading: "Sfatul",
        text: "I gotta know my nuts",
        subtext: "(cel mai bun sfat primit în ultimul timp)",
        style: "hero-accent script-accent",
        mood: "safelight-rose",
        delayMs: 4300,
      },
      {
        subheading: "Decizia",
        text: "Nu am să las povestea asta așa :))",
        style: "serif-emphasis",
        mood: "warm-dawn",
        delayMs: 4950,
      },
    ],
    unlockDelayAfterLastBeatMs: 3680,
    cta: "Continuă",
  },

  // --------------------------------------------------------------------------
  // ACT 4: PROPUNEREA, TERMENII ȘI CONDIȚIILE & VERDICTUL PE INSTAGRAM
  // --------------------------------------------------------------------------
  act4: act4ProposalConfig,
  // Backward-compatible alias
  act5: act4ProposalConfig,
};
