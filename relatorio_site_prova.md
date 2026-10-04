# Relatório de Avaliação e Plano de Implementação: Provas, Ranking e Ficha PDF

Data da avaliação: 14 de junho de 2026

Status: Features 00 a 11 implementadas e validadas localmente; Feature 12 preparada e pendente de execução em produção.

## Status de execução

| Feature | Status | Validação |
| --- | --- | --- |
| Feature 00: Segurança operacional e linha de base | Implementada | Deploy não executa mais reset; configurações de ranking e PDF disponíveis |
| Features 01 a 06: domínio, persistência e fluxos | Implementadas | Testes de domínio, store, escopo, lançamento, publicação e ficha |
| Features 07 e 08: PDF | Implementadas | Gerador puro, original imutável, download privado em memória; validação visual final recomendada antes do deploy |
| Features 09 e 10: resumo e ranking | Implementadas | Ranking combinado reversível por `ACADEMIC_RANKING_ENABLED` |
| Feature 11: revisões | Implementada | Alteração publicada exige motivo e gera histórico |
| Feature 12: liberação gradual | Preparada, não executada | Requer backup, validação em cópia e ativação controlada em produção |

Validação automatizada consolidada: `npm test` com 53 testes aprovados em 14 de junho de 2026.

## 1. Objetivo deste relatório

Este documento avalia como integrar ao sistema atual:

- avaliações criadas manualmente por turma;
- notas OT e WT por aluno;
- publicação de resultados;
- influência das notas no ranking;
- Ficha de Desempenho vinculada à avaliação;
- geração do arquivo `Ficha_desempenho.pdf` preenchido.

O objetivo foi executar a implementação em entregas pequenas, testáveis e reversíveis. As alterações funcionais descritas neste relatório foram implementadas localmente; a liberação em produção permanece controlada pela Feature 12.

## 2. Linha de base validada

### 2.1. Stack atual

- Node.js com Express;
- HTML, CSS e JavaScript sem framework frontend;
- persistência com SQLite em desenvolvimento e PostgreSQL/Neon em produção;
- autenticação por cookie assinado;
- deploy preparado para Vercel;
- testes com `node:test`, `supertest` e `fast-check`.

### 2.2. Organização atual relevante

- `routes/professor.js`: páginas e ações do professor;
- `routes/student.js`: acesso individual do aluno;
- `views.js`: renderização HTML;
- `db-sqlite.js`: implementação SQLite;
- `db-postgres.js`: implementação PostgreSQL;
- `db-common.js`: mapeadores e normalizações compartilhadas;
- `validation.js`: validação de pontos;
- `test/app.test.js`: testes de propriedades e integração.

As rotas usam `await` ao chamar o store. Isso permite manter a implementação SQLite síncrona e a implementação PostgreSQL assíncrona sob a mesma interface.

### 2.3. Validação executada

Comando:

```text
npm test
```

Resultado:

```text
28 testes executados
28 testes aprovados
0 falhas
```

Essa linha de base deve continuar passando após cada feature menor.

## 3. Avaliação de compatibilidade

### 3.1. Compatibilidade com turmas e professores

Status: compatível, com validação obrigatória de escopo.

Cada turma já possui `professor_id`. As avaliações podem pertencer à turma por `class_id`, sem duplicar o professor. Toda rota de avaliação deve confirmar:

```text
assessment.class_id -> classes.professor_id == professor autenticado
```

O sistema não deve confiar apenas em IDs enviados pelo formulário.

### 3.2. Compatibilidade com alunos movidos entre turmas

Status: exige congelamento da lista de alunos da avaliação.

O modelo atual guarda somente a turma atual em `students.class_id`. Se a avaliação consultar sempre os alunos atuais da turma, surgem problemas:

- aluno movido desaparece de uma avaliação antiga;
- aluno cadastrado depois passa a aparecer como pendente em uma avaliação anterior;
- não é possível comprovar que um aluno pertenceu à turma da avaliação;
- uma prova antiga pode ficar impossível de publicar.

Decisão técnica recomendada:

- ao criar a avaliação, criar uma linha `assessment_grades` com status `pending` para cada aluno atual da turma;
- essas linhas funcionam também como retrato da lista de alunos da avaliação;
- aluno movido mantém suas notas e ficha da turma original;
- aluno novo não entra automaticamente em avaliações antigas;
- professor pode adicionar manualmente um aluno a uma avaliação em rascunho, quando necessário.

### 3.3. Compatibilidade com pontos e ranking

Status: compatível se os cálculos forem separados.

Notas não devem gerar registros em `point_transactions`. O sistema deve manter:

- pontos de participação;
- média acadêmica;
- bônus acadêmico;
- pontuação combinada de ranking.

As agregações de pontos e notas devem ocorrer em subconsultas separadas. Juntar transações e notas antes de somar multiplicaria linhas e produziria totais incorretos.

### 3.4. Compatibilidade com a Ficha de Desempenho atual

Status: compatível, mas o modelo atual não guarda histórico por avaliação.

Hoje existe apenas uma linha em `student_performance_profiles` por aluno. Ela deve continuar existindo para preservar dados atuais e funcionar como sugestão inicial.

Para registrar um retrato consistente de cada prova, será necessária uma nova tabela:

```text
assessment_performance_reports
```

Depois de salva, a ficha vinculada à avaliação não deve mudar quando o perfil global do aluno for alterado.

### 3.5. Compatibilidade com o PDF fornecido

Status: possível, com preparação obrigatória do modelo.

O arquivo `Ficha_desempenho.pdf` foi inspecionado:

- possui uma página;
- possui tamanho de `612 x 792` pontos;
- foi exportado do Microsoft Word;
- não possui campos preenchíveis `AcroForm`;
- contém valores de exemplo gravados diretamente;
- contém a tabela de avaliação com colunas `Ótimo`, `Bom` e `Precisa melhorar`.

Consequência:

- não é possível preencher campos nomeados;
- será necessário desenhar textos e marcações em coordenadas;
- o arquivo-base nunca deve ser alterado durante uma geração;
- recomenda-se preparar uma cópia-base limpa e aprovada antes de integrar o gerador.

### 3.6. Compatibilidade com produção e deploy

Status: compatível, com ajuste recomendado no processo.

O banco já usa criação e migração incremental na inicialização. As novas tabelas devem seguir o mesmo padrão.

Ressalva:

```text
predeploy:vercel = npm run db:reset && npm test
```

O `db:reset` atual força SQLite local e não apaga o PostgreSQL de produção. Mesmo assim, misturar reset com deploy é um risco operacional e dificulta um processo de migração confiável.

Recomendação antes de liberar a feature:

- separar `test` de qualquer comando destrutivo;
- criar um comando de validação de migração sem apagar dados;
- nunca executar `db:reset` como parte obrigatória de um deploy;
- validar a migração em uma cópia do banco real.

## 4. Riscos identificados

### Risco alto: lista de alunos dinâmica

Sem retrato da turma por avaliação, movimentações e novos cadastros alteram provas antigas.

Mitigação:

- inicializar `assessment_grades` na criação da avaliação;
- usar essas linhas como lista oficial da avaliação.

### Risco alto: alteração imediata do ranking

Modificar ordenação e cálculo do dashboard junto com o cadastro de provas aumenta o impacto e dificulta identificar falhas.

Mitigação:

- implementar notas primeiro;
- exibir média e bônus sem alterar a ordem;
- ativar o ranking combinado em uma feature separada;
- usar configuração para permitir retorno temporário ao ranking somente por pontos.

### Risco alto: perda de dados em exclusões

O fluxo atual apaga manualmente perfil e pontos ao excluir aluno. Novas tabelas exigirão tratamento explícito.

Mitigação:

- atualizar exclusão dentro da mesma transação;
- impedir exclusão de turma com avaliações;
- preferir arquivamento para avaliações publicadas.

### Risco médio: divergência SQLite/PostgreSQL

Toda regra será implementada duas vezes.

Mitigação:

- definir uma interface de store idêntica;
- centralizar normalização e cálculo puro em módulos compartilhados;
- executar os mesmos testes de contrato contra os dois stores quando houver ambiente PostgreSQL de teste.

### Risco médio: notas decimais

JavaScript e bancos podem produzir diferenças de arredondamento. Além disso, usuários brasileiros podem digitar `8,5` ou `8.5`.

Mitigação:

- aceitar vírgula e ponto na validação;
- converter para centésimos inteiros;
- armazenar `850` para representar `8,50`;
- centralizar formatação e cálculo.

### Risco médio: modelo PDF sem campos

Desenhar sobre valores existentes pode deixar artefatos ou desalinhamentos.

Mitigação:

- preparar modelo-base limpo;
- centralizar coordenadas;
- criar arquivos de referência visual;
- validar textos longos e acentos.

### Risco médio: `views.js` concentrado

O arquivo já concentra muitas páginas e possui definições antigas duplicadas de algumas views. Adicionar todas as telas em um único bloco aumenta risco de regressão.

Mitigação:

- evitar refatoração ampla durante as primeiras features;
- adicionar funções claramente nomeadas;
- em uma entrega isolada posterior, remover definições mortas após cobertura de testes.

### Risco médio: professor sem nome de exibição

Hoje existe apenas `username`, que pode não ser o texto desejado no PDF.

Mitigação:

- adicionar `display_name` preservando `username`;
- usar `username` como fallback;
- manter IDs de professores estáveis.

### Risco baixo: geração concorrente de PDFs

Se o gerador usar arquivos temporários compartilhados, PDFs de alunos diferentes podem se misturar.

Mitigação:

- gerar exclusivamente em memória;
- nunca reutilizar buffer mutável;
- não gravar arquivo temporário na Vercel.

## 5. Arquitetura recomendada

### 5.1. Novos módulos compartilhados

```text
assessment-common.js
services/performance-report-pdf.js
```

Responsabilidades de `assessment-common.js`:

- normalizar notas;
- converter nota para centésimos;
- formatar centésimos;
- validar situação da nota;
- calcular nota da avaliação;
- calcular média acadêmica;
- calcular bônus e pontuação combinada.

Responsabilidades de `services/performance-report-pdf.js`:

- carregar modelo-base;
- desenhar textos e marcações;
- ajustar texto aos limites;
- devolver bytes do PDF;
- não consultar banco e não autorizar usuário.

### 5.2. Novas tabelas principais

```text
assessments
assessment_grades
assessment_performance_reports
```

Tabela opcional para etapa posterior:

```text
assessment_grade_revisions
```

### 5.3. Fonte oficial dos dados

| Informação | Fonte oficial |
| --- | --- |
| Livro | `classes.book` |
| Professor | professor autenticado e `professors.display_name` |
| OT e WT | `assessment_grades` |
| Situação da nota | `assessment_grades.status` |
| Campos com X | `assessment_performance_reports` |
| Data do PDF | relógio do servidor |
| Pontos | `point_transactions` |
| Ranking | cálculo combinado, quando ativado |

## 6. Plano de implementação em features menores

Cada feature abaixo deve:

- possuir testes próprios;
- manter os 28 testes atuais passando;
- ser revisada antes da próxima;
- não depender de dados preenchidos manualmente no banco;
- possuir um caminho claro de reversão.

### Feature 00: Segurança operacional e linha de base

Status de execução: aprovada pelo usuário.

Objetivo:

- preparar o processo para mudanças sem alterar comportamento funcional.

Implementação:

- registrar a linha de base de testes;
- separar o reset local do comando de deploy;
- criar configuração inicial:
  - `ACADEMIC_RANKING_ENABLED=false`;
  - `REPORT_TIMEZONE=America/Sao_Paulo`;
  - `REPORT_CITY=Guarulhos`;
- documentar backup e validação de migração;
- verificar alunos sem turma e IDs de professores.

Arquivos prováveis:

- `package.json`;
- `config.js`;
- `DEPLOY_VERCEL.md`;
- testes de configuração.

Critério para avançar:

- deploy/testes não dependem de reset;
- 28/28 testes atuais passam.

Reversão:

- remover somente as novas configurações e restaurar scripts anteriores.

### Feature 01: Domínio compartilhado de avaliações

Status de execução: implementada e validada automaticamente em 14 de junho de 2026.

Objetivo:

- implementar regras puras, sem banco e sem interface.

Implementação:

- criar normalização de notas com vírgula e ponto;
- armazenar conceito de nota em centésimos;
- validar `pending`, `graded`, `absent` e `exempt`;
- calcular média OT/WT;
- calcular média acadêmica e bônus;
- definir regras de arredondamento.

Arquivos prováveis:

- novo `assessment-common.js`;
- `test/assessment-common.test.js`.

Critério para avançar:

- propriedades de cálculo e validação aprovadas;
- nenhuma alteração no sistema atual.

Reversão:

- remover módulo e testes novos.

### Feature 02: Migração e interface de store

Objetivo:

- criar persistência vazia, sem expor telas.

Implementação:

- adicionar `display_name` aos professores;
- criar `assessments`;
- criar `assessment_grades`;
- criar `assessment_performance_reports`;
- adicionar mapeadores;
- definir métodos equivalentes no SQLite e PostgreSQL;
- impedir exclusão de turma que possua avaliações;
- atualizar exclusão de aluno para tratar dados acadêmicos.

Regra crítica:

- criar avaliação e retrato dos alunos em uma única transação.

Arquivos prováveis:

- `db-common.js`;
- `db-sqlite.js`;
- `db-postgres.js`;
- `config.js`;
- testes de persistência e migração.

Critério para avançar:

- banco antigo abre sem perda;
- avaliação vazia pode ser criada pelo store;
- retrato dos alunos é preservado após movimentação;
- SQLite e PostgreSQL possuem a mesma interface.

Reversão:

- desativar o uso das novas tabelas; não apagar tabelas em produção.

### Feature 03: Cadastro de avaliações pelo professor

Objetivo:

- permitir criar, listar e editar avaliações em rascunho.

Implementação:

- adicionar item `Avaliações` à navegação;
- selecionar turma;
- criar avaliação com título, conteúdo, data e opção de ranking;
- listar avaliações por estado;
- editar ou apagar rascunho sem notas;
- validar escopo do professor.

Arquivos prováveis:

- `routes/professor.js`;
- `views.js`;
- `public/style.css`;
- testes de rotas e segurança.

Critério para avançar:

- professor cria avaliação somente em turma própria;
- avaliação cria retrato dos alunos atuais;
- aluno novo não entra automaticamente na avaliação antiga.

Reversão:

- remover links e rotas; dados criados permanecem preservados.

### Feature 04: Lançamento de OT e WT em rascunho

Objetivo:

- permitir preencher notas sem publicar ou alterar ranking.

Implementação:

- criar grade responsiva de alunos;
- salvar notas em lote atomicamente;
- permitir status pendente, avaliado, ausente e isento;
- calcular média visual;
- validar notas no servidor;
- permitir adicionar manualmente aluno a avaliação em rascunho;
- impedir registros de alunos fora do escopo.

Arquivos prováveis:

- `routes/professor.js`;
- `views.js`;
- `public/app.js`;
- `public/style.css`;
- stores;
- testes de validação, atomicidade e escopo.

Critério para avançar:

- salvar lote completo ou não salvar nenhuma linha;
- movimentação de aluno não remove nota;
- ranking e visão do aluno permanecem inalterados.

Reversão:

- esconder rota e tela; manter rascunhos armazenados.

### Feature 05: Publicação, arquivamento e leitura do aluno

Objetivo:

- publicar avaliações completas e exibir resultados ao aluno.

Implementação:

- bloquear publicação com pendências;
- publicar avaliação;
- arquivar sem apagar;
- impedir edição silenciosa de publicada;
- incluir avaliações publicadas no resumo do aluno;
- mostrar OT, WT, média, situação e conteúdo;
- manter rascunhos invisíveis ao aluno.

Arquivos prováveis:

- stores;
- `routes/professor.js`;
- `routes/student.js`;
- `views.js`;
- testes de publicação e privacidade.

Critério para avançar:

- aluno vê apenas os próprios resultados publicados;
- avaliações publicadas ainda não alteram a ordem do ranking.

Reversão:

- desabilitar exibição do aluno; dados publicados permanecem.

### Feature 06: Ficha de Desempenho por avaliação

Objetivo:

- registrar a ficha associada a uma prova, ainda sem PDF.

Implementação:

- manter perfil global atual;
- criar ficha vinculada a aluno e avaliação;
- usar perfil global apenas como sugestão inicial;
- exigir seleção explícita nos quatro campos;
- rejeitar valores inválidos em vez de converter para `bom`;
- disponibilizar ação `Ficha` na avaliação.

Arquivos prováveis:

- stores;
- `db-common.js`;
- `routes/professor.js`;
- `views.js`;
- testes de histórico e autorização.

Critério para avançar:

- edição do perfil global não modifica ficha já salva;
- professor de outra turma não acessa a ficha;
- ficha acompanha avaliação mesmo após movimentação do aluno.

Reversão:

- esconder tela vinculada e manter o perfil global atual funcionando.

### Feature 07: Preparação e protótipo do PDF

Objetivo:

- validar tecnicamente o modelo antes de expor download.

Implementação:

- aprovar modelo-base limpo;
- definir posições de livro, notas, professor, data e marcadores;
- decidir inclusão de aluno, título e conteúdo;
- adicionar biblioteca de PDF;
- implementar gerador puro;
- produzir PDFs de referência com dados fixos;
- validar visualmente acentos, textos longos e marcações.

Arquivos prováveis:

- `assets/pdf/Ficha_desempenho.pdf`;
- `services/performance-report-pdf.js`;
- `package.json`;
- testes do gerador;
- arquivos de referência de teste fora do deploy.

Critério para avançar:

- modelo aprovado visualmente;
- PDF original permanece inalterado;
- todos os campos aparecem corretamente.

Reversão:

- remover módulo e dependência; nenhuma rota do usuário depende dele.

### Feature 08: Botão e download seguro do PDF

Objetivo:

- disponibilizar geração para o professor.

Implementação:

- adicionar botão `Gerar PDF`;
- validar avaliação, aluno, nota e ficha;
- obter todos os dados no servidor;
- gerar exclusivamente em memória;
- devolver cabeçalhos privados de download;
- permitir geração de rascunho completo para revisão;
- bloquear ausente, isento e pendente inicialmente.

Arquivos prováveis:

- `routes/professor.js`;
- `views.js`;
- serviço de PDF;
- testes HTTP, autorização e concorrência.

Critério para avançar:

- download correto para professor autorizado;
- tentativa fora do escopo falha;
- geração concorrente não mistura dados.

Reversão:

- remover botão e rota; fichas e notas permanecem.

### Feature 09: Resumo acadêmico sem alterar o ranking

Objetivo:

- apresentar cálculos acadêmicos antes de mudar a classificação.

Implementação:

- calcular média e bônus de avaliações publicadas;
- mostrar composição nos detalhes do aluno e dashboard;
- manter ordenação atual por pontos;
- comparar resultados SQLite e PostgreSQL;
- validar turmas com quantidades diferentes de provas.

Arquivos prováveis:

- stores;
- `db-common.js` ou `assessment-common.js`;
- `views.js`;
- testes de cálculo e agregação.

Critério para avançar:

- valores exibidos são auditáveis;
- nenhum total de pontos existente muda;
- ordenação atual permanece igual.

Reversão:

- ocultar os novos campos de resumo.

### Feature 10: Ativação controlada do ranking combinado

Objetivo:

- ordenar o placar pela pontuação combinada.

Implementação:

- aplicar bônus máximo aprovado;
- ordenar por pontuação combinada;
- aplicar desempates;
- manter indicador de 7 dias baseado apenas em pontos;
- controlar comportamento com `ACADEMIC_RANKING_ENABLED`;
- exibir composição no placar.

Critério para avançar:

- cálculos aprovados com dados reais de teste;
- desligar configuração restaura ranking somente por pontos;
- nenhuma transação de pontos é alterada.

Reversão:

- definir `ACADEMIC_RANKING_ENABLED=false`.

### Feature 11: Histórico de alterações após publicação

Objetivo:

- permitir correções rastreáveis.

Implementação:

- criar `assessment_grade_revisions`;
- exigir justificativa para alterar nota publicada;
- registrar valor anterior, novo valor, professor e data;
- recalcular resumo e ranking;
- permitir consulta do histórico pelo professor.

Critério para avançar:

- toda correção publicada é auditável;
- aluno vê o valor atual, sem acesso a dados de outros alunos.

Reversão:

- bloquear novas edições de avaliações publicadas.

### Feature 12: Liberação gradual para produção

Objetivo:

- disponibilizar a feature com risco controlado.

Implementação:

- fazer backup;
- validar migração em cópia do banco;
- verificar alunos sem turma;
- confirmar IDs e nomes de professores;
- liberar inicialmente para uma turma;
- validar PDF, notas e ranking;
- ativar para as demais turmas;
- monitorar erros.

Critério de conclusão:

- dados atuais preservados;
- testes completos aprovados;
- fluxo validado por professor;
- ranking combinado ativado somente após aprovação final.

Reversão:

- desativar navegação e ranking combinado;
- manter dados acadêmicos armazenados para correção posterior.

## 7. Dependências entre features

```text
Feature 00
  -> Feature 01
  -> Feature 02
  -> Feature 03
  -> Feature 04
  -> Feature 05
  -> Feature 06
  -> Feature 07
  -> Feature 08
  -> Feature 09
  -> Feature 10
  -> Feature 11
  -> Feature 12
```

As Features 06 a 08 podem ser adiadas sem impedir cadastro, lançamento e publicação de notas.

A Feature 10 não deve ser iniciada antes da Feature 09 ser validada com dados reais de teste.

A Feature 11 pode ser adiada se a primeira versão bloquear completamente a edição após publicação.

## 8. Estratégia de testes por entrega

Após cada feature:

1. executar testes unitários novos;
2. executar `npm test`;
3. validar migração de banco antigo;
4. validar isolamento entre professores;
5. testar manualmente o fluxo alterado;
6. registrar o resultado antes de avançar.

Testes de maior prioridade:

- preservação dos pontos atuais;
- congelamento da lista de alunos;
- isolamento entre professores;
- invisibilidade de rascunhos para alunos;
- atomicidade do lançamento em lote;
- cálculo acadêmico sem duplicação de pontos;
- geração correta do PDF;
- reversão do ranking por configuração.

## 9. Decisões necessárias antes da implementação

As decisões funcionais completas estão em `feature_avaliacao.md`. As decisões que bloqueiam o início ou uma etapa específica são:

### Bloqueiam Feature 01

- escala de notas de 0 a 10;
- peso de 50% para OT e 50% para WT;
- ausência conta como zero;
- isento não entra na média;
- bônus máximo recomendado de 100.

### Bloqueiam Feature 02

- aprovação do retrato dos alunos na criação da avaliação;
- preservação do perfil global atual;
- política de exclusão de aluno e turma.

### Bloqueiam Feature 05

- publicação somente sem pendências;
- política de edição após publicação.

### Bloqueiam Feature 07

- modelo-base limpo;
- inclusão de nome do aluno, título e conteúdo no PDF;
- nome de exibição dos professores;
- cidade e formato da data.

### Bloqueiam Feature 10

- aprovação definitiva da fórmula;
- validação dos resultados com dados representativos;
- autorização para ativar o ranking combinado.

## 10. Recomendação final da avaliação

A implementação é viável na arquitetura atual, mas não deve ser entregue como uma única alteração.

A sequência recomendada é:

1. estabilizar deploy e configurações;
2. criar domínio e persistência;
3. cadastrar avaliações;
4. lançar e publicar notas;
5. criar ficha por avaliação;
6. validar e disponibilizar PDF;
7. exibir cálculos acadêmicos;
8. ativar o ranking combinado por configuração;
9. adicionar histórico de revisões;
10. liberar gradualmente em produção.

O principal mecanismo de redução de risco será manter as novas capacidades inicialmente invisíveis ou sem efeito no ranking, liberando cada comportamento somente após seus dados, testes e permissões estarem validados.
