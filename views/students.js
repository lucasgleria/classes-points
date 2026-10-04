const {
  escapeHtml,
  formatAssessmentScore,
  formatCategoryLabel,
  formatDateTime,
  formatRatingLabel,
  groupStudentsByClass,
  pageTemplate,
  renderActionEmptyState,
  renderAssessmentStatus,
  renderClassFilter,
  renderHistoryRows,
  renderProfessorNav,
  renderProfessorTopbar,
  renderRatingSelect,
} = require("./shared");

function renderStudentHistoryPage(student, history) {
  return pageTemplate({
    title: `Histórico de ${student.name}`,
    pageClass: "manage-page",
    body: `
      <main class="shell">
        <header class="topbar simple">
          <a class="ghost-link" href="/dashboard">← Voltar</a>
          <div>
            <p class="eyebrow">Histórico completo</p>
            <h1>${student.name}</h1>
            <p>${student.class_label}</p>
          </div>
        </header>
        <section class="card">
          <div class="section-heading">
            <div>
              <h2>Todas as movimentações</h2>
              <p>${history.length} registro(s) encontrados.</p>
            </div>
          </div>
          <div class="history-list history-list--card">
            ${renderHistoryRows(history)}
          </div>
        </section>
      </main>`,
  });
}

function renderStudentView(summary) {
  const penaltyItems = summary.penalties.length
    ? summary.penalties
        .map(
          (item) => `
          <li class="penalty-item">
            <div>
              <strong>${Math.abs(item.points)} pts perdidos</strong>
              <small>${new Date(item.created_at).toLocaleString("pt-BR")}</small>
            </div>
            <p>${item.note}</p>
          </li>`
        )
        .join("")
    : `<li class="empty-state">Nenhuma penalidade registrada.</li>`;
  const assessmentItems = summary.assessments?.length
    ? summary.assessments.map((assessment) => `
      <article class="history-row">
        <div class="history-row__top">
          <strong>${escapeHtml(assessment.title)}</strong>
          <span class="points-pill">${renderAssessmentStatus(assessment.status)}</span>
        </div>
        <p>${escapeHtml(assessment.description || "Sem conteudo informado")}</p>
        <p>OT: ${formatAssessmentScore(assessment.ot_score) || "-"} · WT: ${formatAssessmentScore(assessment.wt_score) || "-"}${assessment.status === "graded" ? ` · Media: ${formatAssessmentScore(Math.round((assessment.ot_score + assessment.wt_score) / 2))}` : ""}</p>
      </article>`).join("")
    : `<div class="empty-state">Nenhuma avaliacao publicada.</div>`;

  return pageTemplate({
    title: `Pontuação de ${summary.student.name}`,
    pageClass: "student-page",
    body: `
      <main class="shell">
        <header class="topbar simple">
          <div>
            <p class="eyebrow">Minha pontuação</p>
            <h1>${summary.student.name}</h1>
            <p>${summary.student.class_label}</p>
          </div>
          <a class="ghost-link" href="/student/${summary.student.token}/logout">Sair</a>
        </header>
        <section class="card score-hero">
          <span class="score-hero__label">Total geral</span>
          <strong class="score-hero__value">${summary.totals.total} pts</strong>
        </section>
        <section class="grid-cards">
          <article class="card metric-card"><span>Media academica</span><strong>${summary.academic?.averageScoreHundredths === null ? "-" : formatAssessmentScore(summary.academic?.averageScoreHundredths)}</strong></article>
          <article class="card metric-card"><span>Bonus academico</span><strong>+${summary.academic?.academicBonus || 0} pts</strong></article>
          <article class="card metric-card"><span>Placar combinado</span><strong>${Number(summary.totals.total || 0) + Number(summary.academic?.academicBonus || 0)} pts</strong></article>
        </section>
        <section class="grid-cards">
          <article class="card metric-card"><span>Homework</span><strong>${summary.totals.homework}</strong></article>
          <article class="card metric-card"><span>Games</span><strong>${summary.totals.games}</strong></article>
          <article class="card metric-card"><span>Challenges</span><strong>${summary.totals.challenges}</strong></article>
          <article class="card metric-card"><span>Presence</span><strong>${summary.totals.presence}</strong></article>
          <article class="card metric-card metric-card--danger"><span>Bad Behavior</span><strong>${summary.totals.bad_behavior}</strong></article>
        </section>
        <section class="card">
          <h2>Avaliacoes publicadas</h2>
          <div class="history-list">${assessmentItems}</div>
        </section>
        <section class="card">
          <h2>Penalidades</h2>
          <ul class="penalty-list">${penaltyItems}</ul>
        </section>
      </main>`,
  });
}

function renderMyStudentsPage(students, classes = [], selectedClassId = "") {
  const groups = groupStudentsByClass(students, selectedClassId);
  const sections = groups.length
    ? groups
        .map(
          (group) => `
            <section class="card class-group">
              <div class="section-heading">
                <div>
                  <p class="eyebrow">Turma</p>
                  <h2>${group.label}</h2>
                  <p>${group.students.length} aluno(s).</p>
                </div>
              </div>
              <div class="student-directory">
                ${group.students
                  .map(
                    (student) => `
                      <article class="student-directory-item">
                        <div>
                          <strong>${student.name}</strong>
                          <small>@${student.username}</small>
                        </div>
                        <div class="inline-actions">
                          <span class="points-pill">${student.total_points || 0} pts</span>
                          <a class="ghost-link" href="/students/${student.id}/details">Detalhes</a>
                          <a class="ghost-link" href="/students/${student.id}/performance">Ficha</a>
                        </div>
                      </article>`
                  )
                  .join("")}
              </div>
            </section>`
        )
        .join("")
    : renderActionEmptyState({
        title: selectedClassId ? "Nenhum aluno nesta turma" : "Nenhum aluno cadastrado",
        text: "Cadastre alunos para abrir fichas de desempenho individuais.",
        href: "/add",
        action: "Cadastrar alunos",
      });

  return pageTemplate({
    title: "Meus alunos",
    pageClass: "manage-page",
    body: `
      ${renderProfessorNav()}
      <main class="shell">
        ${renderProfessorTopbar({ eyebrow: "Alunos", title: "Meus alunos" })}
        ${classes.length ? renderClassFilter(classes, selectedClassId, "/my-students") : ""}
        ${sections}
      </main>`,
    scriptConfig: {
      page: "my-students",
    },
  });
}

function renderStudentDetailsPage(student, totals = {}, history = [], message = "", errorMessage = "", academic = null, assessments = []) {
  const categoryTotals = [
    ["homework", "Homework"],
    ["games", "Games"],
    ["challenges", "Challenges"],
    ["presence", "Presence"],
    ["bad_behavior", "Bad Behavior"],
  ];
  const positivePoints = history
    .filter((item) => Number(item.points) > 0)
    .reduce((sum, item) => sum + Number(item.points), 0);
  const negativePoints = history
    .filter((item) => Number(item.points) < 0)
    .reduce((sum, item) => sum + Number(item.points), 0);
  const lastEntry = history[0] || null;
  const assessmentRows = assessments.length
    ? assessments.map((assessment) => {
      const canCalculateAverage = assessment.status === "graded" && assessment.ot_score !== null && assessment.wt_score !== null;
      const average = canCalculateAverage
        ? formatAssessmentScore(Math.round((assessment.ot_score + assessment.wt_score) / 2))
        : "-";
      const assessmentDate = assessment.assessment_date
        ? String(assessment.assessment_date).slice(0, 10)
        : "Sem data";

      return `
        <article class="assessment-detail-row">
          <div>
            <strong>${escapeHtml(assessment.title)}</strong>
            <span>${escapeHtml(assessment.description || "Sem descricao")}</span>
            <small>${escapeHtml(assessment.class_book || student.class_label)} - ${escapeHtml(assessmentDate)} - Prova ${renderAssessmentStatus(assessment.assessment_status)}</small>
          </div>
          <div class="assessment-score-grid">
            <span><small>Situacao</small><strong>${renderAssessmentStatus(assessment.status)}</strong></span>
            <span><small>OT</small><strong>${formatAssessmentScore(assessment.ot_score) || "-"}</strong></span>
            <span><small>WT</small><strong>${formatAssessmentScore(assessment.wt_score) || "-"}</strong></span>
            <span><small>Media</small><strong>${average}</strong></span>
          </div>
        </article>`;
    }).join("")
    : `<div class="empty-state">Nenhuma prova registrada para este aluno.</div>`;

  return pageTemplate({
    title: `Detalhes do Aluno - ${student.name}`,
    pageClass: "manage-page",
    body: `
      ${renderProfessorNav()}
      <main class="shell">
        ${renderProfessorTopbar({
          eyebrow: "Acompanhamento individual",
          title: "Detalhes do aluno",
          action: `<a class="ghost-link" href="/my-students">Voltar</a>`,
        })}
        ${message ? `<p class="success-banner">${message}</p>` : ""}
        ${errorMessage ? `<p class="error-banner">${errorMessage}</p>` : ""}
        <section class="card student-detail-hero">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Aluno</p>
              <h2>${escapeHtml(student.name)}</h2>
              <p>${escapeHtml(student.class_label)}</p>
            </div>
            <span class="points-pill">${Number(totals.total || 0)} pts</span>
          </div>
          <div class="student-detail-grid">
            <div class="detail-field">
              <span>Login</span>
              <strong>@${escapeHtml(student.username)}</strong>
            </div>
            <div class="detail-field">
              <span>Senha</span>
              <strong>${escapeHtml(student.password)}</strong>
            </div>
            <div class="detail-field">
              <span>URL de acesso</span>
              <strong>/student/${escapeHtml(student.token)}</strong>
            </div>
            <div class="detail-field">
              <span>Turma</span>
              <strong>${escapeHtml(student.class_label)}</strong>
            </div>
            <div class="detail-field">
              <span>Cadastrado em</span>
              <strong>${formatDateTime(student.created_at)}</strong>
            </div>
            <div class="detail-field">
              <span>Ultimo lancamento</span>
              <strong>${lastEntry ? formatDateTime(lastEntry.created_at) : "Sem lancamentos"}</strong>
            </div>
            <div class="detail-field">
              <span>Lancamentos</span>
              <strong>${history.length}</strong>
            </div>
            <div class="detail-field">
              <span>Provas registradas</span>
              <strong>${assessments.length}</strong>
            </div>
          </div>
        </section>
        <section class="student-detail-grid student-detail-grid--metrics">
          <article class="card metric-card">
            <span>Total geral</span>
            <strong>${Number(totals.total || 0)}</strong>
          </article>
          <article class="card metric-card">
            <span>Pontos ganhos</span>
            <strong>${positivePoints}</strong>
          </article>
          <article class="card metric-card metric-card--danger">
            <span>Penalidades</span>
            <strong>${negativePoints}</strong>
          </article>
        </section>
        <section class="card performance-card">
          <p class="eyebrow">Resumo academico</p>
          <h2>Notas e composicao do placar</h2>
          <div class="student-detail-grid">
            <div class="detail-field"><span>Avaliacoes consideradas</span><strong>${academic?.consideredCount || 0}</strong></div>
            <div class="detail-field"><span>Media academica</span><strong>${academic?.averageScoreHundredths === null || academic?.averageScoreHundredths === undefined ? "-" : formatAssessmentScore(academic.averageScoreHundredths)}</strong></div>
            <div class="detail-field"><span>Bonus academico</span><strong>+${academic?.academicBonus || 0} pts</strong></div>
            <div class="detail-field"><span>Placar combinado</span><strong>${Number(totals.total || 0) + Number(academic?.academicBonus || 0)} pts</strong></div>
          </div>
        </section>
        <section class="card performance-card">
          <div>
            <p class="eyebrow">Notas de provas</p>
            <h2>Avaliacoes do aluno</h2>
            <p>${assessments.length} prova(s) encontrada(s), incluindo rascunhos, publicadas e arquivadas.</p>
          </div>
          <div class="assessment-detail-list">${assessmentRows}</div>
        </section>
        <section class="card performance-card">
          <div>
            <p class="eyebrow">Pontuacao por categoria</p>
            <h2>Resumo de pontos</h2>
          </div>
          <div class="grid-cards">
            ${categoryTotals
              .map(
                ([key, label]) => `
                  <article class="metric-card category-total-card ${Number(totals[key] || 0) < 0 ? "metric-card--danger" : ""}">
                    <span>${label}</span>
                    <strong>${Number(totals[key] || 0)}</strong>
                  </article>`
              )
              .join("")}
          </div>
        </section>
        <section class="card performance-card">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Historico completo</p>
              <h2>Todos os lancamentos</h2>
              <p>${history.length} registro(s) encontrados.</p>
            </div>
          </div>
          <div class="history-list">
            ${
              history.length
                ? history
                    .map((item) => {
                      const isNegative = Number(item.points) < 0;
                      const pointsClass = isNegative ? "history-points history-points--negative" : "history-points history-points--positive";
                      const formattedPoints = isNegative ? `${item.points} pts` : `+${item.points} pts`;
                      const note = item.note
                        ? `<div class="history-note"><span class="history-note__label">Justificativa</span><strong>${escapeHtml(item.note)}</strong></div>`
                        : "";

                      return `
                        <article class="history-row">
                          <div class="history-row__top">
                            <strong>${formatCategoryLabel(item.category)}</strong>
                            <span class="${pointsClass}">${formattedPoints}</span>
                          </div>
                          <span class="history-date">${formatDateTime(item.created_at)}</span>
                          ${note}
                        </article>`;
                    })
                    .join("")
                : `<div class="empty-state">Nenhum lancamento registrado para este aluno.</div>`
            }
          </div>
        </section>
      </main>`,
    scriptConfig: {
      page: "performance",
    },
  });
}

function renderStudentPerformancePage(student, profile, message = "", errorMessage = "") {
  return pageTemplate({
    title: `Ficha de Desempenho - ${student.name}`,
    pageClass: "manage-page",
    body: `
      ${renderProfessorNav()}
      <main class="shell">
        ${renderProfessorTopbar({
          eyebrow: "Acompanhamento individual",
          title: "Ficha de Desempenho",
          action: `<a class="ghost-link" href="/my-students">Voltar</a>`,
        })}
        ${message ? `<p class="success-banner">${message}</p>` : ""}
        ${errorMessage ? `<p class="error-banner">${errorMessage}</p>` : ""}
        <section class="card performance-card">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Aluno</p>
              <h2>${escapeHtml(student.name)}</h2>
              <p>${escapeHtml(student.class_label)}</p>
            </div>
            <a class="ghost-link" href="/students/${student.id}/details">Ver detalhes</a>
          </div>
          <div class="profile-summary-grid">
            <div class="detail-field">
              <span>Participacao</span>
              <strong>${formatRatingLabel(profile.participation)}</strong>
            </div>
            <div class="detail-field">
              <span>Gramatica e vocabulario</span>
              <strong>${formatRatingLabel(profile.grammar_vocabulary)}</strong>
            </div>
            <div class="detail-field">
              <span>Tarefas de casa</span>
              <strong>${formatRatingLabel(profile.homework)}</strong>
            </div>
            <div class="detail-field">
              <span>Comportamento</span>
              <strong>${formatRatingLabel(profile.behavior)}</strong>
            </div>
          </div>
          <p>Ultima atualizacao: ${formatDateTime(profile.updated_at)}</p>
          ${
            profile.comments
              ? `<div class="teacher-comments"><span>Consideracoes atuais</span><p>${escapeHtml(profile.comments)}</p></div>`
              : `<div class="empty-state">Nenhuma consideracao registrada ainda.</div>`
          }
        </section>
        <section class="card performance-card">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Editar ficha</p>
              <h2>Avaliacao do professor</h2>
            </div>
          </div>
          <form method="post" action="/students/${student.id}/performance" class="stack-form">
            <div class="performance-table" role="table" aria-label="Ficha de desempenho">
              <div class="performance-row performance-row--head" role="row">
                <strong role="columnheader">Campo</strong>
                <strong role="columnheader">Avalia&ccedil;&atilde;o</strong>
              </div>
              <label class="performance-row" role="row">
                <span>Participa&ccedil;&atilde;o</span>
                ${renderRatingSelect("participation", profile.participation)}
              </label>
              <label class="performance-row" role="row">
                <span>Compreens&atilde;o de Gram&aacute;tica e vocabul&aacute;rio</span>
                ${renderRatingSelect("grammarVocabulary", profile.grammar_vocabulary)}
              </label>
              <label class="performance-row" role="row">
                <span>Tarefas de Casa</span>
                ${renderRatingSelect("homework", profile.homework)}
              </label>
              <label class="performance-row" role="row">
                <span>Comportamento</span>
                ${renderRatingSelect("behavior", profile.behavior)}
              </label>
            </div>
            <label>Considera&ccedil;&otilde;es do professor
              <textarea name="comments" rows="5" placeholder="Comentarios, observacoes ou proximos pontos de atencao">${escapeHtml(profile.comments || "")}</textarea>
            </label>
            <button type="submit">Salvar ficha</button>
          </form>
        </section>
      </main>`,
    scriptConfig: {
      page: "performance",
    },
  });
}

module.exports = {
  renderStudentHistoryPage,
  renderStudentView,
  renderMyStudentsPage,
  renderStudentDetailsPage,
  renderStudentPerformancePage,
};