/**
 * Gemini AI Integration for Quiz Generation and Validation
 *
 * This module provides integration with Google's Gemini AI for generating
 * quiz questions and validating quiz answers.
 *
 * Required environment variables:
 * - GEMINI_API_KEY: Your Google AI Studio API key
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Model is configurable via GEMINI_MODEL. Default is a current, free-tier model
// (the old gemini-1.5-flash was retired by Google and now 404s).
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
// Image generation needs an image-capable model (the text model above cannot
// produce images). Overridable via GEMINI_IMAGE_MODEL.
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctAnswer: number; // Index of correct option
  explanation?: string;
}

interface GenerateQuizOptions {
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  questionCount: number;
  category?: string;
}

interface ValidateAnswerOptions {
  question: string;
  userAnswer: string;
  correctAnswer: string;
}

/**
 * Check if Gemini is configured
 */
export function isGeminiConfigured(): boolean {
  return !!GEMINI_API_KEY;
}

/**
 * Generic free-text generation from a prompt. Used by the user-facing
 * /api/ai/generate (social task content) and any admin text generation.
 * Returns { success, text } or { success:false, error }.
 */
export async function generateText(
  prompt: string
): Promise<{ success: boolean; text?: string; error?: string }> {
  if (!GEMINI_API_KEY) return { success: false, error: "GEMINI_API_KEY not set" };
  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        success: false,
        error: err?.error?.message ?? `HTTP ${res.status}`,
      };
    }
    const data = await res.json();
    const text: string =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return text.trim()
      ? { success: true, text: text.trim() }
      : { success: false, error: "Empty response" };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Request failed",
    };
  }
}

export interface ExtractedId {
  fullName?: string;
  dateOfBirth?: string; // ISO yyyy-mm-dd
  idNumber?: string;
  documentType?: string;
  expiry?: string; // ISO yyyy-mm-dd
  confidence: number; // 0..1
  /** Whether the image actually looks like a government ID document. */
  isIdDocument?: boolean;
  // Extra fields commonly present on a Bangladesh NID (front: parents; back:
  // address + blood group). Nullable — only filled when visible.
  fatherName?: string;
  motherName?: string;
  address?: string;
  bloodGroup?: string;
}

/**
 * OCR an identity document (front, optionally back) with Gemini vision and
 * return structured fields. Used by the automated KYC flow. Returns
 * `{ success, data }` or `{ success:false, error }`. Parses defensively — a
 * bad/blurry image simply yields low confidence.
 */
export async function extractIdData(
  images: { base64: string; mime: string }[]
): Promise<{ success: boolean; data?: ExtractedId; error?: string }> {
  if (!GEMINI_API_KEY) return { success: false, error: "GEMINI_API_KEY not set" };
  if (!images.length) return { success: false, error: "No images" };

  const prompt =
    "You are an ID document OCR engine. Read the attached government ID image(s) " +
    "(a national ID / NID, passport, or driving licence — front and, if present, back) " +
    "and return ONLY a compact JSON object (no markdown, no prose) with these keys: " +
    '{"isIdDocument": boolean, "fullName": string|null, "dateOfBirth": "YYYY-MM-DD"|null, ' +
    '"idNumber": string|null, "documentType": string|null, "expiry": "YYYY-MM-DD"|null, ' +
    '"fatherName": string|null, "motherName": string|null, "address": string|null, ' +
    '"bloodGroup": string|null, "confidence": number}. ' +
    "isIdDocument is true ONLY if the image is genuinely a government identity document; " +
    "set it false for selfies, random photos, screenshots, or anything that is not an ID. " +
    "confidence is 0..1 for how clearly the document + fields are readable and look genuine. " +
    "If the image is not an ID or is unreadable, set isIdDocument false and confidence low (<0.2). " +
    "fatherName/motherName/address/bloodGroup appear on a Bangladesh NID (parents on the front, " +
    "address + blood group on the back) — fill them when visible. Dates must be ISO. " +
    "Do not invent values — use null when a field is not visible.";

  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              ...images.map((im) => ({
                inline_data: { mime_type: im.mime, data: im.base64 },
              })),
            ],
          },
        ],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, error: err?.error?.message ?? `HTTP ${res.status}` };
    }
    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const json = safeJson(text);
    if (!json) return { success: false, error: "Could not parse OCR result" };
    const conf = Number(json.confidence);
    return {
      success: true,
      data: {
        fullName: str(json.fullName),
        dateOfBirth: str(json.dateOfBirth),
        idNumber: str(json.idNumber),
        documentType: str(json.documentType),
        expiry: str(json.expiry),
        confidence: Number.isFinite(conf) ? Math.min(Math.max(conf, 0), 1) : 0,
        // Default to true when the model omits the flag, so a missing key never
        // triggers a false rejection — the caller also gates on confidence.
        isIdDocument: typeof json.isIdDocument === "boolean" ? json.isIdDocument : true,
        fatherName: str(json.fatherName),
        motherName: str(json.motherName),
        address: str(json.address),
        bloodGroup: str(json.bloodGroup),
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Request failed" };
  }
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function safeJson(text: string): Record<string, unknown> | null {
  const raw = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Generate an image from a text prompt using an image-capable Gemini model
 * (default `gemini-2.5-flash-image`, overridable via GEMINI_IMAGE_MODEL).
 * Returns the raw base64 image data + its mime type, or an error string.
 * NOTE: image generation may require billing enabled on the Google AI project;
 * when the key lacks access the API's message is passed through in `error`.
 */
export async function generateImage(
  prompt: string
): Promise<{ success: boolean; imageBase64?: string; mimeType?: string; error?: string }> {
  if (!GEMINI_API_KEY) return { success: false, error: "GEMINI_API_KEY not set" };
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        success: false,
        error: err?.error?.message ?? `HTTP ${res.status}`,
      };
    }
    const data = await res.json();
    const parts: Array<{ inlineData?: { data?: string; mimeType?: string } }> =
      data?.candidates?.[0]?.content?.parts ?? [];
    const imgPart = parts.find((p) => p.inlineData?.data);
    const imageBase64 = imgPart?.inlineData?.data;
    if (!imageBase64) {
      // Some refusals come back as a text part instead of an image.
      const textPart = (parts as Array<{ text?: string }>).find((p) => p.text)?.text;
      return { success: false, error: textPart?.trim() || "No image returned by the model" };
    }
    return {
      success: true,
      imageBase64,
      mimeType: imgPart?.inlineData?.mimeType || "image/png",
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Request failed",
    };
  }
}

/**
 * Generate quiz questions using Gemini AI
 */
export async function generateQuizQuestions(
  options: GenerateQuizOptions
): Promise<{ success: boolean; questions?: QuizQuestion[]; error?: string }> {
  if (!isGeminiConfigured()) {
    return { success: false, error: "Gemini AI not configured" };
  }

  const { topic, difficulty, questionCount, category } = options;

  const prompt = `Generate ${questionCount} multiple-choice quiz questions about "${topic}"${category ? ` in the ${category} category` : ""}.

Difficulty level: ${difficulty}

Requirements:
- Each question should have exactly 4 options (A, B, C, D)
- Only one option should be correct
- Questions should be clear and educational
- Provide a brief explanation for the correct answer

Return the response in the following JSON format only (no markdown, no code blocks, just JSON):
{
  "questions": [
    {
      "id": 1,
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "Brief explanation of why this is correct"
    }
  ]
}

Important:
- correctAnswer should be the index (0-3) of the correct option
- Do not include any text before or after the JSON
- Ensure valid JSON formatting`;

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Gemini API error:", error);
      return { success: false, error: "Failed to generate questions" };
    }

    const data = await response.json();
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textContent) {
      return { success: false, error: "Empty response from Gemini" };
    }

    // Parse the JSON response
    try {
      // Clean up the response (remove markdown code blocks if present)
      let cleanJson = textContent.trim();
      if (cleanJson.startsWith("```json")) {
        cleanJson = cleanJson.slice(7);
      }
      if (cleanJson.startsWith("```")) {
        cleanJson = cleanJson.slice(3);
      }
      if (cleanJson.endsWith("```")) {
        cleanJson = cleanJson.slice(0, -3);
      }
      cleanJson = cleanJson.trim();

      const parsed = JSON.parse(cleanJson);
      return { success: true, questions: parsed.questions };
    } catch (parseError) {
      console.error("Error parsing Gemini response:", parseError, textContent);
      return { success: false, error: "Failed to parse quiz questions" };
    }
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Validate a user's answer with AI explanation
 */
export async function validateAnswerWithAI(
  options: ValidateAnswerOptions
): Promise<{
  success: boolean;
  isCorrect?: boolean;
  feedback?: string;
  error?: string;
}> {
  if (!isGeminiConfigured()) {
    return { success: false, error: "Gemini AI not configured" };
  }

  const { question, userAnswer, correctAnswer } = options;

  const prompt = `Evaluate this quiz answer:

Question: ${question}
User's Answer: ${userAnswer}
Correct Answer: ${correctAnswer}

Provide a brief evaluation in JSON format:
{
  "isCorrect": true or false,
  "feedback": "Brief feedback explaining why the answer is correct or incorrect"
}

Only return the JSON, no additional text.`;

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 512,
        },
      }),
    });

    if (!response.ok) {
      return { success: false, error: "Failed to validate answer" };
    }

    const data = await response.json();
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textContent) {
      return { success: false, error: "Empty response from Gemini" };
    }

    try {
      let cleanJson = textContent.trim();
      if (cleanJson.startsWith("```json")) {
        cleanJson = cleanJson.slice(7);
      }
      if (cleanJson.startsWith("```")) {
        cleanJson = cleanJson.slice(3);
      }
      if (cleanJson.endsWith("```")) {
        cleanJson = cleanJson.slice(0, -3);
      }
      cleanJson = cleanJson.trim();

      const parsed = JSON.parse(cleanJson);
      return {
        success: true,
        isCorrect: parsed.isCorrect,
        feedback: parsed.feedback,
      };
    } catch {
      // Fallback to simple comparison
      return {
        success: true,
        isCorrect: userAnswer.toLowerCase() === correctAnswer.toLowerCase(),
        feedback: "Answer evaluated",
      };
    }
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Generate quiz questions for a specific task
 */
export async function generateTaskQuiz(
  taskTitle: string,
  taskDescription: string,
  contentUrl?: string
): Promise<{ success: boolean; questions?: QuizQuestion[]; error?: string }> {
  if (!isGeminiConfigured()) {
    return { success: false, error: "Gemini AI not configured" };
  }

  const prompt = `Generate 5 multiple-choice quiz questions based on this task:

Title: ${taskTitle}
Description: ${taskDescription}
${contentUrl ? `Related content: ${contentUrl}` : ""}

Generate questions that test understanding of the task content.

Requirements:
- Each question should have exactly 4 options
- Only one option should be correct
- Questions should be relevant to the task

Return the response in JSON format only:
{
  "questions": [
    {
      "id": 1,
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "Brief explanation"
    }
  ]
}`;

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!response.ok) {
      return { success: false, error: "Failed to generate quiz" };
    }

    const data = await response.json();
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textContent) {
      return { success: false, error: "Empty response from Gemini" };
    }

    try {
      let cleanJson = textContent.trim();
      if (cleanJson.startsWith("```json")) {
        cleanJson = cleanJson.slice(7);
      }
      if (cleanJson.startsWith("```")) {
        cleanJson = cleanJson.slice(3);
      }
      if (cleanJson.endsWith("```")) {
        cleanJson = cleanJson.slice(0, -3);
      }
      cleanJson = cleanJson.trim();

      const parsed = JSON.parse(cleanJson);
      return { success: true, questions: parsed.questions };
    } catch (parseError) {
      console.error("Error parsing quiz response:", parseError);
      return { success: false, error: "Failed to parse quiz" };
    }
  } catch (error) {
    console.error("Error generating task quiz:", error);
    return { success: false, error: String(error) };
  }
}
