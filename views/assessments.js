const {
  escapeHtml,
  formatAssessmentScore,
  formatDateOnly,
  formatRatingLabel,
  pageTemplate,
  renderAssessmentStatus,
  renderClassFilter,
  renderProfessorNav,
  renderProfessorTopbar,
  renderRatingSelect,
} = require("./shared");

function renderAssessmentsPage(classes, selectedClassId, assessments, message = "", errorMessage = "", historyMode = false) {
  const selectedClass = classes.find((classroom) => String(classroom.id) === String(selectedClassId));
  const cards = assessments.length
    ? assessments.map((assessment) => {
      const readOnly = historyMode || assessment.status === "archived";
      return `
      <article class="card performance-card">
        <div class="section-heading">
          <div>
            <p class="eyebrow">${renderAssessmentStatus(assessment.status)}</p>
            <h2>${escapeHtml(assessment.title)}</h2>
            <p>${escapeHtml(assessment.description || "Sem descricao")}</p>
          </div>
          <span class="points-pill">${assessment.pending_count} pendente(s)</span>
        </div>
        <p>${assessment.assessment_date ? `Data: ${formatDateOnly(assessment.assessment_date)}` : "Sem data definida"} · ${assessment.roster_count} aluno(s) · ${assessment.counts_for_ranking ? "Conta no placar" : "Nao conta no placar"}</p>
        ${assessment.status === "draft" && !readOnly ? `
          <form method="post" action="/api/assessments/${assessment.id}/update" class="stack-form">
            <label>Titulo<input name="title" value="${escapeHtml(assessment.title)}" required /></label>
            <label>Descricao<textarea name="description" rows="2">${escapeHtml(assessment.description || "")}</textarea></label>
            <label>Data<input name="assessmentDate" type="date" value="${escapeHtml(assessment.assessment_date || "")}" /></label>
            <label><input name="countsForRanking" type="checkbox" value="1" ${assessment.counts_for_ranking ? "checked" : ""} /> Considerar no placar geral</label>
            <button type="submit">Salvar dados da avaliacao</button>
          </form>` : ""}
        <div class="inline-actions">
          <a class="ghost-link" href="/assessments/${assessment.id}/grades">${readOnly ? "Consultar notas" : "Lancar notas"}</a>
          <a class="ghost-link" href="/assessments/${assessment.id}/oral">Avaliacao Oral</a>
          ${readOnly ? "" : assessment.status === "draft" ? `
            <form method="post" action="/api/assessments/${assessment.id}/publish"><button type="submit">Publicar</button></form>
            <form method="post" action="/api/assessments/${assessment.id}/delete"><button class="danger-button" type="submit">Excluir</button></form>
          ` : `<form method="post" action="/api/assessments/${assessment.id}/archive"><button class="ghost-link" type="submit">Arquivar</button></form>`}
        </div>
      </article>`;
    }).join("")
    : selectedClass
      ? `<div class="card empty-state">Nenhuma avaliacao cadastrada para esta turma.</div>`
      : `<div class="card empty-state">Selecione uma turma para gerenciar suas avaliacoes.</div>`;

  return pageTemplate({
    title: "Avaliacoes",
    pageClass: "manage-page",
    body: `
      ${renderProfessorNav()}
      <main class="shell">
        ${renderProfessorTopbar({ eyebrow: "Notas OT e WT", title: historyMode ? "Historico de avaliacoes" : "Avaliacoes por turma", action: `<a class="ghost-link" href="${historyMode ? "/assessments" : "/assessments/history"}">${historyMode ? "Avaliacoes ativas" : "Historico"}</a>` })}
        ${message ? `<p class="success-banner">${escapeHtml(message)}</p>` : ""}
        ${errorMessage ? `<p class="error-banner">${escapeHtml(errorMessage)}</p>` : ""}
        ${renderClassFilter(classes, selectedClassId, historyMode ? "/assessments/history" : "/assessments")}
        ${selectedClass && !historyMode ? `
          <section class="card performance-card">
            <h2>Nova avaliacao em ${escapeHtml(selectedClass.book)}</h2>
            <form method="post" action="/api/assessments" class="stack-form">
              <input type="hidden" name="classId" value="${selectedClass.id}" />
              <label>Titulo<input name="title" required placeholder="Avaliacao 1: Unidades 0 e 1" /></label>
              <label>Descricao<textarea name="description" rows="3"></textarea></label>
              <label>Data<input name="assessmentDate" type="date" /></label>
              <label><input name="countsForRanking" type="checkbox" value="1" checked /> Considerar no placar geral</label>
              <button type="submit">Criar avaliacao</button>
            </form>
          </section>` : ""}
        <section class="stack-form">${cards}</section>
      </main>`,
  });
}

function renderAssessmentGradesPage(assessment, grades, revisions = [], candidates = [], oralResults = {}, message = "", errorMessage = "") {
  const readOnly = Boolean(assessment.class_archived_at || assessment.status === "archived");
  const disabled = readOnly ? "disabled" : "";
  const rows = grades.map((grade) => {
    const oralResult = oralResults[String(grade.student_id)];
    const calculatedOt = oralResult?.score_hundredths ?? null;
    const displayedOt = grade.ot_score === null || grade.ot_score === undefined ? calculatedOt : grade.ot_score;
    const hasDifferentManualOt =
      calculatedOt !== null &&
      grade.ot_score !== null &&
      grade.ot_score !== undefined &&
      Number(grade.ot_score) !== Number(calculatedOt);
    const average =
      grade.status === "graded" && grade.ot_score !== null && grade.wt_score !== null
        ? ` - Media ${formatAssessmentScore(Math.round((grade.ot_score + grade.wt_score) / 2))}`
        : "";
    const oralHint = oralResult
      ? `<p class="panel-description">Nota oral calculada: ${formatAssessmentScore(calculatedOt)}${hasDifferentManualOt ? " (OT manual diferente)" : ""}</p>`
      : "";

    return `
    <div class="card performance-card">
      <div class="section-heading">
        <div><strong>${escapeHtml(grade.student_name)}</strong><p>${renderAssessmentStatus(grade.status)}${average}</p></div>
        <div class="inline-actions">
          <a class="ghost-link" href="/assessments/${assessment.id}/oral/apply/students/${grade.student_id}">Avaliacao Oral</a>
          <a class="ghost-link" href="/assessments/${assessment.id}/students/${grade.student_id}/performance">Ficha / PDF</a>
        </div>
      </div>
      ${oralHint}
      <div class="student-detail-grid">
        <label>Situacao
          <select name="status_${grade.student_id}" ${disabled}>
            ${["pending", "graded", "absent", "exempt"].map((status) => `<option value="${status}" ${grade.status === status ? "selected" : ""}>${renderAssessmentStatus(status)}</option>`).join("")}
          </select>
        </label>
        <label>Teste Oral (OT)<input name="ot_${grade.student_id}" value="${formatAssessmentScore(displayedOt)}" placeholder="0,00 a 10,00" ${disabled} /></label>
        <label>Teste Escrito (WT)<input name="wt_${grade.student_id}" value="${formatAssessmentScore(grade.wt_score)}" placeholder="0,00 a 10,00" ${disabled} /></label>
        <label>Observacao<input name="note_${grade.student_id}" value="${escapeHtml(grade.teacher_note || "")}" ${disabled} /></label>
      </div>
    </div>`;
  }).join("");
  const revisionRows = revisions.length
    ? revisions.map((revision) => `<li>${escapeHtml(revision.student_name)}: ${renderAssessmentStatus(revision.old_status)} (${formatAssessmentScore(revision.old_ot_score)} / ${formatAssessmentScore(revision.old_wt_score)}) para ${renderAssessmentStatus(revision.new_status)} (${formatAssessmentScore(revision.new_ot_score)} / ${formatAssessmentScore(revision.new_wt_score)}). Motivo: ${escapeHtml(revision.reason)}</li>`).join("")
    : "<li>Nenhuma revisao registrada.</li>";

  return pageTemplate({
    title: `Notas - ${assessment.title}`,
    pageClass: "manage-page",
    body: `
      ${renderProfessorNav()}
      <main class="shell">
        ${renderProfessorTopbar({ eyebrow: escapeHtml(assessment.class_book), title: escapeHtml(assessment.title), action: `<a class="ghost-link" href="/assessments?classId=${assessment.class_id}">Voltar</a>` })}
        ${message ? `<p class="success-banner">${escapeHtml(message)}</p>` : ""}
        ${errorMessage ? `<p class="error-banner">${escapeHtml(errorMessage)}</p>` : ""}
        ${readOnly ? `<p class="card">Esta avaliacao esta disponivel somente para consulta.</p>` : ""}
        <form method="post" action="/api/assessments/${assessment.id}/grades" class="stack-form">
          ${rows}
          ${assessment.status === "published" && !readOnly ? `<label>Motivo da alteracao de nota publicada<input name="reason" /></label>` : ""}
          ${readOnly ? "" : `<button type="submit">Salvar notas</button>`}
        </form>
        ${assessment.status === "draft" && !readOnly && candidates.length ? `
          <section class="card">
            <h2>Adicionar aluno manualmente</h2>
            <form method="post" action="/api/assessments/${assessment.id}/students" class="stack-form">
              <select name="studentId">${candidates.map((student) => `<option value="${student.id}">${escapeHtml(student.name)}</option>`).join("")}</select>
              <button type="submit">Adicionar a avaliacao</button>
            </form>
          </section>` : ""}
        <section class="card"><h2>Historico de revisoes</h2><ul>${revisionRows}</ul></section>
      </main>`,
  });
}

function renderAssessmentPerformancePage(assessment, grade, student, report, suggestedProfile, message = "", errorMessage = "") {
  const values = report || suggestedProfile || {};
  const readOnly = Boolean(assessment.class_archived_at || assessment.status === "archived");
  return pageTemplate({
    title: `Ficha - ${student.name}`,
    pageClass: "manage-page",
    body: `
      ${renderProfessorNav()}
      <main class="shell">
        ${renderProfessorTopbar({ eyebrow: escapeHtml(assessment.title), title: `Ficha de ${escapeHtml(student.name)}`, action: `<a class="ghost-link" href="/assessments/${assessment.id}/grades">Voltar</a>` })}
        ${message ? `<p class="success-banner">${escapeHtml(message)}</p>` : ""}
        ${errorMessage ? `<p class="error-banner">${escapeHtml(errorMessage)}</p>` : ""}
        <section class="card">
          <p><strong>Livro:</strong> ${escapeHtml(assessment.class_book)} · <strong>OT:</strong> ${formatAssessmentScore(grade.ot_score) || "-"} · <strong>WT:</strong> ${formatAssessmentScore(grade.wt_score) || "-"}</p>
          ${report ? `<p><strong>Participacao:</strong> ${formatRatingLabel(report.participation)} · <strong>Compreensao:</strong> ${formatRatingLabel(report.grammar_vocabulary)} · <strong>Tarefas:</strong> ${formatRatingLabel(report.homework)} · <strong>Comportamento:</strong> ${formatRatingLabel(report.behavior)}</p>` : ""}
          ${readOnly ? `<p>Ficha arquivada, disponivel somente para consulta.</p>` : `<form method="post" action="/api/assessments/${assessment.id}/students/${student.id}/performance" class="stack-form">
            <label>Participacao${renderRatingSelect("participation", values.participation)}</label>
            <label>Compreensao${renderRatingSelect("grammarVocabulary", values.grammar_vocabulary)}</label>
            <label>Tarefas${renderRatingSelect("homework", values.homework)}</label>
            <label>Comportamento${renderRatingSelect("behavior", values.behavior)}</label>
            <label>Consideracoes<textarea name="comments" rows="5">${escapeHtml(values.comments || "")}</textarea></label>
            <button type="submit">Salvar ficha da avaliacao</button>
          </form>`}
          ${report && grade.status === "graded" ? `<a class="ghost-link" href="/assessments/${assessment.id}/students/${student.id}/performance.pdf">Gerar PDF atualizado</a>` : `<p>Salve a ficha e registre OT/WT para gerar o PDF.</p>`}
        </section>
      </main>`,
  });
}

module.exports = {
  renderAssessmentsPage,
  renderAssessmentGradesPage,
  renderAssessmentPerformancePage,
};