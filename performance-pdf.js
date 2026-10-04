const { formatScoreHundredths } = require("./assessment-common");
const logo = require("./performance-pdf-logo");

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 57;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const SCORE_COLOR = "0.29 0.47 0.75";

// Larguras AFM (por 1000 unidades) dos caracteres 32..126 das fontes padrao do PDF.
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const HELVETICA_BOLD_WIDTHS = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];
// Caracteres WinAnsi fora do ASCII usados nos textos da ficha.
const WIN_ANSI_EXTRAS = {
  "–": "\x96",
  "—": "\x97",
  "“": "\x93",
  "”": "\x94",
  "‘": "\x91",
  "’": "\x92",
  "•": "\x95",
  "…": "\x85",
};
const WIN_ANSI_EXTRA_WIDTHS = { "\x96": 556, "\x97": 1000, "\x93": 333, "\x94": 333, "\x91": 222, "\x92": 222, "\x95": 350, "\x85": 1000 };
const WIN_ANSI_EXTRA_BYTES = new Set(Object.values(WIN_ANSI_EXTRAS));

function formatReportDate(date, timezone, city) {
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
  return `${city}, ${formatted}`;
}

function buildAssessmentDescription(assessment) {
  const title = String(assessment.title || "avaliacao").trim();
  const description = String(assessment.description || "").trim();
  return description ? `${title} (${description})` : title;
}

function buildPdfData({
  assessment,
  grade,
  student,
  report,
  professor,
  timezone = "America/Sao_Paulo",
  city = "Guarulhos",
  now = new Date(),
}) {
  return {
    assessmentDescription: buildAssessmentDescription(assessment),
    book: assessment.class_book || "-",
    city,
    comments: String(report.comments || "").trim().slice(0, 260),
    otScore: grade.ot_score === null ? "-" : formatScoreHundredths(grade.ot_score),
    professorName: professor.display_name || professor.displayName || professor.username || "-",
    reportDate: formatReportDate(now, timezone, city),
    ratings: {
      behavior: report.behavior,
      grammarVocabulary: report.grammar_vocabulary,
      homework: report.homework,
      participation: report.participation,
    },
    studentName: student.name || "-",
    wtScore: grade.wt_score === null ? "-" : formatScoreHundredths(grade.wt_score),
  };
}

// Converte para os bytes WinAnsi (latin1) que as fontes padrao do PDF entendem.
function normalizePdfText(value) {
  return Array.from(String(value ?? ""))
    .map((char) => {
      if (WIN_ANSI_EXTRAS[char]) {
        return WIN_ANSI_EXTRAS[char];
      }
      if (WIN_ANSI_EXTRA_BYTES.has(char)) {
        return char;
      }
      return /[\x09\x0a\x0d\x20-\x7e\xa0-\xff]/.test(char) ? char : "?";
    })
    .join("");
}

function escapePdfText(value) {
  return normalizePdfText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

function charWidth(char, bold) {
  const table = bold ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS;
  const code = char.charCodeAt(0);
  if (code >= 32 && code <= 126) {
    return table[code - 32];
  }
  if (WIN_ANSI_EXTRA_WIDTHS[char]) {
    return WIN_ANSI_EXTRA_WIDTHS[char];
  }
  // Letras acentuadas usam a largura da letra base (a de á, c de ç...).
  const base = char.normalize("NFD")[0];
  if (base !== char && base.charCodeAt(0) >= 32 && base.charCodeAt(0) <= 126) {
    return table[base.charCodeAt(0) - 32];
  }
  return 556;
}

function textWidth(text, size, options = {}) {
  const normalized = normalizePdfText(text);
  let width = 0;
  for (const char of normalized) {
    width += charWidth(char, options.bold);
  }
  return (width * size) / 1000 + (options.charSpacing || 0) * normalized.length;
}

class PdfDocument {
  constructor() {
    this.objects = [];
  }

  addObject(body) {
    this.objects.push(Buffer.isBuffer(body) ? body : Buffer.from(body, "latin1"));
    return this.objects.length;
  }

  render(rootObjectId) {
    const header = Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1");
    const parts = [header];
    const offsets = [0];
    let position = header.length;

    this.objects.forEach((body, index) => {
      offsets.push(position);
      const objectBuffer = Buffer.concat([
        Buffer.from(`${index + 1} 0 obj\n`, "latin1"),
        body,
        Buffer.from("\nendobj\n", "latin1"),
      ]);
      parts.push(objectBuffer);
      position += objectBuffer.length;
    });

    const xrefOffset = position;
    const xrefLines = ["xref", `0 ${this.objects.length + 1}`, "0000000000 65535 f "];
    for (let index = 1; index < offsets.length; index += 1) {
      xrefLines.push(`${String(offsets[index]).padStart(10, "0")} 00000 n `);
    }
    const trailer = [
      ...xrefLines,
      "trailer",
      `<< /Size ${this.objects.length + 1} /Root ${rootObjectId} 0 R >>`,
      "startxref",
      String(xrefOffset),
      "%%EOF",
      "",
    ].join("\n");
    parts.push(Buffer.from(trailer, "latin1"));

    return Buffer.concat(parts);
  }
}

function textCommand(text, x, y, options = {}) {
  const font = options.bold ? "F2" : "F1";
  const size = options.size || 11;
  const color = options.color ? `${options.color} rg ` : "";
  const spacing = options.charSpacing ? `${options.charSpacing} Tc ` : "";
  return `q ${color}BT /${font} ${size} Tf ${spacing}${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(text)}) Tj ET Q\n`;
}

function centeredTextCommand(text, centerX, y, options = {}) {
  return textCommand(text, centerX - textWidth(text, options.size || 11, options) / 2, y, options);
}

function lineCommand(x1, y1, x2, y2, width = 1) {
  return `q ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S Q\n`;
}

function rectCommand(x, y, width, height) {
  return `q 0.75 w ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re S Q\n`;
}

// Quebra texto com trechos em negrito e devolve linhas com a posicao de cada palavra.
function layoutRichText(segments, maxWidth, size) {
  const words = [];
  segments.forEach((segment) => {
    const text = normalizePdfText(segment.text).replace(/\s+/g, " ").trim();
    // Trechos como o titulo da avaliacao ficam inteiros na mesma linha quando cabem.
    const parts = segment.keepTogether && textWidth(text, size, segment) <= maxWidth
      ? [text]
      : text.split(" ");
    parts.filter(Boolean).forEach((part) => words.push({ text: part, bold: Boolean(segment.bold) }));
  });

  const lines = [];
  let current = [];
  let currentWidth = 0;
  for (const word of words) {
    const width = textWidth(word.text, size, word);
    const spaceWidth = current.length ? textWidth(" ", size) : 0;
    if (current.length && currentWidth + spaceWidth + width > maxWidth) {
      lines.push({ words: current, width: currentWidth });
      current = [];
      currentWidth = 0;
    }
    current.push({ ...word, width });
    currentWidth += (current.length > 1 ? textWidth(" ", size) : 0) + width;
  }
  if (current.length) {
    lines.push({ words: current, width: currentWidth });
  }
  return lines;
}

function addRichParagraph(commands, segments, y, options = {}) {
  const size = options.size || 11;
  const lineHeight = options.lineHeight || size + 3;
  const x = options.x ?? MARGIN_X;
  const maxWidth = options.maxWidth ?? CONTENT_WIDTH;
  const align = options.align || "left";
  const lines = layoutRichText(segments, maxWidth, size);
  const spaceWidth = textWidth(" ", size);

  lines.forEach((line, index) => {
    const isLast = index === lines.length - 1;
    let gap = spaceWidth;
    let cursor = x;
    if (align === "center") {
      cursor = x + (maxWidth - line.width) / 2;
    } else if (align === "justify" && !isLast && line.words.length > 1) {
      gap = spaceWidth + (maxWidth - line.width) / (line.words.length - 1);
    }
    line.words.forEach((word) => {
      commands.push(textCommand(word.text, cursor, y - index * lineHeight, { size, bold: word.bold }));
      cursor += word.width + gap;
    });
  });

  return y - lines.length * lineHeight;
}

function drawLogo(commands) {
  const width = 118;
  const height = (width * logo.height) / logo.width;
  const top = 730;
  commands.push(`q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${MARGIN_X} ${(top - height).toFixed(2)} cm /Logo Do Q\n`);
}

function drawTitle(commands) {
  const title = "INFORMATIVO";
  const options = { bold: true, size: 15, charSpacing: 4 };
  const centerX = 330;
  const y = 690;
  const width = textWidth(title, options.size, options) - options.charSpacing;
  commands.push(textCommand(title, centerX - width / 2, y, options));
  commands.push(lineCommand(centerX - width / 2, y - 3, centerX + width / 2, y - 3, 1.2));
}

function drawScores(commands, data, y) {
  // Como no modelo, os dois-pontos e as notas ficam alinhados na mesma coluna.
  const labelOptions = { bold: true, size: 12 };
  const valueOptions = { bold: true, size: 13, color: SCORE_COLOR };
  const colonX = MARGIN_X + textWidth("Prova Escrita", 12, labelOptions) + 1;
  const valueX = colonX + textWidth(": ", 12, labelOptions);
  [["Prova Escrita", data.wtScore], ["Prova Oral", data.otScore]].forEach(([label, value], index) => {
    const lineY = y - index * 19;
    commands.push(textCommand(label, MARGIN_X, lineY, labelOptions));
    commands.push(textCommand(":", colonX, lineY, labelOptions));
    commands.push(textCommand(value, valueX, lineY, valueOptions));
  });
  return y - 19;
}

function drawRatingTable(commands, ratings, top) {
  const columns = [196, 68, 86, CONTENT_WIDTH - 196 - 68 - 86];
  const headerHeight = 30;
  const rows = [
    { lines: ["Participação"], key: "participation", height: 26 },
    { lines: ["Compreensão de Gramática", "e Vocabulário"], key: "grammarVocabulary", height: 34 },
    { lines: ["Tarefas de casa"], key: "homework", height: 28 },
    { lines: ["Comportamento"], key: "behavior", height: 28 },
  ];
  const headers = ["AVALIAÇÃO", "ÓTIMO", "BOM", "PRECISA MELHORAR"];
  const ratingToColumn = { otimo: 1, bom: 2, precisa_melhorar: 3 };
  const columnStart = (index) => MARGIN_X + columns.slice(0, index).reduce((sum, width) => sum + width, 0);
  const columnCenter = (index) => columnStart(index) + columns[index] / 2;
  const tableHeight = headerHeight + rows.reduce((sum, row) => sum + row.height, 0);

  commands.push(rectCommand(MARGIN_X, top - tableHeight, CONTENT_WIDTH, tableHeight));
  for (let index = 1; index < columns.length; index += 1) {
    commands.push(lineCommand(columnStart(index), top, columnStart(index), top - tableHeight, 0.75));
  }

  headers.forEach((header, index) => {
    commands.push(centeredTextCommand(header, columnCenter(index), top - headerHeight / 2 - 4, { size: 11 }));
  });

  let rowTop = top - headerHeight;
  rows.forEach((row) => {
    commands.push(lineCommand(MARGIN_X, rowTop, MARGIN_X + CONTENT_WIDTH, rowTop, 0.75));
    const lineHeight = 12;
    const firstBaseline = rowTop - row.height / 2 + ((row.lines.length - 1) * lineHeight) / 2 - 4;
    row.lines.forEach((line, lineIndex) => {
      commands.push(centeredTextCommand(line, columnCenter(0), firstBaseline - lineIndex * lineHeight, { size: 11 }));
    });

    const ratingColumn = ratingToColumn[ratings[row.key]];
    if (ratingColumn) {
      commands.push(centeredTextCommand("X", columnCenter(ratingColumn), rowTop - row.height / 2 - 5, { bold: true, size: 14 }));
    }
    rowTop -= row.height;
  });

  return top - tableHeight;
}

function buildPerformancePdfContent(data) {
  const commands = ["0 0 0 rg 0 0 0 RG\n"];

  drawLogo(commands);
  drawTitle(commands);

  let y = addRichParagraph(commands, [
    { text: "Deixo-lhe ciente de que o aluno" },
    { text: data.studentName, bold: true },
    { text: "obteve as seguintes notas, referente a" },
    { text: data.assessmentDescription, bold: true, keepTogether: true },
    { text: "do livro" },
  ], 612, { align: "center", size: 11, lineHeight: 15 });
  commands.push(centeredTextCommand(`${data.book}.`, PAGE_WIDTH / 2, y, { bold: true, size: 11 }));

  y = drawScores(commands, data, y - 44);
  y = drawRatingTable(commands, data.ratings, y - 22);

  if (data.comments) {
    y = addRichParagraph(commands, [
      { text: "Observações:", bold: true },
      { text: data.comments },
    ], y - 22, { size: 10.5, lineHeight: 14, align: "justify" });
    y += 14;
  }

  y -= 34;
  commands.push(centeredTextCommand(`A. Prof. ${data.professorName}`, 452, y, { bold: true, size: 11 }));

  y = Math.min(y - 56, 272);
  y = addRichParagraph(commands, [
    { text: "É com grande satisfação e carinho que a escola" },
    { text: "C.L.A.", bold: true },
    { text: "acompanha o desempenho de seus alunos, e da mesma forma, procura deixá-los informados passo a passo quanto ao desenvolvimento de seus filhos." },
  ], y, { size: 11, lineHeight: 14, align: "justify" });
  y = addRichParagraph(commands, [
    { text: "Quaisquer dúvidas, estaremos à disposição para um agendamento através do nosso WhatsApp." },
  ], y - 12, { size: 11, lineHeight: 14 });

  commands.push(textCommand(data.reportDate, 360, Math.min(138, y - 24), { size: 11 }));
  commands.push(centeredTextCommand("C.L.A. – CENTER OF LANGUAGES AMERICA", PAGE_WIDTH / 2, 94, { bold: true, size: 10 }));

  return commands.join("");
}

async function generatePerformancePdf({
  assessment,
  grade,
  student,
  report,
  professor,
  timezone = "America/Sao_Paulo",
  city = "Guarulhos",
  now = new Date(),
}) {
  const data = buildPdfData({ assessment, grade, student, report, professor, timezone, city, now });
  const content = buildPerformancePdfContent(data);
  const contentBuffer = Buffer.from(content, "latin1");
  const document = new PdfDocument();
  const pagesObjectId = 1;
  const catalogObjectId = 2;
  const fontRegularObjectId = 3;
  const fontBoldObjectId = 4;
  const contentObjectId = 5;
  const pageObjectId = 6;
  const logoObjectId = 7;

  document.addObject(`<< /Type /Pages /Kids [${pageObjectId} 0 R] /Count 1 >>`);
  document.addObject(`<< /Type /Catalog /Pages ${pagesObjectId} 0 R >>`);
  document.addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  document.addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  document.addObject(Buffer.concat([
    Buffer.from(`<< /Length ${contentBuffer.length} >>\nstream\n`, "latin1"),
    contentBuffer,
    Buffer.from("\nendstream", "latin1"),
  ]));
  document.addObject(`<< /Type /Page /Parent ${pagesObjectId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontRegularObjectId} 0 R /F2 ${fontBoldObjectId} 0 R >> /XObject << /Logo ${logoObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`);
  document.addObject(Buffer.concat([
    Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.data.length} >>\nstream\n`, "latin1"),
    logo.data,
    Buffer.from("\nendstream", "latin1"),
  ]));

  return document.render(catalogObjectId);
}

module.exports = {
  buildPdfData,
  buildPerformancePdfContent,
  formatReportDate,
  generatePerformancePdf,
};
