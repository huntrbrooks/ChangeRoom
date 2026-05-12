from typing import Any, Dict, List

from .preprocess_clothing import preprocess_clothing_batch


async def process_clothing_items(
    image_files: List[bytes],
    original_filenames: List[str],
    *,
    output_dir: str = "uploads",
) -> List[Dict[str, Any]]:
    """
    Named facade for the clothing upload pipeline.

    The implementation delegates to preprocess_clothing_batch, which performs
    per-item OpenAI/OpenRouter analysis, category/body-zone normalization,
    metadata embedding, storage, and response shaping for the frontend.
    """
    return await preprocess_clothing_batch(image_files, original_filenames, output_dir=output_dir)
