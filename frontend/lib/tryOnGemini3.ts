import { ai } from "./googleClient";

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

  // Build the user message parts: instructions + base image + clothing images
  const parts: any[] = [
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

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-image-preview",
    contents: [{ role: "user", parts }],
    generationConfig: {
      // Required for Gemini image models: must return both text and image 
      responseModalities: ["TEXT", "IMAGE"],
    },
  });

  const candidates = response.candidates ?? [];
  if (!candidates.length) {
    throw new Error("No candidates returned from Gemini 3 Pro Image");
  }

  const contentParts = candidates[0].content.parts ?? [];

  // Find the first image in the response
  const imagePart = contentParts.find((p: any) => p.inlineData && p.inlineData.data);
  if (!imagePart) {
    throw new Error("No image part in Gemini response");
  }

  const b64 = imagePart.inlineData.data as string;
  const mimeType = imagePart.inlineData.mimeType || "image/png";
  return `data:${mimeType};base64,${b64}`;
}

