const {
  groupStudentsByClass,
  pageTemplate,
  renderActionEmptyState,
  renderClassFilter,
  renderConfirmModal,
  renderProfessorNav,
  renderProfessorTopbar,
} = require("./shared");

function renderVisualizationsPage(students, classes = [], baseUrl, message = "", errorMessage = "", selectedClassId = "") {
  const groups = groupStudentsByClass(students, selectedClassId);
  const sections = groups.length
    ? groups
        .map((group) => `
          <section class="class-group">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Turma</p>
                <h2>${group.label}</h2>
              </div>
            </div>
            <div class="credentials-grid">
              ${group.students
                .map((student) => {
                  const fullUrl = `${baseUrl}/student/${student.token}`;
                  return `
                    <article class="card credentials-card">
                      <div class="credentials-card__header">
                        <div>
                          <p class="eyebrow">Aluno</p>
                          <h2>${student.name}</h2>
                        </div>
                        <span class="points-pill">${student.total_points} pts</span>
                      </div>
                      <div class="credentials-preview">
                        <span><strong>Turma:</strong> ${student.class_label}</span>
                        <span><strong>URL:</strong> <a href="/student/${student.token}" target="_blank" rel="noreferrer">${fullUrl}</a></span>
                        <span><strong>Login:</strong> ${student.username}</span>
                        <span><strong>Senha:</strong> ${student.password}</span>
                      </div>
                      <form method="post" action="/api/students/${student.id}/update" class="stack-form">
                        <label>Nome<input name="name" value="${student.name}" required /></label>
                        <label>Turma<select name="classId" required>${classes.map((classroom) => `<option value="${classroom.id}" ${String(student.class_id) === String(classroom.id) ? "selected" : ""}>${classroom.class_label}</option>`).join("")}</select></label>
                        <label>Login<input name="username" value="${student.username}" required /></label>
                        <label>Senha<input name="password" value="${student.password}" required /></label>
                        <label>Token / URL<input name="token" value="${student.token}" required /></label>
                        <button type="submit">Salvar alteracoes</button>
                      </form>
                      <form method="post" action="/api/students/${student.id}/delete" class="stack-form delete-student-form" data-confirm-action data-confirm-title="Excluir aluno" data-confirm-message="Excluir ${student.name}? Todos os pontos e o historico serao perdidos permanentemente.">
                        <p class="warning-text">Se este aluno for apagado, todos os pontos e o historico serao perdidos permanentemente.</p>
                        <button type="submit" class="danger-button">Excluir aluno</button>
                      </form>
                    </article>`;
                })
                .join("")}
            </div>
          </section>`)
        .join("")
    : renderActionEmptyState({
        title: "Nenhum aluno encontrado",
        text: "Cadastre ou importe alunos para visualizar credenciais de acesso.",
        href: "/add#import-students",
        action: "Adicionar alunos",
      });

  return pageTemplate({
    title: "Visualizacoes",
    pageClass: "manage-page",
    body: `
      ${renderProfessorNav()}
      <main class="shell">
        ${renderProfessorTopbar({ eyebrow: "Acesso dos alunos", title: "Visualizacoes por turma" })}
        ${message ? `<p class="success-banner">${message}</p>` : ""}
        ${errorMessage ? `<p class="error-banner">${errorMessage}</p>` : ""}
        ${classes.length ? renderClassFilter(classes, selectedClassId, "/visualizations") : ""}
        ${sections}
      </main>
      ${renderConfirmModal()}`,
  });
}

module.exports = {
  renderVisualizationsPage,
};