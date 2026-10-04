# Relatorio de Validacao

Data: 2026-05-22

## 1. Validacao geral de logins, professores, turmas e alunos

Status: aprovado com ressalva operacional.

O sistema separa o acesso de professor e aluno por cookie assinado com `role`. Professores recebem `professorId` no cookie; alunos recebem `studentId` e `studentToken`. As rotas do painel usam `requireProfessor`, e as rotas de aluno usam `requireStudent`, que tambem impede um aluno autenticado de abrir a URL de outro token.

O isolamento entre professores e turmas esta implementado por escopo:

- Cada turma tem `professor_id`.
- Ao entrar no painel, o sistema calcula as turmas do professor logado.
- Listagens de alunos filtram apenas alunos cujo `class_id` pertence as turmas desse professor.
- Operacoes sensiveis validam escopo antes de agir: historico, detalhes, ficha, cadastro, edicao, exclusao, mover alunos, lancar pontos e desfazer ultimo lancamento.

Validacoes executadas:

- `npm test`: 28 testes passaram.
- O teste de isolamento multi-professor foi reforcado para cobrir tambem as novas telas:
  - `/students/:id/details`
  - `/students/:id/performance`
  - `POST /students/:id/performance`
- Resultado: uma professora nao consegue visualizar detalhes, visualizar ficha, editar ficha, consultar historico via API ou lancar pontos em aluno de outra professora.

Conclusao: nao identifiquei conflito direto entre logins de professores, suas turmas e seus alunos na versao atual, desde que os alunos estejam corretamente vinculados a uma turma.

Ressalva importante:

Os vinculos de propriedade dependem de IDs numericos de professor. Em producao, os IDs de `TEACHER_ACCOUNTS` precisam permanecer estaveis. Nao reordenar nem trocar IDs de professores existentes, porque as turmas apontam para `professor_id`, nao para o nome textual do professor.

## 2. Validacao de preservacao de informacoes em atualizacao para producao

Status: dados nao devem ser apagados pela inicializacao normal, mas ha risco de alunos antigos ficarem ocultos se nao tiverem turma.

O codigo de banco usa criacao e migracao incremental:

- `CREATE TABLE IF NOT EXISTS` cria tabelas sem apagar as existentes.
- SQLite adiciona colunas faltantes com `ALTER TABLE ... ADD COLUMN`.
- Postgres adiciona colunas faltantes com `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- As tabelas de alunos e pontuacoes nao sao recriadas nem limpas pela inicializacao normal da aplicacao.
- A nova tabela `student_performance_profiles` e criada sem alterar pontuacoes existentes.
- A coluna `batch_id` em `point_transactions` e adicionada sem remover historico.
- Turmas antigas sem `professor_id` recebem `professor_id = 1`, preservando a turma e associando ao professor principal.

Validacao executada:

- Simulei um banco SQLite antigo contendo apenas `students` e `point_transactions`, sem `class_id`, sem `batch_id`, sem `professors`, sem `classes` e sem `student_performance_profiles`.
- Abri esse banco com a versao atual.
- Resultado: o aluno, o historico e o total de pontos foram preservados fisicamente. A simulacao retornou: `OK: upgrade SQLite antigo preservou aluno, pontuacoes e historico.`

Risco encontrado antes de producao:

Se o banco atual de producao tiver alunos antigos com `students.class_id` nulo, esses alunos e suas pontuacoes nao serao apagados, mas podem deixar de aparecer nas telas do professor, porque o painel hoje filtra alunos com:

- aluno precisa ter `class_id`;
- esse `class_id` precisa pertencer a uma turma do professor logado.

Isso e especialmente relevante se a versao em producao for anterior a funcionalidade de turmas, ou se existirem alunos cadastrados sem turma. Nessa situacao, a nova versao preserva os dados no banco, mas a visibilidade no painel do professor fica incompleta.

Recomendacao antes de liberar producao:

1. Fazer backup do banco de producao.
2. Verificar se existem alunos sem turma:
   - Postgres: `SELECT COUNT(*) FROM students WHERE class_id IS NULL;`
   - SQLite: `SELECT COUNT(*) FROM students WHERE class_id IS NULL;`
3. Se houver alunos sem turma, criar uma migracao/backfill antes do deploy:
   - criar uma turma padrao para o professor principal, por exemplo `Legado, Sem dia, Sem horario`;
   - atualizar `students.class_id` dos alunos nulos para essa turma;
   - manter todos os `point_transactions` intactos.
4. Confirmar que os IDs dos professores em producao serao os mesmos da configuracao atual.
5. Nao executar scripts de reset contra banco real.

Observacao sobre scripts:

O script `npm run db:reset` apaga o banco SQLite local (`data/points.sqlite`) e recria a estrutura. Ele nao deve ser usado apontando para qualquer arquivo de banco que contenha dados reais. O fluxo normal da aplicacao nao chama esse reset; ele aparece em scripts auxiliares de deploy/local.

Conclusao sobre perda de dados:

Nao encontrei rotina na inicializacao normal que apague alunos, pontuacoes ou historico. O maior risco nao e perda fisica, e sim alunos antigos sem turma ficarem invisiveis para o professor apos a atualizacao. Por isso, eu nao recomendo subir para producao ate validar/backfill de `class_id` no banco atual.

## 3. Evidencias

- Suite automatizada: `npm test` passou com 28/28 testes.
- Simulacao de upgrade SQLite antigo: passou, preservando aluno, pontuacoes e historico.
- Nenhum deploy foi executado.

