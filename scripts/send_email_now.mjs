/**
 * Dispara o e-mail de backup manualmente para teste
 * Usa Resend API diretamente com os dados do banco
 */
import { readFileSync } from "fs";
import { createConnection } from "mysql2/promise";
import { config } from "dotenv";
import { Resend } from "resend";

config();

const USER_ID = 1;
const TO_EMAIL = "myrnapcampagnoli@gmail.com"; // email verificado no Resend (conta de teste)

async function main() {
  const conn = await createConnection(process.env.DATABASE_URL);
  console.log("✅ Conectado ao banco\n");

  // Busca transações do mês atual
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [txs] = await conn.execute(
    `SELECT * FROM transactions WHERE userId = ? AND dueDate >= ? AND dueDate <= ? ORDER BY dueDate ASC`,
    [USER_ID, firstOfMonth, now]
  );

  await conn.end();

  const income = txs.filter(t => t.type === "income").reduce((s, t) => s + parseFloat(t.amount), 0);
  const expense = txs.filter(t => t.type === "expense").reduce((s, t) => s + parseFloat(t.amount), 0);
  const pending = txs.filter(t => t.status === "pending").length;
  const overdue = txs.filter(t => t.status === "overdue").length;
  const balance = income - expense;
  const mes = now.toLocaleString("pt-BR", { month: "long", year: "numeric" });

  console.log(`📊 Dados do mês: ${mes}`);
  console.log(`   Transações: ${txs.length}`);
  console.log(`   Entradas: R$ ${income.toFixed(2)}`);
  console.log(`   Saídas: R$ ${expense.toFixed(2)}`);
  console.log(`   Saldo: R$ ${balance.toFixed(2)}`);
  console.log(`   Pendentes: ${pending} | Atrasados: ${overdue}\n`);

  // Gera CSV
  const headers = ["Data", "Descrição", "Valor", "Tipo", "PJ/PF", "Status", "Pagamento", "Conta", "Vencimento"];
  const rows = txs.map(t => [
    t.dueDate ? new Date(t.dueDate).toLocaleDateString("pt-BR") : new Date(t.createdAt).toLocaleDateString("pt-BR"),
    t.description,
    parseFloat(t.amount).toFixed(2),
    t.type === "income" ? "Entrada" : t.type === "expense" ? "Saída" : "Transferência",
    t.entityType,
    t.status,
    t.paymentMethod || "",
    t.importedFrom || "",
    t.dueDate ? new Date(t.dueDate).toLocaleDateString("pt-BR") : "",
  ]);
  const csvContent = [headers, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  // Envia email via Resend
  const resend = new Resend(process.env.RESEND_API_KEY);

  const fmt = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const saldoColor = balance >= 0 ? "#15803d" : "#dc2626";
  const saldoSinal = balance >= 0 ? "+" : "";

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#1d4ed8;padding:28px 32px;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;">📊 Histórico Financeiro</h1>
            <p style="margin:6px 0 0;color:#bfdbfe;font-size:14px;">Gestor Financeiro — ${mes}</p>
          </td>
        </tr>
        <!-- Saldo principal -->
        <tr>
          <td style="padding:28px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f9ff;border-radius:10px;padding:20px;">
              <tr>
                <td>
                  <p style="margin:0 0 4px;color:#64748b;font-size:13px;">Saldo do período</p>
                  <p style="margin:0;color:${saldoColor};font-size:28px;font-weight:bold;">${saldoSinal}${fmt(balance)}</p>
                </td>
              </tr>
              <tr>
                <td style="padding-top:16px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="50%" style="padding-right:8px;">
                        <div style="background:#dcfce7;border-radius:8px;padding:12px;">
                          <p style="margin:0 0 2px;color:#166534;font-size:12px;">💰 Entradas</p>
                          <p style="margin:0;color:#15803d;font-size:16px;font-weight:bold;">${fmt(income)}</p>
                        </div>
                      </td>
                      <td width="50%" style="padding-left:8px;">
                        <div style="background:#fee2e2;border-radius:8px;padding:12px;">
                          <p style="margin:0 0 2px;color:#991b1b;font-size:12px;">💸 Saídas</p>
                          <p style="margin:0;color:#dc2626;font-size:16px;font-weight:bold;">${fmt(expense)}</p>
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Alertas -->
        <tr>
          <td style="padding:16px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="50%" style="padding-right:8px;">
                  <div style="border:1px solid #fde68a;background:#fffbeb;border-radius:8px;padding:12px;">
                    <p style="margin:0 0 2px;color:#92400e;font-size:12px;">⏳ Pendentes</p>
                    <p style="margin:0;color:#b45309;font-size:20px;font-weight:bold;">${pending}</p>
                  </div>
                </td>
                <td width="50%" style="padding-left:8px;">
                  <div style="border:1px solid #fecaca;background:#fff1f2;border-radius:8px;padding:12px;">
                    <p style="margin:0 0 2px;color:#991b1b;font-size:12px;">🔴 Atrasados</p>
                    <p style="margin:0;color:#dc2626;font-size:20px;font-weight:bold;">${overdue}</p>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Tabela de transações -->
        <tr>
          <td style="padding:20px 32px 0;">
            <p style="margin:0 0 12px;color:#1e293b;font-size:14px;font-weight:600;">📋 Transações do mês (${txs.length})</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px;">
              <tr style="background:#f8fafc;">
                <th style="text-align:left;padding:8px 6px;color:#64748b;border-bottom:1px solid #e2e8f0;">Data</th>
                <th style="text-align:left;padding:8px 6px;color:#64748b;border-bottom:1px solid #e2e8f0;">Descrição</th>
                <th style="text-align:left;padding:8px 6px;color:#64748b;border-bottom:1px solid #e2e8f0;">Conta</th>
                <th style="text-align:right;padding:8px 6px;color:#64748b;border-bottom:1px solid #e2e8f0;">Valor</th>
              </tr>
              ${txs.slice(0, 30).map((t, i) => {
                const isIncome = t.type === "income";
                const isTransfer = t.type === "transfer";
                const color = isTransfer ? "#6366f1" : isIncome ? "#15803d" : "#dc2626";
                const sign = isTransfer ? "⇄" : isIncome ? "+" : "-";
                const date = t.dueDate ? new Date(t.dueDate).toLocaleDateString("pt-BR") : new Date(t.createdAt).toLocaleDateString("pt-BR");
                const desc = t.description.length > 35 ? t.description.substring(0, 35) + "..." : t.description;
                const conta = t.importedFrom || t.entityType;
                return `<tr style="background:${i % 2 === 0 ? "#ffffff" : "#f8fafc"};">
                  <td style="padding:7px 6px;color:#475569;border-bottom:1px solid #f1f5f9;">${date}</td>
                  <td style="padding:7px 6px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${desc}</td>
                  <td style="padding:7px 6px;color:#64748b;border-bottom:1px solid #f1f5f9;font-size:11px;">${conta}</td>
                  <td style="padding:7px 6px;color:${color};font-weight:600;text-align:right;border-bottom:1px solid #f1f5f9;">${sign} ${fmt(parseFloat(t.amount))}</td>
                </tr>`;
              }).join("")}
              ${txs.length > 30 ? `<tr><td colspan="4" style="padding:8px 6px;color:#64748b;font-size:11px;text-align:center;">... e mais ${txs.length - 30} transações no CSV em anexo</td></tr>` : ""}
            </table>
          </td>
        </tr>
        <!-- Info CSV -->
        <tr>
          <td style="padding:20px 32px;">
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;">
              <p style="margin:0 0 6px;color:#475569;font-size:13px;">📎 <strong>CSV em anexo</strong></p>
              <p style="margin:0;color:#64748b;font-size:12px;">
                Este e-mail contém o arquivo <strong>historico_${mes.replace(/ /g, "_")}.csv</strong> com todas as 
                ${txs.length} transações do período. Salve-o no seu computador como backup dos seus dados financeiros.
              </p>
            </div>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
            <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">
              Gestor Financeiro — Dra. Myrna Campagnoli &nbsp;|&nbsp; ${new Date().toLocaleDateString("pt-BR")}
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const csvBuffer = Buffer.from("\uFEFF" + csvContent, "utf-8");
  const filename = `historico_${mes.replace(/ /g, "_").replace(/\//g, "-")}.csv`;

  console.log(`📧 Enviando para: ${TO_EMAIL}`);

  const result = await resend.emails.send({
    from: "onboarding@resend.dev",
    to: TO_EMAIL,
    subject: `📊 Histórico Financeiro — ${mes} | Gestor Financeiro`,
    html,
    attachments: [
      {
        filename,
        content: csvBuffer,
      },
    ],
  });

  if (result.error) {
    console.error("❌ Erro ao enviar:", result.error);
  } else {
    console.log("✅ E-mail enviado com sucesso!");
    console.log("   ID:", result.data?.id);
    console.log("   Para:", TO_EMAIL);
    console.log("   Assunto: 📊 Histórico Financeiro —", mes);
    console.log("   Anexo:", filename, `(${txs.length} transações)`);
  }
}

main().catch(e => {
  console.error("Erro fatal:", e);
  process.exit(1);
});
