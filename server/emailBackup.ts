import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export interface BackupEmailData {
  toEmail: string;
  mes: string;
  income: number;
  expense: number;
  balance: number;
  pending: number;
  overdue: number;
  totalTx: number;
  csvContent: string;
}

export async function sendBackupEmail(data: BackupEmailData): Promise<boolean> {
  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const saldoColor = data.balance >= 0 ? "#16a34a" : "#dc2626";
  const saldoSinal = data.balance >= 0 ? "+" : "";

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Backup Semanal — Gestor Financeiro</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        
        <!-- Header -->
        <tr>
          <td style="background:#1d4ed8;padding:28px 32px;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;">📊 Backup Semanal</h1>
            <p style="margin:6px 0 0;color:#bfdbfe;font-size:14px;">Gestor Financeiro — ${data.mes}</p>
          </td>
        </tr>

        <!-- Saldo principal -->
        <tr>
          <td style="padding:28px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f9ff;border-radius:10px;padding:20px;">
              <tr>
                <td>
                  <p style="margin:0 0 4px;color:#64748b;font-size:13px;">Saldo do período</p>
                  <p style="margin:0;color:${saldoColor};font-size:28px;font-weight:bold;">${saldoSinal}${fmt(data.balance)}</p>
                </td>
              </tr>
              <tr>
                <td style="padding-top:16px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="50%" style="padding-right:8px;">
                        <div style="background:#dcfce7;border-radius:8px;padding:12px;">
                          <p style="margin:0 0 2px;color:#166534;font-size:12px;">💰 Entradas</p>
                          <p style="margin:0;color:#15803d;font-size:16px;font-weight:bold;">${fmt(data.income)}</p>
                        </div>
                      </td>
                      <td width="50%" style="padding-left:8px;">
                        <div style="background:#fee2e2;border-radius:8px;padding:12px;">
                          <p style="margin:0 0 2px;color:#991b1b;font-size:12px;">💸 Saídas</p>
                          <p style="margin:0;color:#dc2626;font-size:16px;font-weight:bold;">${fmt(data.expense)}</p>
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
                    <p style="margin:0;color:#b45309;font-size:20px;font-weight:bold;">${data.pending}</p>
                  </div>
                </td>
                <td width="50%" style="padding-left:8px;">
                  <div style="border:1px solid #fecaca;background:#fff1f2;border-radius:8px;padding:12px;">
                    <p style="margin:0 0 2px;color:#991b1b;font-size:12px;">🔴 Atrasados</p>
                    <p style="margin:0;color:#dc2626;font-size:20px;font-weight:bold;">${data.overdue}</p>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Info CSV -->
        <tr>
          <td style="padding:20px 32px;">
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;">
              <p style="margin:0 0 6px;color:#475569;font-size:13px;">📎 <strong>CSV em anexo</strong></p>
              <p style="margin:0;color:#64748b;font-size:12px;">
                Este e-mail contém o arquivo <strong>backup_${data.mes.replace(/ /g, "_")}.csv</strong> com todas as 
                ${data.totalTx} transações do período. Salve-o no seu computador como backup dos seus dados financeiros.
              </p>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
            <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">
              Gestor Financeiro — Dra. Myrna Campagnoli &nbsp;|&nbsp; Enviado automaticamente toda segunda-feira
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const csvBuffer = Buffer.from("\uFEFF" + data.csvContent, "utf-8");
    const filename = `backup_${data.mes.replace(/ /g, "_").replace(/\//g, "-")}.csv`;

    const result = await resend.emails.send({
      from: "onboarding@resend.dev",
      to: data.toEmail,
      subject: `📊 Backup Semanal — ${data.mes} | Gestor Financeiro`,
      html,
      attachments: [
        {
          filename,
          content: csvBuffer,
        },
      ],
    });

    if (result.error) {
      console.error("[Backup Email] Resend error:", result.error);
      return false;
    }

    console.log("[Backup Email] Sent successfully:", result.data?.id);
    return true;
  } catch (e) {
    console.error("[Backup Email] Exception:", e);
    return false;
  }
}
