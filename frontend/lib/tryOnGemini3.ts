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

  // Build the user message parts: instructions + base image + clothing images
  const parts: Array<{
    text?: string;
    inlineData?: {
      mimeType: string;
      data: string;
    };
  }> = [
    {
      text:
        "You are a fashion virtual try on engine. " +
        "Use the first image as the person that must stay consistent. " +
        "Use the other images as clothing items. " +
        "Generate one photorealistic image of the same person wearing all of the clothes, " +
        "neutral clean studio background, flattering lighting, full body if possible.",
    },
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

  // Use REST API directly to avoid TypeScript type issues
  const baseUrl = "https://generativelanguage.googleapis.com/v1beta/models";
  const modelName = "gemini-3-pro-image-preview";
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
          parts,
        },
      ],
      generationConfig: {
        // Required for Gemini image models: must return both text and image
        responseModalities: ["TEXT", "IMAGE"],
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const candidates = data.candidates ?? [];
  if (!candidates.length) {
    throw new Error("No candidates returned from Gemini 3 Pro Image");
  }

  const contentParts = candidates[0].content?.parts ?? [];

  // Find the first image in the response
  const imagePart = contentParts.find(
    (p: { inlineData?: { data?: string; mimeType?: string } }) => p.inlineData && p.inlineData.data
  );
  if (!imagePart) {
    throw new Error("No image part in Gemini response");
  }

  const b64 = imagePart.inlineData.data as string;
  const mimeType = imagePart.inlineData.mimeType || "image/png";
  return `data:${mimeType};base64,${b64}`;
}

