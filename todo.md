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
- [x] Importação de PDF diretamente (upload de arquivo)
- [x] Upload de CSV/Excel/PDF com parser e preview antes de importar
- [x] Endpoint REST multipart para upload de arquivo
- [x] Parser CSV (extratos bancários)
- [x] Parser Excel (.xlsx)
- [x] Parser PDF (contas/boletos) - Nubank e Banco 301 com coordenadas X
- [x] Página /importar com UI mobile-friendly
- [x] Parser PDF específico para Nubank PF (extrato com coordenadas X)
- [x] Parser PDF específico para Banco 301 PJ (extrato com coordenadas X)
- [x] Badge de conta de origem (Nubank PF / Banco 301 PJ) na tela de importação
- [x] Salvar conta de origem no campo importedFrom ao importar
- [ ] Sincronização automática Dropbox/OneDrive
- [ ] Notificações por email (SMTP)
- [ ] Relatórios mensais em PDF
- [ ] Gráficos de fluxo de caixa

## Correções
- [x] Corrigir erro nested anchor tags no Dashboard
- [x] Investigar saldo -175k (verificar se jurídico está sendo excluído e se dados estão completos)
- [x] Corrigir valor jurídico: era 84 registros × R$1 = R$84, agora 1 registro = R$93.417,46
- [ ] Corrigir erro OAuth Gmail (Client missing project id - precisa de Google Cloud Project)
- [ ] Criar Google Sheets completo com backup no Drive
- [x] Confirmar que jurídico é excluído do saldo (já implementado no dashboard router)

## Importação de Dados
- [ ] Ler e mapear todas as abas do Excel controle_myrna_v7.xlsx
- [ ] Script de importação para o banco de dados via API
- [ ] Verificar dados importados no dashboard
- [ ] Busca automática no Gmail (configurar e testar)

## Detecção de Duplicatas na Importação
- [x] Backend: procedure checkDuplicates que compara transações novas com o banco (data ±3 dias + valor igual + descrição similar)
- [x] Backend: retornar status de cada transação (nova, duplicata_exata, duplicata_similar)
- [x] UI: mostrar badge de duplicata no preview com transação existente para comparação
- [x] UI: botões por transação: Importar mesmo assim / Pular / Substituir existente
- [x] UI: botão "Pular todas duplicatas" e "Importar todas mesmo assim"

## Extração de Boletos PDF
- [x] Parser de boleto: extrair vencimento, valor e linha digitável/código de barras
- [x] UI: exibir linha digitável com botão de cópia rápida
- [x] Remover integração Gmail da navegação (não funciona sem Google Cloud)
- [x] Remover Gmail do menu, rota e página (usuária não vai usar Google Cloud)

## Transferências Entre Contas Próprias
- [x] Adicionar tipo 'transfer' no schema do banco (transactions.type)
- [x] Parser: detectar "Enviado" como possível transferência (não despesa)
- [x] Detecção inteligente: se existe "Recebido" com mesmo valor em ±1 dia, marcar par como transferência
- [x] UI: badge "Transferência?" na tela de importação com botão para classificar
- [x] Botão "Marcar como Transferência" em lote na tela de importação
- [x] Dashboard: tipo 'transfer' não entra no cálculo de receita/despesa

## Backup de Dados
- [ ] Opção 1: Botão "Exportar tudo" em Configurações → baixa CSV com todas as transações
- [ ] Opção 1: Incluir filtro por período (mês/ano/tudo) na exportação
- [ ] Opção 2: Backup automático semanal por e-mail (SMTP) com CSV anexado
- [ ] Opção 2: Configuração de e-mail de destino em Configurações
- [ ] Opção 2: Agendamento via periodic-updates (toda segunda-feira às 8h)

## Visualização em Formato de Extrato Bancário
- [x] Redesenhar Histórico como extrato: linhas com data, descrição, valor e saldo acumulado
- [x] Saldo acumulado calculado cronologicamente (saldo anterior + entradas - saídas)
- [x] Separador de mês com totais de entradas, saídas e saldo do mês
- [x] Filtro por conta de origem (Nubank PF / Banco 301 PJ / Todas) - detectado via importedFrom
- [x] Filtro por período (mês/ano com navegação ← → e pills de mês)
- [x] Linha de saldo inicial do período
- [x] Linha de saldo final do período
- [x] Exportar extrato filtrado como CSV
- [x] Badges de categoria automáticos (Imposto, Equipe, Casa, Consultorio, Financiamento, etc)
- [x] Ícone PJ (azul) / PF (âmbar) por linha
- [x] Transferencias internas identificadas e excluídas do saldo
- [x] Legenda de cores e status na tela

## Edição Rápida de Status no Extrato
- [x] Clique no status dot (bolinha colorida) abre dropdown de troca de status
- [x] Opções: Pago ✅, Pendente ⏳, Atrasado 🔴, Agendado 📅
- [x] Mutation trpc.transactions.update para alterar status
- [x] Feedback visual imediato (invalidação da lista)
- [x] Botão "✓ Pagar" visível ao hover para pendentes/atrasados

## Correções de Dados (mai/2026)
- [x] VIVO FIXO R$29.621 removido (era saldo acumulado lido como receita)
- [x] PIX MYRNA duplicado removido (expense + transfer do mesmo lançamento)
- [x] Outros Vida R$20k e R$12,5k corrigidos para transfer (PJ→PF)
- [x] Duplicatas março: 8 removidas (Excel vs Santander/Nubank)
- [x] Duplicatas abril: 5 removidas (Excel vs Santander/Bradesco/Nubank)

## Importação Santander PF e Bradesco PF
- [x] Parser Santander PF (Extrato Consolidado Inteligente) jan-abr/2026
- [x] Parser Bradesco PF (extrato_conta.pdf) mai/2026
- [x] 57 transações novas importadas (3 duplicatas puladas)
- [x] Total: 754 transações no banco (após limpeza de duplicatas)
