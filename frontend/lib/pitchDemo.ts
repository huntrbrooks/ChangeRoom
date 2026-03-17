export type DemoProduct = {
  title: string;
  price: string;
  link: string;
  thumbnail: string;
  source: string;
};

export type DemoAnalyzedItem = {
  index: number;
  original_filename: string;
  analysis: {
    body_region: string;
    category: string;
    detailed_description: string;
    short_description: string;
    description: string;
    suggested_filename: string;
    metadata: Record<string, unknown>;
    item_type?: string;
    color?: string;
    style?: string;
    brand?: string;
    tags?: string[];
  };
  status: "success";
};

const DEMO_TRY_ON_RESULT_PATH = "/try-on-result.jpg";

const DEMO_PRODUCTS: DemoProduct[] = [
  {
    title: "Aster Lane Sculpt Tank",
    price: "$69",
    link: "/pricing",
    thumbnail: "/TRYON/Cloths/IMG_1084 2.jpg",
    source: "Demo boutique",
  },
  {
    title: "Aster Lane Weekend Dress",
    price: "$129",
    link: "/pricing",
    thumbnail: "/try-on-result (1).jpg",
    source: "Demo boutique",
  },
  {
    title: "Aster Lane Tailored Shirt",
    price: "$89",
    link: "/pricing",
    thumbnail: "/TRYON/Cloths/s1899335_f_r_club_exx_multi_296307_0141_25_03_27.png",
    source: "Demo boutique",
  },
];

function inferCategory(fileName: string): string {
  const normalized = fileName.toLowerCase();

  if (
    /(dress|gown|jumpsuit|romper|onesie|overall)/.test(normalized)
  ) {
    return "full_body";
  }

  if (
    /(pant|pants|jean|jeans|skirt|short|shorts|legging|trouser|bottom)/.test(normalized)
  ) {
    return "lower_body";
  }

  if (/(shoe|shoes|heel|heels|boot|boots|sneaker|sneakers)/.test(normalized)) {
    return "shoes";
  }

  if (/(bag|belt|hat|jewel|glove|scarf|accessory)/.test(normalized)) {
    return "accessories";
  }

  return "upper_body";
}

function inferItemType(fileName: string, category: string): string {
  const normalized = fileName
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized) {
    return normalized;
  }

  switch (category) {
    case "full_body":
      return "dress";
    case "lower_body":
      return "bottoms";
    case "shoes":
      return "shoes";
    case "accessories":
      return "accessories";
    default:
      return "top";
  }
}

function inferColor(fileName: string): string | undefined {
  const normalized = fileName.toLowerCase();
  const palette = [
    "black",
    "white",
    "ivory",
    "cream",
    "blue",
    "navy",
    "red",
    "pink",
    "green",
    "olive",
    "beige",
    "brown",
    "grey",
    "gray",
  ];

  return palette.find((entry) => normalized.includes(entry));
}

export function buildDemoAnalyses(files: File[], startIndex = 0): DemoAnalyzedItem[] {
  return files.map((file, offset) => {
    const category = inferCategory(file.name);
    const itemType = inferItemType(file.name, category);
    const color = inferColor(file.name);
    const description = `${itemType}${color ? ` in ${color}` : ""}`.trim();

    return {
      index: startIndex + offset,
      original_filename: file.name,
      analysis: {
        body_region: category,
        category,
        item_type: itemType,
        color,
        style: "demo_preview",
        brand: "Demo upload",
        short_description: description,
        detailed_description: description,
        description,
        suggested_filename: file.name,
        tags: ["demo-preview"],
        metadata: {
          demoPreview: true,
          category,
          item_type: itemType,
          color: color ?? null,
        },
      },
      status: "success",
    };
  });
}

export function getDemoTryOnImageUrl(cacheBust = Date.now()): string {
  return `${DEMO_TRY_ON_RESULT_PATH}?demo=${cacheBust}`;
}

export function getDemoTryOnProducts(): DemoProduct[] {
  return DEMO_PRODUCTS.map((product) => ({ ...product }));
}
