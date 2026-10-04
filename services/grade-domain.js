const { validateGrade } = require("../assessment-common");
const { normalizePerformanceComments } = require("../db-common");

function prepareAssessmentGradeOperations(assessment, currentGrades, gradeInputs, options = {}) {
  if (!Array.isArray(gradeInputs) || !gradeInputs.length) {
    throw new Error("Nenhuma nota informada.");
  }

  const roster = new Map(currentGrades.map((grade) => [grade.student_id, grade]));
  const reason = normalizePerformanceComments(options.reason);
  const operations = gradeInputs.map((input) => {
    const studentId = Number(input.studentId ?? input.student_id);
    const previous = roster.get(studentId);

    if (!previous) {
      throw new Error("Aluno nao pertence a lista desta avaliacao.");
    }

    const grade = validateGrade(
      input.status,
      input.otScore ?? input.ot_score,
      input.wtScore ?? input.wt_score
    );
    const changed =
      previous.status !== grade.status ||
      previous.ot_score !== grade.ot_score ||
      previous.wt_score !== grade.wt_score;

    if (assessment.status === "published" && changed && !reason) {
      throw new Error("Informe o motivo da alteracao de uma nota publicada.");
    }

    return {
      studentId,
      previous,
      grade,
      changed,
      note: normalizePerformanceComments(input.teacherNote ?? input.teacher_note),
    };
  });

  return { operations, reason };
}

module.exports = {
  prepareAssessmentGradeOperations,
};
