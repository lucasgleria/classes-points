const { normalizeClassValue } = require("../db-common");

function normalizeClassFields({ book, weekday, startTime, endTime }) {
  const normalized = {
    book: normalizeClassValue(book),
    weekday: normalizeClassValue(weekday),
    startTime: normalizeClassValue(startTime),
    endTime: normalizeClassValue(endTime),
  };

  if (!normalized.book) {
    throw new Error("Livro da turma e obrigatorio.");
  }

  if (!normalized.weekday) {
    throw new Error("Dia da semana da turma e obrigatorio.");
  }

  if (!normalized.startTime) {
    throw new Error("Horario de inicio da turma e obrigatorio.");
  }

  if (!normalized.endTime) {
    throw new Error("Horario de fim da turma e obrigatorio.");
  }

  return normalized;
}

function normalizeProfessorId(professorId) {
  if (professorId === null || professorId === undefined || professorId === "") {
    return 1;
  }

  const numericId = Number(professorId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    throw new Error("Professor invalido.");
  }

  return numericId;
}

function normalizeClassId(classId) {
  if (classId === null || classId === undefined || classId === "") {
    return null;
  }

  const numericId = Number(classId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    throw new Error("Turma invalida.");
  }

  return numericId;
}

module.exports = {
  normalizeClassFields,
  normalizeClassId,
  normalizeProfessorId,
};
