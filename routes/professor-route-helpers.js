function buildCredentialsMessage(student) {
  return `Aluno criado com sucesso. URL: /student/${student.token} | usuario: ${student.username} | senha: ${student.password}`;
}

function getBaseUrl(req) {
  return `${req.protocol}://${req.get("host")}`;
}

function collectOralAnswers(body, questions) {
  return questions
    .map((question) => ({
      questionId: question.id,
      result: body[`answer_${question.id}`],
    }))
    .filter((answer) => answer.result);
}

module.exports = {
  buildCredentialsMessage,
  collectOralAnswers,
  getBaseUrl,
};
