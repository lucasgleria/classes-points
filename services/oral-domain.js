const { normalizePerformanceComments } = require("../db-common");
const {
  calculateOralScoreHundredths,
  normalizeOralAnswers,
  normalizeOralObservation,
} = require("../oral-test-common");

function assertOralTemplateOwner(template, professorId) {
  if (!template || Number(template.professor_id) !== Number(professorId)) {
    throw new Error("Modelo de avaliacao oral nao encontrado.");
  }

  if (template.archived_at) {
    throw new Error("Modelo de avaliacao oral arquivado nao pode ser usado.");
  }
}

function prepareOralAttemptSave({ assessment, oralTest, previousAttempt, answers, options = {} }) {
  const complete = Boolean(options.complete);
  const normalizedAnswers = normalizeOralAnswers(answers, oralTest.questions);

  if (complete && normalizedAnswers.some((answer) => !answer.result)) {
    throw new Error("Responda todas as perguntas antes de concluir a avaliacao oral.");
  }

  const answered = normalizedAnswers.filter((answer) => answer.result);

  if (previousAttempt?.status === "completed" && !complete) {
    throw new Error("Resultado oral concluido nao pode voltar para rascunho.");
  }

  const score = complete ? calculateOralScoreHundredths(answered) : null;
  const observation = normalizeOralObservation(options.observation);
  const reason = normalizePerformanceComments(options.reason);
  const changedCompletedScore =
    previousAttempt?.status === "completed" &&
    complete &&
    previousAttempt.score_hundredths !== score;

  if (assessment.status === "published" && changedCompletedScore && !reason) {
    throw new Error("Informe o motivo da alteracao de uma avaliacao oral publicada.");
  }

  return {
    answered,
    changedCompletedScore,
    complete,
    observation,
    reason,
    score,
    status: complete ? "completed" : "draft",
  };
}

module.exports = {
  assertOralTemplateOwner,
  prepareOralAttemptSave,
};
