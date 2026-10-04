const test = require("node:test");
const assert = require("node:assert/strict");
const fc = require("fast-check");
const {
  DEFAULT_ACADEMIC_BONUS_MAXIMUM,
  calculateAcademicBonus,
  calculateAcademicSummary,
  calculateAssessmentScore,
  calculateRankingScore,
  compareAcademicRanking,
  formatScoreHundredths,
  normalizeScoreToHundredths,
  validateGrade,
  validateStoredGrade,
} = require("../assessment-common");

test("Feature 01: notas com virgula ou ponto viram centesimos", () => {
  assert.equal(normalizeScoreToHundredths("8,50"), 850);
  assert.equal(normalizeScoreToHundredths("8.5"), 850);
  assert.equal(normalizeScoreToHundredths(" 10 "), 1000);
  assert.equal(normalizeScoreToHundredths(7.25), 725);
  assert.equal(normalizeScoreToHundredths(8.55), 855);
  assert.equal(formatScoreHundredths(850), "8,50");
});

test("Feature 01: notas invalidas sao rejeitadas", () => {
  for (const value of ["", " ", "-1", "10,01", "8,555", "8.5.0", "abc", null, undefined, NaN]) {
    assert.throws(() => normalizeScoreToHundredths(value));
  }
});

test("Feature 01: situacao avaliado exige OT e WT validos", () => {
  assert.deepEqual(validateGrade("graded", "8,5", "7.25"), {
    status: "graded",
    ot_score: 850,
    wt_score: 725,
  });
  assert.throws(() => validateGrade("graded", "8", ""));
  assert.throws(() => validateGrade("graded", null, "8"));
});

test("Feature 01: somente avaliado pode possuir OT e WT", () => {
  for (const status of ["pending", "absent", "exempt"]) {
    assert.deepEqual(validateGrade(status, "", null), {
      status,
      ot_score: null,
      wt_score: null,
    });
    assert.throws(() => validateGrade(status, "0", ""));
  }
});

test("Feature 01: registros armazenados incoerentes sao rejeitados", () => {
  assert.deepEqual(validateStoredGrade({ status: "graded", ot_score: 800, wt_score: "900" }), {
    status: "graded",
    ot_score: 800,
    wt_score: 900,
  });
  assert.throws(() => validateStoredGrade({ status: "graded", ot_score: 800, wt_score: null }));
  assert.throws(() => validateStoredGrade({ status: "absent", ot_score: 0, wt_score: null }));
  assert.throws(() => calculateAcademicSummary([{ status: "exempt", ot_score: 1000 }]));
  assert.throws(() => calculateAssessmentScore(null, 800));
  assert.throws(() => calculateAssessmentScore("", 800));
});

test("Feature 01: media da avaliacao arredonda para o centesimo mais proximo", () => {
  assert.equal(calculateAssessmentScore(800, 600), 700);
  assert.equal(calculateAssessmentScore(801, 800), 801);
});

test("Feature 01: resumo conta ausencia como zero e ignora isento e pendente", () => {
  const summary = calculateAcademicSummary([
    { status: "graded", ot_score: 800, wt_score: 1000 },
    { status: "absent", ot_score: null, wt_score: null },
    { status: "exempt", ot_score: null, wt_score: null },
    { status: "pending", ot_score: null, wt_score: null },
  ]);

  assert.deepEqual(summary, {
    consideredCount: 2,
    gradedCount: 1,
    absentCount: 1,
    exemptCount: 1,
    pendingCount: 1,
    totalScoreHundredths: 900,
    averageScoreHundredths: 450,
    academicBonus: 45,
  });
});

test("Feature 01: resumo sem avaliacoes consideradas nao comunica nota zero", () => {
  const summary = calculateAcademicSummary([
    { status: "exempt" },
    { status: "pending" },
  ]);

  assert.equal(summary.consideredCount, 0);
  assert.equal(summary.averageScoreHundredths, null);
  assert.equal(summary.academicBonus, 0);
});

test("Feature 01: bonus e pontuacao de ranking seguem a formula aprovada", () => {
  assert.equal(calculateAcademicBonus(1000), DEFAULT_ACADEMIC_BONUS_MAXIMUM);
  assert.equal(calculateAcademicBonus(750), 75);
  assert.equal(calculateAcademicBonus(755, 200), 151);
  assert.equal(calculateRankingScore(120, 90), 210);
  assert.equal(calculateRankingScore(-10, 50), 40);
  assert.throws(() => calculateAcademicBonus(750, null));
  assert.throws(() => calculateRankingScore(null, 50));
  assert.throws(() => calculateRankingScore(100, null));
});

test("Feature 01: quantidade de avaliacoes iguais nao aumenta o bonus", () => {
  const grade = { status: "graded", ot_score: 800, wt_score: 800 };
  const oneAssessment = calculateAcademicSummary([grade]);
  const threeAssessments = calculateAcademicSummary([grade, grade, grade]);

  assert.equal(oneAssessment.averageScoreHundredths, 800);
  assert.equal(threeAssessments.averageScoreHundredths, 800);
  assert.equal(oneAssessment.academicBonus, threeAssessments.academicBonus);
});

test("Feature 01: comparador aplica os desempates aprovados", () => {
  const entries = [
    { name: "Carla", rankingScore: 200, averageScoreHundredths: 900, totalPoints: 110 },
    { name: "Bruno", rankingScore: 200, averageScoreHundredths: 900, totalPoints: 120 },
    { name: "Ana", rankingScore: 210, averageScoreHundredths: 700, totalPoints: 140 },
    { name: "Daniel", rankingScore: 200, averageScoreHundredths: 950, totalPoints: 105 },
  ];

  assert.deepEqual(entries.sort(compareAcademicRanking).map((entry) => entry.name), [
    "Ana",
    "Daniel",
    "Bruno",
    "Carla",
  ]);
});

test("Feature 01: normalizacao faz round trip para todas as notas em centesimos", async () => {
  await fc.assert(
    fc.asyncProperty(fc.integer({ min: 0, max: 1000 }), async (score) => {
      assert.equal(normalizeScoreToHundredths(formatScoreHundredths(score)), score);
    })
  );
});

test("Feature 01: media de OT e WT sempre fica entre as duas notas", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 0, max: 1000 }),
      fc.integer({ min: 0, max: 1000 }),
      async (otScore, wtScore) => {
        const average = calculateAssessmentScore(otScore, wtScore);
        assert.ok(average >= Math.min(otScore, wtScore));
        assert.ok(average <= Math.max(otScore, wtScore));
      }
    )
  );
});

test("Feature 01: bonus cresce de forma monotona com a media", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 0, max: 1000 }),
      fc.integer({ min: 0, max: 1000 }),
      async (first, second) => {
        const lower = Math.min(first, second);
        const upper = Math.max(first, second);
        assert.ok(calculateAcademicBonus(lower) <= calculateAcademicBonus(upper));
      }
    )
  );
});
