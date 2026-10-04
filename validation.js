const VALID_CATEGORIES = new Set([
  "homework",
  "games",
  "challenges",
  "presence",
  "bad_behavior",
]);

function normalizeInteger(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error("Pontos inválidos.");
  }
  return parsed;
}

function validatePoints(category, points, note) {
  if (!VALID_CATEGORIES.has(category)) {
    throw new Error("Categoria inválida.");
  }

  const normalizedNote = typeof note === "string" ? note.trim() : "";

  if (category === "presence") {
    return { category, points: 1, note: null };
  }

  const normalizedPoints = normalizeInteger(points);

  if (category === "homework") {
    if (normalizedPoints !== 1 && normalizedPoints !== 2) {
      throw new Error("Homework aceita apenas 1 ou 2 pontos.");
    }
    return { category, points: normalizedPoints, note: null };
  }

  if (category === "games" || category === "challenges") {
    if (normalizedPoints < 1 || normalizedPoints > 100) {
      throw new Error(`${category} aceita apenas pontos entre 1 e 100.`);
    }
    return { category, points: normalizedPoints, note: null };
  }

  if (normalizedPoints < 1 || normalizedPoints > 100) {
    throw new Error("Bad behavior aceita apenas pontos entre 1 e 100.");
  }

  if (!normalizedNote) {
    throw new Error("Bad behavior exige justificativa.");
  }

  return { category, points: -normalizedPoints, note: normalizedNote };
}

module.exports = {
  VALID_CATEGORIES,
  validatePoints,
};

