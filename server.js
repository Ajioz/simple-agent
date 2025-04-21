import express from "express";
import * as dotenv from "dotenv";
import cors from "cors";
import { Configuration, OpenAIApi } from "openai";
import { body, validationResult } from "express-validator";
import rateLimit from "express-rate-limit";

dotenv.config();

// --- Environment Variable Validation ---
if (!process.env.OPEN_AI_API_KEY) {
  console.error("Error: OPEN_AI_API_KEY is not set.");
  process.exit(1);
}

// --- OpenAI Setup ---
const configuration = new Configuration({
  apiKey: process.env.OPEN_AI_API_KEY,
});
const openai = new OpenAIApi(configuration); // Initialize OpenAI API with the provided configuration

// --- Express Setup ---
const app = express(); // Create an Express application instance

// --- CORS Configuration (Restrict to your frontend's origin in production) ---
app.use(
  cors({
    origin: ["https://ajiozchat.vercel.app/"], // Replace with your actual frontend origin if needed.
    methods: ["GET", "POST"],
  })
);

app.use(express.json());

// --- Rate Limiting ---
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again after 15 minutes",
});
app.use(apiLimiter);

// --- Request timeout ---
app.use((req, res, next) => {
  res.setTimeout(60000, () => {
    res.status(504).json({ error: "Request timed out" });
  });
  next();
});

// --- Routes ---
app.get("/", async (req, res) => {
  res.status(200).send({
    message: "Hello from Ajioz Chat",
  });
});

// --- POST Endpoint for OpenAI Completion ---
app.post(
  "/",
  [body("prompt").isString().trim().notEmpty().isLength({ max: 1000 })], // Input Validation
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const prompt = req.body.prompt;
      console.log("Received prompt:", prompt); // Log the received prompt

      const response = await openai.createCompletion({
        model: "text-davinci-003",
        prompt: `${prompt}`,
        temperature: 0,
        max_tokens: 3000,
        top_p: 1,
        frequency_penalty: 0.5,
        presence_penalty: 0,
      });

      console.log("OpenAI response:", response.data); // Log the full response

      res.status(200).send({
        bot: response.data.choices[0].text,
      });
    } catch (error) {
      console.error("OpenAI error:", error);
      if (error.response?.status === 401) {
        return res.status(401).json({ error: "Invalid API key" });
      }
      if (error.response?.status === 429) {
        return res.status(429).json({ error: "Rate limit exceeded" });
      }
      if (error.code === "ECONNABORTED") {
        return res.status(504).json({ error: "Request timeout" });
      }
      res.status(500).send(error.message || "Something went wrong");
    }
  }
);

// --- Start Server ---
const port = process.env.PORT || 5000;
const server = app.listen(port, () =>
  console.log(`App listening on port http://127.0.0.1:${port}...`)
);
// --- Graceful Shutdown ---
process.on("SIGTERM", () => {
  console.info("SIGTERM received. Closing server...");
  server.close(() => {
    console.info("Server closed.");
    process.exit(0);
  });
});
