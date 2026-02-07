"""
YOLO Model Inference Module.

Loads the trained model and runs inference on cell images.
"""

import io
import logging
from typing import Dict, List, Any

from PIL import Image
from ultralytics import YOLO

from config import config

logger = logging.getLogger(__name__)

# Load model once at startup
logger.info(f"Loading model from {config.model_path}")
model = YOLO(config.model_path)
logger.info("Model loaded successfully")

# Class mapping - adjust based on your model training
# Map Model Class ID -> System Category (normal, apoptosis, other)
# Based on user training: 0:Apoptosis, 1:Normal, 2:Uncertain
CLASS_NAMES = {
    0: "apoptosis",  # Apoptosis -> apoptosis
    1: "normal",     # Normal -> normal
    2: "other"       # Uncertain -> other
}

def run_inference(image_bytes: bytes) -> Dict[str, Any]:
    """Run YOLO inference on image bytes.

    Args:
        image_bytes: Raw image content as bytes

    Returns:
        Dictionary containing:
        - counts: Dict with viable, apoptosis, other counts (viable = normal cells for DB)
        - avg_confidence: Average confidence score
        - bounding_boxes: List of detection bounding boxes (class names: normal, apoptosis, other)
        - summary: Human-readable summary string
    """
    # Load image from bytes
    image = Image.open(io.BytesIO(image_bytes))

    # Run inference
    results = model(image)[0]

    # Parse results
    counts = {"viable": 0, "apoptosis": 0, "other": 0}
    bounding_boxes: List[Dict] = []
    total_confidence = 0.0

    for box in results.boxes:
        cls_id = int(box.cls[0])
        confidence = float(box.conf[0])
        x1, y1, x2, y2 = box.xyxy[0].tolist()

        # Map class ID to name
        class_name = CLASS_NAMES.get(cls_id, "other")
        # For counts dict, map "normal" -> "viable" for DB column compatibility
        count_key = "viable" if class_name == "normal" else class_name
        counts[count_key] += 1
        total_confidence += confidence

        bounding_boxes.append(
            {
                "class": class_name,
                "confidence": round(confidence, 3),
                "x": int(x1),
                "y": int(y1),
                "width": int(x2 - x1),
                "height": int(y2 - y1),
            }
        )

    total_cells = sum(counts.values())
    avg_confidence = total_confidence / total_cells if total_cells > 0 else 0.0

    # Generate Thai summary
    if total_cells > 0:
        normal_pct = counts["viable"] / total_cells * 100  # viable = normal cells
        apoptosis_pct = counts["apoptosis"] / total_cells * 100
        other_pct = counts["other"] / total_cells * 100
    else:
        normal_pct = apoptosis_pct = other_pct = 0.0

    summary = (
        f"พบเซลล์ทั้งหมด {total_cells} เซลล์: "
        f"Normal {counts['viable']} ({normal_pct:.1f}%), "
        f"Apoptosis {counts['apoptosis']} ({apoptosis_pct:.1f}%), "
        f"Other {counts['other']} ({other_pct:.1f}%)"
    )

    logger.info(f"Inference complete: {total_cells} cells detected")

    return {
        "counts": counts,
        "avg_confidence": round(avg_confidence, 3),
        "bounding_boxes": bounding_boxes,
        "summary": summary,
    }
