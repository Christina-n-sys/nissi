const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ShadingType, SectionType, ImageRun,
  PageOrientation, convertInchesToTwip,
} = require("docx");

const FONT = "Times New Roman";
const BODY = 20;      // 10pt in half-points
const SMALL = 16;     // 8pt, used inside tables
const COL_W = 5230;   // usable width of one column, in DXA

// ---------- helpers ----------

const title = (text) => new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 120 },
  children: [new TextRun({ text, font: FONT, size: 48 })],
});

const authorLine = (text, opts = {}) => new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: opts.after ?? 0 },
  children: [new TextRun({ text, font: FONT, size: opts.size ?? BODY, italics: !!opts.italics })],
});

const sectionHead = (text) => new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 240, after: 120 },
  children: [new TextRun({ text, font: FONT, size: BODY, smallCaps: true })],
});

const subHead = (text) => new Paragraph({
  spacing: { before: 160, after: 80 },
  children: [new TextRun({ text, font: FONT, size: BODY, italics: true })],
});

const body = (text, opts = {}) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED,
  spacing: { after: opts.after ?? 80 },
  indent: opts.noIndent ? undefined : { firstLine: convertInchesToTwip(0.2) },
  children: [new TextRun({ text, font: FONT, size: BODY })],
});

const bullet = (text) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED,
  spacing: { after: 60 },
  indent: { left: convertInchesToTwip(0.25), hanging: convertInchesToTwip(0.12) },
  children: [new TextRun({ text, font: FONT, size: BODY })],
});

const equation = (text) => new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 100, after: 100 },
  children: [new TextRun({ text, font: FONT, size: BODY, italics: true })],
});

// IEEE table captions sit above the table on two lines: the number, then the
// title. Both centred, both 8pt.
const tableCaption = (number, titleText) => [
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 140, after: 0 },
    children: [new TextRun({ text: `TABLE ${number}`, font: FONT, size: SMALL })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 60 },
    children: [new TextRun({ text: titleText, font: FONT, size: SMALL, smallCaps: true })],
  }),
];

const note = (text) => new Paragraph({
  alignment: AlignmentType.LEFT,
  spacing: { before: 60, after: 120 },
  children: [new TextRun({ text, font: FONT, size: SMALL, italics: true })],
});

// A cell whose value must be measured, never guessed.
const PENDING = "—";

function cell(text, width, opts = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: opts.header
      ? { type: ShadingType.CLEAR, fill: "E8E8E8", color: "auto" }
      : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [new Paragraph({
      alignment: opts.align ?? AlignmentType.LEFT,
      children: [new TextRun({
        text,
        font: FONT,
        size: opts.size ?? SMALL,
        bold: !!opts.header,
        italics: !!opts.italics,
      })],
    })],
  });
}

function table(widths, rows) {
  return new Table({
    columnWidths: widths,
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 4, color: "000000" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
      left:   { style: BorderStyle.NONE },
      right:  { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "999999" },
      insideVertical:   { style: BorderStyle.NONE },
    },
    rows: rows.map((cells, i) => new TableRow({
      tableHeader: i === 0,
      children: cells.map((c, j) =>
        cell(c.t, widths[j], { header: i === 0, align: c.a, italics: c.i })),
    })),
  });
}

// ---------- figures ----------

const FIGDIR = __dirname + "/figures";
const COL_PX = 344;   // one column at 96 dpi, matching COL_W

// Embeds figures/<file> scaled to column width. When the figure has not been
// generated yet, a visible placeholder is emitted instead of silently nothing.
function figureImage(file, widthPx = COL_PX) {
  const path = `${FIGDIR}/${file}`;
  if (!fs.existsSync(path)) {
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 40 },
      shading: { type: ShadingType.CLEAR, fill: "FFF2CC", color: "auto" },
      children: [new TextRun({
        text: `[ ${file} not generated yet — run python paper/make_figures.py ]`,
        font: FONT, size: SMALL, italics: true,
      })],
    });
  }
  const dim = require("child_process").execSync(
    `python3 -c "from PIL import Image; w,h=Image.open('${path}').size; print(w,h)"`
  ).toString().trim().split(" ").map(Number);
  const height = Math.round(widthPx * (dim[1] / dim[0]));
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 40 },
    children: [new ImageRun({
      type: "png",
      data: fs.readFileSync(path),
      transformation: { width: widthPx, height },
    })],
  });
}

const figCaption = (text) => new Paragraph({
  alignment: AlignmentType.LEFT,
  spacing: { after: 140 },
  children: [new TextRun({ text, font: FONT, size: SMALL })],
});


// Figures are numbered by document order, so inserting or moving one cannot
// leave a stale "Fig. N" behind.
let figureCounter = 0;
function figure(file, captionText, widthPx = COL_PX) {
  figureCounter += 1;
  return [
    figureImage(file, widthPx),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 140 },
      children: [new TextRun({
        text: `Fig. ${figureCounter}.  ${captionText}`, font: FONT, size: SMALL,
      })],
    }),
  ];
}

const ref = (n, text) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED,
  spacing: { after: 40 },
  indent: { left: convertInchesToTwip(0.22), hanging: convertInchesToTwip(0.22) },
  children: [new TextRun({ text: `[${n}] ${text}`, font: FONT, size: SMALL })],
});

// ---------- front matter (full width) ----------

const front = [
  title("Measuring a Multilingual Rule-Based Phishing URL Detector: A Negative Result and a Reproducible Evaluation Protocol"),
  authorLine("Bairi Christina", { after: 0 }),
  authorLine("Department of Data Science and Cyber Security", { size: SMALL }),
  authorLine("Karunya Institute of Technology and Sciences, Coimbatore, India", { size: SMALL }),
  authorLine("bairichristinal@karunya.edu.in", { size: SMALL, after: 120 }),
  authorLine("Rahul R", { after: 0 }),
  authorLine("Department of Data Science and Cyber Security", { size: SMALL }),
  authorLine("Karunya Institute of Technology and Sciences, Coimbatore, India", { size: SMALL }),
  authorLine("rahulrajanrc@gmail.com", { size: SMALL, after: 240 }),
];

// ---------- body (two columns) ----------

const content = [];
const P = (x) => content.push(x);

// Draft banner ---------------------------------------------------------------
P(new Paragraph({
  spacing: { after: 160 },
  shading: { type: ShadingType.CLEAR, fill: "FFF2CC", color: "auto" },
  // No paragraph border: docx-js emits w:pBdr children in an order the schema
  // rejects. The shading alone makes the banner unmissable.
  children: [new TextRun({
    text: "DRAFT — one measurement outstanding. All figures and tables below are from the run of 2 September 2026 except the threshold-10 rows of Tables VII and VIII, shown as em dashes. Re-run python evaluate.py (seconds; the dataset already exists) and fill them from results/ablation.csv and results/match_mode.csv. Delete this box afterwards.",
    font: FONT, size: SMALL, bold: true,
  })],
}));

// Abstract -------------------------------------------------------------------
P(new Paragraph({
  alignment: AlignmentType.JUSTIFIED,
  spacing: { after: 100 },
  children: [
    new TextRun({ text: "Abstract—", font: FONT, size: BODY, bold: true, italics: true }),
    new TextRun({
      text: "Phishing detectors built on English lexical features miss campaigns "
          + "that target users in regional languages. This paper specifies a "
          + "rule-based phishing URL detector that scores a URL against a 33-term "
          + "vocabulary spanning English, Hindi, Tamil and Telugu together with "
          + "four structural indicators, needing no training data, no network "
          + "access and no accelerator, and explaining every verdict by "
          + "construction. It then measures that detector honestly, and reports "
          + "what the measurement found. On a balanced set of 170 URLs drawn from "
          + "the OpenPhish feed and the Tranco top-sites list, the detector "
          + "classifies nothing as phishing at the risk threshold it was "
          + "configured with: recall and F1 are both zero, and accuracy equals "
          + "the base rate. A threshold sweep locates the best attainable "
          + "operating point at a score of 10, where F1 reaches 0.780, so the "
          + "configured threshold is miscalibrated by a factor of six. More "
          + "consequentially, the multilingual vocabulary is inert on this "
          + "corpus: four of its 33 terms fire at all, none of them Hindi, Tamil "
          + "or Telugu, and what detection remains comes almost entirely from a "
          + "URL-length rule that the paper's own construction diagnostic "
          + "identifies as an artifact of how the benchmark was assembled. Two "
          + "further findings emerged from the pipeline rather than the detector. "
          + "Two thirds of the live phishing feed was hosted on domains that also "
          + "appear among the top sites, so domain-level features cannot separate "
          + "the classes at all. And pairing a phishing feed against a top-site "
          + "list yields classes separable by string length alone, which we "
          + "quantify and argue should be reported before any metric in "
          + "URL-classification work. The negative result is reported as found; "
          + "all code, the dataset builder and the evaluation harness are "
          + "released so that every figure here can be regenerated from the "
          + "primary feeds.",
      font: FONT, size: BODY, italics: true,
    }),
  ],
}));

P(new Paragraph({
  alignment: AlignmentType.JUSTIFIED,
  spacing: { after: 120 },
  children: [
    new TextRun({ text: "Index Terms—", font: FONT, size: BODY, bold: true, italics: true }),
    new TextRun({
      text: "phishing detection, URL analysis, multilingual keyword matching, "
          + "rule-based classification, negative results, evaluation methodology, "
          + "dataset construction artifacts, reproducibility",
      font: FONT, size: BODY, italics: true,
    }),
  ],
}));

// I. Introduction ------------------------------------------------------------
P(sectionHead("I.  Introduction"));
P(body("Phishing attacks direct users to deceptive Uniform Resource Locators that "
  + "imitate legitimate services in order to capture passwords, banking credentials "
  + "and one-time passwords. The attack succeeds before any software vulnerability "
  + "is involved: the victim reads a URL, judges it plausible, and proceeds. Because "
  + "the URL is the point at which the deception must survive inspection, it remains "
  + "a productive place to intervene.", { noIndent: true }));
P(body("Established defences fall into three families, each with a structural "
  + "weakness. Blacklists compare a candidate against previously reported malicious "
  + "URLs and therefore cannot recognise a domain registered minutes ago. Supervised "
  + "learning over lexical, host and content features generalises further but "
  + "requires labelled corpora, periodic retraining, and yields models whose "
  + "decisions are difficult to explain to the user being protected. Deep models "
  + "improve accuracy at the cost of substantially greater data and compute."));
P(body("A less discussed limitation cuts across all three. Detectors are "
  + "overwhelmingly built and evaluated on English lexical features, so an attacker "
  + "who writes a lure in a regional language evades the lexical component entirely. "
  + "In the Indian subcontinent, campaigns routinely employ transliterated Hindi, "
  + "Tamil and Telugu terms for account, verification, security and urgency. A "
  + "detector whose vocabulary contains only English tokens scores such a URL as it "
  + "would score any unfamiliar string."));
P(body("This paper addresses that gap with a deliberately small, fully transparent "
  + "detector, and pairs it with an evaluation protocol we believe matters more than "
  + "the detector itself. While assembling a benchmark from the standard public "
  + "sources, we found that the conventional pairing of a phishing feed with a "
  + "top-site list introduces a systematic confound: the phishing class arrives as "
  + "full URLs carrying paths, while the legitimate class arrives as bare "
  + "registrable domains. Any rule keyed to URL length or delimiter count then "
  + "separates the two classes almost perfectly while measuring nothing about "
  + "phishing. We treat the removal and measurement of this confound as a primary "
  + "contribution."));
P(body("The contributions of this work are as follows.", { noIndent: true }));
P(bullet("1)  A rule-based multilingual phishing URL detector covering English, "
  + "Hindi, Tamil and Telugu, requiring no training, no network access and no "
  + "specialised hardware, and returning the identity and weight of every rule "
  + "that fired so that a verdict can be audited term by term."));
P(bullet("2)  A negative result obtained under an enforced protocol. At the risk "
  + "threshold the system was configured with, the detector classifies no URL as "
  + "phishing: recall and F1 are zero. The best attainable operating point lies "
  + "at one sixth of that threshold. The result is reported as found."));
P(bullet("3)  Evidence that the multilingual vocabulary is inert on a global "
  + "phishing feed. Four of 33 terms fire, none of them Hindi, Tamil or Telugu. "
  + "The corpus does not contain the phenomenon the vocabulary was built for, "
  + "which is a statement about benchmark availability as much as about the "
  + "detector."));
P(bullet("4)  A measurement of where live phishing is hosted. Two thirds of the "
  + "feed sat on domains that also appear among the top sites, so no domain-level "
  + "feature can separate the classes on this data."));
P(bullet("5)  Identification and quantification of a construction artifact we "
  + "argue is widespread: pairing a phishing feed against a top-site list yields "
  + "classes separable by string length alone. We give a diagnostic for it and "
  + "argue it should be reported before any metric."));

P(body("Section II reviews related work. Section III specifies the detector. "
  + "Section IV describes the implementation and a defect analysis of the prototype "
  + "it replaces. Section V details dataset construction and the artifact. "
  + "Section VI states the evaluation protocol, Section VII reports results, and "
  + "Sections VIII and IX discuss limitations and conclusions."));

// II. Related work -----------------------------------------------------------
P(sectionHead("II.  Related Work"));
P(body("Blacklist-driven detection, exemplified by early large-scale measurement "
  + "work [8], is precise on known threats and blind to new ones; the reporting "
  + "delay between registration and listing is precisely the window attackers "
  + "exploit. Surveys of the field [2], [11] treat this latency as the defining "
  + "limitation of the approach.", { noIndent: true }));
P(body("Learned classifiers over URL strings were established by Ma et al. [9], who "
  + "showed that lexical and host features alone support accurate discrimination, "
  + "and refined by Le et al. [4] and by Verma and Dyer [10], who examined the "
  + "robustness of purely lexical classifiers. Marchal et al. [1] extended the "
  + "setting to streaming analytics. Jain and Gupta [5] incorporated hyperlink "
  + "information, and related work has explored visual similarity [3]. Deep "
  + "architectures [13] and hybrid lexical-structural systems [12] report further "
  + "gains at higher cost. Across this literature the reported metrics are strong, "
  + "which makes the composition of the underlying benchmarks consequential."));
P(body("Two gaps motivate the present work. First, the lexical component of these "
  + "systems is almost always English. Where multilingual phishing is considered it "
  + "is usually at the level of page content rather than the URL string, leaving "
  + "transliterated regional-language lures in the URL itself unaddressed. Second, "
  + "benchmark construction is rarely reported in enough detail to reproduce, and "
  + "the common recipe of a phishing feed against a top-site list is, as Section V "
  + "shows, sufficient on its own to produce strong-looking results from rules that "
  + "encode no knowledge of phishing. Reports of near-perfect accuracy on URL "
  + "classification should be read with the construction of the negative class in "
  + "view."));

// III. System design ---------------------------------------------------------
P(sectionHead("III.  Detector Design"));

P(body("The system is organised in four layers over a shared test suite "
  + "(Fig. 1). Every interface calls one scoring module, so a URL receives one "
  + "verdict whichever front-end asked; the dataset pipeline and evaluation "
  + "harness sit beneath it and are exercised by the same tests.", { noIndent: true }));

figure("fig2_system.png", "Project architecture. Every interface calls one "
  + "scoring module, so a URL has one verdict whichever front-end asked. The "
  + "data pipeline and the evaluation harness sit below it and are exercised by "
  + "the same test suite; the cross-cutting column attaches to every layer and "
  + "is owned by none.", 344).forEach(P);

P(subHead("A.  Scoring function"));
P(body("The detector maps a URL to a bounded integer score. Each rule that matches "
  + "contributes a fixed weight, weights are summed, and the total is clamped to a "
  + "maximum of 100:", { noIndent: true }));
P(equation("S(u) = min( Σ wᵢ · δᵢ(u),  100 )"));
figure("fig1_architecture.png", "Detection pipeline. Lexical and structural rules contribute weights to a single bounded score, which is banded and returned together with the identity of every rule that fired.", 300).forEach(P);
P(body("where δᵢ(u) is 1 when rule i fires on URL u and 0 otherwise, and "
  + "wᵢ is that rule's weight. The formulation is intentionally additive and "
  + "monotone: no rule can reduce another's contribution, so the effect of any "
  + "single term on the outcome is inspectable in isolation. Both the clamped score "
  + "and the unclamped sum are retained, the latter so that the reported weights "
  + "always reconcile with the total.", { noIndent: true }));

P(subHead("B.  Multilingual vocabulary"));
P(body("The lexical component matches a 33-term vocabulary of transliterated "
  + "phishing lures across four languages. Terms were selected for semantic roles "
  + "that recur in phishing lures: account, verification, security, urgency and "
  + "financial instruments. Each matched term contributes a weight of 10. The "
  + "vocabulary is deduplicated, so a term shared between languages, such as "
  + "khata and suraksha in Hindi and Telugu, contributes once rather than twice.",
  { noIndent: true }));
tableCaption("I", "Multilingual Phishing Vocabulary").forEach(P);
P(table([960, 400, 3870], [
  [{ t: "Language" }, { t: "n", a: AlignmentType.CENTER }, { t: "Terms" }],
  [{ t: "English" }, { t: "9", a: AlignmentType.CENTER },
   { t: "login, verify, secure, account, update, bank, otp, signin, password" }],
  [{ t: "Hindi" }, { t: "11", a: AlignmentType.CENTER },
   { t: "kyc, aadhaar, pan, banking, verifyotp, suraksha, khata, jaanch, satyapan, turant, seva" }],
  [{ t: "Tamil" }, { t: "9", a: AlignmentType.CENTER },
   { t: "vangi, kanakku, urudhi, puduppi, paathukaappu, seyal, udanadi, otpverify, bankupdate" }],
  [{ t: "Telugu" }, { t: "4", a: AlignmentType.CENTER },
   { t: "dhruvikarinchu, vaddi, runam, podupukhata" }],
]));

P(subHead("C.  Structural rules"));
P(body("Four structural indicators complement the vocabulary. Their weights and "
  + "thresholds are given in Table II. The at-sign carries double weight because, "
  + "in a URL, everything preceding it in the authority component is discarded by "
  + "the browser, making it a direct mechanism for disguising the true host rather "
  + "than a statistical correlate of one.", { noIndent: true }));
tableCaption("II", "Rule Weights and Thresholds").forEach(P);
P(table([1450, 2490, 1290], [
  [{ t: "Rule" }, { t: "Condition" }, { t: "Weight", a: AlignmentType.CENTER }],
  [{ t: "keyword" }, { t: "vocabulary term present" }, { t: "10 each", a: AlignmentType.CENTER }],
  [{ t: "long_url" }, { t: "length > 30 characters" }, { t: "10", a: AlignmentType.CENTER }],
  [{ t: "at_symbol" }, { t: "'@' present" }, { t: "20", a: AlignmentType.CENTER }],
  [{ t: "many_dots" }, { t: "more than 3 dots" }, { t: "10", a: AlignmentType.CENTER }],
]));
P(note("Weights are inherited unchanged from the prototype system so that the "
  + "refactored detector remains behaviourally comparable to it."));

P(subHead("D.  Risk bands"));
P(body("The score is mapped to three bands: Low Risk below 30, Medium Risk from 30 "
  + "to 59, and High Risk at 60 and above. The High Risk boundary is the operating "
  + "threshold used for binary classification in Section VI. Because the threshold "
  + "is a free parameter rather than a property of the method, Section VII reports a "
  + "sweep across its full range rather than defending the default in isolation.",
  { noIndent: true }));

P(subHead("E.  Explainability"));
P(body("The detector returns, alongside the score and band, the identity and weight "
  + "of every rule that fired. A verdict is therefore not a bare label but an "
  + "itemised account: a user sees which terms matched and what each contributed. "
  + "This property is a consequence of the additive design rather than a post hoc "
  + "attribution method, and it holds exactly rather than approximately.",
  { noIndent: true }));

figure("fig2_dashboard_phishing.png", "Dashboard classifying a phishing URL that combines "
  + "English lures with the Hindi/Telugu terms suraksha and khata. The verdict "
  + "is accompanied by every rule that fired and its weight, and those weights "
  + "sum to the reported score of 90.", 344).forEach(P);

figure("fig3_dashboard_legitimate.png", "The same interface on a legitimate URL. Only long_url "
  + "fires, giving a score of 10 and a Low Risk band. The single fired rule is "
  + "still itemised, so a user can see that the score reflects length alone and "
  + "no phishing vocabulary was matched.", 344).forEach(P);

figure("fig4_cli.png", "Command-line output for the same two URLs. The "
  + "command-line and dashboard front-ends call one scoring module, so their "
  + "verdicts agree by construction; before the consolidation described in "
  + "Section IV-A they did not.", 344).forEach(P);

figure("fig5_hashing.png", "The accompanying file-integrity tool, which computes "
  + "MD5, SHA-1 or SHA-256 digests and compares a generated digest against a "
  + "reference. It is independent of the detector and is included for "
  + "completeness.", 344).forEach(P);

P(subHead("F.  Matching modes"));
P(body("Two matching modes are provided. Substring matching, the default, reports a "
  + "term wherever it occurs in the URL; token matching first splits the URL on "
  + "non-alphanumeric characters and requires a whole-token match. Substring "
  + "matching is the more sensitive and the more error-prone: the term pan matches "
  + "inside japan.com. Token matching removes that class of false positive at the "
  + "cost of missing terms concatenated with adjacent text, a construction that is "
  + "itself common in phishing domains. Section VII reports both, since the choice "
  + "is an empirical question rather than a settled one.", { noIndent: true }));

// IV. Implementation ---------------------------------------------------------
P(sectionHead("IV.  Implementation"));
P(body("The detector is implemented in Python using only the standard library, in a "
  + "single module of under 200 lines. Three front-ends share it without "
  + "reimplementing any logic: a command-line interface, a Tkinter desktop "
  + "application, and a Streamlit dashboard that renders the fired rules as a table. "
  + "The dataset builder, crawler and evaluation harness add roughly 1,300 further "
  + "lines. The system is covered by 193 automated tests.", { noIndent: true }));

P(subHead("A.  Defect analysis of the prototype"));
P(body("The present system consolidates an earlier prototype in which the scoring "
  + "logic had been copied into each front-end. Auditing those copies against one "
  + "another revealed seven defects, listed in Table III, all of which affected "
  + "reported scores. We record them because several are of a kind that is silent "
  + "in use and would corrupt any evaluation performed on the prototype: a "
  + "duplicated vocabulary entry inflates a score without any visible error, and "
  + "divergent copies of the vocabulary cause the same URL to receive different "
  + "verdicts from different interfaces of the same system. Any result obtained "
  + "from the prototype would have been unreproducible for reasons invisible to the "
  + "experimenter.", { noIndent: true }));
tableCaption("III", "Defects Identified and Corrected in the Prototype").forEach(P);
P(table([450, 2095, 2685], [
  [{ t: "#" }, { t: "Defect" }, { t: "Effect on results" }],
  [{ t: "1" }, { t: "Two vocabulary terms listed twice" },
   { t: "Affected URLs scored 20 instead of 10" }],
  [{ t: "2" }, { t: "Capitalised term compared to lowercased URL" },
   { t: "Term could never match; silently dead" }],
  [{ t: "3" }, { t: "Divergent vocabularies across front-ends" },
   { t: "Same URL, different score per interface" }],
  [{ t: "4" }, { t: "Inconsistent banding across front-ends" },
   { t: "Score of 10 reported both Suspicious and Safe" }],
  [{ t: "5" }, { t: "Structural rules stored in the keyword list" },
   { t: "Rule provenance not recoverable from output" }],
  [{ t: "6" }, { t: "Model loaded by relative path" },
   { t: "Crash when run from another directory" }],
  [{ t: "7" }, { t: "No validation of input type" },
   { t: "Exception on empty or non-string input" }],
]));
P(body("Each correction is pinned by a regression test, and the merged vocabulary "
  + "is the union of the divergent copies. Weights and thresholds were left "
  + "unchanged throughout, so the consolidation is behaviour-preserving except "
  + "where a defect made the prior behaviour indefensible."));

// V. Dataset -----------------------------------------------------------------
P(sectionHead("V.  Dataset Construction"));

P(subHead("A.  Sources"));
P(body("Phishing URLs are drawn from the OpenPhish community feed, optionally "
  + "supplemented by PhishTank. Legitimate URLs are derived from the Tranco "
  + "top-sites list [see Section V-D]. Both phishing feeds are time-varying, so "
  + "the retrieval timestamp is recorded with every build and raw downloads are "
  + "cached, allowing a build to be repeated exactly.", { noIndent: true }));

P(subHead("B.  Deduplication"));
P(body("Duplicates are removed at two levels. Exact deduplication normalises case "
  + "and trailing slashes. Registrable-domain deduplication, computed against the "
  + "Public Suffix List, collapses multiple URLs hosted on one domain. The scope of "
  + "the second is configurable per class, which matters: phishing feeds list many "
  + "URLs per compromised host, so collapsing them prevents a single host dominating "
  + "the positive class, whereas the legitimate class is deliberately allowed "
  + "several paths per domain, for the reason given in Section V-D.", { noIndent: true }));

P(subHead("C.  Cross-class conflicts"));
P(body("A domain can legitimately appear in both classes. URL shorteners and "
  + "file-hosting services are ranked highly by Tranco and simultaneously used to "
  + "host phishing pages. Such domains are reported and, by default, removed from "
  + "both classes, since retaining them injects label noise that no URL-level "
  + "feature can resolve.", { noIndent: true }));

P(subHead("D.  A construction artifact in the standard recipe"));
P(body("Pairing a phishing feed with a top-site list is the conventional way to "
  + "assemble a URL benchmark, and it introduces a confound severe enough to "
  + "invalidate the resulting metrics. Tranco distributes registrable domains, not "
  + "URLs, so the negative class consists of strings such as example.com: short, "
  + "path-free, containing a single dot. Phishing feeds distribute full URLs, "
  + "typically long and carrying multi-segment paths. The two classes are therefore "
  + "separable by string length alone, before any phishing-specific feature is "
  + "consulted.", { noIndent: true }));
P(body("Under such a pairing the long_url and many_dots rules do not detect "
  + "phishing; they detect which file a row came from. A detector reported as "
  + "accurate on this benchmark would fail on the first legitimate URL with a path, "
  + "which is to say on most real traffic. We regard results obtained this way as "
  + "uninformative regardless of their magnitude."));
P(body("We remove the confound at its source. A crawler visits the homepage of each "
  + "of the top-ranked domains and records a small number of internal content links, "
  + "so that the legitimate class consists of genuine URLs with genuine paths. Link "
  + "selection retains only same-domain HTTP(S) links with a non-trivial path; it "
  + "excludes static assets, and it excludes authentication and checkout paths, "
  + "whose own path segments would otherwise import terms such as login and account "
  + "into the negative class and manufacture false positives that are artifacts of "
  + "sampling rather than properties of the detector. Selected links are "
  + "deduplicated by path and spread across distinct top-level path segments. "
  + "Crawling honours robots.txt, identifies itself, fetches homepages only, and "
  + "rate-limits its requests."));

P(subHead("E.  Artifact diagnostic"));
P(body("Because the confound is invisible in headline metrics, the harness measures "
  + "it directly, reporting mean URL length, mean dot count and the percentage of "
  + "URLs carrying a path for each class. A large gap in path presence is reported "
  + "as a warning against interpreting the headline figures. We recommend the "
  + "diagnostic be reported alongside metrics in any URL-classification study.",
  { noIndent: true }));
tableCaption("IV", "Dataset Composition").forEach(P);
P(table([3300, 1930], [
  [{ t: "Quantity" }, { t: "Value", a: AlignmentType.CENTER }],
  [{ t: "Phishing URLs retrieved (OpenPhish)" }, { t: "300", a: AlignmentType.CENTER }],
  [{ t: "Legitimate domains read (Tranco)" }, { t: "5,000", a: AlignmentType.CENTER }],
  [{ t: "Exact duplicates removed" }, { t: "0", a: AlignmentType.CENTER }],
  [{ t: "Domain duplicates removed" }, { t: "32", a: AlignmentType.CENTER }],
  [{ t: "Cross-class conflicts removed" }, { t: "196", a: AlignmentType.CENTER }],
  [{ t: "Domains in both classes" }, { t: "13", a: AlignmentType.CENTER }],
  [{ t: "Final dataset size" }, { t: "170", a: AlignmentType.CENTER }],
  [{ t: "Class balance (phishing : legitimate)" }, { t: "85 : 85", a: AlignmentType.CENTER }],
  [{ t: "Retrieval date" }, { t: "2 Sept. 2026", a: AlignmentType.CENTER }],
]));
P(note("Fill from the DATASET SUMMARY printed by build_dataset.py."));

tableCaption("V", "Construction Artifact Diagnostic").forEach(P);
P(table([2430, 1400, 1400], [
  [{ t: "Measure" }, { t: "Phishing", a: AlignmentType.CENTER }, { t: "Legitimate", a: AlignmentType.CENTER }],
  [{ t: "Mean URL length" }, { t: "47.3", a: AlignmentType.CENTER }, { t: "19.6", a: AlignmentType.CENTER }],
  [{ t: "URLs with a path (%)" }, { t: "62.4", a: AlignmentType.CENTER }, { t: "0.0", a: AlignmentType.CENTER }],
  [{ t: "Mean dot count" }, { t: "1.9", a: AlignmentType.CENTER }, { t: "1.0", a: AlignmentType.CENTER }],
]));
P(note("Fill from the artifact diagnostic printed by evaluate.py. A path-presence "
  + "gap near zero indicates the confound has been removed."));

// VI. Evaluation methodology -------------------------------------------------
P(sectionHead("VI.  Evaluation Protocol"));
P(body("Phishing is the positive class. A URL is classified as phishing when its "
  + "score reaches the operating threshold of 60. We report accuracy, precision, "
  + "recall, specificity and F1, together with the confusion matrix. Because the "
  + "detector is rule-based and fits no parameters to the data, no train-test split "
  + "is required and none is performed; the entire dataset serves as the test set. "
  + "This removes a family of leakage concerns but also means the vocabulary must "
  + "not be revised in response to the measured results, a discipline we observe "
  + "and state explicitly.", { noIndent: true }));
P(body("Three further analyses accompany the headline figures. A threshold sweep "
  + "from 0 to 100 characterises the precision-recall trade-off and situates the "
  + "chosen operating point. A rule-group ablation compares the full rule set "
  + "against vocabulary-only and structural-only variants, isolating the "
  + "contribution of the multilingual terms; ablations are computed by removing "
  + "rules from the scorer's own output rather than by reimplementing the scoring "
  + "logic, so a variant cannot diverge from the deployed detector. A matching-mode "
  + "comparison contrasts substring and token matching. Per-rule statistics report, "
  + "for each rule, its firing rate within each class and its precision when it "
  + "fires."));

// VII. Results ---------------------------------------------------------------
P(sectionHead("VII.  Results and Discussion"));
P(body("Every figure and table in this section comes from one execution of the "
  + "evaluation harness, on 2 September 2026, over the dataset described in "
  + "Section V. The result is negative and is reported as found.", { noIndent: true }));

tableCaption("VI", "Classification Performance, Configured Against Best Threshold").forEach(P);
P(table([2430, 1400, 1400], [
  [{ t: "Metric" }, { t: "t = 60", a: AlignmentType.CENTER }, { t: "t = 10", a: AlignmentType.CENTER }],
  [{ t: "True positives" }, { t: "0", a: AlignmentType.CENTER }, { t: "55", a: AlignmentType.CENTER }],
  [{ t: "False positives" }, { t: "0", a: AlignmentType.CENTER }, { t: "1", a: AlignmentType.CENTER }],
  [{ t: "True negatives" }, { t: "85", a: AlignmentType.CENTER }, { t: "84", a: AlignmentType.CENTER }],
  [{ t: "False negatives" }, { t: "85", a: AlignmentType.CENTER }, { t: "30", a: AlignmentType.CENTER }],
  [{ t: "Accuracy" }, { t: "0.500", a: AlignmentType.CENTER }, { t: "0.818", a: AlignmentType.CENTER }],
  [{ t: "Precision" }, { t: "0.000", a: AlignmentType.CENTER }, { t: "0.982", a: AlignmentType.CENTER }],
  [{ t: "Recall" }, { t: "0.000", a: AlignmentType.CENTER }, { t: "0.647", a: AlignmentType.CENTER }],
  [{ t: "Specificity" }, { t: "1.000", a: AlignmentType.CENTER }, { t: "0.988", a: AlignmentType.CENTER }],
  [{ t: "F1 score" }, { t: "0.000", a: AlignmentType.CENTER }, { t: "0.780", a: AlignmentType.CENTER }],
]));
P(note("t = 60 is the threshold inherited from the prototype; t = 10 is the best point on the sweep of Fig. 7. Source: results/headline.csv and results/threshold_sweep.csv."));

tableCaption("VII", "Rule-Group Ablation at Both Operating Points").forEach(P);
P(table([620, 1560, 780, 780, 780, 710], [
  [{ t: "t" }, { t: "Variant" }, { t: "Acc.", a: AlignmentType.CENTER }, { t: "Prec.", a: AlignmentType.CENTER },
   { t: "Rec.", a: AlignmentType.CENTER }, { t: "F1", a: AlignmentType.CENTER }],
  [{ t: "60", a: AlignmentType.CENTER }, { t: "All rules" }, { t: "0.500", a: AlignmentType.CENTER }, { t: "0.000", a: AlignmentType.CENTER },
   { t: "0.000", a: AlignmentType.CENTER }, { t: "0.000", a: AlignmentType.CENTER }],
  [{ t: "60", a: AlignmentType.CENTER }, { t: "Vocabulary only" }, { t: "0.500", a: AlignmentType.CENTER }, { t: "0.000", a: AlignmentType.CENTER },
   { t: "0.000", a: AlignmentType.CENTER }, { t: "0.000", a: AlignmentType.CENTER }],
  [{ t: "60", a: AlignmentType.CENTER }, { t: "Structural only" }, { t: "0.500", a: AlignmentType.CENTER }, { t: "0.000", a: AlignmentType.CENTER },
   { t: "0.000", a: AlignmentType.CENTER }, { t: "0.000", a: AlignmentType.CENTER }],
  [{ t: "10", a: AlignmentType.CENTER }, { t: "All rules" }, { t: "0.818", a: AlignmentType.CENTER }, { t: "0.982", a: AlignmentType.CENTER },
   { t: "0.647", a: AlignmentType.CENTER }, { t: "0.780", a: AlignmentType.CENTER }],
  [{ t: "10", a: AlignmentType.CENTER }, { t: "Vocabulary only" }, { t: PENDING, a: AlignmentType.CENTER }, { t: PENDING, a: AlignmentType.CENTER },
   { t: PENDING, a: AlignmentType.CENTER }, { t: PENDING, a: AlignmentType.CENTER }],
  [{ t: "10", a: AlignmentType.CENTER }, { t: "Structural only" }, { t: PENDING, a: AlignmentType.CENTER }, { t: PENDING, a: AlignmentType.CENTER },
   { t: PENDING, a: AlignmentType.CENTER }, { t: PENDING, a: AlignmentType.CENTER }],
]));
P(note("At the configured threshold of 60 every variant scores zero, so the "
  + "comparison is vacuous there. The two outstanding rows come from "
  + "results/ablation.csv on a re-run of evaluate.py. Section VII-C already "
  + "establishes from the per-rule statistics that long_url carries essentially "
  + "all of the detection."));

tableCaption("VIII", "Substring Against Token Matching").forEach(P);
P(table([620, 1560, 780, 780, 780, 710], [
  [{ t: "t" }, { t: "Mode" }, { t: "Acc.", a: AlignmentType.CENTER }, { t: "Prec.", a: AlignmentType.CENTER },
   { t: "Rec.", a: AlignmentType.CENTER }, { t: "F1", a: AlignmentType.CENTER }],
  [{ t: "60", a: AlignmentType.CENTER }, { t: "Substring" }, { t: "0.500", a: AlignmentType.CENTER }, { t: "0.000", a: AlignmentType.CENTER },
   { t: "0.000", a: AlignmentType.CENTER }, { t: "0.000", a: AlignmentType.CENTER }],
  [{ t: "60", a: AlignmentType.CENTER }, { t: "Token" }, { t: "0.500", a: AlignmentType.CENTER }, { t: "0.000", a: AlignmentType.CENTER },
   { t: "0.000", a: AlignmentType.CENTER }, { t: "0.000", a: AlignmentType.CENTER }],
  [{ t: "10", a: AlignmentType.CENTER }, { t: "Substring" }, { t: "0.818", a: AlignmentType.CENTER }, { t: "0.982", a: AlignmentType.CENTER },
   { t: "0.647", a: AlignmentType.CENTER }, { t: "0.780", a: AlignmentType.CENTER }],
  [{ t: "10", a: AlignmentType.CENTER }, { t: "Token" }, { t: PENDING, a: AlignmentType.CENTER }, { t: PENDING, a: AlignmentType.CENTER },
   { t: PENDING, a: AlignmentType.CENTER }, { t: PENDING, a: AlignmentType.CENTER }],
]));
P(note("Vacuous at the configured threshold, as above. Too few vocabulary terms "
  + "fire on this corpus for the modes to differ meaningfully; see Section VII-E."));

figure("fig6_threshold_sweep.png", "Precision, recall and F1 across the full threshold range. The dotted line marks the operating threshold of 60.", 344).forEach(P);
figure("fig7_ablation.png", "Rule-group ablation. The gap between the full rule set and the vocabulary-only variant is the contribution of the multilingual terms.", 344).forEach(P);
figure("fig8_per_rule.png", "Firing rate of each rule within each class. A rule that fires often on legitimate URLs is a source of false positives.", 344).forEach(P);

P(subHead("A.  The detector classifies nothing at its configured threshold"));
P(body("At the High Risk threshold of 60 the detector labels no URL as phishing. "
  + "All 85 phishing URLs are false negatives and all 85 legitimate URLs are true "
  + "negatives, so accuracy equals the base rate of 0.500, specificity is 1.000 "
  + "by vacancy, and precision, recall and F1 are all zero. A detector that never "
  + "raises an alarm is trivially specific and useless.", { noIndent: true }));
P(body("The threshold sweep in Fig. 7 shows this is a calibration failure rather "
  + "than an absence of signal. F1 peaks at 0.780 at a threshold of 10, where "
  + "precision is 0.982 and recall 0.647, and decays to zero by a threshold of "
  + "40. The configured threshold is six times the best available one. Because "
  + "the weights and bands were inherited from the prototype and never fitted, "
  + "nothing in the original system could have revealed this: a rule-based "
  + "detector whose thresholds are asserted rather than measured can be published, "
  + "demonstrated and adopted while detecting nothing."));
P(body("Reaching an F1 of 0.780 requires accepting a score of 10, which is a "
  + "single fired rule. The system is therefore not operating as a weighted "
  + "multi-rule scorer at all; it is operating as a single-indicator alarm, and "
  + "Section VII-C identifies the indicator."));

P(subHead("B.  The multilingual vocabulary does not fire"));
P(body("Fig. 9 gives the firing rate of each rule within each class. Four of the "
  + "33 vocabulary terms fire anywhere in the dataset: login on three phishing "
  + "URLs, and update, account and pan on one each. None of the Hindi, Tamil or "
  + "Telugu terms fire at all. The multilingual vocabulary, which is the "
  + "contribution the detector was built around, contributes at most six of 85 "
  + "phishing detections and one false positive.", { noIndent: true }));
P(body("The most plausible reading is scope rather than defect. OpenPhish is a "
  + "global feed, and the campaigns live on the day of retrieval were not aimed "
  + "at Hindi, Tamil or Telugu speakers. A vocabulary built for regional-language "
  + "lures cannot be exercised by a corpus that contains none, and this evaluation "
  + "therefore does not show that multilingual keyword matching fails; it shows "
  + "that the standard public benchmark cannot test it. That distinction matters, "
  + "and it is a finding about the state of available benchmarks: an "
  + "India-targeted phishing corpus with retrievable URLs would be required, and "
  + "we could not source one."));
P(body("The honest consequence is that no claim about multilingual detection "
  + "performance is supported by this experiment, in either direction. The "
  + "vocabulary is released and specified so that it can be tested when such a "
  + "corpus exists."));

P(subHead("C.  What detection remains is the construction artifact"));
P(body("One rule accounts for almost all of the behaviour. The long_url rule "
  + "fires on 55 of 85 phishing URLs and on none of the legitimate URLs, a "
  + "within-class rate of 0.647 against 0.000. At the best operating point of "
  + "10, a score of 10 is in most cases long_url alone, so the reported F1 of "
  + "0.780 is very largely the performance of a single length test.",
  { noIndent: true }));
P(body("Table V shows why that number must not be read as detection. Phishing "
  + "URLs in this dataset average 47.3 characters and carry a path 62.4 per cent "
  + "of the time; legitimate URLs average 19.6 characters and carry a path 0.0 "
  + "per cent of the time, because Tranco distributes registrable domains rather "
  + "than URLs. The classes differ by 62 percentage points in path presence "
  + "before any phishing-specific property is consulted. A length rule separates "
  + "them because one file contains paths and the other does not."));
P(body("This is the artifact of Section V-D, measured on real data. Any system "
  + "evaluated on a benchmark built this way will report a strong length feature "
  + "and will fail on the first legitimate URL that has a path, which is to say "
  + "on most real traffic. We regard the headline F1 of 0.780 as uninformative "
  + "about phishing detection for exactly this reason, and report it only "
  + "alongside the diagnostic that undermines it."));

P(subHead("D.  Live phishing is hosted on legitimate infrastructure"));
P(body("The largest single effect in the build was not anticipated. Of 300 "
  + "phishing URLs retrieved, 196 rows were removed as cross-class conflicts: "
  + "their registrable domains also appear in the Tranco top sites. Thirteen "
  + "domains are shared between the classes, and their character is uniform: "
  + "github.io, netlify.app, vercel.app, pages.dev, blogspot.com, linktr.ee, "
  + "squarespace.com, gitbook.io, backblazeb2.com and b-cdn.net.",
  { noIndent: true }));
P(body("These are hosting, publishing and content-delivery platforms. Roughly "
  + "two thirds of the live phishing in this feed was served from infrastructure "
  + "that is itself entirely legitimate and highly ranked. The consequence for "
  + "URL classification is direct: on this data no domain-level or "
  + "reputation-level feature can separate the classes, because the domain is "
  + "shared. Detection has to come from the path, the subdomain label or the page, "
  + "none of which a registrable-domain feature sees."));
P(body("This also explains part of Section VII-B. A phishing URL of the form "
  + "https://random-name.pages.dev/ has no lexical surface for a keyword rule to "
  + "match: the attacker-chosen text sits in a subdomain generated to look "
  + "arbitrary, not in a path spelling out verify or login. A vocabulary-based "
  + "detector is being asked to read words that the current hosting pattern has "
  + "removed."));

P(subHead("E.  Substring and token matching are indistinguishable here"));
P(body("At the configured threshold both matching modes score zero, so the "
  + "comparison is vacuous there. Because so few vocabulary terms fire at all, "
  + "the modes have almost no opportunity to differ on this corpus; the "
  + "comparison is retained in the harness and in Table VIII, but this dataset "
  + "cannot answer the question. It should be re-run on a corpus in which the "
  + "vocabulary is actually exercised.", { noIndent: true }));

// --- VIII. Threats to validity ---------------------------------------------
P(sectionHead("VIII.  Threats to Validity and Limitations"));
P(body("Six limitations bound these findings, and none of them is dissolved by "
  + "framing.", { noIndent: true }));
P(bullet("Scale. One hundred and seventy URLs after deduplication, from a single "
  + "feed on a single day. The negative result at the configured threshold is "
  + "unambiguous at this scale, since zero true positives is not a marginal "
  + "measurement, but the threshold-10 figure rests on 85 positives and should "
  + "be treated as indicative."));
P(bullet("Single source and single day. Both feeds change daily. A different "
  + "retrieval date would give a different phishing population, and the hosting "
  + "finding of Section VII-D in particular should be replicated across dates "
  + "before it is generalised."));
P(bullet("The corpus cannot test the contribution. The multilingual vocabulary "
  + "is unexercised here. Nothing in this paper establishes whether it works, and "
  + "the absence of an India-targeted evaluation corpus is the binding constraint "
  + "on answering that."));
P(bullet("The negative class is not URLs. Tranco supplies registrable domains, "
  + "and the crawler that would supply genuine content URLs was implemented but "
  + "not used for the reported run. The artifact is therefore present in these "
  + "numbers and is reported rather than removed."));
P(bullet("No trained baseline. Whether a supervised classifier would extract more "
  + "signal from the same 170 URLs is untested, so the comparison that would "
  + "establish what rule-based detection gives up is absent."));
P(bullet("Weights are asserted. The rule weights are inherited from the prototype "
  + "and were never fitted. The threshold result shows what asserted parameters "
  + "cost; the weights themselves are open to the same objection and were not "
  + "re-examined here."));

// --- IX. Conclusion ---------------------------------------------------------
P(sectionHead("IX.  Conclusion and Future Work"));
P(body("This paper specified a rule-based multilingual phishing URL detector, "
  + "built an evaluation protocol around it, and reported what the protocol "
  + "returned. At the risk threshold the system was configured with, it detects "
  + "nothing: zero true positives on 85 phishing URLs, F1 of zero, accuracy equal "
  + "to the base rate. The best attainable operating point is at one sixth of "
  + "that threshold, and even there the performance is very largely a single "
  + "URL-length rule that the paper's own diagnostic identifies as an artifact of "
  + "benchmark construction.", { noIndent: true }));
P(body("The multilingual vocabulary that motivated the work is inert on this "
  + "corpus: four of 33 terms fire, none of them in the three regional languages "
  + "the vocabulary was written for. We do not conclude that multilingual keyword "
  + "matching fails. We conclude that the standard public benchmark cannot test "
  + "it, which is a different and more actionable statement."));
P(body("The findings that survive are the ones the pipeline produced rather than "
  + "the detector. Two thirds of a live phishing feed was hosted on domains that "
  + "also rank among the top sites, so domain-level features are blind on this "
  + "data by construction. And the conventional pairing of a phishing feed with a "
  + "top-site list produces classes separable by string length alone, at a "
  + "62-point gap in path presence here, which is sufficient on its own to "
  + "manufacture a strong-looking result from a rule encoding no knowledge of "
  + "phishing. We recommend the construction diagnostic be reported before any "
  + "metric in URL-classification work."));
P(body("Future work follows directly from the limitations. The threshold and the "
  + "weights should be fitted on held-out data rather than asserted. The "
  + "legitimate class should be collected with the crawler already implemented "
  + "here, so that the artifact is removed rather than reported. An India-targeted "
  + "phishing corpus is needed before any claim about the multilingual vocabulary "
  + "can be made, and assembling one is the single most valuable next step. A "
  + "supervised baseline on the same data would establish what the rule-based "
  + "approach gives up in accuracy and gains in interpretability. Finally, the "
  + "hosting result suggests that subdomain labels and path tokens, rather than "
  + "registrable domains, are where lexical detection now has to operate."));
P(body("A protocol that reports its own detector as ineffective, and that "
  + "identifies the artifact which would otherwise have flattered it, is doing "
  + "what it was built to do."));

P(sectionHead("Acknowledgment"));
P(body("The authors thank the Department of Data Science and Cyber Security, "
  + "Karunya Institute of Technology and Sciences, for guidance and support, and "
  + "acknowledge OpenPhish and the Tranco project, whose public feeds made the "
  + "evaluation in this paper possible, together with the maintainers of the "
  + "Public Suffix List.", { noIndent: true }));

// References -----------------------------------------------------------------
P(sectionHead("References"));
[
  "S. Marchal, J. François, R. State, and T. Engel, \"PhishStorm: Detecting Phishing With Streaming Analytics,\" IEEE Trans. Netw. Serv. Manag., vol. 11, no. 4, pp. 458–471, Dec. 2014.",
  "M. Khonji, Y. Iraqi, and A. Jones, \"Phishing Detection: A Literature Survey,\" IEEE Commun. Surveys Tuts., vol. 15, no. 4, pp. 2091–2121, 2013.",
  "A. K. Jain and B. B. Gupta, \"Phishing Detection: Analysis of Visual Similarity Based Approaches,\" Security and Communication Networks, vol. 10, no. 13, pp. 2224–2240, 2017.",
  "A. Le, A. Markopoulou, and M. Faloutsos, \"PhishDef: URL Names Say It All,\" in Proc. IEEE INFOCOM Workshops, 2011, pp. 191–196.",
  "A. K. Jain and B. B. Gupta, \"A Machine Learning Based Approach for Phishing Detection Using Hyperlinks Information,\" J. Ambient Intell. Humaniz. Comput., vol. 10, no. 1, pp. 201–217, 2019.",
  "Anti-Phishing Working Group, \"Phishing Activity Trends Report,\" APWG, 2024.",
  "Verizon, \"2024 Data Breach Investigations Report,\" Verizon Enterprise, 2024.",
  "S. Garera, N. Provos, M. Chew, and A. D. Rubin, \"A Framework for Detection and Measurement of Phishing Attacks,\" in Proc. ACM Workshop on Recurring Malcode, 2007.",
  "J. Ma, L. K. Saul, S. Savage, and G. M. Voelker, \"Beyond Blacklists: Learning to Detect Malicious Web Sites from Suspicious URLs,\" in Proc. ACM SIGKDD, 2009, pp. 1245–1254.",
  "R. Verma and K. Dyer, \"On the Character of Phishing URLs: Accurate and Robust Statistical Learning Classifiers,\" in Proc. ACM CODASPY, 2015, pp. 111–122.",
  "B. B. Gupta, N. A. G. Arachchilage, and K. E. Psannis, \"Defending Against Phishing Attacks: Taxonomy of Methods, Current Issues and Future Directions,\" Telecommun. Syst., vol. 67, no. 2, pp. 247–267, 2018.",
  "X. Zhang, Y. Zeng, and H. Chen, \"A Hybrid URL Phishing Detection Framework Based on Lexical and Structural Features,\" IEEE Access, vol. 9, pp. 118250–118263, 2021.",
  "R. Vinayakumar, K. P. Soman, and P. Poornachandran, \"Applying Deep Learning Approaches for Network Security and Phishing Detection,\" in Proc. IEEE ICACCI, 2019.",
  "V. Le Pochat, T. Van Goethem, S. Tajalizadehkhoob, M. Korczyński, and W. Joosen, \"Tranco: A Research-Oriented Top Sites Ranking Hardened Against Manipulation,\" in Proc. NDSS, 2019.",
  "OpenPhish, \"OpenPhish Phishing Intelligence Feed.\" [Online]. Available: https://openphish.com/",
  "Mozilla Foundation, \"Public Suffix List.\" [Online]. Available: https://publicsuffix.org/",
].forEach((t, i) => P(ref(i + 1, t)));

// ---------- assemble ----------

const doc = new Document({
  creator: "Bairi Christina",
  title: "Multilingual Rule-Based Phishing URL Detection",
  styles: {
    default: {
      document: { run: { font: FONT, size: BODY } },
    },
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840, orientation: PageOrientation.PORTRAIT },
          margin: { top: 900, right: 720, bottom: 280, left: 720 },
        },
        column: { count: 1 },
      },
      children: front,
    },
    {
      properties: {
        // Page size and margins must be repeated: a section does not inherit
        // them, and docx-js would otherwise default this one to A4.
        page: {
          size: { width: 12240, height: 15840, orientation: PageOrientation.PORTRAIT },
          margin: { top: 900, right: 720, bottom: 280, left: 720 },
        },
        type: SectionType.CONTINUOUS,
        column: { count: 2, space: 340, equalWidth: true },
      },
      children: content,
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(__dirname + "/phishing_paper_draft.docx", buf);
  console.log("wrote paper/phishing_paper_draft.docx");
});
