import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", env: process.env.NODE_ENV });
  });

  // AI Summarization API
  app.post("/api/ai/summarize", async (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: "Content is required" });

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Summarize the following markdown note in a few concise sentences:\n\n${content}`,
        config: {
          systemInstruction: "You are a helpful AI assistant that summarizes notes concisely. Focus on the main points.",
        }
      });
      res.json({ summary: response.text });
    } catch (error) {
      console.error("AI Error:", error);
      res.status(500).json({ error: "AI generation failed" });
    }
  });

  // AI Tagging API
  app.post("/api/ai/tags", async (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: "Content is required" });

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Based on this note content, suggest 3-5 relevant tags as a comma-separated list:\n\n${content}`,
        config: {
          systemInstruction: "You are an expert at organizing notes. Provide only the tags separated by commas, no preamble.",
        }
      });
      const tags = response.text?.split(",").map(t => t.trim()) || [];
      res.json({ tags });
    } catch (error) {
      console.error("AI Error:", error);
      res.status(500).json({ error: "AI tagging failed" });
    }
  });

  // AI Chat API
  app.post("/api/ai/chat", async (req, res) => {
    const { message, context, history } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required" });

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          ...history.map((m: any) => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
          })),
          { role: 'user', parts: [{ text: `Context from my current note:\n${context || 'No note selected'}\n\nMy Question: ${message}` }] }
        ],
        config: {
          systemInstruction: "You are a helpful AI note assistant. Help the user with their notes, brainstorming, and writing. Be concise and friendly.",
        }
      });
      res.json({ reply: response.text });
    } catch (error) {
      console.error("AI Error:", error);
      res.status(500).json({ error: "AI chat failed" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting in DEVELOPMENT mode with Vite middleware");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    console.log("Starting in PRODUCTION mode. Serving files from:", distPath);
    
    // Serve static files from the dist directory
    app.use(express.static(distPath));
    
    // Explicit route for / to ensure index.html is served
    app.get("/", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    
    // Fallback for SPA routing
    app.get("*", (req, res) => {
      console.log(`Production route fallback for URL: ${req.url}`);
      // Only serve index.html for non-API routes
      if (!req.url.startsWith('/api/')) {
        res.sendFile(path.join(distPath, "index.html"));
      } else {
        res.status(404).json({ error: "API route not found" });
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
