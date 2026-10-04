const {
  normalizeClassValue,
  normalizePerformanceComments,
} = require("../db-common");

function normalizeAssessmentFields(fields, existing = {}) {
  const title = normalizeClassValue(fields.title ?? existing.title);
  const description = normalizePerformanceComments(fields.description ?? existing.description);
  const rawAssessmentDate = fields.assessmentDate ?? existing.assessment_date;
  const assessmentDate =
    rawAssessmentDate instanceof Date
      ? rawAssessmentDate.toISOString().slice(0, 10)
      : normalizeClassValue(rawAssessmentDate) || null;
  const countsForRanking =
    fields.countsForRanking === undefined
      ? Boolean(existing.counts_for_ranking ?? true)
      : ["1", "true", "on", "yes", true].includes(fields.countsForRanking);

  if (!title) {
    throw new Error("Titulo da avaliacao e obrigatorio.");
  }

  return { title, description, assessmentDate, countsForRanking };
}

function assertActiveAssessmentClass(value) {
  if (value?.archived_at || value?.class_archived_at) {
    throw new Error("Avaliacao de turma arquivada esta disponivel somente para consulta.");
  }
}

module.exports = {
  assertActiveAssessmentClass,
  normalizeAssessmentFields,
};
