/**
 * Wearing style options for different clothing items
 * Maps category and item_type to available wearing style options
 */

export type WearingStyleOption = {
  value: string;
  label: string;
  promptText: string; // Text to include in AI prompt for try-on
};

export type WearingStyleConfig = {
  category: string;
  itemTypes?: string[]; // Specific item types that have these options
  options: WearingStyleOption[];
};

// Define wearing style configurations
const WEARING_STYLE_CONFIGS: WearingStyleConfig[] = [
  // Hats/Caps (accessories)
  {
    category: "accessories",
    itemTypes: ["hat", "cap"],
    options: [
      {
        value: "frontways",
        label: "Frontways",
        promptText: "worn frontways (bill facing forward)",
      },
      {
        value: "backwards",
        label: "Backwards",
        promptText: "worn backwards (bill facing backward)",
      },
      {
        value: "to_the_side",
        label: "To the Side",
        promptText: "worn to the side (bill facing to one side)",
      },
    ],
  },
  {
    category: "accessories",
    itemTypes: ["beanie"],
    options: [
      {
        value: "normal",
        label: "Normal",
        promptText: "worn normally",
      },
      {
        value: "folded",
        label: "Folded",
        promptText: "worn folded at the bottom",
      },
      {
        value: "pushed_back",
        label: "Pushed Back",
        promptText: "worn pushed back on the head",
      },
    ],
  },
  {
    category: "accessories",
    itemTypes: ["fedora", "flat_cap"],
    options: [
      {
        value: "normal",
        label: "Normal",
        promptText: "worn normally",
      },
      {
        value: "tilted",
        label: "Tilted",
        promptText: "worn tilted to one side",
      },
    ],
  },

  // Shirts/Tops (upper_body)
  {
    category: "upper_body",
    itemTypes: ["tshirt", "shirt"],
    options: [
      {
        value: "untucked",
        label: "Untucked",
        promptText: "worn untucked",
      },
      {
        value: "tucked_in",
        label: "Tucked In",
        promptText: "worn tucked into pants",
      },
      {
        value: "half_tucked",
        label: "Half-Tucked",
        promptText: "worn half-tucked (partially tucked in)",
      },
    ],
  },
  {
    category: "upper_body",
    itemTypes: ["button_down", "dress_shirt"],
    options: [
      {
        value: "fully_buttoned",
        label: "Fully Buttoned",
        promptText: "worn fully buttoned",
      },
      {
        value: "partially_unbuttoned",
        label: "Partially Unbuttoned",
        promptText: "worn with top buttons unbuttoned",
      },
      {
        value: "fully_unbuttoned",
        label: "Fully Unbuttoned (as overshirt)",
        promptText: "worn fully unbuttoned as an overshirt",
      },
    ],
  },
  {
    category: "upper_body",
    itemTypes: ["hoodie", "sweatshirt"],
    options: [
      {
        value: "zipped",
        label: "Zipped",
        promptText: "worn zipped up",
      },
      {
        value: "unzipped",
        label: "Unzipped",
        promptText: "worn unzipped",
      },
      {
        value: "hood_up",
        label: "Hood Up",
        promptText: "worn with hood up",
      },
      {
        value: "hood_down",
        label: "Hood Down",
        promptText: "worn with hood down",
      },
    ],
  },

  // Outerwear
  {
    category: "outerwear",
    itemTypes: ["jacket", "blazer", "coat"],
    options: [
      {
        value: "closed",
        label: "Zipped/Buttoned",
        promptText: "worn closed (zipped or buttoned)",
      },
      {
        value: "open",
        label: "Open/Unbuttoned",
        promptText: "worn open (unzipped or unbuttoned)",
      },
    ],
  },
  {
    category: "outerwear",
    itemTypes: ["cardigan"],
    options: [
      {
        value: "buttoned",
        label: "Buttoned",
        promptText: "worn buttoned",
      },
      {
        value: "unbuttoned",
        label: "Unbuttoned",
        promptText: "worn unbuttoned",
      },
    ],
  },

  // Pants (lower_body)
  {
    category: "lower_body",
    itemTypes: ["pants", "jeans"],
    options: [
      {
        value: "cuffed",
        label: "Cuffed",
        promptText: "worn with cuffed hem",
      },
      {
        value: "uncuffed",
        label: "Uncuffed",
        promptText: "worn with uncuffed hem",
      },
      {
        value: "rolled_up",
        label: "Rolled Up",
        promptText: "worn with rolled up hem",
      },
    ],
  },
  {
    category: "lower_body",
    itemTypes: ["sweatpants", "joggers"],
    options: [
      {
        value: "normal",
        label: "Normal",
        promptText: "worn normally",
      },
      {
        value: "rolled_at_ankles",
        label: "Rolled at Ankles",
        promptText: "worn with rolled up at ankles",
      },
    ],
  },

  // Shoes
  {
    category: "shoes",
    itemTypes: ["sneakers", "trainers"],
    options: [
      {
        value: "laced_tight",
        label: "Laced Tight",
        promptText: "worn with laces tied tightly",
      },
      {
        value: "loosely_laced",
        label: "Loosely Laced",
        promptText: "worn with laces tied loosely",
      },
      {
        value: "unlaced",
        label: "Unlaced",
        promptText: "worn unlaced (tongue out style)",
      },
    ],
  },
  {
    category: "shoes",
    itemTypes: ["boots"],
    options: [
      {
        value: "zipped",
        label: "Zipped",
        promptText: "worn zipped up",
      },
      {
        value: "unzipped",
        label: "Unzipped",
        promptText: "worn unzipped",
      },
    ],
  },

  // Accessories
  {
    category: "accessories",
    itemTypes: ["scarf"],
    options: [
      {
        value: "draped",
        label: "Draped",
        promptText: "worn draped around neck",
      },
      {
        value: "wrapped_once",
        label: "Wrapped Once",
        promptText: "worn wrapped once around neck",
      },
      {
        value: "wrapped_twice",
        label: "Wrapped Twice",
        promptText: "worn wrapped twice around neck",
      },
      {
        value: "knotted",
        label: "Knotted",
        promptText: "worn knotted at the front",
      },
    ],
  },
];

/**
 * Get available wearing style options for a given category and item type
 * @param category - Clothing category (e.g., "accessories", "upper_body")
 * @param itemType - Specific item type (e.g., "hat", "tshirt")
 * @returns Array of wearing style options, or empty array if none available
 */
export function getWearingStyleOptions(
  category: string,
  itemType?: string
): WearingStyleOption[] {
  if (!category) return [];

  // Normalize inputs
  let normalizedCategory = category.toLowerCase().trim();
  const normalizedItemType = itemType?.toLowerCase().trim();

  // Category aliasing:
  // The backend currently returns high-level body regions like "upper_body", but we still want
  // outerwear-specific options for items like jackets/coats/blazers/cardigans.
  if (normalizedCategory === "upper_body" && normalizedItemType) {
    const outerwearKeywords = [
      "jacket",
      "coat",
      "blazer",
      "cardigan",
      "overcoat",
      "windbreaker",
      "parka",
      "anorak",
      "raincoat",
      "trench",
    ];
    if (outerwearKeywords.some((kw) => normalizedItemType.includes(kw))) {
      normalizedCategory = "outerwear";
    }
  }

  // Find matching config
  const config = WEARING_STYLE_CONFIGS.find((cfg) => {
    const categoryMatch = cfg.category === normalizedCategory;

    // If itemTypes are specified, match those too
    if (cfg.itemTypes && normalizedItemType) {
      // Try exact match first
      const exactMatch = cfg.itemTypes.some((type) => type === normalizedItemType);
      if (exactMatch) return categoryMatch && exactMatch;
      
      // Try partial match - check if any itemType is contained in the normalizedItemType or vice versa
      const partialMatch = cfg.itemTypes.some((type) => {
        return normalizedItemType.includes(type) || type.includes(normalizedItemType);
      });
      if (partialMatch) return categoryMatch && partialMatch;
      
      // Try matching common variations
      const variations: Record<string, string[]> = {
        'cap': ['baseball cap', 'ball cap', 'cap', 'baseball'],
        'hat': ['hat', 'cap', 'baseball cap', 'baseball'],
        'hoodie': ['hoodie', 'hooded sweatshirt', 'hoody', 'hooded', 'sweatshirt'],
        'sweatshirt': ['sweatshirt', 'hooded sweatshirt', 'hoodie'],
        'pants': ['pants', 'trousers', 'cargo pants', 'cargo', 'jeans'],
        'jeans': ['jeans', 'denim'],
        'boots': ['boots', 'boot'],
        'sneakers': ['sneakers', 'sneaker', 'trainers', 'athletic shoes'],
      };
      
      for (const [key, aliases] of Object.entries(variations)) {
        if (cfg.itemTypes.includes(key)) {
          const hasMatch = aliases.some(alias => 
            normalizedItemType.includes(alias) || alias.includes(normalizedItemType)
          );
          if (hasMatch) return categoryMatch;
        }
      }
      
      return false;
    }

    // If no itemTypes specified, match any item in this category
    // But only if no other configs have specific itemTypes for this category
    if (!cfg.itemTypes) {
      // Check if there are other configs with specific itemTypes for this category
      const hasSpecificConfigs = WEARING_STYLE_CONFIGS.some(
        (c) =>
          c.category === normalizedCategory &&
          c.itemTypes &&
          c.itemTypes.length > 0
      );

      // If there are specific configs, only use this general one if itemType doesn't match any
      if (hasSpecificConfigs && normalizedItemType) {
        const matchesSpecific = WEARING_STYLE_CONFIGS.some(
          (c) =>
            c.category === normalizedCategory &&
            c.itemTypes?.some((type) => type === normalizedItemType)
        );
        return !matchesSpecific;
      }

      return categoryMatch;
    }

    return false;
  });

  return config?.options || [];
}

/**
 * Get the default wearing style option for a category/item type
 * @param category - Clothing category
 * @param itemType - Specific item type
 * @returns Default wearing style value, or null if none available
 */
export function getDefaultWearingStyle(
  category: string,
  itemType?: string
): string | null {
  const options = getWearingStyleOptions(category, itemType);
  if (options.length === 0) return null;

  // Return the first option as default (usually the most common/normal style)
  return options[0].value;
}

/**
 * Get prompt text for a wearing style
 * @param category - Clothing category
 * @param itemType - Specific item type
 * @param wearingStyle - Selected wearing style value
 * @returns Prompt text for AI generation, or null if not found
 */
export function getWearingStylePromptText(
  category: string,
  itemType: string | undefined,
  wearingStyle: string
): string | null {
  const options = getWearingStyleOptions(category, itemType);
  const option = options.find((opt) => opt.value === wearingStyle);
  return option?.promptText || null;
}

/**
 * Check if an item has wearing style options available
 * @param category - Clothing category
 * @param itemType - Specific item type
 * @returns True if wearing style options are available
 */
export function hasWearingStyleOptions(
  category: string,
  itemType?: string
): boolean {
  return getWearingStyleOptions(category, itemType).length > 0;
}
