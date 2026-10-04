const VALID_ORAL_ANSWER_RESULTS = new Set(["correct", "half", "wrong"]);
const MAX_ORAL_QUESTIONS = 50;
const MAX_ORAL_OBSERVATION_LENGTH = 500;
const MAX_ORAL_QUESTION_WEIGHT = 10;

function normalizeOralText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOralObservation(value) {
  const observation = normalizeOralText(value);
  if (observation.length > MAX_ORAL_OBSERVATION_LENGTH) {
    throw new Error("Observacao da avaliacao oral deve ter no maximo 500 caracteres.");
  }
  return observation;
}

function normalizeOralAnswerResult(value) {
  const result = normalizeOralText(value).toLowerCase();
  if (!VALID_ORAL_ANSWER_RESULTS.has(result)) {
    throw new Error("Resposta da avaliacao oral invalida.");
  }
  return result;
}

function normalizeOralQuestionWeight(value) {
  const text = value === undefined || value === null ? "" : normalizeOralText(String(value));
  if (!text) {
    return 1;
  }

  const weight = Number(text);
  if (!Number.isInteger(weight) || weight < 1 || weight > MAX_ORAL_QUESTION_WEIGHT) {
    throw new Error(`Peso da pergunta deve ser um numero inteiro de 1 a ${MAX_ORAL_QUESTION_WEIGHT}.`);
  }
  return weight;
}

// Cada linha aceita "Pergunta | Resposta esperada | Peso"; resposta e peso sao opcionais.
function parseOralQuestionLine(line) {
  const [prompt = "", teacherNote = "", weight = ""] = line.split("|");
  return { prompt, teacherNote, weight };
}

function normalizeOralQuestions(questions) {
  const list = Array.isArray(questions)
    ? questions
    : normalizeOralText(questions)
      .split(/\r?\n/)
      .map(parseOralQuestionLine);

  const normalized = list
    .map((question, index) => ({
      position: Number(question.position || index + 1),
      prompt: normalizeOralText(question.prompt ?? question.text ?? question),
      teacherNote: normalizeOralText(question.teacherNote ?? question.teacher_note),
      weight: question.weight,
    }))
    .filter((question) => question.prompt);

  if (!normalized.length) {
    throw new Error("Modelo oral precisa ter pelo menos uma pergunta.");
  }

  if (normalized.length > MAX_ORAL_QUESTIONS) {
    throw new Error(`Modelo oral aceita no maximo ${MAX_ORAL_QUESTIONS} perguntas.`);
  }

  return normalized.map((question, index) => ({
    ...question,
    position: index + 1,
    weight: normalizeOralQuestionWeight(question.weight),
  }));
}

function normalizeOralTemplatePayload(payload = {}) {
  const title = normalizeOralText(payload.title);
  const description = normalizeOralText(payload.description);
  const questions = normalizeOralQuestions(payload.questions ?? payload.questionsText);

  if (!title) {
    throw new Error("Titulo do modelo oral e obrigatorio.");
  }

  return {
    title,
    description,
    questions,
  };
}

function normalizeOralAnswers(answers, questions) {
  if (!Array.isArray(questions) || !questions.length) {
    throw new Error("Prova oral sem perguntas.");
  }

  const byQuestionId = new Map();
  if (Array.isArray(answers)) {
    for (const answer of answers) {
      const questionId = Number(answer.questionId ?? answer.question_id);
      if (Number.isInteger(questionId)) {
        byQuestionId.set(questionId, answer.result);
      }
    }
  } else if (answers && typeof answers === "object") {
    for (const [questionId, result] of Object.entries(answers)) {
      byQuestionId.set(Number(questionId), result);
    }
  }

  return questions.map((question) => {
    const questionId = Number(question.id);
    return {
      questionId,
      weight: normalizeOralQuestionWeight(question.weight),
      result: byQuestionId.has(questionId)
        ? normalizeOralAnswerResult(byQuestionId.get(questionId))
        : null,
    };
  });
}

function calculateOralScoreHundredths(answers) {
  if (!Array.isArray(answers) || !answers.length) {
    throw new Error("Prova oral sem respostas.");
  }

  let points = 0;
  let totalWeight = 0;
  for (const answer of answers) {
    const result = normalizeOralAnswerResult(answer.result);
    const weight = normalizeOralQuestionWeight(answer.weight);
    totalWeight += weight;
    if (result === "correct") {
      points += weight;
    } else if (result === "half") {
      points += weight / 2;
    }
  }

  return Math.round((points / totalWeight) * 1000);
}

module.exports = {
  MAX_ORAL_OBSERVATION_LENGTH,
  MAX_ORAL_QUESTIONS,
  MAX_ORAL_QUESTION_WEIGHT,
  VALID_ORAL_ANSWER_RESULTS,
  calculateOralScoreHundredths,
  normalizeOralAnswerResult,
  normalizeOralAnswers,
  normalizeOralObservation,
  normalizeOralQuestionWeight,
  normalizeOralQuestions,
  normalizeOralTemplatePayload,
};
