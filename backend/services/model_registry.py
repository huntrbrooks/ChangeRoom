import os
from dataclasses import dataclass
from typing import Iterable, List, Optional, Tuple


@dataclass(frozen=True)
class TaskModelConfig:
    env_keys: Tuple[str, ...]
    default_model: str
    fallback_models: Tuple[str, ...] = ()


GEMINI_TASKS = {
    "garment_analysis": TaskModelConfig(
        env_keys=("GEMINI_GARMENT_ANALYZE_MODEL", "GEMINI_VISION_MODEL", "GEMINI_TEXT_MODEL"),
        default_model="gemini-3-flash-preview",
        fallback_models=(
            "gemini-2.5-flash",
            "gemini-2.5-flash-lite",
            "gemini-3-pro-image-preview",
            "gemini-3-pro-preview",
        ),
    ),
    "user_analysis": TaskModelConfig(
        env_keys=("GEMINI_USER_ANALYZE_MODEL", "GEMINI_VISION_MODEL", "GEMINI_TEXT_MODEL"),
        default_model="gemini-3-flash-preview",
        fallback_models=(
            "gemini-2.5-flash",
            "gemini-2.5-flash-lite",
            "gemini-3-pro-image-preview",
            "gemini-3-pro-preview",
        ),
    ),
    "rewrite": TaskModelConfig(
        env_keys=("GEMINI_REWRITE_MODEL", "GEMINI_TEXT_MODEL"),
        default_model="gemini-3-flash-preview",
        fallback_models=(
            "gemini-2.5-flash",
            "gemini-2.5-flash-lite",
            "gemini-3-pro-image-preview",
            "gemini-3-pro-preview",
        ),
    ),
    "intimate_detect": TaskModelConfig(
        env_keys=("GEMINI_INTIMATE_DETECT_MODEL", "GEMINI_VISION_MODEL", "GEMINI_TEXT_MODEL"),
        default_model="gemini-3-flash-preview",
        fallback_models=(
            "gemini-2.5-flash",
            "gemini-2.5-flash-lite",
            "gemini-3-pro-image-preview",
            "gemini-3-pro-preview",
        ),
    ),
}


OPENAI_TASKS = {
    "tryon_image": TaskModelConfig(
        env_keys=("OPENAI_TRYON_IMAGE_MODEL", "OPENAI_IMAGE_MODEL"),
        default_model="gpt-image-2",
        fallback_models=(
            "gpt-image-1.5",
            "gpt-image-1",
            "gpt-image-1-mini",
        ),
    ),
    "model_photo_analysis": TaskModelConfig(
        env_keys=("OPENAI_MODEL_PHOTO_ANALYSIS_MODEL", "OPENAI_VISION_MODEL", "OPENAI_MODEL"),
        default_model="gpt-5-mini",
        fallback_models=(
            "gpt-5-mini-2025-08-07",
            "gpt-4.1-mini",
            "gpt-4o-mini",
        ),
    ),
    "clothing_analysis": TaskModelConfig(
        env_keys=("OPENAI_CLOTHING_ANALYZE_MODEL", "OPENAI_VISION_MODEL", "OPENAI_MODEL"),
        default_model="gpt-5-mini",
        fallback_models=(
            "gpt-5-mini-2025-08-07",
            "gpt-4.1-mini",
            "gpt-4o-mini",
        ),
    ),
    "clothing_preprocess": TaskModelConfig(
        env_keys=("OPENAI_PREPROCESS_CLOTHING_MODEL", "OPENAI_VISION_MODEL", "OPENAI_MODEL"),
        default_model="gpt-5-mini",
        fallback_models=(
            "gpt-5-mini-2025-08-07",
            "gpt-4.1-mini",
            "gpt-4o-mini",
        ),
    ),
}


def unique_model_names(models: Iterable[Optional[str]]) -> List[str]:
    unique: List[str] = []
    seen = set()
    for model in models:
        normalized = (model or "").strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        unique.append(normalized)
    return unique


def gemini_generate_content_endpoints(model: str) -> List[str]:
    return [
        f"https://generativelanguage.googleapis.com/v1/models/{model}:generateContent",
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
    ]


def get_task_config(task_family: str, task_name: str) -> TaskModelConfig:
    if task_family == "gemini":
        registry = GEMINI_TASKS
    elif task_family == "openai":
        registry = OPENAI_TASKS
    else:
        raise ValueError(f"Unknown model family: {task_family}")
    try:
        return registry[task_name]
    except KeyError as exc:
        raise ValueError(f"Unknown {task_family} model task: {task_name}") from exc


def get_openai_model(task_name: str) -> str:
    config = get_task_config("openai", task_name)
    for env_key in config.env_keys:
        env_value = (os.getenv(env_key) or "").strip()
        if env_value:
            return env_value
    return config.default_model


def get_openai_model_candidates(
    task_name: str,
    *,
    extra_models: Optional[Iterable[Optional[str]]] = None,
) -> List[str]:
    config = get_task_config("openai", task_name)
    configured_models = [(os.getenv(env_key) or "").strip() for env_key in config.env_keys]
    models = list(extra_models or [])
    models.extend(configured_models)
    models.append(config.default_model)
    models.extend(config.fallback_models)
    return unique_model_names(models)


def get_gemini_configured_model(task_name: str) -> str:
    config = get_task_config("gemini", task_name)
    for env_key in config.env_keys:
        env_value = (os.getenv(env_key) or "").strip()
        if env_value:
            return env_value
    return config.default_model


def get_gemini_model_candidates(
    task_name: str,
    *,
    extra_models: Optional[Iterable[Optional[str]]] = None,
) -> List[str]:
    config = get_task_config("gemini", task_name)
    configured_models = [(os.getenv(env_key) or "").strip() for env_key in config.env_keys]
    models = list(extra_models or [])
    models.extend(configured_models)
    models.append(config.default_model)
    models.extend(config.fallback_models)
    return unique_model_names(models)
