const {
  escapeHtml,
  formatAssessmentScore,
  pageTemplate,
  renderAssessmentStatus,
  renderProfessorNav,
  renderProfessorTopbar,
} = require("./shared");

function renderOralWeight(weight) {
  const value = Number(weight) || 1;
  return `<small class="points-pill">peso ${value}</small>`;
}

function renderOralAssessmentPage(assessment, templates, oralTest, roster = [], message = "", errorMessage = "") {
  const readOnly = Boolean(assessment.class_archived_at || assessment.status === "archived");
  const disabled = readOnly ? "disabled" : "";
  const completedCount = roster.filter((item) => item.attempt_status === "completed").length;
  const templateOptions = templates.length
    ? templates.map((template) => `<option value="${template.id}">${escapeHtml(template.title)} (${template.question_count || 0} perguntas)</option>`).join("")
    : "";
  const linkedQuestions = oralTest
    ? oralTest.questions.map((question) => `
      <li>
        ${question.position}. ${escapeHtml(question.prompt)} ${renderOralWeight(question.weight)}
        ${question.teacher_note ? `<p class="panel-description">Resposta esperada: ${escapeHtml(question.teacher_note)}</p>` : ""}
      </li>`).join("")
    : "";

  return pageTemplate({
    title: `Avaliacao Oral - ${assessment.title}`,
    pageClass: "manage-page",
    body: `
      ${renderProfessorNav()}
      <main class="shell">
        ${renderProfessorTopbar({ eyebrow: escapeHtml(assessment.class_book), title: `Avaliacao Oral - ${escapeHtml(assessment.title)}`, action: `<a class="ghost-link" href="/assessments?classId=${assessment.class_id}">Voltar</a>` })}
        ${message ? `<p class="success-banner">${escapeHtml(message)}</p>` : ""}
        ${errorMessage ? `<p class="error-banner">${escapeHtml(errorMessage)}</p>` : ""}
        ${readOnly ? `<p class="card">Esta avaliacao esta disponivel somente para consulta.</p>` : ""}
        <section class="card performance-card">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Modelo vinculado</p>
              <h2>${oralTest ? escapeHtml(oralTest.title) : "Nenhum modelo selecionado"}</h2>
              <p>${oralTest ? escapeHtml(oralTest.description || "Sem descricao") : "Crie um modelo ou vincule um modelo reutilizavel para aplicar a prova oral."}</p>
            </div>
            ${oralTest ? `<span class="points-pill">${completedCount}/${roster.length} avaliados</span>` : ""}
          </div>
          ${oralTest ? `<ol>${linkedQuestions}</ol><a class="ghost-link" href="/assessments/${assessment.id}/oral/apply">Aplicar prova oral</a>` : ""}
        </section>
        ${templates.length && !readOnly ? `
          <section class="card performance-card">
            <h2>Usar modelo existente</h2>
            <form method="post" action="/api/assessments/${assessment.id}/oral/attach-template" class="stack-form">
              <label>Modelo
                <select name="templateId" ${disabled}>${templateOptions}</select>
              </label>
              <button type="submit">Vincular modelo</button>
            </form>
          </section>` : ""}
        ${!readOnly ? `
          <section class="card performance-card">
            <h2>Criar novo modelo oral</h2>
            <form method="post" action="/api/assessments/${assessment.id}/oral/templates" class="stack-form">
              <label>Nome do modelo<input name="title" required placeholder="Oral Test - Unit 1" /></label>
              <label>Descricao<textarea name="description" rows="2" placeholder="Tema, unidade ou criterio de aplicacao"></textarea></label>
              <label>Perguntas
                <textarea name="questionsText" rows="8" required placeholder="What's this? | It's a frog. | 1&#10;Do you like dogs? | I like dogs. / I don't like dogs. | 2"></textarea>
              </label>
              <p class="panel-description">Uma pergunta por linha, no formato <strong>Pergunta | Resposta esperada | Peso</strong>. Resposta e peso sao opcionais; sem peso, a pergunta vale 1. O peso vai de 1 a 10 e define quanto a pergunta conta na nota.</p>
              <button type="submit">Salvar modelo e vincular</button>
            </form>
          </section>` : ""}
      </main>`,
  });
}

function renderOralApplyPage(assessment, oralTest, roster, message = "", errorMessage = "") {
  const rows = roster.length
    ? roster.map((item) => `
      <article class="card performance-card">
        <div class="section-heading">
          <div>
            <strong>${escapeHtml(item.student_name)}</strong>
            <p>${item.total_points} pontos - ${renderAssessmentStatus(item.grade_status)}</p>
            ${item.attempt_status === "completed" ? `<p class="panel-description">Nota oral: ${formatAssessmentScore(item.score_hundredths)}${item.observation ? ` - Obs.: ${escapeHtml(item.observation)}` : ""}</p>` : ""}
            ${item.attempt_status === "draft" ? `<p class="panel-description">Rascunho salvo</p>` : ""}
          </div>
          <a class="ghost-link" href="/assessments/${assessment.id}/oral/apply/students/${item.student_id}">${item.attempt_status === "completed" ? "Revisar" : "Aplicar"}</a>
        </div>
      </article>`).join("")
    : `<div class="card empty-state">Nenhum aluno encontrado nesta avaliacao.</div>`;

  return pageTemplate({
    title: `Aplicar Oral - ${assessment.title}`,
    pageClass: "manage-page",
    body: `
      ${renderProfessorNav()}
      <main class="shell">
        ${renderProfessorTopbar({ eyebrow: escapeHtml(oralTest.title), title: "Aplicar prova oral", action: `<a class="ghost-link" href="/assessments/${assessment.id}/oral">Voltar</a>` })}
        ${message ? `<p class="success-banner">${escapeHtml(message)}</p>` : ""}
        ${errorMessage ? `<p class="error-banner">${escapeHtml(errorMessage)}</p>` : ""}
        <section class="card">
          <p>Alunos ordenados por pontos, do maior para o menor. A nota oral concluida aparece automaticamente no campo OT da tela de lancamento de notas.</p>
          <a class="ghost-link" href="/assessments/${assessment.id}/grades">Abrir lancamento de notas</a>
        </section>
        <section class="stack-form">${rows}</section>
      </main>`,
  });
}

function renderOralAttemptPage(assessment, oralTest, student, attempt, message = "", errorMessage = "") {
  const readOnly = Boolean(assessment.class_archived_at || assessment.status === "archived");
  const disabled = readOnly ? "disabled" : "";
  const answers = new Map((attempt?.answers || []).map((answer) => [Number(answer.question_id), answer.result]));
  const answeredCount = oralTest.questions.filter((question) => answers.has(question.id)).length;
  const statusText = attempt?.status === "completed" ? "Concluido" : attempt?.status === "draft" ? "Rascunho" : "Nao iniciado";
  const resultOptions = [
    ["correct", "Correto", "oral-answer-option--correct"],
    ["half", "Meio-Certo", "oral-answer-option--half"],
    ["wrong", "Errado", "oral-answer-option--wrong"],
  ];
  const questions = oralTest.questions.map((question) => `
    <fieldset class="oral-question">
      <legend>
        <span class="oral-question-number">${question.position}</span>
        <span>${escapeHtml(question.prompt)} ${renderOralWeight(question.weight)}</span>
      </legend>
      ${question.teacher_note ? `<p class="panel-description">Resposta esperada: ${escapeHtml(question.teacher_note)}</p>` : ""}
      <div class="oral-answer-grid">
        ${resultOptions.map(([value, label, className]) => `
          <label class="oral-answer-option ${className}">
            <input type="radio" name="answer_${question.id}" value="${value}" ${answers.get(question.id) === value ? "checked" : ""} ${disabled} />
            <span>${label}</span>
          </label>`).join("")}
      </div>
    </fieldset>`).join("");
  const completedSummary = attempt?.status === "completed"
    ? `<p class="success-banner">Resultado atual: ${formatAssessmentScore(attempt.score_hundredths)}.</p>`
    : "";

  return pageTemplate({
    title: `Oral - ${student.name}`,
    pageClass: "manage-page",
    body: `
      ${renderProfessorNav()}
      <main class="shell">
        ${renderProfessorTopbar({ eyebrow: escapeHtml(oralTest.title), title: `Prova oral - ${escapeHtml(student.name)}`, action: `<a class="ghost-link" href="/assessments/${assessment.id}/oral/apply">Voltar</a>` })}
        ${message ? `<p class="success-banner">${escapeHtml(message)}</p>` : ""}
        ${errorMessage ? `<p class="error-banner">${escapeHtml(errorMessage)}</p>` : ""}
        ${completedSummary}
        ${readOnly ? `<p class="card">Esta avaliacao esta disponivel somente para consulta.</p>` : ""}
        <section class="card oral-attempt-hero">
          <div>
            <p class="eyebrow">Aplicacao individual</p>
            <h2>${escapeHtml(student.name)}</h2>
            <p>${escapeHtml(assessment.title)} - ${escapeHtml(assessment.class_book)}</p>
          </div>
          <div class="oral-attempt-stats">
            <span><strong>${answeredCount}/${oralTest.questions.length}</strong><small>respondidas</small></span>
            <span><strong>${statusText}</strong><small>status</small></span>
            ${attempt?.status === "completed" ? `<span><strong>${formatAssessmentScore(attempt.score_hundredths)}</strong><small>nota oral</small></span>` : ""}
          </div>
        </section>
        <form method="post" action="/api/assessments/${assessment.id}/oral/students/${student.id}/complete" class="stack-form oral-attempt-form">
          <section class="oral-question-list">${questions}</section>
          <section class="card oral-notes-card">
            <label>Observacoes da prova oral
              <textarea name="observation" rows="4" maxlength="500" placeholder="Observacao curta, ate 500 caracteres" ${disabled}>${escapeHtml(attempt?.observation || "")}</textarea>
            </label>
            <p class="panel-description">Campo opcional, maximo de 500 caracteres.</p>
          </section>
          ${attempt?.status === "completed" && assessment.status === "published" && !readOnly ? `<label>Motivo da alteracao<input name="reason" placeholder="Obrigatorio se a nota mudar" /></label>` : ""}
          ${readOnly ? "" : `
            <div class="inline-actions oral-submit-actions">
              ${attempt?.status === "completed" ? "" : `<button class="ghost-link" type="submit" formaction="/api/assessments/${assessment.id}/oral/students/${student.id}/draft">Salvar rascunho</button>`}
              <button type="submit">Salvar nota oral</button>
            </div>`}
        </form>
      </main>`,
  });
}

module.exports = {
  renderOralAssessmentPage,
  renderOralApplyPage,
  renderOralAttemptPage,
};