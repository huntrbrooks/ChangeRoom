import { geminiConfig } from "./config";

type TryOnArgs = {
  baseImage: string;        // base64, no data URL prefix
  baseImageMimeType?: string; // optional mime type, defaults to image/png
  clothingImages: string[]; // array of base64 strings
  clothingMimeTypes?: string[]; // optional mime types array, defaults to image/png
};

export async function generateTryOnWithGemini3ProImage({
  baseImage,
  baseImageMimeType = "image/png",
  clothingImages,
  clothingMimeTypes,
}: TryOnArgs): Promise<string> {
  if (!baseImage) throw new Error("Missing baseImage");
  if (!clothingImages.length) throw new Error("No clothing images");

  const apiKey = geminiConfig.apiKey;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const basePrompt =
    "You are a fashion virtual try on engine. " +
    "Use the first image as the person that must stay consistent. " +
    "Use the other images as clothing items. " +
    "Generate one photorealistic image of the same person wearing all of the clothes, " +
    "neutral clean studio background, flattering lighting, full body if possible. " +
    "Ensure the result is tasteful and appropriate. If any item looks intimate or revealing, " +
    "subtly increase coverage while keeping the garment recognizable.";

  const buildParts = (textPrompt: string) => {
    const parts: Array<{
      text?: string;
      inlineData?: {
        mimeType: string;
        data: string;
      };
    }> = [
      { text: textPrompt },
      {
        inlineData: {
          mimeType: baseImageMimeType,
          data: baseImage,
        },
      },
    ];

    for (let i = 0; i < clothingImages.length; i++) {
      const mimeType = clothingMimeTypes?.[i] || "image/png";
      parts.push({
        inlineData: {
          mimeType,
          data: clothingImages[i],
        },
      });
    }
    return parts;
  };

  // Use REST API directly to avoid TypeScript type issues
  const baseUrl = "https://generativelanguage.googleapis.com/v1beta/models";
  const modelName = "gemini-3-pro-image-preview";

  // 4 total tries = 1 initial attempt + 3 retries
  const maxAttempts = 4;
  let lastErrorDetail = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const retrySuffix =
      attempt === 1
        ? ""
        : ` RETRY ${attempt}: If the garment could be considered intimate, automatically add lining/opacity and keep framing professional.`;

    const endpoint = `${baseUrl}/${modelName}:generateContent?key=${apiKey}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: buildParts(basePrompt + retrySuffix),
          },
        ],
        generationConfig: {
          // Required for Gemini image models: must return both text and image
          responseModalities: ["TEXT", "IMAGE"],
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_LOW_AND_ABOVE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      lastErrorDetail = `status ${response.status}: ${errorText}`;
      if (attempt === maxAttempts) {
        throw new Error(`Gemini API error after ${maxAttempts} attempts: ${lastErrorDetail}`);
      }
      continue;
    }

    const data = await response.json();
    const candidates = data.candidates ?? [];
    if (!candidates.length) {
      lastErrorDetail = "No candidates returned";
      if (attempt === maxAttempts) {
        throw new Error("No candidates returned from Gemini 3 Pro Image");
      }
      continue;
    }

    const candidate = candidates[0];
    const finishReason = candidate.finishReason || candidate.finish_reason;
    const contentParts = candidate.content?.parts ?? [];

    const imagePart = contentParts.find(
      (p: { inlineData?: { data?: string; mimeType?: string } }) => p.inlineData && p.inlineData.data
    );

    if (imagePart && (!finishReason || finishReason === "STOP")) {
      const b64 = imagePart.inlineData!.data as string;
      const mimeType = imagePart.inlineData!.mimeType || "image/png";
      return `data:${mimeType};base64,${b64}`;
    }

    const textParts = contentParts
      .filter((p: { text?: string }) => !!p.text)
      .map((p: { text?: string }) => p.text as string);

    lastErrorDetail = `finishReason=${finishReason || "UNKNOWN"}, text="${textParts[0] || ""}"`;
    if (attempt === maxAttempts) {
      throw new Error(`No image generated after ${maxAttempts} attempts. ${lastErrorDetail}`);
    }
  }

  throw new Error(`No image generated. ${lastErrorDetail}`);
}

