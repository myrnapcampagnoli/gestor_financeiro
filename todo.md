# Gestor Financeiro - TODO

## Schema & Backend
- [x] Schema: tabelas transactions, accounts, installments, categories, notifications, gmailImports
- [x] Migrations aplicadas no banco
- [x] DB helpers: CRUD de transações, contas, parcelamentos, notificações, Gmail
- [x] tRPC: transactions (list, create, update, delete, markPaid)
- [x] tRPC: dashboard (resumo PJ/PF, saldo, entradas, saídas, pendentes, atrasados, jurídico)
- [x] tRPC: installments (criar parcelamento automático com N parcelas)
- [x] tRPC: notifications (listar, marcar lida, marcar todas)
- [x] tRPC: export (exportar dados como CSV)
- [x] tRPC: gmail (getAuthUrl, isConnected, disconnect, scanEmails, importEmail)
- [x] tRPC: accounts (list, create)
- [x] tRPC: categories (list + seed padrão)
- [x] Callback Gmail OAuth no servidor (/api/gmail/callback)
- [x] Atualização automática de status overdue
- [x] Notificações automáticas de vencimento (3 dias antes)

## Frontend - Design System
- [x] Paleta de cores semânticas (verde=pago, vermelho=atrasado, amarelo=pendente, cinza=jurídico)
- [x] AppLayout com sidebar desktop + bottom nav mobile
- [x] Componentes: StatusBadge, EntityBadge, PaymentMethodBadge, MoneyDisplay

## Frontend - Páginas
- [x] Dashboard: cards PJ/PF, saldo total, pendentes, atrasados, jurídico, próximos vencimentos
- [x] Contas a Pagar: lista com filtros, ações (pagar, jurídico, excluir)
- [x] Histórico: busca, filtros por tipo/PJ/PF, agrupado por mês
- [x] Calendário: mini calendário + próximos 30 dias de compromissos
- [x] Nova Transação: formulário completo (avulso e parcelado, 4 formas de pagamento)
- [x] Gmail: conectar, escanear, preview e importar emails
- [x] Notificações: lista in-app com marcar como lida
- [x] Configurações: perfil, contas bancárias, exportar CSV

## Funcionalidades Avançadas
- [x] Parcelamento automático (N vezes, valor dividido, datas mensais)
- [x] Filtro jurídico (excluído dos cálculos de saldo)
- [x] Notificações in-app (3 dias antes do vencimento)
- [x] Exportar backup CSV
- [x] Integração Gmail OAuth (autorizar acesso)
- [x] Busca automática de extratos bancários no Gmail (Nubank, Contabilizei, Bradesco...)
- [x] Busca automática de faturas de cartão no Gmail (Nubank, Itaú, XP...)
- [x] Busca automática de contas de serviços no Gmail (Vivo, Claro, TIM, Copel, Cemig...)
- [x] Detecção CNPJ/CPF para classificação PJ/PF automática
- [x] Preview antes de importar (editar descrição, valor, vencimento, PJ/PF)

## Testes
- [x] Vitest: auth.logout
- [x] Vitest: gmail.isConnected
- [x] Vitest: gmail.getAuthUrl
- [x] Vitest: export.csv headers
- [x] Vitest: installments.create validação
- [x] Vitest: transactions.create validação

## Pendente / Futuro
- [ ] Importação de PDF diretamente (upload de arquivo)
- [ ] Sincronização automática Dropbox/OneDrive
- [ ] Notificações por email (SMTP)
- [ ] Relatórios mensais em PDF
- [ ] Gráficos de fluxo de caixa

## Correções
- [x] Corrigir erro nested anchor tags no Dashboard
- [ ] Corrigir erro OAuth Gmail (Client missing project id - precisa de Google Cloud Project)
- [ ] Criar Google Sheets completo com backup no Drive
- [x] Confirmar que jurídico é excluído do saldo (já implementado no dashboard router)

## Importação de Dados
- [ ] Ler e mapear todas as abas do Excel controle_myrna_v7.xlsx
- [ ] Script de importação para o banco de dados via API
- [ ] Verificar dados importados no dashboard
- [ ] Busca automática no Gmail (configurar e testar)
