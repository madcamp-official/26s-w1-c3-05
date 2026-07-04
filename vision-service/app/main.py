import base64
from io import BytesIO
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from PIL import Image, ImageDraw

from .detector import CatDetector
from .identifier import CatIdentifier
from .schemas import (
    BoundingBox,
    CatAnalysisRequest,
    CatAnalysisResponse,
    CatDetectionRequest,
    CatDetectionResponse,
    CatIdentificationCandidateResponse,
    CatIdentificationRequest,
    CatIdentificationResponse,
    DebugVisionRequest,
)

app = FastAPI(title="Myocatmongo Vision Service", version="0.1.0")
detector = CatDetector()
identifier = CatIdentifier(detector)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/debug", response_class=HTMLResponse)
async def debug_page() -> str:
    return DEBUG_HTML


@app.post("/cat-detection", response_model=CatDetectionResponse)
async def cat_detection(payload: CatDetectionRequest) -> CatDetectionResponse:
    try:
        is_cat, confidence = await detector.detect_from_url(str(payload.imageUrl))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail="Cat detection failed") from error

    return CatDetectionResponse(isCat=is_cat, confidence=confidence)


@app.post("/debug/analyze")
async def debug_analyze(payload: DebugVisionRequest) -> dict[str, Any]:
    try:
        image = await detector.load_image(payload.imageSource)
        detections = detector.detect_boxes(image)
        best_cat_confidence = max((item["confidence"] for item in detections if item["isCat"]), default=0.0)
        query_crop = crop_from_detections(image, detections)

        candidates = []
        for candidate in payload.candidates:
            references = []
            for reference in candidate.references:
                try:
                    reference_image = await detector.load_image(reference.imageSource)
                    reference_detections = detector.detect_boxes(reference_image)
                    reference_crop = crop_from_detections(reference_image, reference_detections)
                    score = identifier.similarity_for_images(query_crop, reference_crop)
                    references.append(
                        {
                            "label": reference.label,
                            "score": score,
                            "catConfidence": max((item["confidence"] for item in reference_detections if item["isCat"]), default=0.0),
                            "cropImage": image_to_data_url(reference_crop),
                            "error": None,
                        }
                    )
                except Exception as error:
                    references.append(
                        {
                            "label": reference.label,
                            "score": 0.0,
                            "catConfidence": 0.0,
                            "cropImage": None,
                            "error": str(error),
                        }
                    )

            references.sort(key=lambda item: item["score"], reverse=True)
            candidates.append(
                {
                    "label": candidate.label,
                    "bestScore": references[0]["score"] if references else 0.0,
                    "references": references,
                }
            )

        candidates.sort(key=lambda item: item["bestScore"], reverse=True)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Debug analysis failed: {error}") from error

    return {
        "threshold": detector.threshold,
        "isCat": best_cat_confidence >= detector.threshold,
        "confidence": round(best_cat_confidence, 4),
        "detections": detections,
        "annotatedImage": image_to_data_url(draw_detections(image, detections)),
        "queryCropImage": image_to_data_url(query_crop),
        "candidates": candidates,
    }


@app.post("/analyze", response_model=CatAnalysisResponse)
async def analyze(payload: CatAnalysisRequest) -> CatAnalysisResponse:
    """Single-pass pipeline: download once, detect, crop, score quality, embed."""
    try:
        image = await detector.download_image(str(payload.imageUrl))
        detections = detector.detect_boxes(image)
        best = detector.best_cat_detection(detections)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail="Cat analysis failed") from error

    if best is None:
        best_confidence = max((item["confidence"] for item in detections if item["isCat"]), default=0.0)
        return CatAnalysisResponse(
            isCat=False,
            confidence=round(float(best_confidence), 4),
            modelName=identifier.model_name,
        )

    confidence = round(float(best["confidence"]), 4)
    if confidence < detector.threshold:
        return CatAnalysisResponse(isCat=False, confidence=confidence, modelName=identifier.model_name)

    box = best["box"]
    quality = detector.quality_metrics(image, box)
    dominant_color = detector.dominant_color(image, box)
    crop = detector.crop_box(image, box)
    embedding = identifier.embedding_list(crop)

    return CatAnalysisResponse(
        isCat=True,
        confidence=confidence,
        bbox=BoundingBox(**{key: int(box[key]) for key in ("x1", "y1", "x2", "y2")}),
        qualityScore=quality["qualityScore"],
        qualityReason=quality["qualityReason"],
        dominantColor=dominant_color,
        modelName=identifier.model_name,
        embedding=embedding,
        cropImage=image_to_jpeg_data_url(crop) if payload.includeCrop else None,
    )


@app.post("/cat-identification", response_model=CatIdentificationResponse)
async def cat_identification(payload: CatIdentificationRequest) -> CatIdentificationResponse:
    try:
        candidates = []
        query_image_url = str(payload.imageUrl)

        for candidate in payload.candidates:
            image_urls = [str(image_url) for image_url in candidate.imageUrls]
            score = await identifier.similarity(query_image_url, image_urls)
            candidates.append(CatIdentificationCandidateResponse(catId=candidate.catId, imageSimilarityScore=score))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail="Cat identification failed") from error

    return CatIdentificationResponse(candidates=sorted(candidates, key=lambda item: item.imageSimilarityScore, reverse=True))


def crop_from_detections(image: Image.Image, detections: list[dict[str, Any]]) -> Image.Image:
    best_detection = None
    best_area = 0
    for detection in detections:
        if not detection["isCat"]:
            continue
        box = detection["box"]
        area = max(0, int(box["x2"]) - int(box["x1"])) * max(0, int(box["y2"]) - int(box["y1"]))
        if area > best_area:
            best_area = area
            best_detection = box

    if best_detection is None:
        return image

    return image.crop((int(best_detection["x1"]), int(best_detection["y1"]), int(best_detection["x2"]), int(best_detection["y2"])))


def draw_detections(image: Image.Image, detections: list[dict[str, Any]]) -> Image.Image:
    annotated = image.copy()
    draw = ImageDraw.Draw(annotated)
    line_width = max(3, min(image.size) // 160)

    for detection in detections:
        box = detection["box"]
        xy = (int(box["x1"]), int(box["y1"]), int(box["x2"]), int(box["y2"]))
        color = "#ef4444" if detection["isCat"] else "#2563eb"
        label = f'{detection["label"]} {float(detection["confidence"]) * 100:.1f}%'
        draw.rectangle(xy, outline=color, width=line_width)
        text_box = draw.textbbox((xy[0], xy[1]), label)
        draw.rectangle((text_box[0] - 4, text_box[1] - 4, text_box[2] + 4, text_box[3] + 4), fill=color)
        draw.text((xy[0], xy[1]), label, fill="white")

    return annotated


def image_to_data_url(image: Image.Image) -> str:
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def image_to_jpeg_data_url(image: Image.Image, quality: int = 85) -> str:
    buffer = BytesIO()
    image.convert("RGB").save(buffer, format="JPEG", quality=quality)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


DEBUG_HTML = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Cat Vision Debugger</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f5f7fb;
      color: #1f2937;
    }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { width: min(1180px, calc(100vw - 32px)); margin: 0 auto; padding: 28px 0 48px; }
    header { display: flex; justify-content: space-between; gap: 18px; align-items: flex-end; margin-bottom: 20px; }
    h1 { margin: 0; font-size: 28px; line-height: 1.1; }
    p { margin: 6px 0 0; color: #64748b; }
    .grid { display: grid; grid-template-columns: 360px 1fr; gap: 18px; align-items: start; }
    .panel, .result-panel {
      background: #ffffff;
      border: 1px solid #d8e0ea;
      border-radius: 8px;
      box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08);
    }
    .panel { padding: 16px; position: sticky; top: 16px; }
    label { display: block; margin: 14px 0 6px; font-weight: 700; font-size: 13px; color: #334155; }
    input[type="url"], textarea {
      width: 100%;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px 11px;
      font: inherit;
      background: #fff;
      color: #1f2937;
    }
    textarea { min-height: 116px; resize: vertical; }
    input[type="file"] { width: 100%; border: 1px dashed #94a3b8; border-radius: 6px; padding: 10px; background: #f8fafc; }
    input[type="number"] {
      width: 100%;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px 11px;
      font: inherit;
      background: #fff;
      color: #1f2937;
    }
    button {
      width: 100%;
      margin-top: 16px;
      border: 0;
      border-radius: 6px;
      background: #0f766e;
      color: #fff;
      padding: 12px 14px;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }
    button:disabled { background: #94a3b8; cursor: wait; }
    .hint { font-size: 12px; color: #64748b; line-height: 1.45; }
    .result-panel { padding: 16px; min-height: 380px; }
    .status { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
    .pill { border-radius: 999px; padding: 6px 10px; font-size: 13px; font-weight: 800; background: #e2e8f0; color: #334155; }
    .pill.good { background: #dcfce7; color: #166534; }
    .pill.bad { background: #fee2e2; color: #991b1b; }
    .images { display: grid; grid-template-columns: 1.5fr 0.8fr; gap: 12px; margin-bottom: 16px; }
    figure { margin: 0; border: 1px solid #d8e0ea; border-radius: 8px; overflow: hidden; background: #f8fafc; }
    img { display: block; width: 100%; height: auto; }
    figcaption { padding: 9px 10px; font-size: 13px; font-weight: 800; color: #475569; border-top: 1px solid #d8e0ea; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0 18px; font-size: 13px; }
    th, td { text-align: left; padding: 9px; border-bottom: 1px solid #e2e8f0; }
    th { color: #475569; background: #f8fafc; }
    .candidate { border: 1px solid #d8e0ea; border-radius: 8px; padding: 12px; margin-top: 10px; }
    .candidate-head { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 8px; font-weight: 900; }
    .bar { height: 9px; border-radius: 999px; background: #e2e8f0; overflow: hidden; }
    .bar > span { display: block; height: 100%; background: #0f766e; }
    .refs { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 10px; margin-top: 10px; }
    .ref { border: 1px solid #e2e8f0; border-radius: 7px; overflow: hidden; background: #fff; }
    .ref div { padding: 8px; font-size: 12px; color: #475569; }
    .ref-error { display: grid; min-height: 92px; place-items: center; background: #fee2e2; color: #991b1b; font-size: 12px; text-align: center; padding: 8px; }
    .empty { display: grid; min-height: 320px; place-items: center; color: #64748b; text-align: center; padding: 30px; }
    @media (max-width: 860px) {
      header, .grid, .images { display: block; }
      .panel { position: static; margin-bottom: 16px; }
      .images figure { margin-bottom: 12px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Cat Vision Debugger</h1>
        <p>Inspect YOLO detection boxes, the selected cat crop, and MobileNet identity scores.</p>
      </div>
    </header>
    <div class="grid">
      <section class="panel">
        <label for="queryFile">Query image file</label>
        <input id="queryFile" type="file" accept="image/*" />
        <label for="queryUrl">or query image URL</label>
        <input id="queryUrl" type="url" placeholder="https://example.com/cat.jpg" />

        <label for="referenceFiles">Reference image folder/files</label>
        <input id="referenceFiles" type="file" accept="image/*" multiple webkitdirectory />
        <div class="hint">Selecting assets/model_data groups cat01, cat02, ... automatically. Non-image files are ignored.</div>

        <label for="maxRefs">Max references per candidate</label>
        <input id="maxRefs" type="number" min="1" max="20" value="6" />
        <div class="hint">Lower values keep folder tests responsive while still showing the top match clearly.</div>

        <label for="candidateText">Reference image URLs</label>
        <textarea id="candidateText" placeholder="cat01 | https://example.com/a.jpg, https://example.com/b.jpg&#10;cat02 | https://example.com/c.jpg"></textarea>
        <div class="hint">One candidate per line. Use "label | url1, url2". Local files and URL candidates can be mixed.</div>
        <button id="runButton">Run visualization</button>
      </section>

      <section id="result" class="result-panel">
        <div class="empty">Choose a query image and run the model.</div>
      </section>
    </div>
  </main>
  <script>
    const queryFile = document.querySelector("#queryFile");
    const queryUrl = document.querySelector("#queryUrl");
    const referenceFiles = document.querySelector("#referenceFiles");
    const maxRefs = document.querySelector("#maxRefs");
    const candidateText = document.querySelector("#candidateText");
    const runButton = document.querySelector("#runButton");
    const result = document.querySelector("#result");

    const readFile = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char]));
    }

    async function buildQuerySource() {
      if (queryFile.files[0]) return readFile(queryFile.files[0]);
      const url = queryUrl.value.trim();
      if (url) return url;
      throw new Error("Choose a query image file or enter an image URL.");
    }

    async function buildFileCandidates() {
      const grouped = new Map();
      const imageFiles = [...referenceFiles.files].filter((file) => file.type.startsWith("image/"));
      const limit = Math.max(1, Math.min(20, Number(maxRefs.value) || 6));
      for (const file of imageFiles.sort((a, b) => a.name.localeCompare(b.name))) {
        const path = file.webkitRelativePath || file.name;
        const parts = path.split("/");
        const modelDataIndex = parts.indexOf("model_data");
        let label = file.name.replace(/\\.[^.]+$/, "");
        if (modelDataIndex >= 0 && parts[modelDataIndex + 1]) {
          label = parts[modelDataIndex + 1];
        } else if (parts.length > 1) {
          label = parts[parts.length - 2];
        }
        if (!grouped.has(label)) grouped.set(label, []);
        if (grouped.get(label).length < limit) {
          grouped.get(label).push({ label: file.name, imageSource: await readFile(file) });
        }
      }
      return [...grouped.entries()].map(([label, references]) => ({ label, references }));
    }

    function buildUrlCandidates() {
      return candidateText.value
        .split("\\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, index) => {
          const [rawLabel, rawUrls] = line.includes("|") ? line.split("|", 2) : [`candidate-${index + 1}`, line];
          const references = rawUrls
            .split(/[,\\s]+/)
            .map((url) => url.trim())
            .filter(Boolean)
            .map((url, refIndex) => ({ label: `url-${refIndex + 1}`, imageSource: url }));
          return { label: rawLabel.trim(), references };
        })
        .filter((candidate) => candidate.references.length > 0);
    }

    function mergeCandidates(fileCandidates, urlCandidates) {
      const merged = new Map();
      for (const candidate of [...fileCandidates, ...urlCandidates]) {
        if (!merged.has(candidate.label)) merged.set(candidate.label, { label: candidate.label, references: [] });
        merged.get(candidate.label).references.push(...candidate.references);
      }
      return [...merged.values()];
    }

    function render(data) {
      const detections = data.detections.map((item) => `
        <tr>
          <td>${escapeHtml(item.label)}</td>
          <td>${item.isCat ? "yes" : "no"}</td>
          <td>${(item.confidence * 100).toFixed(1)}%</td>
          <td>${item.box.x1}, ${item.box.y1}, ${item.box.x2}, ${item.box.y2}</td>
        </tr>
      `).join("");

      const candidates = data.candidates.map((candidate, index) => `
        <div class="candidate">
          <div class="candidate-head">
            <span>${index + 1}. ${escapeHtml(candidate.label)}</span>
            <span>${(candidate.bestScore * 100).toFixed(1)}%</span>
          </div>
          <div class="bar"><span style="width: ${(candidate.bestScore * 100).toFixed(1)}%"></span></div>
          <div class="refs">
            ${candidate.references.slice(0, 8).map((reference) => `
              <div class="ref">
                ${reference.cropImage ? `<img src="${reference.cropImage}" alt="" />` : `<div class="ref-error">Skipped<br />${escapeHtml(reference.error || "invalid image")}</div>`}
                <div>${escapeHtml(reference.label)}<br />score ${(reference.score * 100).toFixed(1)}%<br />cat ${(reference.catConfidence * 100).toFixed(1)}%</div>
              </div>
            `).join("")}
          </div>
        </div>
      `).join("");

      result.innerHTML = `
        <div class="status">
          <span class="pill ${data.isCat ? "good" : "bad"}">${data.isCat ? "Cat accepted" : "Cat rejected"}</span>
          <span class="pill">confidence ${(data.confidence * 100).toFixed(1)}%</span>
          <span class="pill">threshold ${(data.threshold * 100).toFixed(1)}%</span>
        </div>
        <div class="images">
          <figure>
            <img src="${data.annotatedImage}" alt="Annotated detection result" />
            <figcaption>Detection boxes</figcaption>
          </figure>
          <figure>
            <img src="${data.queryCropImage}" alt="Selected query crop" />
            <figcaption>Identity crop</figcaption>
          </figure>
        </div>
        <h2>Detections</h2>
        <table>
          <thead><tr><th>Label</th><th>Cat</th><th>Confidence</th><th>Box</th></tr></thead>
          <tbody>${detections || `<tr><td colspan="4">No detections</td></tr>`}</tbody>
        </table>
        <h2>Identification candidates</h2>
        ${candidates || `<p>No reference candidates were provided.</p>`}
      `;
    }

    runButton.addEventListener("click", async () => {
      runButton.disabled = true;
      runButton.textContent = "Running...";
      result.innerHTML = `<div class="empty">Running the vision models...</div>`;
      try {
        const imageSource = await buildQuerySource();
        const candidates = mergeCandidates(await buildFileCandidates(), buildUrlCandidates());
        const response = await fetch("/debug/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageSource, candidates })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Analysis failed.");
        render(data);
      } catch (error) {
        result.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
      } finally {
        runButton.disabled = false;
        runButton.textContent = "Run visualization";
      }
    });
  </script>
</body>
</html>
"""
