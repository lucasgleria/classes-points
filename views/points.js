const {
  groupStudentsByClass,
  pageTemplate,
  renderActionEmptyState,
  renderClassFilter,
  renderConfirmModal,
  renderProfessorNav,
  renderProfessorTopbar,
} = require("./shared");

function renderPointsPage(students, classes = [], selectedClassId = "", message = "", errorMessage = "") {
  const effectiveClassId = selectedClassId || (classes.length === 1 ? String(classes[0].id) : "");
  const selectedGroup = groupStudentsByClass(students, effectiveClassId)[0] || null;
  const studentPicker = !classes.length
    ? renderActionEmptyState({
        title: "Crie uma turma primeiro",
        text: "Voce precisa de uma turma e alunos antes de registrar pontos.",
        href: "/add",
        action: "Ir para cadastros",
      })
    : !effectiveClassId
      ? `<div class="empty-state">Selecione uma turma para exibir os alunos.</div>`
      : !selectedGroup
        ? renderActionEmptyState({
            title: "Nenhum aluno nesta turma",
            text: "Cadastre ou importe alunos antes de lancar pontos.",
            href: "/add#import-students",
            action: "Adicionar alunos",
          })
        : `
          <section class="student-batch-group" data-class-label="${selectedGroup.label}">
            <div class="student-batch-group__header">
              <strong>${selectedGroup.label}</strong>
              <button type="button" class="ghost-link batch-select-button" data-select-group="${selectedGroup.id || "unassigned"}">Marcar turma</button>
            </div>
            <div class="student-batch-list">
              ${selectedGroup.students
                .map(
                  (student) => `
                    <label class="student-check">
                      <input type="checkbox" name="studentIds" value="${student.id}" data-student-checkbox data-student-name="${student.name}" data-group="${selectedGroup.id || "unassigned"}" />
                      <span>${student.name}</span>
                    </label>`
                )
                .join("")}
            </div>
          </section>`;

  return pageTemplate({
    title: "Pontuacao",
    pageClass: "manage-page",
    body: `
      ${renderProfessorNav()}
      <main class="shell">
        ${renderProfessorTopbar({
          eyebrow: "Lancamentos",
          title: "Registrar pontos",
          action: students.length ? `<form method="post" action="/api/points/undo" data-confirm-action data-confirm-title="Desfazer ultimo lancamento" data-confirm-message="Desfazer o ultimo lancamento das suas turmas?"><button type="submit" class="ghost-link">Desfazer ultimo</button></form>` : "",
        })}
        ${message ? `<p class="success-banner">${message}</p>` : ""}
        ${errorMessage ? `<p class="error-banner">${errorMessage}</p>` : ""}
        ${classes.length ? renderClassFilter(classes, effectiveClassId, "/points") : ""}
        <section class="card">
          <h2>Novo lancamento</h2>
          <form method="post" action="/api/points" class="stack-form" data-points-form>
            <input type="hidden" name="classId" value="${effectiveClassId}" />
            <div class="section-heading">
              <div>
                <h3>Alunos</h3>
                <p>Selecione um ou varios alunos para receber a mesma categoria de pontos.</p>
              </div>
              <button type="button" class="ghost-link batch-select-button" data-select-all>Marcar todos</button>
            </div>
            <div class="student-batch-picker">${studentPicker}</div>
            <label>Categoria
              <select name="category" required>
                <option value="homework">Homework</option>
                <option value="games">Games</option>
                <option value="challenges">Challenges</option>
                <option value="presence">Presence</option>
                <option value="bad_behavior">Bad Behavior</option>
              </select>
            </label>
            <label>Pontos<input name="points" type="number" min="1" max="100" value="1" required /></label>
            <label>Justificativa<textarea name="note" rows="3" placeholder="Obrigatoria para bad behavior"></textarea></label>
            <button type="submit" ${selectedGroup ? "" : "disabled"}>Salvar lancamento</button>
          </form>
        </section>
      </main>
      <div class="history-modal-backdrop" id="points-summary-backdrop" hidden></div>
      <section class="history-modal confirm-modal" id="points-summary-modal" hidden role="dialog" aria-modal="true">
        <div class="history-modal__header">
          <div>
            <p class="eyebrow">Revisao</p>
            <h2>Confirmar lancamento</h2>
          </div>
          <button class="icon-button" type="button" id="points-summary-close">x</button>
        </div>
        <p id="points-summary-text"></p>
        <div class="modal-actions">
          <button type="button" class="ghost-link" id="points-summary-cancel">Editar</button>
          <button type="button" id="points-summary-confirm">Salvar lancamento</button>
        </div>
      </section>
      ${renderConfirmModal()}`,
    scriptConfig: {
      page: "points",
    },
  });
}

module.exports = {
  renderPointsPage,
};