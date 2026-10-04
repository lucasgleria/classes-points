# Plano de Implementação

- [] 1. Configurar estrutura do projeto e banco de dados
  - Inicializar projeto Node.js com `npm init`
  - Instalar dependências: `express`, `better-sqlite3`, `express-session`, `uuid`, `fast-check` (dev)
  - Criar estrutura de diretórios: `routes/`, `public/`
  - Criar `db.js` com inicialização do SQLite e criação das tabelas `professors`, `students`, `point_transactions`
  - Inserir registro padrão do professor no banco na inicialização
  - _Requirements: 8.1, 8.2_

- [] 2. Implementar autenticação e middleware de sessão
  - [] 2.1 Criar `auth.js` com funções de verificação de credenciais para professor e aluno
    - Implementar `verifyProfessor(username, password)` consultando tabela `professors`
    - Implementar `verifyStudent(token, username, password)` consultando tabela `students`
    - _Requirements: 1.1, 1.2, 6.1, 6.2_
  - [] 2.2 Escrever teste de propriedade — Propriedade 1: Credenciais inválidas sempre rejeitadas
    - **Property 1: Credenciais inválidas são sempre rejeitadas**
    - **Validates: Requirements 1.2, 6.2**
  - [ ] 2.3 Criar middleware `requireProfessor` e `requireStudent` para proteger rotas
    - _Requirements: 1.3, 6.3_

- [ ] 3. Implementar gerenciamento de alunos
  - [ ] 3.1 Criar funções em `db.js` para CRUD de alunos
    - `createStudent(name)` — gera token UUID, username e senha aleatória, insere no banco
    - `getAllStudents()` — retorna alunos com pontuação total calculada, ordenados por total decrescente
    - `getStudentByToken(token)` — retorna dados do aluno pelo token
    - _Requirements: 3.1, 3.4_
  - [ ] 3.2 Escrever teste de propriedade — Propriedade 4: Criação de aluno com pontuação zero
    - **Property 4: Criação de aluno inicializa com pontuação zero**
    - **Validates: Requirements 3.1**
  - [ ] 3.3 Escrever teste de propriedade — Propriedade 5: Nome vazio rejeitado
    - **Property 5: Nome vazio ou só espaços é rejeitado no cadastro**
    - **Validates: Requirements 3.2**
  - [ ] 3.4 Escrever teste de propriedade — Propriedade 6: Round trip de persistência de aluno
    - **Property 6: Round trip de persistência de aluno**
    - **Validates: Requirements 3.4, 8.3**

- [ ] 4. Implementar registro de pontos e histórico
  - [ ] 4.1 Criar função `validatePoints(category, points, note)` com regras de negócio por categoria
    - Homework: aceita apenas 1 ou 2
    - Games/Challenges: aceita 1-100
    - Presence: sempre 1
    - Bad Behavior: aceita 1-100 (armazenado como negativo), nota obrigatória
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
  - [ ] 4.2 Escrever teste de propriedade — Propriedade 7: Validação de intervalo Games/Challenges
    - **Property 7: Validação de intervalo para Games e Challenges**
    - **Validates: Requirements 4.2, 4.3, 4.6**
  - [ ] 4.3 Escrever teste de propriedade — Propriedade 8: Bad Behavior exige justificativa
    - **Property 8: Bad Behavior exige justificativa e intervalo válido**
    - **Validates: Requirements 4.5, 4.6**
  - [ ] 4.4 Criar função `addPoints(studentId, category, points, note)` que valida e insere em `point_transactions`
    - _Requirements: 4.7_
  - [ ] 4.5 Escrever teste de propriedade — Propriedade 9: Round trip de persistência de transação
    - **Property 9: Round trip de persistência de transação**
    - **Validates: Requirements 4.7, 5.2, 8.3**
  - [ ] 4.6 Criar função `getStudentHistory(studentId)` retornando transações em ordem cronológica decrescente
    - _Requirements: 5.1, 5.2_
  - [ ] 4.7 Escrever teste de propriedade — Propriedade 10: Histórico em ordem cronológica decrescente
    - **Property 10: Histórico em ordem cronológica decrescente**
    - **Validates: Requirements 5.1**

- [ ] 5. Implementar cálculo de totais por categoria
  - [ ] 5.1 Criar função `getStudentTotals(studentId)` que retorna soma de pontos por categoria e total geral
    - _Requirements: 7.1_
  - [ ] 5.2 Escrever teste de propriedade — Propriedade 3: Totais calculados corretamente
    - **Property 3: Totais por aluno são calculados corretamente**
    - **Validates: Requirements 2.2, 7.1**
  - [ ] 5.3 Escrever teste de propriedade — Propriedade 2: Dashboard ordenado por pontuação decrescente
    - **Property 2: Dashboard ordenado por pontuação decrescente**
    - **Validates: Requirements 2.1, 2.4**

- [ ] 6. Checkpoint — Garantir que todos os testes passam
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implementar rotas do professor
  - [ ] 7.1 Criar `routes/professor.js` com rotas de login, logout, dashboard e adição
    - `GET /` → servir `login.html` ou redirecionar para `/dashboard` se autenticado
    - `POST /login` → autenticar professor, iniciar sessão
    - `GET /logout` → encerrar sessão
    - `GET /dashboard` → retornar dados para dashboard (protegido)
    - `GET /add` → servir tela de adição (protegido)
    - `POST /api/students` → criar aluno (protegido)
    - `POST /api/points` → registrar pontos (protegido)
    - `GET /api/students` → listar alunos com totais (protegido)
    - `GET /api/students/:id/history` → histórico do aluno (protegido)
    - _Requirements: 1.1, 1.4, 2.1, 3.1, 4.1-4.7, 5.1_

- [ ] 8. Implementar rotas do aluno
  - [ ] 8.1 Criar `routes/student.js` com rotas de login e visualização individual
    - `GET /student/:token` → servir `student-login.html` ou redirecionar se autenticado
    - `POST /student/:token/login` → autenticar aluno, iniciar sessão
    - `GET /student/:token/view` → retornar dados da visualização individual (protegido, isolado)
    - _Requirements: 6.1, 6.2, 6.3, 7.1, 7.2_
  - [ ] 8.2 Escrever teste de propriedade — Propriedade 11: Isolamento de dados entre alunos
    - **Property 11: Isolamento de dados entre alunos**
    - **Validates: Requirements 6.3, 6.4**

- [ ] 9. Criar frontend — Telas do professor
  - [ ] 9.1 Criar `public/login.html` com formulário de login mobile-first
    - _Requirements: 1.1, 1.2_
  - [ ] 9.2 Criar `public/dashboard.html` com ranking de alunos e menu hamburguer lateral
    - Exibir lista de alunos ordenada por pontuação total
    - Menu lateral com opções: "Adicionar" e "Visualização do Aluno"
    - _Requirements: 2.1, 2.2, 2.3_
  - [ ] 9.3 Criar `public/add.html` com formulário de adição de aluno e registro de pontos
    - Seção para adicionar novo aluno (campo nome)
    - Seção para selecionar aluno existente e registrar pontos por categoria
    - _Requirements: 3.1, 3.2, 3.3, 4.1-4.6_

- [ ] 10. Criar frontend — Telas do aluno
  - [ ] 10.1 Criar `public/student-login.html` com formulário de login do aluno
    - _Requirements: 6.1, 6.2_
  - [ ] 10.2 Criar `public/student-view.html` com visualização individual de pontos
    - Exibir pontuação total e saldo por categoria
    - Exibir lista de penalidades Bad Behavior com data, pontos e justificativa
    - _Requirements: 7.1, 7.2, 7.3_

- [ ] 11. Criar `public/style.css` com estilos mobile-first
  - Layout responsivo otimizado para celular
  - Menu hamburguer lateral funcional
  - _Requirements: 2.1_

- [ ] 12. Criar `server.js` e integrar todos os módulos
  - Configurar Express com express-session
  - Registrar rotas do professor e do aluno
  - Servir arquivos estáticos de `public/`
  - Inicializar banco de dados na inicialização
  - _Requirements: 8.1, 8.2_

- [ ] 13. Escrever teste de propriedade — Propriedade 12: Persistência sobrevive a reinício
  - **Property 12: Persistência sobrevive a reinício do servidor**
  - **Validates: Requirements 8.2**

- [ ] 14. Checkpoint Final — Garantir que todos os testes passam
  - Ensure all tests pass, ask the user if questions arise.
