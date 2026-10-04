# Design Document — English Class Points

## Overview

Aplicação web leve e mobile-first para controle de pontos de alunos em aulas de inglês. O professor gerencia alunos e pontos via painel principal. Cada aluno acessa uma visualização individual via URL única com autenticação própria. Stack: Node.js + Express + SQLite (better-sqlite3) no backend, HTML/CSS/JS vanilla no frontend (sem frameworks pesados).

## Arquitetura

```
┌─────────────────────────────────────────┐
│              Browser (Mobile)           │
│  ┌──────────────┐  ┌──────────────────┐ │
│  │  /           │  │  /student/:token │ │
│  │  (Professor) │  │  (Aluno)         │ │
│  └──────┬───────┘  └────────┬─────────┘ │
└─────────┼────────────────────┼───────────┘
          │  HTTP              │  HTTP
┌─────────▼────────────────────▼───────────┐
│           Express.js Server              │
│  ┌─────────────┐  ┌────────────────────┐ │
│  │  Auth       │  │  API Routes        │ │
│  │  Middleware │  │  /api/...          │ │
│  └─────────────┘  └────────────────────┘ │
│  ┌───────────────────────────────────────┐│
│  │         better-sqlite3                ││
│  │         (SQLite database)             ││
│  └───────────────────────────────────────┘│
└───────────────────────────────────────────┘
```

Arquitetura simples de servidor único com renderização server-side de páginas HTML e uma API REST leve para operações CRUD.

## Componentes e Interfaces

### Rotas do Servidor (Express)

```
GET  /                        → login do professor (ou dashboard se autenticado)
POST /login                   → autenticação do professor
GET  /dashboard               → painel principal (protegido)
GET  /add                     → tela de adição de aluno/pontos (protegido)
POST /api/students            → criar aluno
POST /api/points              → registrar pontos
GET  /api/students            → listar alunos com totais
GET  /api/students/:id/history → histórico de um aluno

GET  /student/:token          → login do aluno (ou visualização se autenticado)
POST /student/:token/login    → autenticação do aluno
GET  /student/:token/view     → visualização individual do aluno (protegido)
```

### Módulos do Backend

- `server.js` — ponto de entrada, configuração do Express
- `db.js` — inicialização e queries do SQLite
- `auth.js` — funções de autenticação (sessões simples com express-session)
- `routes/professor.js` — rotas do professor
- `routes/student.js` — rotas do aluno

### Frontend (HTML/CSS/JS)

- `public/login.html` — login do professor
- `public/dashboard.html` — dashboard com ranking
- `public/add.html` — tela de adição de aluno/pontos
- `public/student-login.html` — login do aluno
- `public/student-view.html` — visualização individual do aluno
- `public/style.css` — estilos mobile-first
- `public/app.js` — lógica de frontend compartilhada

## Modelos de Dados

### Tabela: `professors`
```sql
CREATE TABLE professors (
  id      INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL
);
```

### Tabela: `students`
```sql
CREATE TABLE students (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  token      TEXT NOT NULL UNIQUE,   -- token na URL única
  username   TEXT NOT NULL UNIQUE,   -- login do aluno
  password   TEXT NOT NULL,          -- senha do aluno
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Tabela: `point_transactions`
```sql
CREATE TABLE point_transactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES students(id),
  category    TEXT NOT NULL CHECK(category IN ('homework','games','challenges','presence','bad_behavior')),
  points      INTEGER NOT NULL,       -- negativo para bad_behavior
  note        TEXT,                   -- justificativa obrigatória para bad_behavior
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Regras de negócio por categoria

| Categoria     | Pontos          | Nota obrigatória |
|---------------|-----------------|------------------|
| homework      | +1 ou +2        | Não              |
| games         | +1 a +100       | Não              |
| challenges    | +1 a +100       | Não              |
| presence      | +1 (fixo)       | Não              |
| bad_behavior  | -1 a -100       | Sim              |

### Geração de credenciais do aluno

- `token`: UUID v4 (usado na URL: `/student/<token>`)
- `username`: gerado a partir do nome do aluno (ex: `joao_silva`)
- `password`: string aleatória de 6 caracteres alfanuméricos


## Propriedades de Corretude

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

---

**Reflexão sobre redundâncias:**
- 2.4 é coberto por 2.1 (ordenação)
- 4.3 é combinável com 4.2 (validação de intervalo para Games e Challenges)
- 4.6 é coberto por 4.2/4.3/4.5
- 6.4 é coberto por 6.3
- 8.1 é coberto por 3.4 e 4.7
- 7.2 é parcialmente coberto por 5.2

---

**Propriedade 1: Credenciais inválidas são sempre rejeitadas**
*Para qualquer* par de credenciais que não corresponda a um usuário cadastrado (professor ou aluno), o sistema deve retornar erro de autenticação e não iniciar sessão.
**Validates: Requirements 1.2, 6.2**

---

**Propriedade 2: Dashboard ordenado por pontuação decrescente**
*Para qualquer* conjunto de alunos com pontuações distintas, a função que retorna a lista do dashboard deve sempre retornar os alunos em ordem decrescente de pontuação total.
**Validates: Requirements 2.1, 2.4**

---

**Propriedade 3: Totais por aluno são calculados corretamente**
*Para qualquer* aluno com um conjunto de transações, a soma calculada de pontos deve ser igual à soma aritmética de todos os valores de transações daquele aluno.
**Validates: Requirements 2.2, 7.1**

---

**Propriedade 4: Criação de aluno inicializa com pontuação zero**
*Para qualquer* nome válido de aluno, ao criar o aluno, a pontuação total calculada deve ser zero (sem transações).
**Validates: Requirements 3.1**

---

**Propriedade 5: Nome vazio ou só espaços é rejeitado no cadastro**
*Para qualquer* string composta inteiramente de espaços em branco ou string vazia, o sistema deve rejeitar o cadastro do aluno.
**Validates: Requirements 3.2**

---

**Propriedade 6: Round trip de persistência de aluno**
*Para qualquer* aluno criado com sucesso, buscar esse aluno no banco de dados deve retornar um objeto com os mesmos dados (nome, token, username).
**Validates: Requirements 3.4, 8.3**

---

**Propriedade 7: Validação de intervalo para Games e Challenges**
*Para qualquer* valor inteiro entre 1 e 100 (inclusive), o sistema deve aceitar o registro nas categorias Games e Challenges. Para qualquer valor fora desse intervalo, o sistema deve rejeitar.
**Validates: Requirements 4.2, 4.3, 4.6**

---

**Propriedade 8: Bad Behavior exige justificativa e intervalo válido**
*Para qualquer* tentativa de registrar Bad Behavior sem justificativa, ou com valor fora do intervalo 1-100, o sistema deve rejeitar o registro.
**Validates: Requirements 4.5, 4.6**

---

**Propriedade 9: Round trip de persistência de transação**
*Para qualquer* transação de pontos registrada com sucesso, buscar o histórico do aluno deve conter essa transação com todos os campos (categoria, pontos, nota, data).
**Validates: Requirements 4.7, 5.2, 8.3**

---

**Propriedade 10: Histórico em ordem cronológica decrescente**
*Para qualquer* aluno com múltiplas transações, a query de histórico deve retornar as transações ordenadas por data/hora de forma decrescente.
**Validates: Requirements 5.1**

---

**Propriedade 11: Isolamento de dados entre alunos**
*Para qualquer* aluno autenticado, as queries de pontos e histórico devem retornar apenas dados pertencentes a esse aluno, nunca dados de outros alunos.
**Validates: Requirements 6.3, 6.4**

---

**Propriedade 12: Persistência sobrevive a reinício do servidor**
*Para qualquer* conjunto de dados persistidos (alunos e transações), após reinicializar a conexão com o banco SQLite, todos os dados devem ser recuperáveis com os mesmos valores.
**Validates: Requirements 8.2**

---

## Tratamento de Erros

- Autenticação falha → HTTP 401, mensagem de erro na tela de login
- Validação de entrada falha → HTTP 400, mensagem descritiva
- Aluno não encontrado → HTTP 404
- Erro interno do servidor → HTTP 500, mensagem genérica
- Acesso não autorizado a recurso de outro aluno → HTTP 403

## Estratégia de Testes

### Testes Unitários

Verificam comportamentos específicos e casos de borda:
- Validação de credenciais (válidas e inválidas)
- Validação de intervalos de pontos por categoria
- Cálculo de totais por categoria
- Geração de token único para aluno
- Rejeição de nome vazio no cadastro

### Testes Baseados em Propriedades (Property-Based Testing)

Biblioteca: **fast-check** (JavaScript/Node.js)

Cada teste de propriedade deve rodar no mínimo **100 iterações**.

Cada teste deve ser anotado com o seguinte formato:
`// Feature: english-class-points, Property {N}: {texto da propriedade}`

Cada propriedade de corretude deve ser implementada por **um único** teste de propriedade.

Propriedades a implementar:
- Propriedade 1: Credenciais inválidas sempre rejeitadas
- Propriedade 2: Dashboard ordenado por pontuação decrescente
- Propriedade 3: Totais calculados corretamente
- Propriedade 4: Criação de aluno com pontuação zero
- Propriedade 5: Nome vazio rejeitado
- Propriedade 6: Round trip de persistência de aluno
- Propriedade 7: Validação de intervalo Games/Challenges
- Propriedade 8: Bad Behavior exige justificativa e intervalo válido
- Propriedade 9: Round trip de persistência de transação
- Propriedade 10: Histórico em ordem cronológica decrescente
- Propriedade 11: Isolamento de dados entre alunos
- Propriedade 12: Persistência sobrevive a reinício

### Abordagem Complementar

Testes unitários cobrem exemplos concretos e casos de borda (lista vazia, valores limítrofes).
Testes de propriedade verificam invariantes universais com entradas geradas aleatoriamente.
Juntos, fornecem cobertura abrangente: unitários pegam bugs concretos, propriedades verificam corretude geral.
