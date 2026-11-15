const { getProfessorScope, normalizeProfessorId } = require("./professor-scope");

async function getScopedAssessment(store, req) {
  const professorId = normalizeProfessorId(req.auth.professorId);
  const [{ classIds }, assessment] = await Promise.all([
    getProfessorScope(store, professorId, { includeArchived: true }),
    store.getAssessmentById(req.params.id),
  ]);
  return assessment && classIds.has(assessment.class_id) ? assessment : null;
}

function assertAssessmentWritable(assessment) {
  if (assessment.class_archived_at || assessment.status === "archived") {
    throw new Error("Avaliacao arquivada esta disponivel somente para consulta.");
  }
}

module.exports = {
  assertAssessmentWritable,
  getScopedAssessment,
};
