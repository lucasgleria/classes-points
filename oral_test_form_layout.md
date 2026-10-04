# Planejamento da Feature: Avaliacao Oral por Formulario

## 1. Objetivo

Adicionar ao fluxo de avaliacoes uma area especifica para o professor montar, reutilizar e aplicar avaliacoes orais.

O professor deve conseguir:

- criar um modelo de prova oral com quantas questoes quiser;
- definir o texto/pergunta de cada questao;
- avaliar cada resposta com tres opcoes: `Correto`, `Meio-Certo` e `Errado`;
- salvar o modelo para reutilizar em outras avaliacoes e/ou turmas;
- aplicar o modelo em uma avaliacao especifica;
- ver os alunos ordenados por pontos, do maior para o menor;
- salvar automaticamente a nota oral calculada;
- usar essa nota como preenchimento automatico do campo `Teste Oral (OT)`;
- continuar podendo preencher ou ajustar o OT manualmente na tela atual de lancamento de notas.

Esta feature deve complementar o fluxo existente de `Avaliacoes`, sem substituir a tela atual de `Lancar notas`.

## 2. Situacao Atual Relevante

Hoje o sistema possui:

- cadastro de avaliacoes por turma;
- botao `Lancar notas`;
- campos `Teste Oral (OT)` e `Teste Escrito (WT)` na tela de notas;
- validacao centralizada exigindo OT e WT para um aluno ficar como `Avaliado`;
- publicacao da avaliacao bloqueada enquanto houver aluno `Pendente`;
- historico de revisoes quando uma nota publicada e alterada;
- rankings e resumo academico baseados nas avaliacoes publicadas.

Ponto tecnico importante:

- o modelo atual de `assessment_grades` nao aceita apenas OT salvo como nota oficial se o status for `graded`; para `graded`, OT e WT precisam existir.
- portanto, a avaliacao oral deve ter armazenamento proprio e sincronizar o OT com a tela de notas de forma controlada.

## 3. Fluxo Proposto

### 3.1. Lista de avaliacoes

Na tela `Avaliacoes`, cada card de avaliacao deve exibir:

- `Lancar notas`;
- `Avaliacao Oral`;
- `Arquivar` quando a avaliacao estiver publicada;
- `Publicar` e `Excluir` quando estiver em rascunho, como hoje.

O botao `Avaliacao Oral` deve apontar para:

```text
GET /assessments/:id/oral
```

Para avaliacoes arquivadas ou turmas arquivadas, a tela oral deve abrir em modo somente leitura.

### 3.2. Tela inicial da avaliacao oral

A tela `Avaliacao Oral` deve ter dois blocos principais:

1. `Modelos de prova oral`
   - listar modelos existentes do professor;
   - permitir selecionar um modelo para esta avaliacao;
   - permitir criar um novo modelo;
   - permitir copiar um modelo existente para editar sem alterar o original.

2. `Aplicar prova oral`
   - exibir o modelo selecionado;
   - exibir progresso: alunos avaliados / total;
   - botao para iniciar ou continuar a aplicacao.

Se a avaliacao ainda nao tiver modelo selecionado:

- mostrar estado vazio orientando o professor a criar ou escolher um modelo;
- nao permitir aplicar prova ate existir um modelo valido.

### 3.3. Criacao do modelo oral

A tela de criacao/edicao do modelo deve permitir:

- nome do modelo, por exemplo `Oral Test - Unit 1`;
- descricao opcional;
- lista dinamica de questoes;
- adicionar questao;
- remover questao;
- reordenar questoes;
- editar pergunta de cada questao;
- salvar como modelo reutilizavel.

Cada questao deve possuir:

- numero/ordem;
- texto da pergunta;
- opcionalmente observacao interna para o professor.

O modelo deve ser validado com:

- nome obrigatorio;
- pelo menos uma questao;
- cada questao com pergunta obrigatoria;
- limite recomendado de 1 a 50 questoes para evitar formularios grandes demais.

### 3.4. Reutilizacao do modelo

Os modelos devem pertencer a um professor.

Regras:

- professor so enxerga seus proprios modelos;
- modelo pode ser reutilizado em qualquer turma do mesmo professor;
- modelo usado em uma avaliacao deve ser copiado como snapshot para aquela aplicacao, ou seja, editar o modelo original depois nao deve alterar provas orais antigas;
- deve existir opcao `Duplicar modelo` para criar variacoes.

Decisao recomendada:

- armazenar um modelo global reutilizavel;
- ao vincular a uma avaliacao, criar um snapshot das questoes naquela avaliacao.

Isso protege historico e evita que uma edicao futura mude notas ja aplicadas.

### 3.5. Aplicacao da prova oral

Ao iniciar a aplicacao, o professor deve ver:

- nome da avaliacao;
- modelo selecionado;
- lista de alunos da avaliacao;
- alunos ordenados por pontos, do maior para o menor;
- indicador de status por aluno:
  - `Nao iniciado`;
  - `Em andamento`;
  - `Concluido`;
  - `Sincronizado com OT`.

A ordenacao deve usar os pontos atuais de participacao (`total_points`) em ordem decrescente. Em empate, ordenar por nome.

Ao clicar em um aluno:

- abrir formulario da prova oral daquele aluno;
- exibir todas as questoes;
- cada questao deve ter tres botoes:
  - `Correto`;
  - `Meio-Certo`;
  - `Errado`;
- permitir salvar parcialmente;
- permitir concluir a prova do aluno;
- permitir registrar uma observacao curta por aluno durante a aplicacao, com limite de 500 caracteres.

### 3.6. Calculo da nota oral

Formula recomendada para a primeira versao:

```text
Correto = 1 ponto bruto
Meio-Certo = 0,5 ponto bruto
Errado = 0 ponto bruto

nota_oral = (soma dos pontos brutos / quantidade de questoes) * 10
```

Arredondamento:

- armazenar em centesimos, igual ao sistema atual;
- exemplo: `8,75` vira `875`.

Exemplo:

```text
10 questoes
7 corretas = 7
2 meio-certas = 1
1 errada = 0

soma = 8
nota_oral = 8,00
```

Se alguma questao estiver sem resposta:

- a prova pode ser salva como rascunho;
- nao deve gerar nota final;
- nao deve sincronizar com OT.

### 3.7. Sincronizacao com campo OT

Ao concluir a prova oral de um aluno:

- salvar respostas da prova oral;
- calcular nota oral final;
- gravar a nota final como sugestao/sincronizacao de OT para aquele aluno naquela avaliacao;
- mostrar essa nota na tela `Lancar notas`.

Como o modelo atual exige OT e WT para status `Avaliado`, existem duas opcoes tecnicas.

Opcao recomendada:

- manter `assessment_grades` como fonte oficial da avaliacao publicada;
- criar uma tabela propria para resultado oral;
- na tela `Lancar notas`, preencher automaticamente o input OT com a ultima nota oral concluida quando `ot_score` oficial ainda estiver vazio;
- o professor confirma/salva a tela de notas para transformar a sugestao em nota oficial junto com WT.

Alternativa:

- alterar `assessment_grades` para permitir OT parcial sem WT;
- exige mudanca nas validacoes de dominio e nos testes de publicacao.

Recomendacao:

- usar a opcao recomendada para reduzir impacto e manter a regra atual: avaliacao so publica quando OT e WT estiverem resolvidos.

### 3.8. Edicao apos publicacao

Se a avaliacao ja estiver publicada:

- aplicar ou alterar prova oral deve exigir motivo;
- se a nota oral sincronizada alterar o OT oficial, deve registrar revisao em `assessment_grade_revisions`;
- se a nota oral ficar apenas como resultado oral e nao alterar OT oficial, registrar no historico oral proprio.

Recomendacao:

- bloquear criacao/troca de modelo em avaliacao publicada;
- permitir consultar e aplicar apenas se ainda houver aluno sem resultado oral;
- qualquer alteracao de resultado oral concluido apos publicacao deve exigir justificativa.

## 4. Modelo de Dados Proposto

### 4.1. `oral_test_templates`

Modelos reutilizaveis criados pelo professor.

Campos:

- `id`;
- `professor_id`;
- `title`;
- `description`;
- `created_at`;
- `updated_at`;
- `archived_at`.

### 4.2. `oral_test_template_questions`

Questoes de um modelo reutilizavel.

Campos:

- `id`;
- `template_id`;
- `position`;
- `prompt`;
- `teacher_note`;
- `created_at`;
- `updated_at`.

### 4.3. `assessment_oral_tests`

Snapshot do modelo usado em uma avaliacao especifica.

Campos:

- `id`;
- `assessment_id`;
- `source_template_id`;
- `title`;
- `description`;
- `created_by_professor_id`;
- `created_at`;
- `updated_at`;
- `locked_at`.

Observacao:

- `locked_at` indica que a prova ja foi usada para algum aluno e nao deve ter suas questoes editadas diretamente.

### 4.4. `assessment_oral_test_questions`

Snapshot das questoes da prova oral da avaliacao.

Campos:

- `id`;
- `oral_test_id`;
- `position`;
- `prompt`;
- `teacher_note`;
- `created_at`;
- `updated_at`.

### 4.5. `assessment_oral_attempts`

Aplicacao da prova oral para um aluno.

Campos:

- `id`;
- `oral_test_id`;
- `assessment_id`;
- `student_id`;
- `status`: `draft` ou `completed`;
- `score_hundredths`;
- `observation`: texto curto da aplicacao, maximo 500 caracteres;
- `synced_to_ot_at`;
- `created_at`;
- `updated_at`;
- `completed_at`.

Restricao:

```text
UNIQUE(oral_test_id, student_id)
```

### 4.6. `assessment_oral_answers`

Resposta/avaliacao de cada questao para um aluno.

Campos:

- `attempt_id`;
- `question_id`;
- `result`: `correct`, `half`, `wrong`;
- `created_at`;
- `updated_at`.

Restricao:

```text
PRIMARY KEY(attempt_id, question_id)
```

### 4.7. `assessment_oral_attempt_revisions`

Historico de alteracoes em resultados orais concluidos.

Campos:

- `id`;
- `attempt_id`;
- `student_id`;
- `old_score_hundredths`;
- `new_score_hundredths`;
- `reason`;
- `professor_id`;
- `created_at`.

## 5. Interface de Store

Adicionar os mesmos metodos em SQLite e PostgreSQL:

- `getOralTestTemplates(professorId, options)`;
- `getOralTestTemplateById(templateId)`;
- `createOralTestTemplate(professorId, payload)`;
- `updateOralTestTemplate(templateId, payload)`;
- `archiveOralTestTemplate(templateId)`;
- `duplicateOralTestTemplate(templateId, professorId)`;
- `attachOralTemplateToAssessment(assessmentId, templateId, professorId)`;
- `getAssessmentOralTest(assessmentId)`;
- `updateAssessmentOralTest(oralTestId, payload)`;
- `getAssessmentOralRoster(assessmentId)`;
- `getOralAttempt(oralTestId, studentId)`;
- `saveOralAttemptDraft(oralTestId, studentId, answers, options)`;
- `completeOralAttempt(oralTestId, studentId, answers, options)`;
- `syncOralAttemptToGrade(assessmentId, studentId, options)`;
- `getOralAttemptRevisions(oralTestId)`.

Todos os metodos devem validar escopo do professor nas rotas antes de serem chamados ou internamente quando receberem `professorId`.

## 6. Rotas Propostas

### 6.1. Telas

```text
GET /assessments/:id/oral
```

Tela inicial da avaliacao oral.

```text
GET /assessments/:id/oral/templates/new
```

Criar novo modelo.

```text
GET /assessments/:id/oral/templates/:templateId/edit
```

Editar modelo reutilizavel.

```text
GET /assessments/:id/oral/apply
```

Lista de alunos ordenada por pontos.

```text
GET /assessments/:id/oral/apply/students/:studentId
```

Formulario oral de um aluno.

### 6.2. Acoes

```text
POST /api/oral-test-templates
POST /api/oral-test-templates/:templateId/update
POST /api/oral-test-templates/:templateId/archive
POST /api/oral-test-templates/:templateId/duplicate
POST /api/assessments/:id/oral/attach-template
POST /api/assessments/:id/oral/layout
POST /api/assessments/:id/oral/students/:studentId/draft
POST /api/assessments/:id/oral/students/:studentId/complete
POST /api/assessments/:id/oral/students/:studentId/sync-to-ot
```

Para a primeira versao, `complete` pode executar tambem `sync-to-ot` como passo automatico, desde que a sincronizacao seja reversivel e apareca claramente na tela.

## 7. Regras de Escopo e Seguranca

- professor so acessa avaliacoes de suas turmas;
- professor so acessa seus modelos orais;
- modelo global nao pode ser editado por outro professor;
- snapshot de prova oral pertence a uma avaliacao especifica;
- aluno nao acessa formularios orais;
- aluno so ve resultado final depois que a avaliacao principal for publicada, usando a visualizacao academica ja existente;
- turma arquivada deixa prova oral em modo somente leitura.

## 8. Estados e Comportamentos

### 8.1. Modelo reutilizavel

Estados:

- ativo;
- arquivado.

Modelo arquivado:

- nao aparece por padrao na selecao;
- continua preservado para snapshots antigos.

### 8.2. Prova oral da avaliacao

Estados derivados:

- sem modelo;
- modelo selecionado, ainda sem aplicacao;
- em aplicacao;
- concluida para todos os alunos;
- somente leitura.

### 8.3. Tentativa por aluno

Estados:

- `draft`: respostas parciais;
- `completed`: todas as questoes respondidas e nota calculada.

## 9. Integracao com Tela de Lancar Notas

Na tela `Lancar notas`, cada aluno deve exibir:

- campo OT atual;
- se houver prova oral concluida, mostrar `Nota oral calculada: X,XX`;
- se OT estiver vazio, preencher automaticamente o input com a nota oral calculada;
- se OT ja existir e for diferente da nota oral, mostrar aviso:

```text
OT manual: 8,00
Nota oral calculada: 8,50
```

Acoes recomendadas:

- botao `Usar nota oral` para substituir o valor do input;
- manter edicao manual permitida;
- ao salvar notas, a validacao atual continua exigindo OT e WT quando status for `Avaliado`.

## 10. Testes Necessarios

### 10.1. Dominio

- calcular nota oral corretamente para correto/meio/errado;
- rejeitar prova sem questoes;
- rejeitar questao sem pergunta;
- rejeitar tentativa concluida com respostas faltantes;
- rejeitar observacao oral com mais de 500 caracteres;
- arredondar nota para centesimos;
- garantir monotonicidade: mais respostas corretas nao reduzem nota.

### 10.2. Store SQLite/PostgreSQL

- criar modelo e questoes;
- duplicar modelo;
- anexar modelo a avaliacao criando snapshot;
- editar modelo original sem alterar snapshot;
- salvar tentativa em rascunho;
- concluir tentativa e calcular nota;
- salvar observacao curta da tentativa;
- listar alunos ordenados por pontos;
- sincronizar nota oral como sugestao/OT;
- preservar isolamento entre professores.

### 10.3. HTTP/UI

- card da avaliacao mostra botao `Avaliacao Oral`;
- professor cria modelo pela interface;
- professor anexa modelo a avaliacao;
- professor aplica prova para aluno;
- professor registra observacao curta para o aluno durante a prova;
- tela de lancar notas exibe/preenche OT com nota oral;
- avaliacao arquivada abre em modo somente leitura.

## 11. Plano de Implementacao em Etapas

### Etapa 1: Dominio puro

- criar funcoes para validar modelo oral;
- criar funcoes para calcular nota oral;
- criar testes unitarios.

### Etapa 2: Persistencia

- adicionar tabelas SQLite;
- adicionar tabelas PostgreSQL;
- adicionar mapeadores em `db-common.js`;
- adicionar metodos equivalentes nos dois stores;
- criar testes de contrato no SQLite.

### Etapa 3: UI de modelos

- adicionar botao `Avaliacao Oral` no card da avaliacao;
- criar tela inicial oral;
- criar tela de criacao/edicao de modelo;
- salvar e listar modelos.

### Etapa 4: Vinculo com avaliacao

- permitir selecionar modelo para avaliacao;
- criar snapshot das questoes;
- impedir edicao destrutiva de snapshot ja usado.

### Etapa 5: Aplicacao por aluno

- criar tela de alunos ordenados por pontos;
- criar formulario com questoes e botoes `Correto`, `Meio-Certo`, `Errado`;
- adicionar campo de observacao curta por aluno, limitado a 500 caracteres;
- salvar rascunho;
- concluir tentativa e calcular nota.

### Etapa 6: Integracao com OT

- exibir nota oral calculada na tela `Lancar notas`;
- preencher automaticamente OT quando estiver vazio;
- adicionar botao `Usar nota oral` quando houver divergencia;
- manter validacao de publicacao atual.

### Etapa 7: Revisoes e arquivamento

- exigir motivo para alterar resultado oral concluido em avaliacao publicada;
- registrar historico;
- garantir modo somente leitura para turmas/avaliacoes arquivadas.

## 12. Decisoes Pendentes Antes de Implementar

1. A nota oral deve sincronizar automaticamente com OT ao concluir a prova ou apenas aparecer como sugestao com botao `Usar nota oral`?

   Recomendacao: sincronizar automaticamente quando OT estiver vazio; exigir confirmacao quando OT ja tiver valor.

2. Questoes devem ter pesos diferentes?

   Recomendacao: nao na primeira versao. Todas as questoes valem o mesmo peso.

3. `Meio-Certo` vale exatamente 0,5?

   Recomendacao: sim.

4. O professor pode aplicar prova oral antes da avaliacao escrita existir?

   Recomendacao: sim, desde que a avaliacao principal exista.

5. A prova oral pode ser alterada depois que algum aluno ja foi avaliado?

   Recomendacao: bloquear alteracao de questoes apos primeira tentativa; permitir duplicar para corrigir em uma nova avaliacao.

6. O resultado oral deve aparecer para o aluno separadamente?

   Recomendacao: nao na primeira versao. O aluno continua vendo OT/WT dentro das avaliacoes publicadas.

7. Ao concluir a oral, o aluno deve virar `Avaliado` automaticamente?

   Recomendacao: nao. Ele so deve virar `Avaliado` quando OT e WT estiverem resolvidos na tela de notas.

## 13. Criterios de Aceite

- professor ve botao `Avaliacao Oral` em cada avaliacao;
- professor cria modelo com N questoes;
- cada questao possui botoes `Correto`, `Meio-Certo`, `Errado`;
- modelo pode ser reutilizado em outra avaliacao/turma do mesmo professor;
- aplicar prova mostra alunos ordenados por pontos decrescentes;
- professor pode salvar uma observacao curta por aluno durante a aplicacao;
- concluir prova calcula nota oral em escala 0 a 10;
- nota oral aparece na tela `Lancar notas` como OT automatico/sugerido;
- professor ainda pode editar OT manualmente;
- avaliacao nao publica enquanto houver pendencias conforme regra atual;
- dados permanecem isolados por professor;
- turmas/avaliacoes arquivadas ficam somente leitura;
- testes passam com `npm test`.

## 14. Recomendacao Final

Implementar a avaliacao oral como modulo proprio, com tabelas especificas para modelos, snapshots, tentativas e respostas.

Nao e recomendado gravar diretamente cada clique de `Correto`, `Meio-Certo` ou `Errado` em `assessment_grades`, porque essa tabela representa a nota oficial final da avaliacao. O resultado oral deve ser calculado em seu proprio modulo e depois alimentar o campo OT de forma controlada.

Esse desenho preserva o comportamento atual de publicacao, reduz risco sobre ranking e permite evoluir a prova oral sem quebrar o fluxo existente de notas.
