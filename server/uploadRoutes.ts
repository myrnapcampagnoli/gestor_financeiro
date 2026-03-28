import { Router } from "express";
import multer from "multer";
import { parseCsv, parseExcel, parsePdf, ParsedTransaction } from "./fileParser";

const router = Router();

// In-memory storage (we parse immediately, no disk needed)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/pdf",
      "text/plain",
    ];
    const ext = file.originalname.toLowerCase();
    if (
      allowed.includes(file.mimetype) ||
      ext.endsWith(".csv") ||
      ext.endsWith(".xlsx") ||
      ext.endsWith(".xls") ||
      ext.endsWith(".pdf")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Formato não suportado. Use CSV, Excel (.xlsx/.xls) ou PDF."));
    }
  },
});

// POST /api/upload/parse  →  returns parsed transactions for preview
router.post("/parse", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Nenhum arquivo enviado." });
      return;
    }

    const { buffer, originalname, mimetype } = req.file;
    const ext = originalname.toLowerCase();

    let transactions: ParsedTransaction[] = [];

    if (ext.endsWith(".pdf") || mimetype === "application/pdf") {
      transactions = await parsePdf(buffer);
    } else if (ext.endsWith(".xlsx") || ext.endsWith(".xls") || mimetype.includes("spreadsheet") || mimetype.includes("excel")) {
      transactions = parseExcel(buffer);
    } else {
      // CSV or plain text
      transactions = parseCsv(buffer);
    }

    res.json({
      success: true,
      filename: originalname,
      count: transactions.length,
      transactions,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao processar arquivo.";
    console.error("[Upload] Parse error:", err);
    res.status(500).json({ error: message });
  }
});

export default router;
