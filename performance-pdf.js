const { formatScoreHundredths } = require("./assessment-common");

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 54;

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

function normalizePdfText(value) {
  return String(value ?? "")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x09\x0a\x0d\x20-\xff]/g, "?");
}

function escapePdfText(value) {
  return normalizePdfText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

function estimateTextWidth(text, fontSize) {
  return normalizePdfText(text).length * fontSize * 0.48;
}

function wrapText(text, maxWidth, fontSize) {
  const words = normalizePdfText(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (estimateTextWidth(candidate, fontSize) <= maxWidth || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }

  if (current) {
    lines.push(current);
  }
  return lines.length ? lines : [""];
}

class PdfDocument {
  constructor() {
    this.objects = [];
  }

  addObject(body) {
    this.objects.push(body);
    return this.objects.length;
  }

  render(rootObjectId) {
    const header = Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "binary");
    const parts = [header];
    const offsets = [0];
    let position = header.length;

    this.objects.forEach((body, index) => {
      offsets.push(position);
      const objectBuffer = Buffer.from(`${index + 1} 0 obj\n${body}\nendobj\n`, "latin1");
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
  return `BT /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(text)}) Tj ET\n`;
}

function lineCommand(x1, y1, x2, y2) {
  return `${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S\n`;
}

function rectCommand(x, y, width, height) {
  return `${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re S\n`;
}

function filledRectCommand(x, y, width, height, shade = 0.94) {
  return `q ${shade} ${shade} ${shade} rg ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f Q\n`;
}

function addWrappedText(commands, text, x, y, maxWidth, options = {}) {
  const fontSize = options.size || 11;
  const lineHeight = options.lineHeight || fontSize + 4;
  const lines = wrapText(text, maxWidth, fontSize);
  lines.forEach((line, index) => {
    commands.push(textCommand(line, x, y - index * lineHeight, options));
  });
  return y - lines.length * lineHeight;
}

function drawScoreBox(commands, label, value, y) {
  commands.push(textCommand(label, MARGIN_X, y, { bold: true, size: 12 }));
  commands.push("0.13 0.32 0.62 rg\n");
  commands.push(textCommand(value, MARGIN_X + 116, y, { bold: true, size: 14 }));
  commands.push("0 0 0 rg\n");
}

function drawRatingTable(commands, ratings, y) {
  const x = MARGIN_X;
  const widths = [230, 78, 78, 120];
  const rowHeight = 36;
  const rows = [
    ["AVALIACAO", "OTIMO", "BOM", "PRECISA MELHORAR"],
    ["Participacao", "participation"],
    ["Compreensao de Gramatica e Vocabulario", "grammarVocabulary"],
    ["Tarefas de casa", "homework"],
    ["Comportamento", "behavior"],
  ];
  const ratingToColumn = {
    otimo: 1,
    bom: 2,
    precisa_melhorar: 3,
  };

  rows.forEach((row, rowIndex) => {
    const rowY = y - rowIndex * rowHeight;
    if (rowIndex === 0) {
      commands.push(filledRectCommand(x, rowY - rowHeight, widths.reduce((sum, width) => sum + width, 0), rowHeight));
    }

    let cellX = x;
    widths.forEach((width) => {
      commands.push(rectCommand(cellX, rowY - rowHeight, width, rowHeight));
      cellX += width;
    });

    if (rowIndex === 0) {
      commands.push(textCommand(row[0], x + 62, rowY - 23, { bold: true, size: 11 }));
      commands.push(textCommand(row[1], x + widths[0] + 19, rowY - 23, { bold: true, size: 10 }));
      commands.push(textCommand(row[2], x + widths[0] + widths[1] + 26, rowY - 23, { bold: true, size: 10 }));
      commands.push(textCommand(row[3], x + widths[0] + widths[1] + widths[2] + 15, rowY - 23, { bold: true, size: 9 }));
      return;
    }

    const ratingColumn = ratingToColumn[ratings[row[1]]];
    commands.push(textCommand(row[0], x + 12, rowY - 23, { size: row[0].length > 30 ? 9 : 10 }));

    if (ratingColumn) {
      const centerX =
        x +
        widths.slice(0, ratingColumn).reduce((sum, width) => sum + width, 0) +
        widths[ratingColumn] / 2 -
        4;
      commands.push(textCommand("X", centerX, rowY - 24, { bold: true, size: 15 }));
    }
  });

  return y - rows.length * rowHeight;
}

function buildPerformancePdfContent(data) {
  const commands = [];
  let y = 742;

  commands.push("0 0 0 rg\n1 w\n");
  commands.push(textCommand("C.L.A. - CENTER OF LANGUAGES AMERICA", MARGIN_X, y, { bold: true, size: 11 }));
  commands.push(textCommand("INFORMATIVO", 235, y - 34, { bold: true, size: 18 }));
  commands.push(lineCommand(235, y - 38, 377, y - 38));

  y -= 78;
  y = addWrappedText(
    commands,
    `Deixo-lhe ciente de que o aluno ${data.studentName} obteve as seguintes notas, referente a ${data.assessmentDescription}, do livro`,
    MARGIN_X,
    y,
    PAGE_WIDTH - MARGIN_X * 2,
    { size: 11, lineHeight: 15 }
  );

  y -= 10;
  commands.push(textCommand(data.book, 245, y, { bold: true, size: 14 }));

  y -= 42;
  drawScoreBox(commands, "Prova Escrita:", data.wtScore, y);
  y -= 25;
  drawScoreBox(commands, "Prova Oral:", data.otScore, y);

  y -= 38;
  y = drawRatingTable(commands, data.ratings, y);

  if (data.comments) {
    y -= 24;
    y = addWrappedText(
      commands,
      `Observacoes: ${data.comments}`,
      MARGIN_X,
      y,
      PAGE_WIDTH - MARGIN_X * 2,
      { size: 10, lineHeight: 13 }
    );
  }

  y -= 42;
  y = addWrappedText(
    commands,
    "E com grande satisfacao e carinho que a escola C.L.A. acompanha o desempenho de seus alunos, e da mesma forma, procura deixa-los informados passo a passo quanto ao desenvolvimento de seus filhos.",
    MARGIN_X,
    y,
    PAGE_WIDTH - MARGIN_X * 2,
    { size: 10, lineHeight: 13 }
  );

  y -= 18;
  y = addWrappedText(
    commands,
    "Quaisquer duvidas, estaremos a disposicao para um agendamento atraves do nosso WhatsApp.",
    MARGIN_X,
    y,
    PAGE_WIDTH - MARGIN_X * 2,
    { size: 10, lineHeight: 13 }
  );

  commands.push(textCommand(data.reportDate, 355, 128, { size: 10 }));
  commands.push(lineCommand(360, 90, 540, 90));
  commands.push(textCommand(`Prof. ${data.professorName}`, 395, 76, { bold: true, size: 10 }));

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

  document.addObject(`<< /Type /Pages /Kids [${pageObjectId} 0 R] /Count 1 >>`);
  document.addObject(`<< /Type /Catalog /Pages ${pagesObjectId} 0 R >>`);
  document.addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  document.addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  document.addObject(`<< /Length ${contentBuffer.length} >>\nstream\n${content}\nendstream`);
  document.addObject(`<< /Type /Page /Parent ${pagesObjectId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontRegularObjectId} 0 R /F2 ${fontBoldObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`);

  return document.render(catalogObjectId);
}

module.exports = {
  buildPdfData,
  buildPerformancePdfContent,
  formatReportDate,
  generatePerformancePdf,
};
