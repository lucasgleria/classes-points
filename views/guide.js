const {
  pageTemplate,
  renderProfessorNav,
  renderProfessorTopbar,
} = require("./shared");

function renderGuidePage() {
  const guideItems = [
    {
      title: "Dashboard",
      text: "Use o dashboard para acompanhar rankings por turma e abrir rapidamente os dados recentes de cada aluno.",
      steps: [
        "Abra Dashboard no menu lateral para ver os alunos ordenados por pontuacao.",
        "Use o filtro de turma para analisar uma sala especifica.",
        "Quando o ranking academico estiver ativado, o placar soma pontos de participacao e bonus academico.",
        "Clique em Historico para consultar os ultimos lancamentos e acessar o historico completo.",
      ],
    },
    {
      title: "Cadastros",
      text: "Nesta area voce cria turmas, cadastra alunos, importa listas e reorganiza alunos entre salas.",
      steps: [
        "Crie uma turma informando livro, dia da semana e horario.",
        "Cadastre um aluno individualmente ou importe varios nomes de uma vez, usando uma linha ou virgula por aluno.",
        "Use Mover alunos em massa para transferir alunos selecionados para outra turma.",
        "Use Mover turma completa para transferir todos os alunos de uma turma para outra.",
      ],
    },
    {
      title: "Minhas Turmas",
      text: "Use esta aba para revisar, editar e encerrar turmas sem perder dados historicos.",
      steps: [
        "Edite livro, dia da semana e horario nos cards de cada turma.",
        "Arquive turmas encerradas para remove-las dos fluxos ativos sem apagar alunos ou historico.",
        "Turmas arquivadas preservam avaliacoes em modo consulta e saem do ranking ativo.",
        "Apague apenas turmas vazias quando elas nao forem mais necessarias.",
      ],
    },
    {
      title: "Meus alunos",
      text: "Use esta aba para consultar alunos, abrir detalhes completos e manter a ficha individual do professor.",
      steps: [
        "Filtre por turma quando quiser encontrar um aluno rapidamente.",
        "Clique em Detalhes para ver credenciais, pontos por categoria, historico completo e avaliacoes do aluno.",
        "Clique em Ficha para registrar participacao, compreensao, tarefas, comportamento e comentarios do professor.",
        "A ficha e privada do professor e nao aparece na area do aluno.",
      ],
    },
    {
      title: "Avaliacoes",
      text: "Use Avaliacoes para criar provas por turma, lancar notas OT/WT e publicar resultados para os alunos.",
      steps: [
        "Selecione a turma e crie uma avaliacao com titulo, descricao, data opcional e opcao de contar no placar.",
        "A avaliacao congela a lista atual da turma; novos alunos podem ser adicionados manualmente enquanto estiver em rascunho.",
        "Em Lancar notas, defina a situacao de cada aluno: Pendente, Avaliado, Ausente ou Isento.",
        "Alunos avaliados exigem nota de Teste Oral (OT) e Teste Escrito (WT), de 0,00 a 10,00.",
        "Publique somente depois de resolver todos os pendentes; alunos veem apenas avaliacoes publicadas.",
        "Alteracoes em notas publicadas exigem motivo e ficam registradas no historico de revisoes.",
      ],
    },
    {
      title: "Avaliacao Oral",
      text: "Use a prova oral por formulario para aplicar perguntas reutilizaveis e preencher automaticamente o OT sugerido.",
      steps: [
        "Abra Avaliacao Oral dentro de uma avaliacao em rascunho ou publicada.",
        "Crie um novo modelo oral ou vincule um modelo existente do professor.",
        "Digite uma pergunta por linha no formato Pergunta | Resposta esperada | Peso; resposta e peso sao opcionais (peso de 1 a 10, padrao 1). O sistema aceita ate 50 perguntas por modelo.",
        "Aplique a prova por aluno, com respostas Correto, Meio-Certo ou Errado.",
        "Salve rascunhos durante a aplicacao ou conclua para calcular a nota oral.",
        "A nota concluida aparece como sugestao no campo OT da tela Lancar notas; o professor ainda confirma e salva OT/WT.",
      ],
    },
    {
      title: "Ficha / PDF",
      text: "Use a ficha por avaliacao para registrar desempenho qualitativo e gerar o PDF atualizado do aluno.",
      steps: [
        "Na tela Lancar notas, abra Ficha / PDF para o aluno da avaliacao.",
        "Registre participacao, compreensao, tarefas, comportamento e consideracoes.",
        "O PDF fica disponivel depois que a ficha esta salva e o aluno possui OT/WT com situacao Avaliado.",
        "O gerador cria o PDF em memoria no Node e nao substitui o modelo base.",
        "Fichas de avaliacoes ou turmas arquivadas ficam disponiveis somente para consulta.",
      ],
    },
    {
      title: "Pontuacao",
      text: "Use esta pagina durante a aula para registrar pontos para um aluno, varios alunos ou a turma inteira.",
      steps: [
        "Selecione a turma e marque os alunos que receberao o mesmo lancamento.",
        "Escolha a categoria: Homework, Games, Challenges, Presence ou Bad Behavior.",
        "Informe os pontos. Presence sempre vale 1 ponto; Homework aceita 1 ou 2; Games, Challenges e Bad Behavior aceitam de 1 a 100.",
        "Preencha a justificativa quando a categoria for Bad Behavior.",
        "Revise o resumo antes de confirmar. Se necessario, use Desfazer ultimo para remover o lancamento mais recente das suas turmas.",
      ],
    },
    {
      title: "Visualizacoes",
      text: "Esta area concentra os links e credenciais usados pelos alunos para consultar o proprio desempenho.",
      steps: [
        "Filtre por turma para encontrar os alunos mais rapido.",
        "Copie ou abra a URL individual do aluno quando precisar compartilhar o acesso.",
        "Edite nome, turma, login, senha e token quando uma credencial precisar ser corrigida.",
        "Exclua um aluno apenas quando tiver certeza, pois os pontos e o historico dele tambem serao removidos.",
      ],
    },
    {
      title: "Area do aluno",
      text: "Cada aluno acessa uma pagina propria para acompanhar pontos, penalidades e avaliacoes publicadas.",
      steps: [
        "Compartilhe a URL, login e senha exibidos em Visualizacoes.",
        "Depois do login, o aluno ve total geral, totais por categoria, media academica, bonus academico e placar combinado.",
        "Avaliacoes publicadas mostram OT, WT e media; avaliacoes em rascunho nao aparecem para o aluno.",
        "Penalidades de Bad Behavior exibem pontos perdidos, data e justificativa.",
        "Se uma credencial for alterada em Visualizacoes, compartilhe os novos dados com o aluno.",
      ],
    },
    {
      title: "Seguranca e producao",
      text: "A implementacao atual separa professores, alunos, bancos locais e banco persistente de producao.",
      steps: [
        "Professores so acessam turmas e alunos do proprio escopo.",
        "Alunos autenticados ficam presos ao proprio token e nao acessam dados de outros alunos.",
        "A autenticacao usa cookie assinado e funciona entre instancias quando o SESSION_SECRET e o mesmo.",
        "Em desenvolvimento e testes, o sistema usa SQLite; em producao na Vercel, configure DATABASE_URL para Postgres/Neon.",
        "Nao execute npm run db:reset contra dados reais.",
      ],
    },
  ];

  return pageTemplate({
    title: "Guia",
    pageClass: "manage-page",
    body: `
      ${renderProfessorNav()}
      <main class="shell">
        ${renderProfessorTopbar({ eyebrow: "Ajuda", title: "Guia do sistema" })}
        <section class="card guide-intro">
          <h2>Como usar o English Class Points</h2>
          <p>Este guia resume as rotinas atuais do painel: turmas, alunos, pontos, avaliacoes, prova oral, fichas de desempenho, PDF, acesso dos alunos e cuidados de producao.</p>
        </section>
        <section class="guide-grid">
          ${guideItems
            .map(
              (item) => `
                <article class="card guide-card">
                  <div>
                    <p class="eyebrow">Feature</p>
                    <h2>${item.title}</h2>
                    <p>${item.text}</p>
                  </div>
                  <ol>
                    ${item.steps.map((step) => `<li>${step}</li>`).join("")}
                  </ol>
                </article>`
            )
            .join("")}
        </section>
      </main>`,
  });
}

module.exports = {
  renderGuidePage,
};