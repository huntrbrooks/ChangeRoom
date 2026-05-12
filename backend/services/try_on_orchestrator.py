from typing import Any, Dict, List, Optional

from . import vton


async def perform_try_on(
    model_image: Any,
    clothing_items: List[Any],
    *,
    category: str = "upper_body",
    model_metadata: Optional[Dict[str, Any]] = None,
    garment_metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Stack-native equivalent of the requested performTryOn(modelImage, clothingItems[]).

    The provider waterfall itself lives in services.vton.generate_try_on so existing
    endpoint/tests keep their integration point:
      OpenAI -> OpenRouter -> xAI/Grok.
    """
    user_attributes: Dict[str, Any] = {}
    if model_metadata:
        user_attributes.update(
            {
                "body_pose": model_metadata.get("model:bodyPose") or model_metadata.get("body_pose"),
                "skin_tone": model_metadata.get("model:skinTone") or model_metadata.get("skin_tone"),
                "approximate_measurements": (
                    model_metadata.get("model:approximateMeasurements")
                    or model_metadata.get("approximate_measurements")
                ),
                "proportions": model_metadata.get("model:proportions") or model_metadata.get("proportions"),
                "lighting_condition": (
                    model_metadata.get("model:lightingCondition")
                    or model_metadata.get("lighting_condition")
                ),
                "background_type": (
                    model_metadata.get("model:backgroundType")
                    or model_metadata.get("background_type")
                ),
                "model_metadata": model_metadata,
            }
        )

    return await vton.generate_try_on(
        [model_image],
        clothing_items,
        category=category,
        garment_metadata=garment_metadata or {},
        user_attributes=user_attributes,
        main_index=0,
    )


# Alias kept for teams looking for the TypeScript-style function name in docs.
performTryOn = perform_try_on
