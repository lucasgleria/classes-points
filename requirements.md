# Documento de Requisitos

## Introdução

Sistema web MVP para controle de pontos de alunos em aulas de inglês. O professor pode gerenciar alunos e seus pontos por diferentes categorias (Homework, Games, Challenges, Presence, Bad Behavior). Cada aluno possui acesso individual via URL única com login/senha, onde visualiza apenas seus próprios pontos e justificativas. O professor acessa o painel principal com visão geral de todos os alunos ordenados por pontuação.

## Glossário

- **Sistema**: A aplicação web de controle de pontos
- **Professor**: Usuário administrador com acesso ao painel principal e gerenciamento de alunos e pontos
- **Aluno**: Usuário com acesso restrito à sua própria visualização de pontos
- **Painel Principal (Dashboard)**: Tela inicial do professor com ranking de todos os alunos por pontuação total
- **Visualização do Aluno**: Tela individual do aluno com seus pontos por categoria e histórico de penalidades
- **Categoria de Ponto**: Tipo de evento que gera ganho ou perda de pontos (Homework, Games, Challenges, Presence, Bad Behavior)
- **Histórico**: Registro cronológico de todas as transações de pontos de um aluno
- **URL Única**: Endereço web exclusivo gerado para cada aluno acessar sua visualização individual
- **Justificativa**: Texto explicativo do professor associado a uma penalidade de Bad Behavior
- **SQLite**: Banco de dados relacional leve utilizado no servidor
- **Token de Aluno**: Identificador único na URL do aluno que diferencia seu acesso

## Requisitos

### Requisito 1

**User Story:** Como professor, quero fazer login no painel principal, para que eu possa acessar o sistema de forma segura.

#### Critérios de Aceitação

1. WHEN o professor acessa a URL principal e submete credenciais válidas, THE Sistema SHALL autenticar o professor e redirecionar para o dashboard
2. IF o professor submete credenciais inválidas, THEN THE Sistema SHALL exibir mensagem de erro e manter o usuário na tela de login
3. WHILE o professor está autenticado, THE Sistema SHALL manter a sessão ativa durante a navegação entre telas
4. WHEN o professor faz logout, THE Sistema SHALL encerrar a sessão e redirecionar para a tela de login

---

### Requisito 2

**User Story:** Como professor, quero visualizar um dashboard com todos os alunos ordenados por pontuação, para que eu possa acompanhar o desempenho geral da turma rapidamente.

#### Critérios de Aceitação

1. WHEN o professor acessa o dashboard, THE Sistema SHALL exibir todos os alunos cadastrados ordenados por pontuação total em ordem decrescente
2. WHEN o dashboard é carregado, THE Sistema SHALL exibir o nome e a pontuação total de cada aluno
3. WHEN não há alunos cadastrados, THE Sistema SHALL exibir uma mensagem indicando que nenhum aluno foi adicionado
4. WHEN a pontuação de um aluno é atualizada, THE Sistema SHALL refletir a nova ordenação no dashboard

---

### Requisito 3

**User Story:** Como professor, quero adicionar novos alunos ao sistema, para que eu possa registrar e acompanhar seus pontos.

#### Critérios de Aceitação

1. WHEN o professor submete um formulário com nome válido de aluno, THE Sistema SHALL criar o aluno com pontuação inicial zero e gerar uma URL única e credenciais de acesso para ele
2. IF o professor tenta cadastrar um aluno com nome vazio, THEN THE Sistema SHALL rejeitar o cadastro e exibir mensagem de erro
3. WHEN um aluno é criado com sucesso, THE Sistema SHALL exibir as credenciais geradas (login, senha e URL única) para que o professor possa repassá-las ao aluno
4. WHEN um aluno é criado, THE Sistema SHALL persistir os dados no banco de dados SQLite imediatamente

---

### Requisito 4

**User Story:** Como professor, quero adicionar pontos a um aluno existente por diferentes categorias, para que eu possa registrar o desempenho de forma rápida durante a aula.

#### Critérios de Aceitação

1. WHEN o professor seleciona um aluno e escolhe a categoria Homework, THE Sistema SHALL permitir registrar +1 ponto (feita) ou +2 pontos (feita corretamente)
2. WHEN o professor seleciona um aluno e escolhe a categoria Games, THE Sistema SHALL permitir registrar entre 1 e 100 pontos
3. WHEN o professor seleciona um aluno e escolhe a categoria Challenges, THE Sistema SHALL permitir registrar entre 1 e 100 pontos
4. WHEN o professor seleciona um aluno e escolhe a categoria Presence, THE Sistema SHALL registrar +1 ponto automaticamente
5. WHEN o professor seleciona um aluno e escolhe a categoria Bad Behavior, THE Sistema SHALL permitir registrar entre 1 e 100 pontos negativos e exigir uma justificativa textual obrigatória
6. IF o professor tenta registrar pontos de Games, Challenges ou Bad Behavior fora do intervalo de 1 a 100, THEN THE Sistema SHALL rejeitar o registro e exibir mensagem de erro
7. WHEN uma transação de pontos é registrada com sucesso, THE Sistema SHALL persistir o registro no histórico do aluno imediatamente

---

### Requisito 5

**User Story:** Como professor, quero visualizar o histórico de pontos de um aluno, para que eu possa acompanhar a evolução individual de cada aluno.

#### Critérios de Aceitação

1. WHEN o professor acessa o histórico de um aluno, THE Sistema SHALL exibir todas as transações em ordem cronológica decrescente
2. WHEN o histórico é exibido, THE Sistema SHALL mostrar para cada transação: data/hora, categoria, quantidade de pontos e justificativa (quando aplicável)
3. WHEN não há transações registradas para um aluno, THE Sistema SHALL exibir uma mensagem indicando histórico vazio

---

### Requisito 6

**User Story:** Como aluno, quero acessar minha visualização individual via URL única com login e senha, para que eu possa ver meus pontos sem acessar informações de outros alunos.

#### Critérios de Aceitação

1. WHEN o aluno acessa sua URL única e submete credenciais válidas, THE Sistema SHALL autenticar o aluno e exibir apenas sua visualização individual
2. IF o aluno submete credenciais inválidas, THEN THE Sistema SHALL exibir mensagem de erro e manter o aluno na tela de login
3. WHEN o aluno está autenticado em sua URL, THE Sistema SHALL impedir o acesso ao dashboard do professor ou a dados de outros alunos
4. IF um aluno tenta acessar a URL de outro aluno, THEN THE Sistema SHALL negar o acesso e exibir mensagem de erro

---

### Requisito 7

**User Story:** Como aluno, quero visualizar meus pontos por categoria e minhas penalidades com justificativa, para que eu possa entender meu desempenho e os motivos de perda de pontos.

#### Critérios de Aceitação

1. WHEN o aluno acessa sua visualização, THE Sistema SHALL exibir a pontuação total e o saldo de pontos por categoria (Homework, Games, Challenges, Presence, Bad Behavior)
2. WHEN o aluno visualiza suas penalidades de Bad Behavior, THE Sistema SHALL exibir a data, a quantidade de pontos perdidos e a justificativa do professor para cada registro
3. WHEN não há registros de Bad Behavior, THE Sistema SHALL exibir uma mensagem indicando que não há penalidades registradas

---

### Requisito 8

**User Story:** Como professor, quero que o sistema utilize SQLite como banco de dados server-side, para que a aplicação seja leve e funcione corretamente sem infraestrutura complexa.

#### Critérios de Aceitação

1. THE Sistema SHALL persistir todos os dados de alunos, credenciais e histórico de transações em um banco de dados SQLite no servidor
2. WHEN o servidor é reiniciado, THE Sistema SHALL recuperar todos os dados previamente persistidos do banco de dados SQLite
3. THE Sistema SHALL serializar e desserializar todos os objetos de dados corretamente ao ler e escrever no banco de dados SQLite
