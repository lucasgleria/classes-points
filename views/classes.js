const {
  pageTemplate,
  renderActionEmptyState,
  renderConfirmModal,
  renderOnboarding,
  renderProfessorNav,
  renderProfessorTopbar,
} = require("./shared");

function renderClassAdminCards(classes = []) {
  return classes.length
    ? classes
        .map(
          (classroom) => `
            <article class="card class-admin-card">
              <h2>${classroom.class_label}</h2>
              <p class="panel-description">Edite os dados da turma, arquive uma sala encerrada ou apague uma turma vazia.</p>
              <form method="post" action="/api/classes/${classroom.id}/update" class="stack-form">
                <label>Livro<input name="book" value="${classroom.book}" required /></label>
                <label>Dia da semana<input name="weekday" value="${classroom.weekday}" required /></label>
                <label>Horario de inicio<input name="startTime" value="${classroom.start_time}" required /></label>
                <label>Horario de fim<input name="endTime" value="${classroom.end_time}" required /></label>
                <button type="submit">Salvar turma</button>
              </form>
              <div class="inline-actions">
                <form method="post" action="/api/classes/${classroom.id}/archive" data-confirm-action data-confirm-title="Arquivar turma" data-confirm-message="Arquivar ${classroom.class_label}? Ela saira dos fluxos ativos, sem apagar alunos ou historico.">
                  <button type="submit" class="ghost-link">Arquivar</button>
                </form>
                <form method="post" action="/api/classes/${classroom.id}/delete" data-confirm-action data-confirm-title="Apagar turma" data-confirm-message="Apagar ${classroom.class_label}? Esta acao so funciona se a turma estiver vazia.">
                  <button type="submit" class="danger-button">Apagar</button>
                </form>
              </div>
            </article>`
        )
        .join("")
    : renderActionEmptyState({
        title: "Nenhuma turma cadastrada",
        text: "Crie a primeira turma para liberar cadastro e importacao de alunos.",
        href: "/add#new-class",
        action: "Criar turma",
      });
}

function renderManagementPage(classes = [], message = "", errorMessage = "", students = []) {
  const classOptions = classes.length
    ? classes.map((classroom) => `<option value="${classroom.id}">${classroom.class_label}</option>`).join("")
    : `<option value="">Cadastre uma turma primeiro</option>`;

  return pageTemplate({
    title: "Cadastros",
    pageClass: "manage-page",
    body: `
      ${renderProfessorNav()}
      <main class="shell">
        ${renderProfessorTopbar({ eyebrow: "Gerenciamento", title: "Turmas e alunos" })}
        ${message ? `<p class="success-banner">${message}</p>` : ""}
        ${errorMessage ? `<p class="error-banner">${errorMessage}</p>` : ""}
        ${renderOnboarding(classes, students)}
        <section class="management-section">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Criacao</p>
              <h2>Comece por turma e aluno</h2>
            </div>
          </div>
          <div class="management-grid">
            <section class="card" id="new-class">
              <h2>Nova turma</h2>
              <p class="panel-description">Crie uma turma com livro, dia e horario para agrupar alunos e filtrar rankings, lancamentos e acessos.</p>
              <form method="post" action="/api/classes" class="stack-form">
                <label>Livro<input name="book" placeholder="Super Minds 1" required /></label>
                <label>Dia da semana<input name="weekday" placeholder="Sabados" required /></label>
                <label>Horario de inicio<input name="startTime" placeholder="10h45" required /></label>
                <label>Horario de fim<input name="endTime" placeholder="12h45" required /></label>
                <button type="submit">Criar turma</button>
              </form>
            </section>
            <section class="card">
              <h2>Novo aluno</h2>
              <p class="panel-description">Cadastre um aluno individualmente em uma turma. O sistema cria automaticamente login, senha e link de acesso.</p>
              <form method="post" action="/api/students" class="stack-form">
                <label>Nome do aluno<input name="name" required /></label>
                <label>Turma<select name="classId" required ${classes.length ? "" : "disabled"}>${classOptions}</select></label>
                <button type="submit" ${classes.length ? "" : "disabled"}>Criar aluno</button>
              </form>
            </section>
          </div>
        </section>
        <section class="management-section">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Organizacao em massa</p>
              <h2>Importar lista e avancar turma</h2>
            </div>
          </div>
          <div class="management-grid">
            <section class="card" id="import-students">
              <h2>Importar lista de alunos</h2>
              <p class="panel-description">Opcional para turmas novas: cole a lista quando quiser evitar cadastrar os alunos um por um.</p>
              <form method="post" action="/api/students/import" class="stack-form">
                <label>Turma<select name="classId" required ${classes.length ? "" : "disabled"}>${classOptions}</select></label>
                <label>Lista de nomes<textarea name="names" rows="8" placeholder="Um nome por linha ou separado por virgula" required></textarea></label>
                <button type="submit" ${classes.length ? "" : "disabled"}>Importar lista</button>
              </form>
            </section>
            <section class="card">
              <h2>Mover turma completa</h2>
              <p class="panel-description">Use quando a turma terminar um livro e todos os alunos devem avancar juntos para uma nova turma.</p>
              <form method="post" action="/api/classes/move-students" class="stack-form" data-confirm-action data-confirm-title="Mover turma completa" data-confirm-message="Mover todos os alunos da turma de origem para a turma de destino?">
                <label>Turma de origem<select name="fromClassId" required ${classes.length ? "" : "disabled"}>${classOptions}</select></label>
                <label>Turma de destino<select name="toClassId" required ${classes.length ? "" : "disabled"}>${classOptions}</select></label>
                <button type="submit" ${classes.length >= 2 && students.length ? "" : "disabled"}>Mover turma completa</button>
              </form>
            </section>
          </div>
        </section>
      </main>
      ${renderConfirmModal()}`,
    scriptConfig: {
      page: "add",
    },
  });
}

function renderMyClassesPage(classes = [], message = "", errorMessage = "") {
  return pageTemplate({
    title: "Minhas Turmas",
    pageClass: "manage-page",
    body: `
      ${renderProfessorNav()}
      <main class="shell">
        ${renderProfessorTopbar({
          eyebrow: "Turmas",
          title: "Minhas Turmas",
          action: `<a class="ghost-link" href="/add#new-class">Criar turma</a>`,
        })}
        ${message ? `<p class="success-banner">${message}</p>` : ""}
        ${errorMessage ? `<p class="error-banner">${errorMessage}</p>` : ""}
        <section class="card guide-intro">
          <h2>Gerencie suas turmas</h2>
          <p>Edite informacoes de horario e livro, arquive turmas encerradas ou apague turmas vazias. Alunos e historico ficam preservados ao arquivar.</p>
        </section>
        <section class="class-admin-grid">${renderClassAdminCards(classes)}</section>
      </main>
      ${renderConfirmModal()}`,
    scriptConfig: {
      page: "classes",
    },
  });
}

module.exports = {
  renderManagementPage,
  renderMyClassesPage,
};