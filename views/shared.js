function pageTemplate({ title, body, pageClass = "", scriptConfig = null }) {
  const configScript = scriptConfig
    ? `<script>window.APP_CONFIG = ${JSON.stringify(scriptConfig)};</script>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body class="${pageClass}">
    ${body}
    ${configScript}
    <script src="/app.js" defer></script>
  </body>
</html>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderProfessorNav() {
  return `
    <aside class="side-nav" id="side-nav">
      <div class="side-nav__header">
        <strong>Menu</strong>
        <button class="icon-button" type="button" data-close-menu>×</button>
      </div>
      <nav class="side-nav__links">
        <a href="/dashboard">Dashboard</a>
        <a href="/add">Cadastros</a>
        <a href="/classes">Minhas Turmas</a>
        <a href="/my-students">Meus alunos</a>
        <a href="/assessments">Avaliacoes</a>
        <a href="/points">Pontuação</a>
        <a href="/visualizations">Visualizações</a>
        <a href="/guide">Guia</a>
        <a href="/logout">Sair</a>
      </nav>
    </aside>
    <div class="backdrop" data-close-menu></div>`;
}

function renderProfessorTopbar({ eyebrow, title, action = "" }) {
  return `
    <header class="topbar">
      <button class="icon-button" type="button" data-open-menu>☰</button>
      <div>
        <p class="eyebrow">${eyebrow}</p>
        <h1>${title}</h1>
      </div>
      ${action}
    </header>`;
}

function renderActionEmptyState({ title, text, href, action }) {
  return `
    <section class="card actionable-empty">
      <h2>${title}</h2>
      <p>${text}</p>
      <a class="ghost-link" href="${href}">${action}</a>
    </section>`;
}

function renderOnboarding(classes, students) {
  if (classes.length && students.length) {
    return "";
  }

  const steps = [
    ["Crie uma turma", "Defina livro, dia e horário para organizar seus alunos.", "/add", "Criar turma", classes.length > 0],
    ["Adicione alunos", "Cadastre individualmente ou importe uma lista de nomes.", "/add#import-students", "Adicionar alunos", students.length > 0],
    ["Lance presença", "Depois dos alunos cadastrados, registre presença ou pontos em lote.", "/points", "Lançar pontos", false],
  ];

  return `
    <section class="card onboarding-card">
      <p class="eyebrow">Primeiro uso</p>
      <h2>Comece em 3 passos</h2>
      <div class="onboarding-steps">
        ${steps
          .map(
            ([title, text, href, action, done], index) => `
              <article class="onboarding-step ${done ? "is-done" : ""}">
                <span class="onboarding-step__number">${done ? "✓" : index + 1}</span>
                <div>
                  <strong>${title}</strong>
                  <p>${text}</p>
                  <a class="ghost-link" href="${href}">${action}</a>
                </div>
              </article>`
          )
          .join("")}
      </div>
    </section>`;
}

function groupStudentsByClass(students, selectedClassId = "") {
  const filteredStudents = selectedClassId
    ? students.filter((student) => String(student.class_id || "") === String(selectedClassId))
    : students;

  const groups = new Map();

  for (const student of filteredStudents) {
    const key = student.class_id || "unassigned";
    const label = student.class_label || "Sem turma";
    if (!groups.has(key)) {
      groups.set(key, { id: student.class_id || "", label, students: [] });
    }
    groups.get(key).students.push(student);
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    students: group.students.sort((left, right) => {
      const scoreDifference = Number(right.ranking_score ?? right.total_points) - Number(left.ranking_score ?? left.total_points);
      const averageDifference =
        Number(right.ranking_average ?? -1) -
        Number(left.ranking_average ?? -1);
      const pointsDifference = Number(right.total_points || 0) - Number(left.total_points || 0);
      return scoreDifference || averageDifference || pointsDifference || String(left.name).localeCompare(String(right.name), "pt-BR");
    }),
  }));
}

function renderClassFilter(classes, selectedClassId, basePath) {
  const options = [
    `<option value="">Todas as turmas</option>`,
    ...classes.map(
      (classroom) =>
        `<option value="${classroom.id}" ${String(selectedClassId) === String(classroom.id) ? "selected" : ""}>${classroom.class_label}</option>`
    ),
  ].join("");

  return `
    <form method="get" action="${basePath}" class="card stack-form filter-card">
      <label>Filtrar por turma
        <select name="classId">
          ${options}
        </select>
      </label>
      <button type="submit">Aplicar filtro</button>
    </form>`;
}

function renderHistoryRows(history) {
  if (!history.length) {
    return `<div class="empty-state">Histórico vazio.</div>`;
  }

  return history
    .map((item) => {
      const isNegative = Number(item.points) < 0;
      const pointsClass = isNegative ? "history-points history-points--negative" : "history-points history-points--positive";
      const formattedPoints = isNegative ? `${item.points} pts` : `+${item.points} pts`;
      const note = item.note
        ? `<div class="history-note"><span class="history-note__label">Justificativa</span><strong>${item.note}</strong></div>`
        : "";

      return `
        <article class="history-row">
          <div class="history-row__top">
            <strong>${item.category}</strong>
            <span class="${pointsClass}">${formattedPoints}</span>
          </div>
          <span class="history-date">${new Date(item.created_at).toLocaleString("pt-BR")}</span>
          ${note}
        </article>`;
    })
    .join("");
}

function renderConfirmModal() {
  return `
    <div class="history-modal-backdrop" id="confirm-modal-backdrop" hidden></div>
    <section class="history-modal confirm-modal" id="confirm-modal" hidden role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
      <div class="history-modal__header">
        <div>
          <p class="eyebrow">Confirmacao</p>
          <h2 id="confirm-modal-title">Confirmar acao</h2>
        </div>
        <button class="icon-button" type="button" id="confirm-modal-close">x</button>
      </div>
      <p id="confirm-modal-message"></p>
      <div class="modal-actions">
        <button type="button" class="ghost-link" id="confirm-modal-cancel">Cancelar</button>
        <button type="button" class="danger-button" id="confirm-modal-confirm">Confirmar</button>
      </div>
    </section>`;
}

function renderRatingSelect(name, selectedValue) {
  const options = [
    ["otimo", "&Oacute;timo"],
    ["bom", "Bom"],
    ["precisa_melhorar", "Precisa melhorar"],
  ];

  return `
    <select name="${name}">
      ${options
        .map(([value, label]) => `<option value="${value}" ${selectedValue === value ? "selected" : ""}>${label}</option>`)
        .join("")}
    </select>`;
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString("pt-BR") : "Ainda nao salvo";
}

function formatCategoryLabel(category) {
  const labels = {
    homework: "Homework",
    games: "Games",
    challenges: "Challenges",
    presence: "Presence",
    bad_behavior: "Bad Behavior",
  };

  return labels[category] || category;
}

function formatRatingLabel(value) {
  const labels = {
    otimo: "Otimo",
    bom: "Bom",
    precisa_melhorar: "Precisa melhorar",
  };

  return labels[value] || "Bom";
}

function formatAssessmentScore(value) {
  return value === null || value === undefined ? "" : (Number(value) / 100).toFixed(2).replace(".", ",");
}

function renderAssessmentStatus(status) {
  return {
    draft: "Rascunho",
    published: "Publicada",
    archived: "Arquivada",
    pending: "Pendente",
    graded: "Avaliado",
    absent: "Ausente",
    exempt: "Isento",
  }[status] || status;
}

module.exports = {
  pageTemplate,
  escapeHtml,
  renderProfessorNav,
  renderProfessorTopbar,
  renderActionEmptyState,
  renderOnboarding,
  groupStudentsByClass,
  renderClassFilter,
  renderHistoryRows,
  renderConfirmModal,
  renderRatingSelect,
  formatDateTime,
  formatCategoryLabel,
  formatRatingLabel,
  formatAssessmentScore,
  renderAssessmentStatus,
};