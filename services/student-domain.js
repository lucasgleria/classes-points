const { normalizeToken } = require("../db-common");

function normalizeStudentName(name) {
  const trimmedName = typeof name === "string" ? name.trim() : "";

  if (!trimmedName) {
    throw new Error("Nome do aluno e obrigatorio.");
  }

  return trimmedName;
}

function parseStudentNames(names) {
  const parsedNames = String(names || "")
    .split(/\r?\n|,/)
    .map((name) => name.trim())
    .filter(Boolean);

  if (!parsedNames.length) {
    throw new Error("Informe pelo menos um nome de aluno.");
  }

  return parsedNames;
}

function normalizeStudentCredentialFields({ name, username, password, token, classId }) {
  const trimmedName = normalizeStudentName(name);
  const trimmedUsername = typeof username === "string" ? username.trim() : "";
  const trimmedPassword = typeof password === "string" ? password.trim() : "";
  const trimmedToken = normalizeToken(token);

  if (!trimmedUsername) {
    throw new Error("Login do aluno e obrigatorio.");
  }

  if (!trimmedPassword) {
    throw new Error("Senha do aluno e obrigatoria.");
  }

  if (!trimmedToken) {
    throw new Error("URL do aluno e obrigatoria.");
  }

  if (!classId) {
    throw new Error("Turma do aluno e obrigatoria.");
  }

  return {
    name: trimmedName,
    username: trimmedUsername,
    password: trimmedPassword,
    token: trimmedToken,
    classId,
  };
}

module.exports = {
  normalizeStudentCredentialFields,
  normalizeStudentName,
  parseStudentNames,
};
