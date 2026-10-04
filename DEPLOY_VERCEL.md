# Deploy via Vercel CLI

## Configuracao aplicada

- Login do professor: `Lucas Leria`
- Senha do professor: `Lucas!0509`
- A autenticacao em producao usa cookie assinado e nao depende mais de sessao em memoria.
- Em producao na Vercel, o app usa Postgres persistente via integracao Neon.
- SQLite fica restrito ao desenvolvimento/testes locais.
- O script `npm run db:reset` limpa o banco SQLite local. Ele nunca deve ser executado contra dados reais e nao faz parte do fluxo de deploy.
- O ranking academico permanece desativado por padrao e deve ser ativado somente apos validar notas reais.
- A Ficha de Desempenho e gerada como PDF diretamente no Node, em memoria, sem LibreOffice, Word, Chromium ou binario instalado no servidor.

## Comandos

1. Instale a CLI se precisar:
   `npm i -g vercel`
2. Vincule o projeto:
   `npm run vercel:link`
3. Defina as variaveis no projeto Vercel:
   `vercel env add TEACHER_USERNAME production`
   `vercel env add TEACHER_PASSWORD production`
   `vercel env add SESSION_SECRET production`
   `vercel env add ACADEMIC_RANKING_ENABLED production`
   `vercel env add REPORT_TIMEZONE production`
   `vercel env add REPORT_CITY production`
4. Provisione o banco persistente:
   `vercel integration add neon -e production -m region=gru1`
5. Antes do deploy:
   `npm run predeploy:vercel`
6. Publicacao em producao:
   `npm run vercel:deploy`

## Valores recomendados para as variaveis

- `TEACHER_USERNAME`: `Lucas Leria`
- `TEACHER_PASSWORD`: `Lucas!0509`
- `SESSION_SECRET`: use um segredo forte e exclusivo no projeto da Vercel
- `ACADEMIC_RANKING_ENABLED`: `false` ate a aprovacao da ativacao do ranking combinado
- `REPORT_TIMEZONE`: `America/Sao_Paulo`
- `REPORT_CITY`: `Guarulhos`

## Validacao antes do deploy

- `npm run verify` executa a suite automatizada sem apagar banco.
- `npm run predeploy:vercel` executa a mesma validacao sem reset.
- `npm run db:reset` e uma acao manual e destrutiva restrita ao SQLite local.
- Antes de uma migracao de producao, faca backup e valide a alteracao em uma copia do banco.
- Valide visualmente uma Ficha de Desempenho gerada antes de liberar o botao para uso regular.
- Mantenha `ACADEMIC_RANKING_ENABLED=false` no primeiro deploy; ative somente depois de conferir medias e bonus de uma turma piloto.
