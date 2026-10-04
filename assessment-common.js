const SCORE_MIN_HUNDREDTHS = 0;
const SCORE_MAX_HUNDREDTHS = 1000;
const DEFAULT_ACADEMIC_BONUS_MAXIMUM = 100;
const VALID_GRADE_STATUSES = new Set(["pending", "graded", "absent", "exempt"]);

function normalizeGradeStatus(value) {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!VALID_GRADE_STATUSES.has(status)) {
    throw new Error("Situacao da nota invalida.");
  }
  return status;
}

function normalizeScoreToHundredths(value) {
  let numericValue;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Nota invalida.");
    }
    numericValue = value;
  } else if (typeof value === "string") {
    const normalized = value.trim();
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(normalized)) {
      throw new Error("Nota invalida. Use no maximo duas casas decimais.");
    }
    numericValue = Number(normalized.replace(",", "."));
  } else {
    throw new Error("Nota invalida.");
  }

  const hundredths = Math.round(numericValue * 100);
  if (Math.abs(numericValue * 100 - hundredths) > 1e-9) {
    throw new Error("Nota invalida. Use no maximo duas casas decimais.");
  }

  return assertScoreHundredths(hundredths);
}

function assertScoreHundredths(value) {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !/^\d+$/.test(value.trim()))
  ) {
    throw new Error("Nota deve estar entre 0,00 e 10,00.");
  }

  const score = Number(value);
  if (
    !Number.isInteger(score) ||
    score < SCORE_MIN_HUNDREDTHS ||
    score > SCORE_MAX_HUNDREDTHS
  ) {
    throw new Error("Nota deve estar entre 0,00 e 10,00.");
  }
  return score;
}

function formatScoreHundredths(value) {
  return (assertScoreHundredths(value) / 100).toFixed(2).replace(".", ",");
}

function hasScoreValue(value) {
  return value !== null && value !== undefined && !(typeof value === "string" && value.trim() === "");
}

function validateGrade(statusValue, otValue, wtValue) {
  const status = normalizeGradeStatus(statusValue);
  const hasOt = hasScoreValue(otValue);
  const hasWt = hasScoreValue(wtValue);

  if (status === "graded") {
    if (!hasOt || !hasWt) {
      throw new Error("Aluno avaliado exige notas OT e WT.");
    }

    return {
      status,
      ot_score: normalizeScoreToHundredths(otValue),
      wt_score: normalizeScoreToHundredths(wtValue),
    };
  }

  if (hasOt || hasWt) {
    throw new Error("Somente aluno avaliado pode possuir notas OT e WT.");
  }

  return {
    status,
    ot_score: null,
    wt_score: null,
  };
}

function validateStoredGrade(grade) {
  const status = normalizeGradeStatus(grade?.status);
  const hasOt = hasScoreValue(grade?.ot_score);
  const hasWt = hasScoreValue(grade?.wt_score);

  if (status === "graded") {
    if (!hasOt || !hasWt) {
      throw new Error("Aluno avaliado exige notas OT e WT.");
    }

    return {
      status,
      ot_score: assertScoreHundredths(grade.ot_score),
      wt_score: assertScoreHundredths(grade.wt_score),
    };
  }

  if (hasOt || hasWt) {
    throw new Error("Somente aluno avaliado pode possuir notas OT e WT.");
  }

  return {
    status,
    ot_score: null,
    wt_score: null,
  };
}

function calculateAssessmentScore(otScoreHundredths, wtScoreHundredths) {
  const otScore = assertScoreHundredths(otScoreHundredths);
  const wtScore = assertScoreHundredths(wtScoreHundredths);
  return Math.round((otScore + wtScore) / 2);
}

function normalizeBonusMaximum(value = DEFAULT_ACADEMIC_BONUS_MAXIMUM) {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !/^\d+$/.test(value.trim()))
  ) {
    throw new Error("Bonus academico maximo invalido.");
  }

  const bonusMaximum = Number(value);
  if (!Number.isInteger(bonusMaximum) || bonusMaximum < 0) {
    throw new Error("Bonus academico maximo invalido.");
  }
  return bonusMaximum;
}

function calculateAcademicBonus(
  averageScoreHundredths,
  bonusMaximumValue = DEFAULT_ACADEMIC_BONUS_MAXIMUM
) {
  const bonusMaximum = normalizeBonusMaximum(bonusMaximumValue);
  if (averageScoreHundredths === null || averageScoreHundredths === undefined) {
    return 0;
  }

  const averageScore = assertScoreHundredths(averageScoreHundredths);
  return Math.round((averageScore / SCORE_MAX_HUNDREDTHS) * bonusMaximum);
}

function calculateAcademicSummary(grades, options = {}) {
  if (!Array.isArray(grades)) {
    throw new Error("Lista de notas invalida.");
  }

  const summary = {
    consideredCount: 0,
    gradedCount: 0,
    absentCount: 0,
    exemptCount: 0,
    pendingCount: 0,
    totalScoreHundredths: 0,
    averageScoreHundredths: null,
    academicBonus: 0,
  };

  for (const gradeValue of grades) {
    const grade = validateStoredGrade(gradeValue);
    const { status } = grade;

    if (status === "graded") {
      summary.gradedCount += 1;
      summary.consideredCount += 1;
      summary.totalScoreHundredths += calculateAssessmentScore(grade.ot_score, grade.wt_score);
      continue;
    }

    if (status === "absent") {
      summary.absentCount += 1;
      summary.consideredCount += 1;
      continue;
    }

    if (status === "exempt") {
      summary.exemptCount += 1;
      continue;
    }

    summary.pendingCount += 1;
  }

  if (summary.consideredCount > 0) {
    summary.averageScoreHundredths = Math.round(
      summary.totalScoreHundredths / summary.consideredCount
    );
  }

  summary.academicBonus = calculateAcademicBonus(
    summary.averageScoreHundredths,
    options.bonusMaximum
  );

  return summary;
}

function calculateRankingScore(pointsValue, academicBonusValue) {
  const integerPattern = /^-?\d+$/;
  if (
    (typeof pointsValue !== "number" &&
      !(typeof pointsValue === "string" && integerPattern.test(pointsValue.trim()))) ||
    (typeof academicBonusValue !== "number" &&
      !(typeof academicBonusValue === "string" && /^\d+$/.test(academicBonusValue.trim())))
  ) {
    throw new Error("Pontuacao de ranking invalida.");
  }

  const points = Number(pointsValue);
  const academicBonus = Number(academicBonusValue);
  if (!Number.isInteger(points) || !Number.isInteger(academicBonus) || academicBonus < 0) {
    throw new Error("Pontuacao de ranking invalida.");
  }

  return points + academicBonus;
}

function compareAcademicRanking(left, right) {
  const rankingDifference = Number(right?.rankingScore) - Number(left?.rankingScore);
  if (rankingDifference !== 0) {
    return rankingDifference;
  }

  const leftAverage = left?.averageScoreHundredths ?? -1;
  const rightAverage = right?.averageScoreHundredths ?? -1;
  const averageDifference = Number(rightAverage) - Number(leftAverage);
  if (averageDifference !== 0) {
    return averageDifference;
  }

  const pointsDifference = Number(right?.totalPoints) - Number(left?.totalPoints);
  if (pointsDifference !== 0) {
    return pointsDifference;
  }

  return String(left?.name || "").localeCompare(String(right?.name || ""), "pt-BR", {
    sensitivity: "base",
  });
}

module.exports = {
  DEFAULT_ACADEMIC_BONUS_MAXIMUM,
  SCORE_MAX_HUNDREDTHS,
  SCORE_MIN_HUNDREDTHS,
  VALID_GRADE_STATUSES,
  assertScoreHundredths,
  calculateAcademicBonus,
  calculateAcademicSummary,
  calculateAssessmentScore,
  calculateRankingScore,
  compareAcademicRanking,
  formatScoreHundredths,
  normalizeGradeStatus,
  normalizeScoreToHundredths,
  validateGrade,
  validateStoredGrade,
};
