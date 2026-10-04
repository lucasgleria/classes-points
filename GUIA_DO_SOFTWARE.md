# Guia do Software - English Class Points

Este guia descreve o estado atual do sistema, incluindo as funcionalidades novas e as implementacoes principais.

## 1. Visao geral

O English Class Points e uma aplicacao web para professoras e professores acompanharem turmas de ingles, pontos de participacao, avaliacoes, prova oral, fichas de desempenho e acesso individual dos alunos.

Perfis de acesso:

- **Professor**: acessa painel, turmas, alunos, pontos, avaliacoes, fichas e PDFs.
- **Aluno**: acessa apenas a propria pagina por URL unica, login e senha.

Entrada principal:

- Local: `npm start`, por padrao em `http://localhost:3100`.
- Producao: Vercel com Postgres/Neon via `DATABASE_URL`.

## 2. Painel do professor

### Dashboard

- Mostra rankings agrupados por turma.
- Permite filtrar uma turma especifica.
- Ordena alunos por pontos de participacao ou, quando ativado, por placar combinado.
- Exibe atalho de historico para consultar lancamentos recentes e historico completo.
- O ranking academico e controlado por `ACADEMIC_RANKING_ENABLED`.

### Cadastros

- Cria turmas com livro, dia da semana, horario inicial e horario final.
- Cadastra aluno individualmente em uma turma.
- Importa varios alunos de uma vez por texto, aceitando nomes separados por linha ou virgula.
- Move alunos selecionados para outra turma.
- Move uma turma completa para outra turma.

### Minhas Turmas

- Lista as turmas ativas do professor autenticado.
- Permite editar livro, dia e horario.
- Permite arquivar turmas encerradas.
- Permite apagar apenas turmas vazias e sem avaliacoes vinculadas.
- Turmas arquivadas preservam dados, mas saem dos fluxos ativos e do ranking.

### Meus alunos

- Lista alunos por turma.
- Abre a pagina de detalhes do aluno, com credenciais, pontos, historico e avaliacoes.
- Abre a ficha individual do professor, com participacao, compreensao, tarefas, comportamento e comentarios.
- A ficha individual do professor nao aparece na area do aluno.

## 3. Pontuacao

Categorias implementadas:

| Categoria | Regra |
| --- | --- |
| `homework` | +1 ou +2 pontos |
| `games` | +1 a +100 pontos |
| `challenges` | +1 a +100 pontos |
| `presence` | +1 ponto fixo |
| `bad_behavior` | -1 a -100 pontos, com justificativa obrigatoria |

Funcionalidades:

- Lancamento para um aluno, varios alunos ou turma inteira.
- Lancamentos em lote recebem `batch_id`.
- `Desfazer ultimo` remove o lote mais recente dentro do escopo do professor.
- Historico registra categoria, pontos, justificativa, lote e data.

## 4. Avaliacoes OT/WT

As avaliacoes pertencem a uma turma e possuem:

- titulo;
- descricao;
- data opcional;
- status: `draft`, `published` ou `archived`;
- opcao `counts_for_ranking`;
- lista congelada de alunos no momento da criacao.

Regras:

- Criar uma avaliacao em turma ativa cria o retrato atual da turma em `assessment_grades`.
- Alunos novos nao entram automaticamente em avaliacoes antigas.
- Alunos podem ser adicionados manualmente enquanto a avaliacao esta em rascunho.
- Situacoes de nota: `pending`, `graded`, `absent`, `exempt`.
- `graded` exige OT e WT entre `0,00` e `10,00`.
- A nota da avaliacao e a media simples entre OT e WT.
- Publicar e bloqueado enquanto houver aluno pendente.
- Aluno so ve avaliacoes publicadas.
- Alterar nota publicada exige motivo e gera revisao em `assessment_grade_revisions`.
- Avaliacoes arquivadas ficam em modo consulta.

## 5. Ranking academico

O sistema calcula resumo academico por aluno:

- quantidade considerada;
- avaliados;
- ausentes;
- isentos;
- pendentes;
- media academica;
- bonus academico.

Formula atual:

```text
nota_avaliacao = (OT + WT) / 2
media_academica = media das avaliacoes publicadas consideradas
bonus_academico = arredondar((media_academica / 10) * 100)
placar_combinado = pontos_de_participacao + bonus_academico
```

O dashboard so usa o placar combinado quando `ACADEMIC_RANKING_ENABLED=true`.

## 6. Avaliacao oral

A avaliacao oral complementa o fluxo de avaliacoes.

Funcionalidades:

- Cria modelos orais reutilizaveis por professor.
- Cada modelo tem titulo, descricao opcional e perguntas.
- Perguntas podem ser digitadas como uma pergunta por linha, no formato `Pergunta | Resposta esperada | Peso`.
- Resposta esperada e peso sao opcionais; o peso e um inteiro de 1 a 10 e vale 1 quando omitido.
- A resposta esperada aparece para o professor durante a aplicacao.
- O limite atual e de 50 perguntas por modelo.
- Um modelo vinculado a uma avaliacao e copiado como snapshot.
- A aplicacao da prova lista alunos por pontos de participacao, do maior para o menor.
- Cada resposta aceita `Correto`, `Meio-Certo` ou `Errado`.
- O professor pode salvar rascunho ou concluir a prova oral do aluno.
- Observacao da prova oral e opcional e tem limite de 500 caracteres.

Calculo:

```text
Correto = peso
Meio-Certo = peso * 0,5
Errado = 0
nota_oral = (soma / soma_dos_pesos) * 10
```

A nota oral concluida aparece como sugestao no campo OT da tela de lancamento de notas. A nota oficial continua sendo confirmada no fluxo OT/WT.

## 7. Ficha de desempenho e PDF

Existem dois niveis de ficha:

- ficha individual do professor, em `/students/:id/performance`;
- ficha por avaliacao, em `/assessments/:id/students/:studentId/performance`.

A ficha por avaliacao registra:

- participacao;
- compreensao;
- tarefas;
- comportamento;
- consideracoes.

O PDF atualizado fica disponivel quando:

- a ficha da avaliacao foi salva;
- o aluno esta como `graded`;
- OT e WT estao preenchidos.

Implementacao:

- `performance-pdf.js` gera o PDF em memoria no Node.
- Nao depende de LibreOffice, Word, Chromium ou binario externo.
- O modelo base nao e substituido.
- O download usa nome `Ficha_desempenho_<aluno>.pdf`.

## 8. Visualizacoes e area do aluno

Em `Visualizacoes`, o professor pode:

- filtrar alunos por turma;
- copiar ou abrir a URL individual;
- editar nome, turma, login, senha e token;
- excluir aluno, apagando tambem pontos, historico, notas, fichas e tentativas orais relacionadas.

Na area do aluno, o aluno ve:

- total geral;
- media academica;
- bonus academico;
- placar combinado;
- totais por categoria;
- avaliacoes publicadas com OT, WT e media;
- penalidades de Bad Behavior com data e justificativa.

O aluno nao ve:

- dados de outros alunos;
- fichas privadas do professor;
- avaliacoes em rascunho.

## 9. Seguranca e isolamento

Implementacoes principais:

- Autenticacao por cookie assinado em `auth.js`.
- Cookie do professor contem `role=professor` e `professorId`.
- Cookie do aluno contem `role=student`, `studentId` e `studentToken`.
- Rotas do professor usam `requireProfessor`.
- Rotas do aluno usam `requireStudent`.
- O aluno autenticado nao pode abrir pagina de outro token.
- Professores so acessam turmas e alunos do proprio `professor_id`.
- Operacoes sensiveis validam escopo antes de consultar ou gravar dados.

Cuidados de producao:

- IDs de professores em `TEACHER_ACCOUNTS` devem permanecer estaveis.
- Nao reordenar professores ja usados em producao.
- Nao executar `npm run db:reset` em banco real.

## 10. Persistencia e configuracao

Arquivos principais:

| Arquivo | Responsabilidade |
| --- | --- |
| `app.js` | cria o Express app, middlewares, auth e rotas |
| `server.js` | inicia o servidor local |
| `routes/professor.js` | rotas e fluxos do professor |
| `routes/student.js` | rotas e fluxo do aluno |
| `views.js` | HTML server-side das telas |
| `db.js` | seleciona SQLite ou Postgres |
| `db-sqlite.js` | store SQLite local/testes |
| `db-postgres.js` | store Postgres/Neon producao |
| `assessment-common.js` | notas, medias, bonus e ranking |
| `oral-test-common.js` | modelos, respostas e calculo oral |
| `performance-pdf.js` | geracao do PDF |
| `validation.js` | validacao de pontos |
| `config.js` | variaveis de ambiente e defaults |

Variaveis relevantes:

| Variavel | Uso |
| --- | --- |
| `TEACHER_USERNAME` | professor principal quando `TEACHER_ACCOUNTS` nao e usado |
| `TEACHER_PASSWORD` | senha do professor principal |
| `TEACHER_ACCOUNTS` | JSON com multiplos professores e IDs estaveis |
| `SESSION_SECRET` | segredo de assinatura dos cookies |
| `DATABASE_URL` ou `POSTGRES_URL` | ativa Postgres |
| `DATABASE_FILE` | caminho SQLite local |
| `ACADEMIC_RANKING_ENABLED` | ativa placar combinado no dashboard |
| `REPORT_TIMEZONE` | fuso usado no PDF |
| `REPORT_CITY` | cidade exibida no PDF |

## 11. Deploy e operacao

Comandos:

```bash
npm start
npm test
npm run verify
npm run db:reset
npm run vercel:link
npm run vercel:deploy
```

Fluxo recomendado antes de producao:

1. Fazer backup do banco.
2. Validar `TEACHER_ACCOUNTS` e IDs de professores.
3. Confirmar que todos os alunos possuem `class_id`.
4. Configurar `SESSION_SECRET`.
5. Configurar `DATABASE_URL` com Postgres/Neon.
6. Manter `ACADEMIC_RANKING_ENABLED=false` ate validar medias e bonus.
7. Executar `npm run verify`.
8. Validar visualmente uma ficha PDF gerada.
9. Publicar com `npm run vercel:deploy`.

## 12. Testes

A suite usa `node --test`, `supertest` e `fast-check`.

Coberturas relevantes:

- autenticacao e isolamento de professor/aluno;
- propriedades de pontos e historico;
- persistencia SQLite;
- turmas, importacao, movimentacao e arquivamento;
- avaliacoes, publicacao, revisoes e ranking academico;
- ficha de desempenho;
- PDF interno;
- avaliacao oral, modelos, rascunho, conclusao e OT sugerido;
- configuracao de runtime.

Execute:

```bash
npm test
```
