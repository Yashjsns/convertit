import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for document/image base64 processing
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API Health Endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "ConvertIt API Engine", timestamp: new Date().toISOString() });
  });

  // Server-Side Gemini API OCR Endpoint
  app.post("/api/ocr", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY environment variable is missing" });
      }

      const { base64Data, mimeType = "image/png", prompt } = req.body;
      if (!base64Data) {
        return res.status(400).json({ error: "Missing base64Data payload" });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const defaultPrompt = prompt || "Perform clean OCR on this document or image. Extract all readable text accurately, maintaining structural paragraphing and heading hierarchy. Do not add markdown commentary, just return the transcribed formatted text.";

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Data.replace(/^data:[^;]+;base64,/, ""),
              },
            },
            {
              text: defaultPrompt,
            },
          ],
        },
      });

      const extractedText = response.text || "No text could be recognized from the provided document.";

      res.json({
        success: true,
        text: extractedText,
        wordCount: extractedText.split(/\s+/).filter(Boolean).length,
      });
    } catch (error: any) {
      console.error("OCR API error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "An error occurred during AI OCR document analysis",
      });
    }
  });

  // Vite middleware for development vs static serve for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`ConvertIt Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
