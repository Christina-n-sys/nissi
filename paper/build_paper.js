const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ShadingType, SectionType, ImageRun,
  PageOrientation, convertInchesToTwip,
} = require("docx");

const FONT = "Times New Roman";
const BODY = 20;      // 10pt in half-points
const SMALL = 16;     // 8pt, used inside tables
const COL_W = 4870;   // usable width of one column, in DXA

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

const caption = (text) => new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 100, after: 60 },
  children: [new TextRun({ text, font: FONT, size: SMALL, smallCaps: true })],
});

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
const COL_PX = 330;   // one column at 96 dpi, matching COL_W inches

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

const ref = (n, text) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED,
  spacing: { after: 40 },
  indent: { left: convertInchesToTwip(0.22), hanging: convertInchesToTwip(0.22) },
  children: [new TextRun({ text: `[${n}] ${text}`, font: FONT, size: SMALL })],
});

// ---------- front matter (full width) ----------

const front = [
  title("Multilingual Rule-Based Phishing URL Detection with Explainable Scoring and a Reproducible Evaluation Protocol"),
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
    text: "DRAFT — NUMBERS NOT YET MEASURED. Every cell shown as an em dash is a "
        + "value that must come from an actual run of the evaluation harness. Run "
        + "run_pipeline.py, then fill each table from the corresponding file in "
        + "results/. Do not submit while any em dash remains. Delete this box once "
        + "the tables are complete.",
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
      text: "Phishing remains among the most common cyber threats, and detectors "
          + "built on English lexical features miss campaigns that target users in "
          + "regional languages. This paper presents a rule-based phishing URL "
          + "detector that scores a URL against a 33-term vocabulary spanning "
          + "English, Hindi, Tamil and Telugu together with four structural "
          + "indicators, producing a bounded risk score, a three-level risk band, "
          + "and an itemised list of every rule that contributed weight. The "
          + "detector needs no training data, no network access and no accelerator, "
          + "and every decision is fully explainable by construction. Beyond the "
          + "detector, the paper contributes an evaluation protocol addressing a "
          + "construction artifact that we argue is widespread in URL-classification "
          + "work: benchmarks that pair phishing feeds, which supply full URLs with "
          + "paths, against top-site lists, which supply bare domains. Under such a "
          + "pairing, length- and delimiter-based rules separate the classes for "
          + "reasons unrelated to phishing. We quantify the effect with a diagnostic "
          + "that reports the gap in path presence between classes, remove it by "
          + "crawling content URLs for the legitimate class, and report a rule-group "
          + "ablation that isolates the contribution of the multilingual vocabulary "
          + "from that of the structural rules. On a balanced dataset of ",
      font: FONT, size: BODY, italics: true,
    }),
    new TextRun({ text: PENDING, font: FONT, size: BODY, italics: true, bold: true }),
    new TextRun({
      text: " URLs the detector attains an F1 of ",
      font: FONT, size: BODY, italics: true,
    }),
    new TextRun({ text: PENDING, font: FONT, size: BODY, italics: true, bold: true }),
    new TextRun({
      text: ", of which the multilingual vocabulary alone accounts for ",
      font: FONT, size: BODY, italics: true,
    }),
    new TextRun({ text: PENDING, font: FONT, size: BODY, italics: true, bold: true }),
    new TextRun({
      text: ". All code, the dataset builder and the evaluation harness are released "
          + "so that the reported figures can be regenerated from the primary feeds.",
      font: FONT, size: BODY, italics: true,
    }),
  ],
}));

P(new Paragraph({
  alignment: AlignmentType.JUSTIFIED,
  spacing: { after: 120 },
  children: [
    new TextRun({ text: "Keywords—", font: FONT, size: BODY, bold: true, italics: true }),
    new TextRun({
      text: "phishing detection, URL analysis, multilingual keyword matching, "
          + "rule-based classification, explainable security, dataset construction "
          + "artifacts, reproducible evaluation",
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
  + "specialised hardware."));
P(bullet("2)  An explainable scoring function that returns, for every classified "
  + "URL, the identity and weight of each rule that fired, so a verdict can be "
  + "audited term by term."));
P(bullet("3)  A reproducible dataset pipeline that deduplicates exactly and by "
  + "registrable domain, applies deduplication per class, and reports every URL and "
  + "domain appearing in both classes."));
P(bullet("4)  Identification and quantification of the bare-domain construction "
  + "artifact, together with a crawler that removes it by collecting genuine content "
  + "URLs for the legitimate class."));
P(bullet("5)  A rule-group ablation separating the contribution of the multilingual "
  + "vocabulary from that of the structural rules, so that neither can be credited "
  + "with the other's performance."));
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

P(subHead("A.  Scoring function"));
P(body("The detector maps a URL to a bounded integer score. Each rule that matches "
  + "contributes a fixed weight, weights are summed, and the total is clamped to a "
  + "maximum of 100:", { noIndent: true }));
P(equation("S(u) = min( Σ wᵢ · δᵢ(u),  100 )"));
P(figureImage("fig1_architecture.png", 300));
P(figCaption("Fig. 1.  Detection pipeline. Lexical and structural rules contribute weights to a single bounded score, which is banded and returned together with the identity of every rule that fired."));
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
P(caption("Table I.  Multilingual phishing vocabulary"));
P(table([900, 380, 3590], [
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
P(caption("Table II.  Rule weights"));
P(table([1350, 2320, 1200], [
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

P(figureImage("fig2_dashboard.png", 330));
P(figCaption("Fig. 2.  Dashboard classifying a URL that combines English lures with the Hindi/Telugu terms suraksha and khata. The verdict is accompanied by every rule that fired and its weight, which sum to the reported score."));

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
P(caption("Table III.  Defects identified and corrected"));
P(table([420, 1950, 2500], [
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
P(caption("Table IV.  Dataset composition"));
P(table([3070, 1800], [
  [{ t: "Quantity" }, { t: "Value", a: AlignmentType.CENTER }],
  [{ t: "Phishing URLs retrieved" }, { t: PENDING, a: AlignmentType.CENTER }],
  [{ t: "Legitimate URLs collected" }, { t: PENDING, a: AlignmentType.CENTER }],
  [{ t: "Exact duplicates removed" }, { t: PENDING, a: AlignmentType.CENTER }],
  [{ t: "Domain duplicates removed" }, { t: PENDING, a: AlignmentType.CENTER }],
  [{ t: "Cross-class conflicts removed" }, { t: PENDING, a: AlignmentType.CENTER }],
  [{ t: "Final dataset size" }, { t: PENDING, a: AlignmentType.CENTER }],
  [{ t: "Class balance (phishing : legitimate)" }, { t: PENDING, a: AlignmentType.CENTER }],
  [{ t: "Retrieval date" }, { t: PENDING, a: AlignmentType.CENTER }],
]));
P(note("Fill from the DATASET SUMMARY printed by build_dataset.py."));

P(caption("Table V.  Artifact diagnostic"));
P(table([2270, 1300, 1300], [
  [{ t: "Measure" }, { t: "Phishing", a: AlignmentType.CENTER }, { t: "Legitimate", a: AlignmentType.CENTER }],
  [{ t: "Mean URL length" }, { t: PENDING, a: AlignmentType.CENTER }, { t: PENDING, a: AlignmentType.CENTER }],
  [{ t: "URLs with a path (%)" }, { t: PENDING, a: AlignmentType.CENTER }, { t: PENDING, a: AlignmentType.CENTER }],
  [{ t: "Mean dot count" }, { t: PENDING, a: AlignmentType.CENTER }, { t: PENDING, a: AlignmentType.CENTER }],
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
P(body("The tables in this section are to be populated from a single execution of "
  + "the evaluation harness on the dataset described in Section V.", { noIndent: true }));

P(caption("Table VI.  Classification performance at threshold 60"));
P(table([2570, 2300], [
  [{ t: "Metric" }, { t: "Value", a: AlignmentType.CENTER }],
  [{ t: "True positives / False positives" }, { t: PENDING, a: AlignmentType.CENTER }],
  [{ t: "True negatives / False negatives" }, { t: PENDING, a: AlignmentType.CENTER }],
  [{ t: "Accuracy" }, { t: PENDING, a: AlignmentType.CENTER }],
  [{ t: "Precision" }, { t: PENDING, a: AlignmentType.CENTER }],
  [{ t: "Recall" }, { t: PENDING, a: AlignmentType.CENTER }],
  [{ t: "Specificity" }, { t: PENDING, a: AlignmentType.CENTER }],
  [{ t: "F1 score" }, { t: PENDING, a: AlignmentType.CENTER }],
]));
P(note("Fill from results/headline.csv."));

P(caption("Table VII.  Rule-group ablation"));
P(table([1770, 780, 780, 780, 760], [
  [{ t: "Variant" }, { t: "Acc.", a: AlignmentType.CENTER }, { t: "Prec.", a: AlignmentType.CENTER },
   { t: "Rec.", a: AlignmentType.CENTER }, { t: "F1", a: AlignmentType.CENTER }],
  [{ t: "All rules" }, { t: PENDING, a: AlignmentType.CENTER }, { t: PENDING, a: AlignmentType.CENTER },
   { t: PENDING, a: AlignmentType.CENTER }, { t: PENDING, a: AlignmentType.CENTER }],
  [{ t: "Vocabulary only" }, { t: PENDING, a: AlignmentType.CENTER }, { t: PENDING, a: AlignmentType.CENTER },
   { t: PENDING, a: AlignmentType.CENTER }, { t: PENDING, a: AlignmentType.CENTER }],
  [{ t: "Structural only" }, { t: PENDING, a: AlignmentType.CENTER }, { t: PENDING, a: AlignmentType.CENTER },
   { t: PENDING, a: AlignmentType.CENTER }, { t: PENDING, a: AlignmentType.CENTER }],
]));
P(note("Fill from results/ablation.csv. This is the central table of the paper: the "
  + "gap between the first two rows is the contribution of the multilingual "
  + "vocabulary, and the third row bounds what the structural rules achieve alone."));

P(caption("Table VIII.  Substring versus token matching"));
P(table([1770, 780, 780, 780, 760], [
  [{ t: "Mode" }, { t: "Acc.", a: AlignmentType.CENTER }, { t: "Prec.", a: AlignmentType.CENTER },
   { t: "Rec.", a: AlignmentType.CENTER }, { t: "F1", a: AlignmentType.CENTER }],
  [{ t: "Substring" }, { t: PENDING, a: AlignmentType.CENTER }, { t: PENDING, a: AlignmentType.CENTER },
   { t: PENDING, a: AlignmentType.CENTER }, { t: PENDING, a: AlignmentType.CENTER }],
  [{ t: "Token" }, { t: PENDING, a: AlignmentType.CENTER }, { t: PENDING, a: AlignmentType.CENTER },
   { t: PENDING, a: AlignmentType.CENTER }, { t: PENDING, a: AlignmentType.CENTER }],
]));
P(note("Fill from results/match_mode.csv."));

P(figureImage("fig3_threshold_sweep.png", 330));
P(figCaption("Fig. 3.  Precision, recall and F1 across the full threshold range. The dotted line marks the operating threshold of 60."));
P(figureImage("fig4_ablation.png", 330));
P(figCaption("Fig. 4.  Rule-group ablation. The gap between the full rule set and the vocabulary-only variant is the contribution of the multilingual terms."));
P(figureImage("fig5_per_rule.png", 330));
P(figCaption("Fig. 5.  Firing rate of each rule within each class. A rule that fires often on legitimate URLs is a source of false positives."));

P(subHead("A.  Interpretation"));
P(body("Three questions should be answered from the tables above, and the answers "
  + "determine the claims this paper can support.", { noIndent: true }));
P(bullet("Does the multilingual vocabulary carry the detection? Compare the "
  + "vocabulary-only row of Table VII against the full rule set. A small gap "
  + "supports the paper's central claim; a large one indicates the structural rules "
  + "dominate and the multilingual contribution is modest."));
P(bullet("Are the structural rules measuring phishing or dataset construction? Read "
  + "Table VII together with Table V. Structural-only performance that is strong "
  + "while the path-presence gap is large indicates the artifact, not detection."));
P(bullet("Which matching mode should be deployed? Table VIII decides this "
  + "empirically. If token matching improves precision without materially reducing "
  + "recall, it should become the default."));
P(body("Per-rule statistics in results/per_rule.csv identify which vocabulary terms "
  + "fire in practice. Terms that never fire are candidates for removal, and terms "
  + "that fire frequently on legitimate URLs are candidates for revision; both "
  + "should be discussed rather than omitted."));

// VIII. Limitations ----------------------------------------------------------
P(sectionHead("VIII.  Limitations"));
P(body("The detector is bounded by its vocabulary. A lure phrased in terms absent "
  + "from the 33-term list contributes no lexical weight, and an attacker who reads "
  + "this paper can construct such a URL directly. Rule-based detection of this kind "
  + "raises the cost of a careless campaign; it does not withstand a targeted one.",
  { noIndent: true }));
P(body("Substring matching produces false positives on legitimate strings that "
  + "contain a vocabulary term, and the weights are inherited from the prototype "
  + "rather than fitted, so they are defensible only as a transparent baseline. "
  + "Because the terms are transliterations, the detector does not address lures "
  + "written in native scripts."));
P(body("The evaluation is a single-shot measurement on one dataset drawn from feeds "
  + "that change daily, and the phishing class reflects whatever campaigns were "
  + "live at retrieval time. The legitimate class is drawn from highly ranked sites "
  + "and is not representative of the long tail of the web. No comparison against a "
  + "trained baseline classifier is reported; establishing whether the multilingual "
  + "vocabulary adds anything a supervised model would not learn on its own remains "
  + "open, and we regard it as the most important next experiment."));

// IX. Conclusion -------------------------------------------------------------
P(sectionHead("IX.  Conclusion and Future Work"));
P(body("This paper presented a rule-based multilingual phishing URL detector that "
  + "requires no training and explains every verdict by construction, and an "
  + "evaluation protocol built around a construction artifact that we argue affects "
  + "a substantial body of URL-classification work. The methodological contribution "
  + "is the more durable of the two: pairing a phishing feed against a top-site list "
  + "yields classes separable by string length alone, and any study using that "
  + "recipe should report the artifact diagnostic before reporting metrics.",
  { noIndent: true }));
P(body("Future work follows the limitations. The vocabulary should be extended to "
  + "native scripts and to additional languages, and weights fitted rather than "
  + "assigned. A supervised baseline trained on the same dataset would establish "
  + "what the rule-based approach gives up in accuracy and gains in "
  + "interpretability. Finally, the detector's low computational cost makes a "
  + "browser extension a natural deployment, which would allow measurement against "
  + "live traffic rather than a static corpus."));

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
          margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
        },
        column: { count: 1 },
      },
      children: front,
    },
    {
      properties: {
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
