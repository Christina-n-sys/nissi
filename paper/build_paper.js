const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ShadingType, SectionType, ImageRun,
  PageOrientation, convertInchesToTwip,
} = require("docx");

const FONT = "Times New Roman";
const BODY = 20;      // 10pt in half-points
const SMALL = 16;     // 8pt, used in tables and captions
const COL_W = 5230;   // usable width of one column, in DXA
const COL_PX = 344;   // the same column at 96 dpi
const FIGDIR = __dirname + "/figures";
const C = AlignmentType.CENTER;

// ---------- building blocks ----------

const title = (text) => new Paragraph({
  alignment: C, spacing: { after: 120 },
  children: [new TextRun({ text, font: FONT, size: 44 })],
});

const authorLine = (text, opts = {}) => new Paragraph({
  alignment: C, spacing: { after: opts.after ?? 0 },
  children: [new TextRun({ text, font: FONT, size: opts.size ?? BODY })],
});

const sectionHead = (text) => new Paragraph({
  alignment: C, spacing: { before: 220, after: 110 },
  children: [new TextRun({ text, font: FONT, size: BODY, smallCaps: true })],
});

const subHead = (text) => new Paragraph({
  spacing: { before: 140, after: 70 },
  children: [new TextRun({ text, font: FONT, size: BODY, italics: true })],
});

const body = (text, opts = {}) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED,
  spacing: { after: opts.after ?? 70 },
  indent: opts.noIndent ? undefined : { firstLine: convertInchesToTwip(0.18) },
  children: [new TextRun({ text, font: FONT, size: BODY })],
});

const bullet = (text) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED, spacing: { after: 50 },
  indent: { left: convertInchesToTwip(0.24), hanging: convertInchesToTwip(0.12) },
  children: [new TextRun({ text, font: FONT, size: BODY })],
});

const equation = (text) => new Paragraph({
  alignment: C, spacing: { before: 90, after: 90 },
  children: [new TextRun({ text, font: FONT, size: BODY, italics: true })],
});

// IEEE table caption: number then title, both centred above the table.
const tableCaption = (number, titleText) => [
  new Paragraph({
    alignment: C, spacing: { before: 130, after: 0 },
    children: [new TextRun({ text: `TABLE ${number}`, font: FONT, size: SMALL })],
  }),
  new Paragraph({
    alignment: C, spacing: { before: 0, after: 55 },
    children: [new TextRun({ text: titleText, font: FONT, size: SMALL, smallCaps: true })],
  }),
];

const note = (text) => new Paragraph({
  alignment: AlignmentType.LEFT, spacing: { before: 50, after: 110 },
  children: [new TextRun({ text, font: FONT, size: SMALL, italics: true })],
});

function cell(text, width, opts = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    margins: { top: 36, bottom: 36, left: 70, right: 70 },
    children: [new Paragraph({
      alignment: opts.align ?? AlignmentType.LEFT,
      children: [new TextRun({
        text, font: FONT, size: SMALL, bold: !!opts.header,
      })],
    })],
  });
}

// Tables are black and white: horizontal rules only, no fills.
function table(widths, rows) {
  return new Table({
    columnWidths: widths,
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 6, color: "000000" },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
      left:   { style: BorderStyle.NONE },
      right:  { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
      insideVertical:   { style: BorderStyle.NONE },
    },
    rows: rows.map((cells, i) => new TableRow({
      tableHeader: i === 0,
      children: cells.map((c, j) =>
        cell(c.t, widths[j], { header: i === 0, align: c.a })),
    })),
  });
}

// Figures are numbered by document order, so moving one cannot leave a stale
// number behind.
let figureCounter = 0;
function figure(file, captionText, widthPx = COL_PX) {
  figureCounter += 1;
  const path = `${FIGDIR}/${file}`;
  const dim = require("child_process").execSync(
    `python3 -c "from PIL import Image; w,h=Image.open('${path}').size; print(w,h)"`
  ).toString().trim().split(" ").map(Number);
  return [
    new Paragraph({
      alignment: C, spacing: { before: 110, after: 35 },
      children: [new ImageRun({
        type: "png", data: fs.readFileSync(path),
        transformation: { width: widthPx, height: Math.round(widthPx * dim[1] / dim[0]) },
      })],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT, spacing: { after: 130 },
      children: [new TextRun({
        text: `Fig. ${figureCounter}.  ${captionText}`, font: FONT, size: SMALL,
      })],
    }),
  ];
}

const ref = (n, text) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED, spacing: { after: 32 },
  indent: { left: convertInchesToTwip(0.2), hanging: convertInchesToTwip(0.2) },
  children: [new TextRun({ text: `[${n}] ${text}`, font: FONT, size: SMALL })],
});

// ---------- front matter ----------

const front = [
  title("Measuring a Multilingual Rule-Based Phishing URL Detector: A Negative Result"),
  authorLine("Bairi Christina", { after: 0 }),
  authorLine("Department of Data Science and Cyber Security", { size: SMALL }),
  authorLine("Karunya Institute of Technology and Sciences, Coimbatore, India", { size: SMALL }),
  authorLine("bairichristinal@karunya.edu.in", { size: SMALL, after: 110 }),
  authorLine("Rahul R", { after: 0 }),
  authorLine("Department of Data Science and Cyber Security", { size: SMALL }),
  authorLine("Karunya Institute of Technology and Sciences, Coimbatore, India", { size: SMALL }),
  authorLine("rahulrajanrc@gmail.com", { size: SMALL, after: 200 }),
];

const content = [];
const P = (x) => content.push(x);

// ---------- abstract ----------

P(new Paragraph({
  alignment: AlignmentType.JUSTIFIED, spacing: { after: 90 },
  children: [
    new TextRun({ text: "Abstract—", font: FONT, size: BODY, bold: true, italics: true }),
    new TextRun({
      text: "Phishing detectors built on English lexical features miss campaigns "
          + "aimed at speakers of regional languages. This paper specifies a "
          + "rule-based phishing URL detector that scores a URL against a 33-term "
          + "vocabulary spanning English, Hindi, Tamil and Telugu together with "
          + "four structural indicators, requires no training data and explains "
          + "every verdict by construction, and then measures it. On a balanced "
          + "set of 170 URLs drawn from a live phishing feed and a top-sites list, "
          + "the detector classifies nothing as phishing at the risk threshold it "
          + "was configured with: recall and F1 are zero and accuracy equals the "
          + "base rate. A threshold sweep places the best operating point at a "
          + "score of 10, where F1 reaches 0.780, so the configured threshold is "
          + "miscalibrated by a factor of six. An ablation shows the multilingual "
          + "vocabulary's marginal value is negative rather than merely small: "
          + "removing it raises F1 to 0.786. Four of its 33 terms fire at all and "
          + "none of them are Hindi, Tamil or Telugu. What detection remains comes "
          + "almost entirely from a URL-length rule that our own construction "
          + "diagnostic identifies as an artifact of how the benchmark was "
          + "assembled. Two findings emerged from the pipeline rather than the "
          + "detector: two thirds of the live feed was hosted on domains that also "
          + "rank among the top sites, so no domain-level feature can separate the "
          + "classes; and 36 per cent of the phishing URLs carry their deception in "
          + "the spelling of the hostname rather than in path keywords, a mechanism "
          + "keyword matching cannot address. The negative result is reported as "
          + "found, and all code and data are released so that every number can be "
          + "regenerated.",
      font: FONT, size: BODY, italics: true,
    }),
  ],
}));

P(new Paragraph({
  alignment: AlignmentType.JUSTIFIED, spacing: { after: 110 },
  children: [
    new TextRun({ text: "Index Terms—", font: FONT, size: BODY, bold: true, italics: true }),
    new TextRun({
      text: "phishing detection, URL analysis, multilingual keyword matching, "
          + "rule-based classification, negative results, evaluation methodology, "
          + "dataset construction, reproducibility",
      font: FONT, size: BODY, italics: true,
    }),
  ],
}));

// ---------- 1. Introduction ----------

P(sectionHead("I.  Introduction"));
P(body("Phishing directs users to deceptive Uniform Resource Locators that "
  + "imitate legitimate services in order to capture passwords, banking "
  + "credentials and one-time passwords. It remains among the most frequently "
  + "reported categories of cybercrime [1], and continues to feature in a large "
  + "share of breaches involving a human element [2]. The attack succeeds before "
  + "any software vulnerability is involved: the victim reads a URL, judges it "
  + "plausible, and proceeds. Because the URL is where the deception must survive "
  + "inspection, it remains a productive place to intervene.", { noIndent: true }));
P(body("Established defences have known structural weaknesses. Blacklists cannot "
  + "recognise a domain registered minutes ago, and large-scale measurement shows "
  + "that much of a phishing campaign's damage is done inside the window before "
  + "listing occurs [3], with blacklist coverage and speed varying widely in "
  + "practice [4]. Supervised learning over URL strings generalises further but "
  + "requires labelled corpora, periodic retraining, and yields models whose "
  + "decisions are difficult to explain to the user being protected."));
P(body("A less discussed limitation cuts across all of these. Detectors are "
  + "overwhelmingly built and evaluated on English lexical features, so an "
  + "attacker who writes a lure in a regional language evades the lexical "
  + "component entirely. In the Indian subcontinent, campaigns can employ "
  + "transliterated Hindi, Tamil and Telugu terms for account, verification, "
  + "security and urgency. A detector whose vocabulary contains only English "
  + "tokens scores such a URL as it would score any unfamiliar string."));
P(body("This paper specifies a deliberately small, fully transparent detector "
  + "addressing that gap, and then measures it under a protocol built for the "
  + "purpose. The measurement is negative, and we report it as found. We also "
  + "report a construction artifact encountered while assembling the benchmark: "
  + "the conventional pairing of a phishing feed with a top-sites list produces "
  + "classes separable by string length alone, because one source supplies full "
  + "URLs and the other supplies bare domains. We treat the identification and "
  + "quantification of that artifact as a contribution in its own right."));
P(body("The contributions are as follows.", { noIndent: true }));
P(bullet("1) A rule-based multilingual phishing URL detector covering English, "
  + "Hindi, Tamil and Telugu, requiring no training and no network access, which "
  + "returns the identity and weight of every rule that fired so a verdict can be "
  + "audited term by term."));
P(bullet("2) A negative result. At the threshold the detector was configured "
  + "with it classifies nothing as phishing; the best attainable operating point "
  + "lies at one sixth of that threshold."));
P(bullet("3) Evidence that the multilingual vocabulary has negative marginal "
  + "value on a global feed: removing it improves F1, and none of its "
  + "regional-language terms fire."));
P(bullet("4) Two measurements of the current phishing landscape: two thirds of "
  + "the feed is hosted on domains that also rank among the top sites, and 36 per "
  + "cent of URLs carry their deception in the hostname spelling."));
P(bullet("5) A construction-artifact diagnostic that we argue should be reported "
  + "before any metric in URL-classification work."));

// ---------- 2. Related work ----------

P(sectionHead("II.  Related Work"));
P(body("Recent surveys of phishing website detection agree on the broad "
  + "landscape: blacklists are precise but slow, feature-based machine learning "
  + "dominates the literature, and deep models improve accuracy at substantially "
  + "greater data and compute cost [5], [6]. Character-level neural models "
  + "operating directly on the URL string report strong results without "
  + "hand-crafted features [7]. Across this work the reported metrics are high, "
  + "which makes the composition of the underlying benchmarks consequential.",
  { noIndent: true }));
P(body("That composition has itself been questioned. Hannousse and Yahiouche [8] "
  + "examine the datasets commonly used for machine-learning phishing detection "
  + "and find that reported performance depends heavily on how the corpus was "
  + "assembled and on which features are available in it. Our construction "
  + "artifact is an instance of the same concern, arising at the level of the raw "
  + "URL string rather than of extracted features, and we give a diagnostic that "
  + "detects it directly."));
P(body("A parallel line of measurement work characterises what live phishing "
  + "actually looks like, rather than how well a classifier scores. Zhang et al. "
  + "[9] show that client-side cloaking is widespread and materially reduces the "
  + "effectiveness of automated crawlers. Kondracki et al. [10] identify "
  + "man-in-the-middle phishing toolkits that proxy the genuine site. Bijmans et "
  + "al. [11] track phishing kits at national scale and document how heavily "
  + "attackers rely on shared infrastructure. Our findings on hosting and on "
  + "hostname spelling are consistent with this line of work, and were obtained "
  + "as a by-product of the evaluation pipeline rather than as its objective."));
P(body("Two gaps motivate this paper. First, the lexical component of published "
  + "detectors is almost always English; where multilingual phishing is "
  + "considered it is usually at the level of page content rather than the URL "
  + "string. Second, benchmark construction is rarely reported in enough detail "
  + "to reproduce, and the recipe we examine is sufficient on its own to produce "
  + "strong-looking results from a rule encoding no knowledge of phishing."));

// ---------- 3. Methodology ----------

P(sectionHead("III.  Methodology"));

P(subHead("A.  Scoring function"));
P(body("The detector maps a URL to a bounded integer score. Each rule that "
  + "matches contributes a fixed weight, weights are summed, and the total is "
  + "clamped at 100:", { noIndent: true }));
P(equation("S(u) = min ( sum over i of w_i . d_i(u) ,  100 )"));
P(body("where d_i(u) is 1 when rule i fires on URL u and 0 otherwise, and w_i is "
  + "that rule's weight. The form is deliberately additive and monotone: no rule "
  + "can reduce another's contribution, so the effect of any single term is "
  + "inspectable in isolation. Fig. 1 shows the pipeline.", { noIndent: true }));

figure("fig1_pipeline.png", "Detection pipeline. Lexical and structural rules "
  + "contribute weights to one bounded score, which is banded and returned "
  + "together with the identity of every rule that fired.", 275).forEach(P);

P(subHead("B.  Multilingual vocabulary and structural rules"));
P(body("The lexical component matches a 33-term vocabulary of transliterated "
  + "phishing lures across four languages, listed in Table I. Terms were chosen "
  + "for semantic roles that recur in lures: account, verification, security, "
  + "urgency and financial instruments. Each matched term contributes a weight of "
  + "10. The vocabulary is de-duplicated, so a term shared between languages, "
  + "such as khata and suraksha in Hindi and Telugu, contributes once.",
  { noIndent: true }));

tableCaption("I", "Multilingual Phishing Vocabulary").forEach(P);
P(table([960, 400, 3870], [
  [{ t: "Language" }, { t: "n", a: C }, { t: "Terms" }],
  [{ t: "English" }, { t: "9", a: C },
   { t: "login, verify, secure, account, update, bank, otp, signin, password" }],
  [{ t: "Hindi" }, { t: "11", a: C },
   { t: "kyc, aadhaar, pan, banking, verifyotp, suraksha, khata, jaanch, satyapan, turant, seva" }],
  [{ t: "Tamil" }, { t: "9", a: C },
   { t: "vangi, kanakku, urudhi, puduppi, paathukaappu, seyal, udanadi, otpverify, bankupdate" }],
  [{ t: "Telugu" }, { t: "4", a: C },
   { t: "dhruvikarinchu, vaddi, runam, podupukhata" }],
]));

P(body("Four structural indicators complement the vocabulary: a URL longer than "
  + "30 characters and a URL containing more than three dots each add 10, and the "
  + "presence of an at-sign adds 20. The at-sign carries double weight because "
  + "everything preceding it in the authority component is discarded by the "
  + "browser, making it a direct mechanism for disguising the host rather than a "
  + "statistical correlate of one. Scores map to three bands: Low below 30, "
  + "Medium from 30 to 59, and High at 60 and above. The High boundary is the "
  + "operating threshold used for binary classification. Weights and thresholds "
  + "are inherited from the prototype system and were never fitted to data, a "
  + "point Section V returns to."));

P(subHead("C.  Explainability and matching modes"));
P(body("The detector returns, alongside the score and band, the identity and "
  + "weight of every rule that fired. A verdict is therefore an itemised account "
  + "rather than a bare label. This holds exactly rather than approximately, "
  + "being a consequence of the additive design rather than a post hoc "
  + "attribution method. Fig. 2 shows the interface reporting a verdict this way.",
  { noIndent: true }));
P(body("Two matching modes are provided. Substring matching, the inherited "
  + "default, reports a term wherever it occurs in the URL. Token matching first "
  + "splits the URL on non-alphanumeric characters and requires a whole-token "
  + "match. Substring matching is the more sensitive and the more error-prone; "
  + "Section V measures the difference."));

figure("fig5_dashboard_bw.png", "The dashboard classifying a phishing URL. The "
  + "verdict is accompanied by every rule that fired and its weight, and those "
  + "weights sum to the reported score of 90.", 300).forEach(P);

P(subHead("D.  Implementation"));
P(body("The detector is implemented in Python using only the standard library, "
  + "in a single module of under 200 lines. Three front-ends share it without "
  + "reimplementing any logic: a command-line interface, a desktop application "
  + "and a web dashboard. The dataset builder and evaluation harness add roughly "
  + "1,300 further lines. The system is covered by 208 automated tests, and the "
  + "code, the dataset and the result files are released so that every figure in "
  + "this paper can be regenerated.", { noIndent: true }));

P(subHead("E.  Dataset construction"));
P(body("Phishing URLs are drawn from the OpenPhish community feed [12] and "
  + "legitimate domains from the Tranco top-sites list [13]. Both change daily, "
  + "so the retrieval date is recorded with every build and raw downloads are "
  + "cached, allowing a build to be repeated exactly. Duplicates are removed at "
  + "two levels: exact deduplication normalises case and trailing slashes, and "
  + "registrable-domain deduplication, computed against the Public Suffix List "
  + "[14], collapses multiple URLs hosted on one domain. The scope of the second "
  + "is configurable per class, since phishing feeds list many URLs per "
  + "compromised host.", { noIndent: true }));
P(body("A domain can legitimately appear in both classes. Hosting platforms and "
  + "URL shorteners rank highly in Tranco and are simultaneously used to serve "
  + "phishing. Such domains are reported and removed from both classes, since "
  + "retaining them injects label noise that no URL-level feature can resolve. "
  + "Table II gives the resulting composition."));

tableCaption("II", "Dataset Composition").forEach(P);
P(table([3300, 1930], [
  [{ t: "Quantity" }, { t: "Value", a: C }],
  [{ t: "Phishing URLs retrieved" }, { t: "300", a: C }],
  [{ t: "Legitimate domains read" }, { t: "5,000", a: C }],
  [{ t: "Exact duplicates removed" }, { t: "0", a: C }],
  [{ t: "Domain duplicates removed" }, { t: "32", a: C }],
  [{ t: "Cross-class conflicts removed" }, { t: "196", a: C }],
  [{ t: "Domains present in both classes" }, { t: "13", a: C }],
  [{ t: "Final dataset size" }, { t: "170", a: C }],
  [{ t: "Class balance (phishing : legitimate)" }, { t: "85 : 85", a: C }],
  [{ t: "Retrieval date" }, { t: "2 Sept. 2026", a: C }],
]));

P(subHead("F.  A construction artifact in the standard recipe"));
P(body("Pairing a phishing feed with a top-sites list is the conventional way to "
  + "assemble a URL benchmark, and it introduces a confound severe enough to "
  + "invalidate the resulting metrics. Tranco distributes registrable domains, "
  + "not URLs, so the negative class consists of short, path-free strings such as "
  + "example.com. Phishing feeds distribute full URLs, typically longer and "
  + "carrying multi-segment paths. The two classes are therefore separable by "
  + "string length before any phishing-specific feature is consulted.",
  { noIndent: true }));
P(body("Because the confound is invisible in headline metrics, the harness "
  + "measures it directly, reporting mean URL length, mean dot count and the "
  + "percentage of URLs carrying a path for each class. Table III gives the values "
  + "for this dataset. A gap of 62 percentage points in path presence means a "
  + "length rule separates the classes because one file contains paths and the "
  + "other does not. We recommend this diagnostic be reported alongside metrics "
  + "in any URL-classification study."));

tableCaption("III", "Construction Artifact Diagnostic").forEach(P);
P(table([2430, 1400, 1400], [
  [{ t: "Measure" }, { t: "Phishing", a: C }, { t: "Legitimate", a: C }],
  [{ t: "Mean URL length" }, { t: "47.3", a: C }, { t: "19.6", a: C }],
  [{ t: "URLs with a path (%)" }, { t: "62.4", a: C }, { t: "0.0", a: C }],
  [{ t: "Mean dot count" }, { t: "1.9", a: C }, { t: "1.0", a: C }],
]));

// ---------- 4. Experimental protocol ----------

P(sectionHead("IV.  Experimental Protocol"));
P(body("Phishing is the positive class. A URL is classified as phishing when its "
  + "score reaches the operating threshold of 60. We report accuracy, precision, "
  + "recall, specificity and F1 together with the confusion matrix. Because the "
  + "detector is rule-based and fits no parameters to the data, no train-test "
  + "split is required and none is performed; the entire dataset serves as the "
  + "test set. This removes a family of leakage concerns but also means the "
  + "vocabulary must not be revised in response to the measured results, a "
  + "discipline we observe and state explicitly.", { noIndent: true }));
P(body("Three further analyses accompany the headline figures. A threshold sweep "
  + "from 0 to 100 characterises the precision-recall trade-off and situates the "
  + "chosen operating point. A rule-group ablation compares the full rule set "
  + "against vocabulary-only and structural-only variants; ablations are computed "
  + "by removing rules from the scorer's own output rather than by reimplementing "
  + "the scoring logic, so a variant cannot diverge from the deployed detector. A "
  + "matching-mode comparison contrasts substring and token matching. Because a "
  + "badly calibrated threshold can drive every variant to zero and make the "
  + "comparison vacuous, the ablation and the mode comparison are reported at the "
  + "best-F1 threshold as well as at the configured one. Per-rule statistics "
  + "report, for each rule, its firing rate within each class."));

// ---------- 5. Results ----------

P(sectionHead("V.  Results"));
P(body("Every figure and table in this section comes from one execution of the "
  + "harness over the dataset of Section III-E.", { noIndent: true }));

P(subHead("A.  Nothing is detected at the configured threshold"));
P(body("At the High Risk threshold of 60 the detector labels no URL as phishing. "
  + "All 85 phishing URLs are false negatives and all 85 legitimate URLs are true "
  + "negatives, so accuracy equals the base rate of 0.500, specificity is 1.000 "
  + "by vacancy, and precision, recall and F1 are all zero. A detector that never "
  + "raises an alarm is trivially specific and useless.", { noIndent: true }));
P(body("The sweep in Fig. 3 shows this is a calibration failure rather than an "
  + "absence of signal. F1 peaks at 0.780 at a threshold of 10, where precision is "
  + "0.982 and recall 0.647, and decays to zero by 40. The configured threshold is "
  + "six times the best available one. Because the weights and bands were "
  + "inherited and never fitted, nothing in the original system could have "
  + "revealed this: a rule-based detector whose thresholds are asserted rather "
  + "than measured can be demonstrated and adopted while detecting nothing. "
  + "Table IV contrasts the two operating points."));
P(body("Reaching 0.780 requires accepting a score of 10, which is a single fired "
  + "rule. The system is therefore not operating as a weighted multi-rule scorer "
  + "at all, but as a single-indicator alarm."));

figure("fig2_threshold_sweep.png", "Precision, recall and F1 across the full "
  + "threshold range. Performance is already zero well before the configured "
  + "threshold of 60.").forEach(P);

tableCaption("IV", "Performance at the Configured and Best Thresholds").forEach(P);
P(table([2430, 1400, 1400], [
  [{ t: "Metric" }, { t: "t = 60", a: C }, { t: "t = 10", a: C }],
  [{ t: "True positives" }, { t: "0", a: C }, { t: "55", a: C }],
  [{ t: "False positives" }, { t: "0", a: C }, { t: "1", a: C }],
  [{ t: "True negatives" }, { t: "85", a: C }, { t: "84", a: C }],
  [{ t: "False negatives" }, { t: "85", a: C }, { t: "30", a: C }],
  [{ t: "Accuracy" }, { t: "0.500", a: C }, { t: "0.818", a: C }],
  [{ t: "Precision" }, { t: "0.000", a: C }, { t: "0.982", a: C }],
  [{ t: "Recall" }, { t: "0.000", a: C }, { t: "0.647", a: C }],
  [{ t: "Specificity" }, { t: "1.000", a: C }, { t: "0.988", a: C }],
  [{ t: "F1 score" }, { t: "0.000", a: C }, { t: "0.780", a: C }],
]));

P(subHead("B.  The vocabulary has negative marginal value"));
P(body("Fig. 4 gives the firing rate of each rule within each class. Four of the "
  + "33 vocabulary terms fire anywhere in the dataset: login on three phishing "
  + "URLs, and update, account and pan on one each. None of the Hindi, Tamil or "
  + "Telugu terms fire at all.", { noIndent: true }));
P(body("The ablation in Table V quantifies what that costs. At the best operating "
  + "point the vocabulary alone reaches F1 0.130, catching six of 85 phishing "
  + "URLs. The structural rules alone reach 0.786. The full rule set reaches "
  + "0.780. Removing the multilingual vocabulary therefore improves the detector: "
  + "the six URLs it finds are already found by the structural rules, while its "
  + "single false positive is not otherwise produced. On this corpus the "
  + "contribution of the vocabulary is not small; it is negative."));
P(body("One of the six hits is spurious in any case. The term pan matches inside "
  + "the hostname cpanel.site, a hosting control panel and not a reference to a "
  + "Permanent Account Number. The rule fires for the wrong reason and is counted "
  + "as a true positive only because the URL happens to be phishing for unrelated "
  + "reasons."));

tableCaption("V", "Rule-Group Ablation at Both Operating Points").forEach(P);
P(table([620, 1560, 780, 780, 780, 710], [
  [{ t: "t" }, { t: "Variant" }, { t: "Acc.", a: C }, { t: "Prec.", a: C },
   { t: "Rec.", a: C }, { t: "F1", a: C }],
  [{ t: "60", a: C }, { t: "All rules" }, { t: "0.500", a: C }, { t: "0.000", a: C },
   { t: "0.000", a: C }, { t: "0.000", a: C }],
  [{ t: "60", a: C }, { t: "Vocabulary only" }, { t: "0.500", a: C }, { t: "0.000", a: C },
   { t: "0.000", a: C }, { t: "0.000", a: C }],
  [{ t: "60", a: C }, { t: "Structural only" }, { t: "0.500", a: C }, { t: "0.000", a: C },
   { t: "0.000", a: C }, { t: "0.000", a: C }],
  [{ t: "10", a: C }, { t: "All rules" }, { t: "0.818", a: C }, { t: "0.982", a: C },
   { t: "0.647", a: C }, { t: "0.780", a: C }],
  [{ t: "10", a: C }, { t: "Vocabulary only" }, { t: "0.529", a: C }, { t: "0.857", a: C },
   { t: "0.071", a: C }, { t: "0.130", a: C }],
  [{ t: "10", a: C }, { t: "Structural only" }, { t: "0.824", a: C }, { t: "1.000", a: C },
   { t: "0.647", a: C }, { t: "0.786", a: C }],
]));
P(note("At the configured threshold every variant scores zero, so the comparison "
  + "is vacuous there and is repeated at the best operating point."));

figure("fig3_ablation.png", "Rule-group ablation at the best operating point. "
  + "Removing the multilingual vocabulary raises F1 from 0.780 to 0.786.").forEach(P);

P(subHead("C.  What detection remains is the artifact"));
P(body("One rule accounts for almost all of the behaviour. The long_url rule "
  + "fires on 55 of 85 phishing URLs and on none of the legitimate URLs, a "
  + "within-class rate of 0.647 against 0.000. At the best operating point a "
  + "score of 10 is in most cases long_url alone, so the reported F1 of 0.780 is "
  + "very largely the performance of a single length test.", { noIndent: true }));
P(body("Table III shows why that number must not be read as detection. The "
  + "classes differ by 62 percentage points in path presence before any "
  + "phishing-specific property is consulted, because the negative class consists "
  + "of bare domains. A length rule separates them for that reason alone. Any "
  + "system evaluated on a benchmark built this way will report a strong length "
  + "feature and will fail on the first legitimate URL that has a path, which is "
  + "to say on most real traffic."));

figure("fig4_per_rule.png", "Firing rate of each rule within each class. One "
  + "structural rule dominates; the vocabulary terms are barely present.").forEach(P);

P(subHead("D.  Live phishing is hosted on legitimate infrastructure"));
P(body("The largest single effect in the build was not anticipated. Of 300 "
  + "phishing URLs retrieved, 196 rows were removed as cross-class conflicts "
  + "because their registrable domains also appear among the top sites. Thirteen "
  + "domains are shared between the classes and their character is uniform: "
  + "hosting, publishing and content-delivery platforms. Roughly two thirds of "
  + "the live phishing in this feed was served from infrastructure that is itself "
  + "entirely legitimate and highly ranked.", { noIndent: true }));
P(body("The consequence for URL classification is direct. On this data no "
  + "domain-level or reputation-level feature can separate the classes, because "
  + "the domain is shared. Detection must come from the path, the subdomain label "
  + "or the page, none of which a registrable-domain feature sees. This is "
  + "consistent with measurement work documenting attacker reliance on shared "
  + "infrastructure [11]."));
P(body("Inspecting the phishing class sharpens the point further. Thirty-six per "
  + "cent of the URLs impersonate a brand by misspelling it in the hostname, in "
  + "forms such as whastapp-center.my, robiox.com.py and steamcommunutty.com. "
  + "Fifteen per cent are served from general-purpose hosting platforms and "
  + "eleven per cent from link shorteners or QR redirectors, which carry no "
  + "attacker-chosen text at all. The brands being impersonated are themselves "
  + "present in the legitimate class. Not one URL in the sample contains a "
  + "non-ASCII character."));

P(subHead("E.  Token matching is better than substring matching"));
P(body("At the configured threshold both matching modes score zero. At the best "
  + "operating point they separate: substring matching reaches F1 0.780 and token "
  + "matching 0.786, the whole difference being one false positive that token "
  + "matching does not make. The legitimate URL windowsupdate.com contains the "
  + "term update as a substring of windowsupdate, and substring matching duly "
  + "reports it; token matching splits the URL and matches neither token. The "
  + "same mechanism produced the spurious pan match inside cpanel.site. Substring "
  + "matching is the second inherited parameter that measurement shows to be the "
  + "wrong default.", { noIndent: true }));

// ---------- 6. Discussion and Limitations ----------

P(sectionHead("VI.  Discussion and Limitations"));
P(body("Two readings of the vocabulary result are available and they differ in "
  + "what they license. The narrow reading is that the vocabulary failed. The "
  + "reading we favour is that the corpus cannot test it: OpenPhish is a global "
  + "feed, no URL in the retrieved sample contains a single non-ASCII character, "
  + "and the campaigns live on the day of retrieval were not aimed at Hindi, "
  + "Tamil or Telugu speakers. A vocabulary built for regional-language lures "
  + "cannot be exercised by a corpus that contains none. This evaluation "
  + "therefore does not show that multilingual keyword matching fails in general; "
  + "it shows that the standard public benchmark cannot test it, and that on a "
  + "global feed the vocabulary is dead weight.", { noIndent: true }));
P(body("A deeper objection applies regardless of language. In this corpus the "
  + "deception is carried by the spelling of the domain, not by lure words in the "
  + "path. A vocabulary of terms such as verify and login is looking in a place "
  + "the attacker no longer uses. What would detect these URLs is string "
  + "similarity against a list of known brands, which is a different mechanism "
  + "from keyword matching and is not what this detector implements. That "
  + "conclusion is independent of which languages the vocabulary covers."));
P(body("Six limitations bound these findings, and none is dissolved by framing.",
  { noIndent: true }));
P(bullet("Scale. One hundred and seventy URLs after deduplication, from a single "
  + "feed on a single day. The negative result at the configured threshold is "
  + "unambiguous at this scale, since zero true positives is not a marginal "
  + "measurement, but the threshold-10 figures rest on 85 positives and should be "
  + "treated as indicative. The margin between substring and token matching rests "
  + "on a single URL."));
P(bullet("Single source and single day. Both feeds change daily. A different "
  + "retrieval date would give a different phishing population, and the hosting "
  + "and hostname-spelling findings in particular should be replicated across "
  + "dates before being generalised."));
P(bullet("The corpus cannot test the contribution. Nothing here establishes "
  + "whether the multilingual vocabulary works, and the absence of an "
  + "India-targeted evaluation corpus is the binding constraint on answering "
  + "that."));
P(bullet("The negative class is not URLs. Tranco supplies registrable domains. A "
  + "crawler that collects genuine content URLs was implemented but not used for "
  + "the reported run, so the artifact is present in these numbers and is "
  + "reported rather than removed."));
P(bullet("No trained baseline. Whether a supervised classifier would extract more "
  + "signal from the same URLs is untested, so the comparison that would "
  + "establish what rule-based detection gives up is absent."));
P(bullet("Weights are asserted. The rule weights were inherited and never fitted. "
  + "The threshold result shows what asserted parameters cost; the weights "
  + "themselves are open to the same objection and were not re-examined."));

// ---------- 7. Conclusion ----------

P(sectionHead("VII.  Conclusion"));
P(body("This paper specified a rule-based multilingual phishing URL detector, "
  + "built an evaluation protocol around it, and reported what the protocol "
  + "returned. At the threshold the system was configured with it detects "
  + "nothing: zero true positives on 85 phishing URLs and accuracy equal to the "
  + "base rate. The best attainable operating point lies at one sixth of that "
  + "threshold, and even there the performance is very largely a single "
  + "URL-length rule that our own diagnostic identifies as an artifact of "
  + "benchmark construction. An ablation shows the multilingual vocabulary's "
  + "marginal value to be negative.", { noIndent: true }));
P(body("We do not conclude that multilingual keyword matching fails. We conclude "
  + "that the standard public benchmark cannot test it, which is a different and "
  + "more actionable statement, and that on current phishing the mechanism is "
  + "poorly matched to where the deception is carried."));
P(body("The findings that survive came from the pipeline rather than the "
  + "detector. Two thirds of a live phishing feed was hosted on domains that also "
  + "rank among the top sites, so domain-level features are blind on this data by "
  + "construction. And the conventional pairing of a phishing feed with a "
  + "top-sites list produces classes separable by string length alone, at a "
  + "62-point gap in path presence here, which is enough on its own to "
  + "manufacture a strong-looking result from a rule encoding no knowledge of "
  + "phishing. We recommend the construction diagnostic be reported before any "
  + "metric in URL-classification work."));
P(body("Future work follows from the limitations. Thresholds and weights should "
  + "be fitted on held-out data rather than asserted. The legitimate class should "
  + "be collected with the crawler already implemented, so the artifact is "
  + "removed rather than reported. An India-targeted phishing corpus is needed "
  + "before any claim about the multilingual vocabulary can be made, and "
  + "assembling one is the single most valuable next step. Finally, the hosting "
  + "and spelling results suggest that subdomain labels, path tokens and string "
  + "similarity to known brands, rather than registrable domains and lure "
  + "keywords, are where lexical detection now has to operate."));

// ---------- 8. References ----------

P(sectionHead("VIII.  References"));
[
  "Anti-Phishing Working Group, \"Phishing Activity Trends Report,\" APWG, 2024.",
  "Verizon, \"2024 Data Breach Investigations Report,\" Verizon Business, 2024.",
  "A. Oest, P. Zhang, B. Wardman, E. Nunes, J. Burgis, A. Zand, K. Thomas, A. Doupé, and G.-J. Ahn, \"Sunrise to sunset: Analyzing the end-to-end life cycle and effectiveness of phishing attacks at scale,\" in Proc. 29th USENIX Security Symp., 2020.",
  "A. Oest, Y. Safaei, P. Zhang, B. Wardman, K. Tyers, Y. Shoshitaishvili, and A. Doupé, \"PhishTime: Continuous longitudinal measurement of the effectiveness of anti-phishing blacklists,\" in Proc. 29th USENIX Security Symp., 2020.",
  "D. M. Divakaran and A. Oest, \"Phishing detection leveraging machine learning and deep learning: A review,\" IEEE Security & Privacy, vol. 20, no. 5, 2022.",
  "R. Zieni, L. Massari, and M. C. Calzarossa, \"Phishing or not phishing? A survey on the detection of phishing websites,\" IEEE Access, vol. 11, 2023.",
  "A. Aljofey, Q. Jiang, Q. Qu, M. Huang, and J.-P. Niyigena, \"An effective phishing detection model based on character level convolutional neural network from URL,\" Electronics, vol. 9, no. 9, 2020.",
  "A. Hannousse and S. Yahiouche, \"Towards benchmark datasets for machine learning based website phishing detection: An experimental study,\" Engineering Applications of Artificial Intelligence, vol. 104, 2021.",
  "P. Zhang, A. Oest, H. Cho, Z. Sun, R. Johnson, B. Wardman, S. Sarker, A. Kapravelos, T. Bao, R. Wang, Y. Shoshitaishvili, A. Doupé, and G.-J. Ahn, \"CrawlPhish: Large-scale analysis of client-side cloaking techniques in phishing,\" in Proc. IEEE Symp. Security and Privacy, 2021.",
  "B. Kondracki, B. A. Azad, O. Starov, and N. Nikiforakis, \"Catching transparent phish: Analyzing and detecting MITM phishing toolkits,\" in Proc. ACM SIGSAC Conf. Computer and Communications Security, 2021.",
  "H. Bijmans, T. Booij, A. Schwedersky, A. Nedgabat, and R. van Wegberg, \"Catching phishers by their bait: Investigating the Dutch phishing landscape through phishing kit detection,\" in Proc. 30th USENIX Security Symp., 2021.",
  "OpenPhish, \"OpenPhish phishing intelligence feed.\" [Online]. Available: https://openphish.com/ (accessed Sept. 2, 2026).",
  "Tranco, \"A research-oriented top sites ranking hardened against manipulation.\" [Online]. Available: https://tranco-list.eu/ (accessed Sept. 2, 2026).",
  "Mozilla Foundation, \"Public Suffix List.\" [Online]. Available: https://publicsuffix.org/ (accessed Sept. 2, 2026).",
].forEach((t, i) => P(ref(i + 1, t)));

// ---------- assemble ----------

const pageSetup = {
  page: {
    size: { width: 12240, height: 15840, orientation: PageOrientation.PORTRAIT },
    margin: { top: 900, right: 720, bottom: 280, left: 720 },
  },
};

const doc = new Document({
  creator: "Bairi Christina",
  title: "Measuring a Multilingual Rule-Based Phishing URL Detector",
  styles: { default: { document: { run: { font: FONT, size: BODY } } } },
  sections: [
    { properties: { ...pageSetup, column: { count: 1 } }, children: front },
    {
      properties: {
        ...pageSetup,
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
