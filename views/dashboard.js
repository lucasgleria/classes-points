const {
  groupStudentsByClass,
  pageTemplate,
  renderActionEmptyState,
  renderClassFilter,
  renderOnboarding,
  renderProfessorNav,
  renderProfessorTopbar,
} = require("./shared");

function renderDashboard(students, classes = [], selectedClassId = "", academicRankingEnabled = false) {
  const groups = groupStudentsByClass(students, selectedClassId);
  const sections = groups.length
    ? groups
        .map((group) => {
          const total = group.students.reduce((sum, student) => sum + Number(student.total_points || 0), 0);
          const average = group.students.length ? Math.round(total / group.students.length) : 0;
          const items = group.students
            .map(
              (student, index) => `
                <li class="ranking-item">
                  <div class="ranking-item__main">
                    <div>
                      <span class="ranking-position">${index < 3 ? ["Ouro", "Prata", "Bronze"][index] : `#${index + 1}`}</span>
                      <strong>${student.name}</strong>
                      <small>@${student.username}</small>
                      <small class="trend-pill ${Number(student.recent_points || 0) >= 0 ? "trend-pill--up" : "trend-pill--down"}">
                        7 dias: ${Number(student.recent_points || 0) >= 0 ? "+" : ""}${student.recent_points || 0} pts
                      </small>
                    </div>
                    <span class="points-pill">${student.ranking_score ?? student.total_points} pts</span>
                  </div>
                  <div class="ranking-item__actions">
                    ${academicRankingEnabled ? `<small>Base: ${student.total_points} · Bonus academico: +${student.academic_bonus || 0}</small>` : ""}
                    <button type="button" class="ghost-link ranking-history-button" data-history-toggle data-student-id="${student.id}" data-student-name="${student.name}">
                      Historico
                    </button>
                  </div>
                </li>`
            )
            .join("");

          return `
            <section class="card class-group">
              <div class="section-heading">
                <div>
                  <p class="eyebrow">Turma</p>
                  <h2>${group.label}</h2>
                  <p>${group.students.length} aluno(s), ${total} pts no total, media ${average} pts.</p>
                </div>
              </div>
              <ol class="ranking-list">${items}</ol>
            </section>`;
        })
        .join("")
    : renderActionEmptyState({
        title: selectedClassId ? "Nenhum aluno nesta turma" : "Nenhum aluno cadastrado",
        text: "Cadastre alunos para liberar ranking, historico e lancamento de pontos.",
        href: "/add",
        action: "Cadastrar alunos",
      });

  return pageTemplate({
    title: "Dashboard",
    pageClass: "dashboard-page",
    body: `
      ${renderProfessorNav()}
      <div class="history-modal-backdrop" id="history-modal-backdrop" hidden></div>
      <section class="history-modal" id="history-modal" hidden aria-modal="true" role="dialog" aria-labelledby="history-modal-title">
        <div class="history-modal__header">
          <div>
            <p class="eyebrow">Historico individual</p>
            <h2 id="history-modal-title">Aluno</h2>
          </div>
          <button class="icon-button" type="button" id="history-modal-close">x</button>
        </div>
        <div class="history-list history-list--card" id="history-modal-content"></div>
        <div class="history-modal__footer" id="history-modal-footer" hidden>
          <a class="ghost-link" id="history-modal-link" href="#">Ver historico completo</a>
        </div>
      </section>
      <main class="shell">
        ${renderProfessorTopbar({
          eyebrow: "Resumo geral",
          title: "Rankings por turma",
          action: `<a class="ghost-link" href="/points">Lancar pontos</a>`,
        })}
        ${renderOnboarding(classes, students)}
        ${classes.length ? renderClassFilter(classes, selectedClassId, "/dashboard") : ""}
        ${sections}
      </main>`,
    scriptConfig: {
      page: "dashboard",
    },
  });
}

module.exports = {
  renderDashboard,
};