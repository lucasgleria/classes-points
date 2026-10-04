# Planejamento da Feature de Avaliações

## Status da implementação em 14 de junho de 2026

As Features 00 a 11 foram implementadas localmente e integradas. A Feature 12 está preparada para liberação controlada, mas o deploy, backup de produção, validação visual final do PDF e ativação de `ACADEMIC_RANKING_ENABLED=true` continuam sendo operações deliberadas de produção.

Validação automatizada atual: `npm test` com 53 testes aprovados.

Principais arquivos implementados:

- `assessment-common.js`: validação, médias, bônus e desempates;
- `db-sqlite.js` e `db-postgres.js`: avaliações, notas, fichas e revisões;
- `routes/professor.js` e `views.js`: fluxo completo do professor;
- `performance-pdf.js`: geração em memória a partir de `Ficha_desempenho.pdf`;
- `test/assessment-store.test.js` e `test/assessment-http.test.js`: persistência, interface, PDF e ranking.

## 1. Objetivo

Adicionar ao sistema o registro de avaliações por turma, permitindo que o professor:

- crie manualmente quantas avaliações forem necessárias para cada turma;
- informe o título e o conteúdo de cada avaliação, por exemplo:
  - título: `Avaliação 1`;
  - conteúdo: `Unidades 0 e 1`;
- registre para cada aluno duas notas:
  - `OT`: Oral Test, ou Teste Oral;
  - `WT`: Written Test, ou Teste Escrito;
- atualize a Ficha de Desempenho de cada aluno no contexto de uma avaliação;
- gere, por meio de um botão na interface, uma cópia atualizada do arquivo `Ficha_desempenho.pdf`;
- publique as notas para que os alunos possam consultá-las;
- faça com que o desempenho acadêmico influencie o placar da turma, sem apagar ou alterar o histórico atual de pontos.

A feature deve funcionar tanto no SQLite quanto no PostgreSQL, mantendo o isolamento atual entre professores, turmas e alunos.

O documento operacional complementar é `relatorio_site_prova.md`. Ele define a avaliação técnica, os riscos, a sequência de pequenas features, os critérios para avançar e os caminhos de reversão.

## 2. Situação Atual do Software

Hoje o placar funciona da seguinte maneira:

- cada aluno pertence a uma turma;
- pontos são registrados como transações nas categorias `homework`, `games`, `challenges`, `presence` e `bad_behavior`;
- o total do aluno é a soma de todas as transações;
- o dashboard apresenta rankings separados por turma, ordenados pelo total de pontos;
- o aluno vê seu total de pontos, os totais por categoria e as penalidades;
- o sistema possui implementações equivalentes para SQLite e PostgreSQL;
- o professor só pode acessar turmas e alunos pertencentes ao seu próprio escopo.

As notas não devem ser inseridas como transações comuns de pontos. Elas possuem regras, histórico e significado diferentes. O sistema deve manter separados:

- **Pontos de participação:** saldo atual das transações já existentes.
- **Desempenho acadêmico:** média calculada a partir das avaliações.
- **Pontuação de ranking:** valor combinado usado apenas para ordenar o placar.

Essa separação evita confundir uma nota corrigida com um ponto ganho ou perdido em aula.

## 3. Princípios da Solução

1. **Cada turma possui suas próprias avaliações.**
   Turmas podem ter quantidades diferentes de avaliações.

2. **A quantidade de avaliações não pode gerar vantagem.**
   O placar deve usar a média das avaliações, e não a soma das notas.

3. **OT e WT têm o mesmo peso inicialmente.**
   A nota de uma avaliação será a média simples entre OT e WT.

4. **Notas em rascunho não influenciam o placar.**
   O professor poderá preencher e revisar todas as notas antes de publicá-las.

5. **O histórico de pontos atual permanece intacto.**
   Nenhuma nota criará, removerá ou modificará uma transação em `point_transactions`.

6. **O placar deve explicar sua composição.**
   Professor e aluno devem conseguir entender quanto veio de pontos e quanto veio das avaliações.

7. **A exclusão de dados acadêmicos deve ser controlada.**
   Avaliações já publicadas devem ser arquivadas, em vez de apagadas sem rastreabilidade.

8. **A Ficha de Desempenho deve representar uma avaliação específica.**
   Como cada aluno poderá ter várias avaliações com notas OT e WT diferentes, uma única ficha global não é suficiente para representar o histórico.

9. **O PDF original deve permanecer imutável.**
   Cada geração deve criar uma nova cópia em memória, preencher os dados selecionados e enviá-la para download, sem substituir o modelo-base.

10. **A avaliação deve congelar sua lista de alunos.**
    A lista oficial da avaliação deve ser criada junto com ela, para que movimentações e novos cadastros não alterem provas antigas.

11. **O ranking combinado deve possuir ativação controlada.**
    Notas, médias e bônus devem ser validados antes de alterar a ordem do placar. Uma configuração deve permitir voltar temporariamente ao ranking somente por pontos.

## 4. Modelo Recomendado para Influência no Placar

### 4.1. Cálculo da nota da avaliação

Considerando notas de `0,00` a `10,00`:

```text
nota_avaliacao = (OT + WT) / 2
```

Exemplo:

```text
OT = 8,00
WT = 6,00
nota_avaliacao = 7,00
```

### 4.2. Cálculo da média acadêmica

Somente avaliações publicadas e marcadas para influenciar o ranking entram no cálculo:

```text
media_academica = soma das notas das avaliações / quantidade de avaliações consideradas
```

Usar a média resolve o problema de turmas com quantidades diferentes de provas. Uma turma com duas avaliações e outra com cinco avaliações continuam usando uma média na escala de 0 a 10.

Quando não existir nenhuma avaliação publicada considerada para o aluno:

- a média acadêmica deve ser exibida como `Sem avaliações publicadas`, e não como nota zero;
- o bônus acadêmico será temporariamente zero;
- o dashboard deve identificar que a pontuação de ranking ainda não possui componente acadêmico.

### 4.3. Conversão da média em bônus acadêmico

Proposta inicial:

```text
bonus_academico = arredondar((media_academica / 10) * BONUS_MAXIMO)
```

Recomendação inicial:

```text
BONUS_MAXIMO = 100 pontos de ranking
```

Assim:

| Média acadêmica | Bônus acadêmico |
| --- | ---: |
| 10,0 | 100 |
| 9,0 | 90 |
| 7,5 | 75 |
| 5,0 | 50 |
| 0,0 | 0 |

### 4.4. Pontuação final usada no ranking

```text
pontuacao_ranking = pontos_de_participacao + bonus_academico
```

Exemplo:

| Aluno | Pontos | Média | Bônus acadêmico | Pontuação de ranking |
| --- | ---: | ---: | ---: | ---: |
| Ana | 120 | 9,0 | 90 | 210 |
| Bruno | 150 | 5,0 | 50 | 200 |

Nesse caso, Ana ultrapassa Bruno porque o desempenho acadêmico compensa a diferença de pontos.

### 4.5. Critérios de desempate

Quando dois alunos possuírem a mesma pontuação de ranking:

1. maior média acadêmica;
2. maior total de pontos de participação;
3. nome em ordem alfabética.

### 4.6. Por que essa fórmula é recomendada para a primeira versão

- preserva o comportamento e o histórico atual de pontos;
- é simples de explicar para professores e alunos;
- evita vantagem para turmas com mais avaliações;
- não exige transformar o sistema inteiro em percentuais;
- permite ajustar o impacto acadêmico alterando apenas o bônus máximo.

### 4.7. Limitação que precisa ser aceita

Os pontos de participação não possuem limite máximo. Por isso, um bônus acadêmico máximo de 100 pontos terá menos influência quando os alunos acumularem centenas ou milhares de pontos.

Antes da implementação, deve ser aprovado um dos caminhos:

- **Recomendado para a primeira versão:** bônus máximo global de 100 pontos.
- **Alternativa:** bônus máximo global maior, por exemplo 200 ou 300 pontos.
- **Evolução futura:** criar períodos de ranking e metas de pontos para permitir uma fórmula percentual, por exemplo 60% participação e 40% avaliações.

Não é recomendado normalizar os pontos usando o aluno com maior pontuação da turma. Nesse modelo, a pontuação de um aluno mudaria quando outro aluno recebesse pontos, tornando o placar difícil de compreender.

## 5. Regras das Avaliações

### 5.1. Cadastro manual por turma

O professor seleciona uma de suas turmas e cria uma avaliação com:

- título obrigatório, por exemplo `Avaliação 1`;
- conteúdo ou descrição obrigatória, por exemplo `Unidades 0 e 1`;
- data da avaliação opcional;
- opção `Influenciar o ranking`, marcada por padrão;
- ordem de exibição;
- situação: `rascunho`, `publicada` ou `arquivada`.

Não haverá quantidade fixa de avaliações por turma.

Na mesma transação que cria a avaliação, o sistema deve criar uma linha `assessment_grades` com situação `pending` para cada aluno atual da turma. Essas linhas formam o retrato oficial dos alunos da avaliação.

Regras do retrato:

- aluno movido para outra turma continua associado à avaliação original;
- aluno cadastrado depois não entra automaticamente em avaliações antigas;
- aluno novo pode ser adicionado manualmente enquanto a avaliação estiver em rascunho;
- a publicação considera somente os alunos pertencentes ao retrato da avaliação;
- falha ao criar qualquer linha do retrato deve desfazer toda a criação da avaliação.

### 5.2. Situações da avaliação

#### Rascunho

- notas podem estar incompletas;
- não aparece para os alunos;
- não influencia o ranking;
- pode ser editada ou apagada se ainda não houver notas relevantes.

#### Publicada

- aparece para os alunos;
- influencia o ranking quando a opção correspondente estiver ativa;
- deve ter uma situação definida para todos os alunos da turma;
- alterações posteriores devem ficar registradas.

#### Arquivada

- permanece no histórico;
- fica somente para consulta;
- deixa de influenciar o ranking;
- não deve ser apagada automaticamente.

### 5.3. Situação da nota de cada aluno

Cada aluno, em cada avaliação, deve estar em uma destas situações:

- `pendente`: ainda não concluída pelo professor;
- `avaliado`: possui OT e WT válidos;
- `ausente`: não realizou a avaliação e conta como nota zero enquanto não houver reposição;
- `isento`: não realizou por motivo aceito e não entra no denominador da média.

Uma avaliação só poderá ser publicada quando não existir aluno com situação `pendente`.

Essa regra evita dois problemas:

- aluno com apenas uma nota alta não fica artificialmente acima de colegas com todas as avaliações preenchidas;
- campos ainda não preenchidos pelo professor não são confundidos com nota zero.

### 5.4. Validação das notas

- OT e WT aceitam valores entre `0,00` e `10,00`;
- a situação `avaliado` exige os dois campos;
- a situação `ausente` não permite OT ou WT e equivale a zero;
- a situação `isento` não permite OT ou WT e não entra na média;
- valores inválidos devem ser rejeitados no servidor, mesmo que o navegador já faça validação;
- a precisão recomendada é de até duas casas decimais.
- a entrada deve aceitar separador decimal com vírgula ou ponto;
- as notas devem ser convertidas e armazenadas em centésimos inteiros, por exemplo `8,50` como `850`.

### 5.5. Avaliações que não influenciam o ranking

O professor poderá publicar uma avaliação apenas para consulta, sem influência no ranking. Isso atende casos como:

- avaliações diagnósticas;
- simulados;
- atividades informativas;
- recuperação que substitui outra nota segundo uma regra ainda não automatizada.

## 6. Experiência do Professor

### 6.1. Nova seção `Avaliações`

Adicionar uma opção `Avaliações` na navegação do professor.

Fluxo principal:

1. professor acessa `Avaliações`;
2. seleciona uma turma;
3. vê avaliações existentes e seus estados;
4. cria uma nova avaliação;
5. abre a grade de lançamento;
6. informa OT e WT para cada aluno;
7. salva como rascunho;
8. revisa o resumo;
9. publica a avaliação.

### 6.2. Tela de avaliações da turma

A tela deve mostrar:

- nome da turma;
- quantidade de alunos;
- avaliações em rascunho, publicadas e arquivadas;
- título e conteúdo;
- data;
- quantidade de notas concluídas;
- indicação se influencia o ranking;
- ações de abrir, editar, publicar e arquivar.

### 6.3. Tela de lançamento de notas

Usar uma tabela ou lista responsiva com uma linha por aluno:

| Aluno | Situação | OT | WT | Média calculada |
| --- | --- | ---: | ---: | ---: |
| Ana | Avaliado | 8,0 | 9,0 | 8,5 |
| Bruno | Pendente |  |  |  |

Requisitos de usabilidade:

- salvar todos os alunos em uma única ação;
- permitir navegação rápida entre campos usando `Tab`;
- calcular e exibir a média da avaliação antes de salvar;
- manter os dados informados se ocorrer erro de validação;
- pedir confirmação antes de publicar;
- mostrar claramente quantos alunos continuam pendentes;
- impedir acesso a alunos de turmas de outro professor.

### 6.4. Dashboard do professor

Cada aluno deve mostrar:

```text
Pontuação de ranking: 210
120 pontos + 90 de bônus acadêmico
Média acadêmica: 9,0
```

O ranking passa a ser ordenado pela pontuação de ranking, não apenas por `total_points`.

O indicador atual de `7 dias` deve continuar representando somente transações de pontos. Na primeira versão, mudanças de notas não entram nesse indicador.

### 6.5. Detalhes do aluno

A página de detalhes deve ganhar uma seção com:

- média acadêmica;
- bônus acadêmico atual;
- avaliações publicadas;
- OT, WT e média por avaliação;
- avaliações ausentes ou isentas;
- avaliações antigas arquivadas.

### 6.6. Ficha de Desempenho vinculada à avaliação

A Ficha de Desempenho atual possui um único perfil por aluno. Com a nova feature, ela deverá ser atualizada para trabalhar no contexto de uma avaliação selecionada.

Fluxo recomendado:

1. professor acessa uma avaliação;
2. escolhe um aluno;
3. informa ou revisa OT e WT;
4. preenche Participação, Compreensão, Tarefas e Comportamento;
5. salva a ficha da avaliação;
6. clica em `Gerar PDF`;
7. o sistema valida os dados, gera uma cópia preenchida e inicia o download.

A tela atual `/students/:id/performance` pode continuar existindo como visão geral e ponto de seleção da avaliação. A edição específica deve usar uma rota que identifique também a avaliação.

Na grade de notas da avaliação, cada aluno também deve possuir uma ação `Ficha`, permitindo abrir diretamente a ficha correspondente.

O botão `Gerar PDF` deve:

- ficar disponível somente para professores autorizados;
- exigir uma avaliação selecionada;
- exigir OT e WT preenchidos;
- exigir os quatro campos de desempenho preenchidos;
- informar claramente quais dados ainda faltam;
- gerar um PDF novo sem modificar o modelo original;
- usar um nome de arquivo seguro, por exemplo:

```text
ficha-desempenho_ana_avaliacao-1_2026-06-14.pdf
```

Para alunos marcados como `ausente`, `isento` ou `pendente`, a recomendação inicial é bloquear a geração até que exista uma nota válida. Caso seja necessário emitir fichas com esses estados, o modelo do PDF deverá definir como representar textos como `Ausente` ou `Isento` nos campos de nota.

## 7. Experiência do Aluno

Na visualização individual, o aluno deverá ver:

- total de pontos de participação;
- média acadêmica;
- bônus acadêmico;
- pontuação usada no ranking;
- lista de avaliações publicadas;
- OT, WT e média de cada avaliação;
- indicação de ausência ou isenção;
- descrição do conteúdo avaliado.

O aluno nunca poderá:

- ver notas de outros alunos;
- ver avaliações em rascunho;
- editar suas notas;
- acessar avaliações de outra turma por alteração manual da URL.

## 8. Modelo de Dados Proposto

### 8.1. Tabela `assessments`

Representa uma avaliação pertencente a uma turma.

| Campo | Tipo sugerido | Regra |
| --- | --- | --- |
| `id` | inteiro | chave primária |
| `class_id` | inteiro | turma proprietária, obrigatório |
| `title` | texto | obrigatório |
| `description` | texto | obrigatório |
| `assessment_date` | data, anulável | data da avaliação |
| `status` | texto | `draft`, `published` ou `archived` |
| `counts_for_ranking` | booleano | padrão verdadeiro |
| `sort_order` | inteiro | ordem de exibição |
| `published_at` | data/hora, anulável | preenchido na publicação |
| `created_at` | data/hora | criação |
| `updated_at` | data/hora | última alteração |

O professor proprietário deve ser obtido por `assessments.class_id -> classes.professor_id`. Não é necessário duplicar `professor_id` na avaliação.

### 8.2. Tabela `assessment_grades`

Representa a nota de um aluno em uma avaliação.

| Campo | Tipo sugerido | Regra |
| --- | --- | --- |
| `assessment_id` | inteiro | avaliação |
| `student_id` | inteiro | aluno |
| `status` | texto | `pending`, `graded`, `absent` ou `exempt` |
| `ot_score` | número anulável | nota oral |
| `wt_score` | número anulável | nota escrita |
| `teacher_note` | texto anulável | observação opcional |
| `created_at` | data/hora | criação |
| `updated_at` | data/hora | última alteração |

Restrições:

- chave única composta por `assessment_id` e `student_id`;
- as linhas iniciais devem ser criadas junto com a avaliação e representam seu retrato de alunos;
- ao adicionar manualmente um aluno depois, ele deve pertencer à turma da avaliação;
- `graded` exige OT e WT;
- `absent`, `exempt` e `pending` não devem possuir OT ou WT.

Para evitar diferenças de arredondamento entre SQLite, PostgreSQL e JavaScript, pode-se armazenar as notas em centésimos inteiros. Exemplo: `8,50` seria armazenado como `850` e convertido pelos métodos do banco.

### 8.3. Histórico de alterações

Recomendação para uma segunda etapa ou para a primeira versão, caso rastreabilidade seja obrigatória:

Tabela `assessment_grade_revisions` com:

- avaliação;
- aluno;
- valores anteriores;
- valores novos;
- professor responsável;
- data/hora;
- motivo da alteração.

Ao editar uma nota já publicada, o sistema deve solicitar uma justificativa e registrar a revisão.

### 8.4. Valores calculados

Os campos abaixo não devem ser gravados como valores permanentes nas tabelas de alunos:

- média acadêmica;
- bônus acadêmico;
- pontuação de ranking.

Eles devem ser calculados a partir das notas e dos pontos atuais. Isso evita inconsistências quando uma avaliação é publicada, arquivada ou corrigida.

### 8.5. Atualização do modelo da Ficha de Desempenho

Hoje a tabela `student_performance_profiles` possui apenas uma linha por aluno. Ela pode continuar existindo como perfil atual ou modelo reutilizável, mas não deve ser a única fonte histórica das fichas geradas.

Adicionar a tabela `assessment_performance_reports`, com uma ficha por aluno e avaliação:

| Campo | Tipo sugerido | Regra |
| --- | --- | --- |
| `assessment_id` | inteiro | avaliação relacionada |
| `student_id` | inteiro | aluno relacionado |
| `participation` | texto | `otimo`, `bom` ou `precisa_melhorar` |
| `grammar_vocabulary` | texto | exibido como Compreensão; `otimo`, `bom` ou `precisa_melhorar` |
| `homework` | texto | `otimo`, `bom` ou `precisa_melhorar` |
| `behavior` | texto | `otimo`, `bom` ou `precisa_melhorar` |
| `comments` | texto anulável | observações internas do professor |
| `updated_by_professor_id` | inteiro | professor que salvou a ficha |
| `created_at` | data/hora | criação |
| `updated_at` | data/hora | última atualização |

Restrições:

- chave única composta por `assessment_id` e `student_id`;
- a avaliação e o aluno devem pertencer à mesma turma no momento da criação da ficha;
- somente o professor proprietário da turma pode criar, editar ou gerar o PDF;
- os valores devem usar o mesmo conjunto atual: `otimo`, `bom` e `precisa_melhorar`.
- a ficha vinculada não deve ser criada automaticamente com todos os campos como `bom`;
- valores inválidos devem ser rejeitados, e não convertidos silenciosamente para `bom`;
- o PDF só pode ser gerado após uma ficha vinculada ter sido explicitamente salva.

Mapeamento entre a implementação atual e o PDF:

| Campo atual do sistema | Campo exibido no PDF |
| --- | --- |
| `participation` | Participação |
| `grammar_vocabulary` | Compreensão |
| `homework` | Tarefas |
| `behavior` | Comportamento |

Para evitar perda de dados, os perfis atuais devem ser preservados. Ao abrir pela primeira vez uma ficha vinculada a uma avaliação, o sistema poderá oferecer os valores do perfil atual como preenchimento inicial. Depois de salva, a ficha da avaliação torna-se um registro próprio e não deve mudar automaticamente quando o perfil atual for editado.

## 9. Ficha de Desempenho e Geração do PDF

### 9.1. Resultado da inspeção do arquivo fornecido

O arquivo `Ficha_desempenho.pdf` foi inspecionado e possui as seguintes características:

- uma página;
- tamanho de página de `612 x 792` pontos;
- foi exportado do Microsoft Word;
- não possui campos de formulário preenchíveis, como `AcroForm`;
- contém valores de exemplo gravados diretamente no conteúdo, incluindo livro, notas, professora e data;
- contém uma tabela com as colunas `Ótimo`, `Bom` e `Precisa melhorar`.

Consequência técnica: não será possível apenas chamar uma função de preenchimento de formulário PDF. O sistema deverá usar o documento como base visual e desenhar os novos valores nas posições corretas.

### 9.2. Estratégia recomendada

Durante a implementação:

1. preservar o PDF recebido como referência;
2. criar um modelo-base limpo, sem os valores de exemplo, mantendo o mesmo layout;
3. armazenar o modelo em um caminho controlado pela aplicação, por exemplo `assets/pdf/Ficha_desempenho.pdf`;
4. carregar o modelo no servidor a cada geração;
5. desenhar textos e os marcadores `X` em coordenadas previamente definidas;
6. gerar o documento em memória;
7. devolver o resultado diretamente na resposta HTTP.

Se for necessário usar o PDF atual sem criar uma versão limpa, o gerador deverá primeiro desenhar retângulos brancos sobre todos os valores de exemplo e somente depois inserir os novos dados. Essa alternativa é mais frágil e deve ser validada visualmente.

Não é recomendado:

- editar ou sobrescrever o arquivo-base;
- gerar o PDF apenas no navegador;
- gravar PDFs temporários no disco da Vercel;
- confiar em texto enviado pelo navegador para identificar professor, aluno, turma ou notas.

### 9.3. Mapeamento de informações para o PDF

| Informação do PDF | Fonte oficial no sistema | Regra |
| --- | --- | --- |
| Livro | `classes.book` da turma da avaliação | usar somente o livro, não o rótulo completo com dia e horário |
| Prova Escrita | `assessment_grades.wt_score` | formatar na escala aprovada |
| Prova Oral | `assessment_grades.ot_score` | formatar na escala aprovada |
| Participação | ficha da avaliação | desenhar um `X` em exatamente uma coluna |
| Compreensão | ficha da avaliação | corresponde hoje a `grammar_vocabulary` |
| Tarefas | ficha da avaliação | corresponde hoje a `homework` |
| Comportamento | ficha da avaliação | corresponde hoje a `behavior` |
| Nome do professor | professor autenticado e proprietário da turma | nunca aceitar o nome diretamente do formulário |
| Data | data atual no momento da geração | usar locale `pt-BR` e fuso horário configurado |

O `X` deve ser desenhado no centro da célula correspondente:

| Valor salvo | Coluna marcada |
| --- | --- |
| `otimo` | Ótimo |
| `bom` | Bom |
| `precisa_melhorar` | Precisa melhorar |

### 9.4. Professor e data

A tabela atual de professores possui `username`, mas não possui um campo separado de nome de exibição. Recomenda-se adicionar `display_name`:

- o PDF usa `display_name`;
- quando não existir, o sistema usa `username` como fallback;
- o professor usado deve ser o professor autenticado;
- a autorização também deve confirmar que a turma pertence a esse professor.

A data deve ser calculada no servidor, sem aceitar um valor enviado pelo formulário.

Como o software é usado no Brasil, recomenda-se:

```text
locale: pt-BR
timezone: America/Sao_Paulo
formato: Guarulhos, 14 de junho de 2026
```

O texto `Guarulhos` já aparece no modelo fornecido. Deve ser confirmado se ele continuará fixo ou se será configurável.

### 9.5. Identificação da ficha

Embora não tenha sido listado entre os campos solicitados, uma ficha por aluno e avaliação precisa identificar claramente:

- nome do aluno;
- título da avaliação;
- conteúdo ou unidades avaliadas.

Sem esses dados, dois PDFs do mesmo aluno ou da mesma turma podem ficar indistinguíveis. A recomendação é incluir essas informações no modelo-base antes da implementação, caso existam áreas apropriadas no layout.

### 9.6. Rota de geração

Rota sugerida:

```text
GET /students/:studentId/assessments/:assessmentId/performance-report.pdf
```

A rota deve:

1. exigir autenticação de professor;
2. validar que a avaliação pertence a uma turma do professor;
3. validar que o aluno pertence ou pertenceu à turma da avaliação;
4. buscar OT e WT diretamente do banco;
5. buscar a ficha vinculada à avaliação;
6. buscar livro e professor diretamente do banco e da sessão;
7. validar que todos os dados obrigatórios estão disponíveis;
8. gerar o PDF em memória;
9. responder com:

```text
Content-Type: application/pdf
Content-Disposition: attachment; filename="ficha-desempenho_....pdf"
Cache-Control: private, no-store
```

O PDF gerado não precisa ser armazenado no banco ou no servidor na primeira versão. A fonte oficial permanece sendo os dados estruturados da avaliação e da ficha.

### 9.7. Biblioteca e organização recomendadas

Adicionar uma biblioteca de manipulação de PDF compatível com Node.js, como `pdf-lib`, e isolar a geração em um módulo próprio, por exemplo:

```text
services/performance-report-pdf.js
```

O módulo deve receber apenas dados já autorizados e normalizados, carregar o modelo e devolver os bytes do PDF. As coordenadas, tamanhos, fontes e cores devem ficar centralizados em uma configuração única, evitando números espalhados pelas rotas.

## 10. Alterações Técnicas Previstas

### 10.1. Camada de banco

Implementar os mesmos métodos em `db-sqlite.js` e `db-postgres.js`:

- criar, editar, listar, publicar e arquivar avaliações;
- obter avaliação por ID;
- salvar notas em lote;
- listar notas por avaliação;
- listar avaliações e notas de um aluno;
- calcular resumo acadêmico do aluno;
- calcular a pontuação de ranking;
- criar, obter e atualizar a Ficha de Desempenho por aluno e avaliação;
- validar vínculo entre avaliação, turma, professor e aluno.

Adicionar mapeadores e normalizadores em `db-common.js`.

Centralizar regras puras de nota e ranking em um módulo compartilhado, por exemplo `assessment-common.js`, para evitar divergências entre SQLite, PostgreSQL, rotas e interface.

Criar uma função compartilhada de contexto e autorização para as rotas de avaliação. Ela deve obter avaliação, turma e professor proprietário em uma única operação lógica, evitando validações incompletas repetidas em cada rota.

As migrações devem ser incrementais com `CREATE TABLE IF NOT EXISTS` e `ALTER TABLE` quando necessário. O deploy não pode depender de reset do banco.

O processo de deploy deve separar testes de qualquer comando destrutivo. `db:reset` deve permanecer exclusivamente como ferramenta local e nunca ser etapa obrigatória de implantação.

### 10.2. Cuidado com agregações SQL

Não se deve juntar diretamente todas as transações de pontos com todas as notas e depois usar `SUM`, pois isso multiplicaria linhas e produziria totais incorretos.

O cálculo do dashboard deve agregar separadamente:

1. total de pontos por aluno;
2. média acadêmica e bônus por aluno;
3. junção final dos dois resumos.

No PostgreSQL, isso pode ser feito com CTEs ou subconsultas agregadas. No SQLite, deve ser aplicada a mesma regra.

### 10.3. Rotas sugeridas

Rotas de páginas:

```text
GET  /assessments
GET  /assessments/:id/grades
GET  /students/:studentId/assessments/:assessmentId/performance
GET  /students/:studentId/assessments/:assessmentId/performance-report.pdf
```

Rotas de ações:

```text
POST /api/classes/:classId/assessments
POST /api/assessments/:id/update
POST /api/assessments/:id/grades
POST /api/assessments/:id/publish
POST /api/assessments/:id/archive
POST /api/assessments/:id/delete
POST /students/:studentId/assessments/:assessmentId/performance
```

Todas as rotas devem validar que a avaliação pertence a uma turma do professor autenticado. IDs enviados pelo formulário nunca devem ser considerados suficientes para autorizar a operação.

### 10.4. Views e frontend

Alterações esperadas:

- `views.js`: novas páginas e seções de avaliação, ficha vinculada e botão de geração;
- `routes/professor.js`: fluxos de cadastro, notas, ficha, publicação e download do PDF;
- `routes/student.js`: inclusão das avaliações publicadas no resumo do aluno;
- `public/app.js`: cálculo visual da média e confirmação de publicação;
- `public/style.css`: tabela/lista de notas responsiva;
- `validation.js`: validação das notas e situações;
- `db-common.js`, `db-sqlite.js` e `db-postgres.js`: persistência e cálculo.
- `config.js`: nome de exibição dos professores, localidade e fuso usados no PDF;
- `assessment-common.js`: normalização, validação e cálculos compartilhados;
- `services/performance-report-pdf.js`: geração centralizada do PDF;
- `assets/pdf/Ficha_desempenho.pdf`: modelo-base imutável.

Configurações recomendadas:

```text
ACADEMIC_RANKING_ENABLED=false
REPORT_TIMEZONE=America/Sao_Paulo
REPORT_CITY=Guarulhos
```

O ranking combinado só deve ser ativado após a validação dos cálculos exibidos.

## 11. Movimentação, Arquivamento e Exclusão

### 11.1. Aluno movido para outra turma

O modelo atual guarda apenas a turma atual do aluno. Para a primeira versão, recomenda-se:

- preservar todas as notas antigas;
- manter cada nota ligada à avaliação da turma original;
- usar a linha existente em `assessment_grades` como evidência de participação no retrato da avaliação;
- deixar notas da turma antiga fora do ranking da nova turma;
- mostrar um aviso antes de mover o aluno;
- permitir que o aluno consulte seu próprio histórico antigo;
- permitir ao professor consultar notas pela avaliação de uma turma que lhe pertence.

Mensagem sugerida:

```text
As notas anteriores serão preservadas, mas não influenciarão o ranking da nova turma.
```

Uma evolução futura pode criar histórico formal de matrículas por turma. Isso será necessário se o sistema precisar calcular médias por período de matrícula ou transferir histórico acadêmico entre professores.

### 11.2. Turma arquivada

- avaliações e notas permanecem preservadas;
- avaliações ficam somente para consulta;
- não entram em rankings ativos.
- as fichas e PDFs continuam acessíveis ao professor proprietário em uma área de histórico.

### 11.3. Exclusão de avaliação

- avaliação em rascunho e sem notas pode ser apagada;
- avaliação publicada deve ser arquivada;
- avaliação com notas não deve ser apagada sem confirmação reforçada e política definida.
- uma turma que possua avaliações não pode ser apagada; deve ser arquivada.

### 11.4. Exclusão de aluno

O fluxo atual apaga o aluno e seu histórico de pontos. Após a feature, ele também deverá apagar ou anonimizar:

- notas de avaliações;
- fichas de desempenho vinculadas às avaliações;
- revisões de notas;
- observações acadêmicas associadas.

Essa política deve ser apresentada claramente na confirmação de exclusão.

## 12. Ranking Entre Turmas Diferentes

O dashboard atual apresenta rankings separados por turma. Esse comportamento deve continuar.

A média evita vantagem causada pela quantidade de avaliações, mas não torna avaliações de turmas diferentes perfeitamente comparáveis, porque:

- provas podem ter dificuldades diferentes;
- professores podem usar critérios diferentes;
- o volume de pontos de participação pode variar por turma.

Por isso, não é recomendado criar um ranking único entre todas as turmas nesta primeira versão. Caso isso seja desejado no futuro, será necessário padronizar períodos, pesos, metas de pontos e critérios de avaliação.

## 13. Testes Necessários

### 13.1. Testes de validação

- rejeitar OT ou WT abaixo de 0 ou acima de 10;
- aceitar notas decimais válidas;
- exigir OT e WT quando a situação for `graded`;
- impedir notas em `absent`, `exempt` ou `pending`;
- impedir publicação com alunos pendentes.
- impedir geração de PDF sem OT, WT ou ficha completa;
- rejeitar valores inválidos da ficha em vez de convertê-los para `bom`;

### 13.2. Testes de cálculo

- calcular corretamente a média de OT e WT;
- calcular corretamente a média acadêmica;
- ignorar avaliações em rascunho ou arquivadas;
- ignorar avaliações publicadas que não influenciam o ranking;
- contar ausência como zero;
- retirar aluno isento do denominador;
- garantir que quantidade diferente de avaliações não gere bônus extra;
- calcular pontuação de ranking e desempates corretamente;
- garantir que o total de pontos existente não seja alterado.

### 13.3. Testes de segurança e escopo

- professor não acessa avaliação de outra professora;
- professor não lança nota em aluno de outra turma;
- aluno não vê nota de outro aluno;
- aluno não vê avaliação em rascunho;
- IDs manipulados no formulário são rejeitados.
- professor não gera ficha de aluno ou avaliação de outra professora;
- nome do professor, livro e notas usados no PDF são obtidos do servidor.

### 13.4. Testes de persistência e migração

- banco antigo abre sem perda de alunos, turmas ou pontos;
- avaliações sobrevivem à reinicialização;
- SQLite e PostgreSQL entregam os mesmos resultados;
- exclusão de aluno trata notas relacionadas;
- movimentação de aluno preserva notas antigas e recalcula o ranking.
- fichas globais existentes são preservadas durante a migração;
- fichas vinculadas permanecem associadas às avaliações corretas.
- criação da avaliação e do retrato de alunos é atômica;
- aluno cadastrado depois não altera avaliação antiga;
- aluno movido permanece na avaliação original;
- deploy e testes não dependem da execução de `db:reset`.

### 13.5. Testes do PDF

- confirmar que o PDF gerado possui uma página e abre corretamente;
- confirmar que o modelo original não é modificado;
- confirmar que livro, WT, OT, professor e data aparecem no resultado;
- confirmar que existe exatamente um `X` por linha da tabela;
- confirmar que nomes e valores longos não ultrapassam as áreas definidas;
- confirmar que acentos em nomes e datas são renderizados corretamente;
- confirmar cabeçalhos HTTP de download e privacidade;
- criar arquivos de referência para revisão visual das coordenadas;
- testar geração concorrente para alunos diferentes sem mistura de dados.

## 14. Plano Final de Implementação Incremental

A implementação deve seguir as features menores abaixo. Cada uma deve possuir testes próprios, manter a linha de base aprovada e ser revisada antes da próxima.

O detalhamento operacional, arquivos afetados, critérios para avançar e caminhos de reversão estão em `relatorio_site_prova.md`.

### Feature 00: Segurança operacional e linha de base

Status: aprovada pelo usuário.

- separar deploy de `db:reset`;
- adicionar configurações de ranking e PDF;
- validar backup, alunos sem turma e IDs dos professores.

### Feature 01: Domínio compartilhado de avaliações

Status: implementada e validada automaticamente.

- validar e normalizar notas;
- aceitar vírgula e ponto;
- armazenar notas em centésimos;
- calcular médias e bônus sem banco ou interface.

### Feature 02: Migração e interface de store

- criar tabelas;
- adicionar `display_name`;
- criar retrato dos alunos atomicamente;
- preservar dados existentes;
- atualizar exclusões e regras de turma.

### Feature 03: Cadastro de avaliações pelo professor

- criar, listar e editar avaliações em rascunho;
- validar escopo;
- confirmar congelamento da lista de alunos.

### Feature 04: Lançamento de OT e WT em rascunho

- salvar notas em lote atomicamente;
- tratar avaliado, ausente, isento e pendente;
- não publicar nem alterar ranking.

### Feature 05: Publicação, arquivamento e leitura do aluno

- publicar somente sem pendências;
- mostrar resultados publicados ao aluno;
- manter rascunhos privados;
- ainda não alterar a ordem do ranking.

### Feature 06: Ficha de Desempenho por avaliação

- preservar perfil global;
- salvar ficha histórica vinculada;
- exigir seleção explícita dos quatro campos.

### Feature 07: Preparação e protótipo do PDF

- aprovar modelo-base limpo;
- implementar gerador isolado;
- validar coordenadas, acentos e textos longos;
- ainda não expor botão ao usuário.

### Feature 08: Botão e download seguro do PDF

- adicionar `Gerar PDF`;
- validar todos os dados no servidor;
- gerar em memória;
- testar autorização e concorrência.

### Feature 09: Resumo acadêmico sem alterar ranking

- exibir média, bônus e composição;
- manter ordenação atual;
- validar cálculos com dados representativos.

### Feature 10: Ativação controlada do ranking combinado

- ordenar pela pontuação combinada;
- aplicar desempates;
- permitir reversão com `ACADEMIC_RANKING_ENABLED=false`.

### Feature 11: Histórico de alterações após publicação

- exigir justificativa;
- registrar correções de notas publicadas;
- manter rastreabilidade.

### Feature 12: Liberação gradual para produção

- validar migração em cópia do banco;
- liberar inicialmente para uma turma;
- monitorar antes da liberação geral.

## 15. Critérios de Aceitação da Feature

1. O professor consegue criar qualquer quantidade de avaliações em uma turma própria.
2. Cada avaliação possui título, descrição e campos OT e WT para cada aluno.
3. O professor consegue salvar notas incompletas como rascunho.
4. O sistema impede publicar uma avaliação com alunos pendentes.
5. O aluno vê somente suas avaliações publicadas.
6. A quantidade de avaliações não gera vantagem direta no placar.
7. A média acadêmica gera um bônus acadêmico conforme a fórmula aprovada.
8. O dashboard mostra pontos, bônus acadêmico e pontuação de ranking separadamente.
9. O ranking é ordenado pela pontuação combinada.
10. O histórico atual de pontos permanece intacto.
11. Professor e aluno não conseguem acessar dados fora de seus escopos.
12. A implementação funciona de forma equivalente no SQLite e PostgreSQL.
13. O professor consegue salvar uma Ficha de Desempenho vinculada a um aluno e uma avaliação.
14. O botão `Gerar PDF` produz uma nova cópia baseada no modelo fornecido.
15. O PDF usa o livro da turma, WT, OT, professor autenticado e data atual.
16. Participação, Compreensão, Tarefas e Comportamento possuem exatamente um `X` na coluna selecionada.
17. O modelo original `Ficha_desempenho.pdf` nunca é alterado por uma geração.
18. O sistema impede a geração quando faltam dados obrigatórios ou quando o professor não possui autorização.

## 16. Decisões Pendentes para Aprovação

As seguintes definições precisam ser aprovadas antes da implementação:

1. **Escala de notas:** usar `0,00` a `10,00`.
   Recomendação: aprovar.

2. **Peso de OT e WT:** cada um vale 50% da avaliação.
   Recomendação: aprovar para a primeira versão.

3. **Bônus acadêmico máximo:** média 10 gera 100 pontos de ranking.
   Recomendação: começar com 100, revisar após observar o volume real de pontos.

4. **Ausência:** aluno ausente conta como zero até uma reposição.
   Recomendação: aprovar, mantendo também a opção `isento`.

5. **Publicação:** avaliação só influencia o ranking após publicação e sem alunos pendentes.
   Recomendação: aprovar.

6. **Recuperação:** inicialmente será cadastrada como nova avaliação ou tratada manualmente.
   Recomendação: deixar substituição automática de nota fora da primeira versão.

7. **Alteração após publicação:** exigir justificativa e guardar histórico.
   Recomendação: implementar o histórico de revisões se as notas tiverem uso oficial.

8. **Movimentação de aluno:** notas antigas são preservadas, mas não influenciam a nova turma.
   Recomendação: aprovar para a primeira versão.

9. **Ranking geral entre turmas:** continuar exibindo rankings separados por turma.
   Recomendação: aprovar.

10. **Vínculo da ficha:** criar uma Ficha de Desempenho por aluno e avaliação, preservando o perfil global atual como preenchimento inicial.
    Recomendação: aprovar para manter histórico consistente.

11. **Identificação no PDF:** adicionar nome do aluno, título e conteúdo da avaliação.
    Recomendação: aprovar, pois várias fichas sem identificação clara serão difíceis de distinguir.

12. **Modelo PDF:** criar uma cópia-base limpa a partir do arquivo fornecido, sem os valores de exemplo.
    Recomendação: aprovar; cobrir valores hardcoded a cada geração é mais frágil.

13. **Ausente, isento ou pendente:** bloquear a geração do PDF até existirem OT e WT válidos.
    Recomendação: aprovar para a primeira versão.

14. **Nome do professor:** adicionar `display_name`, usando `username` como fallback.
    Recomendação: aprovar.

15. **Data do PDF:** usar a data da geração no fuso `America/Sao_Paulo`.
    Recomendação: aprovar.

16. **Localidade da data:** manter `Guarulhos` fixo ou torná-lo configurável.
    Recomendação: tornar configurável, com `Guarulhos` como padrão.

17. **Acesso ao PDF:** permitir geração somente pelo professor, sem disponibilizar download ao aluno na primeira versão.
    Recomendação: aprovar inicialmente e revisar após validar o documento.

18. **Estado da avaliação para gerar o PDF:** permitir somente após a publicação ou também quando a avaliação completa ainda estiver em rascunho.
    Recomendação: permitir geração pelo professor quando notas e ficha estiverem completas, mesmo antes da publicação, para possibilitar revisão.

19. **Retrato dos alunos:** criar automaticamente uma linha pendente para cada aluno atual da turma ao criar a avaliação.
    Recomendação: aprovar; essa regra é necessária para preservar avaliações após movimentações e novos cadastros.

20. **Ativação do ranking:** implementar e validar o resumo acadêmico antes de alterar a ordenação, usando configuração para ativar ou reverter o ranking combinado.
    Recomendação: aprovar.

21. **Deploy:** remover `db:reset` do fluxo obrigatório de deploy antes das migrações da feature.
    Recomendação: aprovar.

## 17. Recomendação Final

Implementar primeiro a separação entre `pontos`, `bônus acadêmico` e `pontuação de ranking`, usando avaliações publicadas e média acadêmica na escala de 0 a 10.

A fórmula recomendada para a primeira versão é:

```text
nota_avaliacao = (OT + WT) / 2
media_academica = média das avaliações publicadas consideradas
bonus_academico = arredondar((media_academica / 10) * 100)
pontuacao_ranking = pontos_de_participacao + bonus_academico
```

Essa abordagem entrega influência real das notas no placar, mantém o sistema compreensível e reduz o risco de quebrar o modelo de pontos já utilizado.

Em conjunto, a Ficha de Desempenho deve deixar de ser apenas um perfil global mutável e passar a registrar um retrato por avaliação. O PDF deve ser gerado no servidor a partir desses dados estruturados, mantendo o arquivo-base imutável e garantindo que notas, marcações, professor e data correspondam ao contexto selecionado.

A implementação foi concluída localmente após a aprovação deste documento e de `relatorio_site_prova.md`. Antes da produção, resta executar a liberação gradual, validar visualmente uma ficha PDF real e decidir quando ativar o ranking combinado.
