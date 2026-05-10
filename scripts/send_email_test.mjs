import { config } from "dotenv";
config();

// Importa o emailBackup diretamente
const { sendBackupEmail } = await import("../server/emailBackup.ts").catch(async () => {
  // Fallback: compilar e importar
  const { execSync } = await import("child_process");
  return import("../server/emailBackup.js");
});

console.log("Módulo carregado:", typeof sendBackupEmail);
