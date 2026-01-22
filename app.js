
// ==========================
// Cholecystectomy Annotation App - Phase 2
// Sequential Clip Flow + Expert Overlay Support
// ==========================

const participantIdInput = document.getElementById("participantIdInput");
const participantIdStatus = document.getElementById("participantIdStatus");
const replayBtn = document.getElementById("replayBtn");
const video = document.getElementById("caseVideo");
const finalFrameCanvas = document.getElementById("finalFrame");
const annotationCanvas = document.getElementById("annotationCanvas");
const canvasContainer = document.getElementById("canvasContainer");
const clearLineBtn = document.getElementById("clearLineBtn");
const videoStatus = document.getElementById("videoStatus");
const annotationStatus = document.getElementById("annotationStatus");
const toastTemplate = document.getElementById("toastTemplate");
const submitAnnotationBtn = document.getElementById("submitAnnotationBtn");
const submissionStatus = document.getElementById("submissionStatus");

const submissionConfig = window.ANNOTATION_SUBMISSION || {};
let clips = [];
let currentClipIndex = 0;
let currentClip = null;
let expertLines = null;

let frameCaptured = false;
let activeLine = null;
let pointerDown = false;
let latestPayload = null;
let submissionInFlight = false;
let capturedFrameTimeValue = 0;
let participantIdValue = "";

const overlayCtx = finalFrameCanvas.getContext("2d");
const annotationCtx = annotationCanvas.getContext("2d");

function showToast(message) {
  const toast = toastTemplate.content.firstElementChild.cloneNode(true);
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast--visible"));
  setTimeout(() => toast.remove(), 3000);
}

function getClips() {
  return Array.isArray(window.ANNOTATION_CLIPS) ? [...window.ANNOTATION_CLIPS] : [];
}

async function loadExpertAnnotation(clipId, annotationType = "gt") {
  const basePath = annotationType === "mock" ? "mock-annotations/" : "expert-annotations/";
  const suffix = annotationType === "mock" ? "_mock.json" : "_gt.json";
  const jsonPath = `${basePath}${clipId}${suffix}`;

  try {
    const response = await fetch(jsonPath);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("Failed to load expert overlay:", error);
    return null;
  }
}

async function loadClipByIndex(index) {
  if (index >= clips.length) {
    document.body.innerHTML = "<h2>Thank you for completing all annotations!</h2>";
    return;
  }

  const clip = clips[index];
  currentClip = { ...clip };
  expertLines = null;

  resetAnnotationState();

  const baseClipId = currentClip.id.replace(/_(mock|gt)$/, "");
  expertLines = await loadExpertAnnotation(baseClipId, currentClip.annotationType || "gt");

  video.src = currentClip.src;
  video.poster = currentClip.poster || "";
  video.load();
  videoStatus.textContent = `Loading clip ${index + 1} of ${clips.length}...`;
}

function resetAnnotationState() {
  frameCaptured = false;
  activeLine = null;
  pointerDown = false;
  latestPayload = null;
  submissionInFlight = false;
  annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
  overlayCtx.clearRect(0, 0, finalFrameCanvas.width, finalFrameCanvas.height);
  annotationCanvas.style.backgroundImage = "";
  annotationStatus.textContent = "Watch the clip. The final frame will appear below.";
  clearLineBtn.disabled = true;
  submitAnnotationBtn.disabled = true;
  capturedFrameTimeValue = 0;
}

function captureFrameImage(video) {
  resizeCanvases(video.videoWidth, video.videoHeight);
  overlayCtx.drawImage(video, 0, 0);
  const dataUrl = finalFrameCanvas.toDataURL("image/png");
  annotationCanvas.style.backgroundImage = `url(${dataUrl})`;
  annotationCanvas.style.backgroundSize = "contain";
  annotationCanvas.style.backgroundRepeat = "no-repeat";
  annotationCanvas.style.backgroundPosition = "center";

  frameCaptured = true;
  canvasContainer.hidden = false;
  annotationStatus.textContent = "Draw your incision line on top of the safety corridor.";
  drawCanvas();
}

function resizeCanvases(width, height) {
  finalFrameCanvas.width = width;
  finalFrameCanvas.height = height;
  annotationCanvas.width = width;
  annotationCanvas.height = height;
}

function drawCanvas() {
  annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);

  if (expertLines?.incisionDetails) {
    const w = annotationCanvas.width;
    const h = annotationCanvas.height;

    annotationCtx.strokeStyle = "rgba(0, 255, 0, 0.7)";
    annotationCtx.lineWidth = Math.max(2, w * 0.005);
    annotationCtx.setLineDash([8, 6]);

    expertLines.incisionDetails.forEach(line => {
      const norm = line.normalized;
      annotationCtx.beginPath();
      annotationCtx.moveTo(norm.start.x * w, norm.start.y * h);
      annotationCtx.lineTo(norm.end.x * w, norm.end.y * h);
      annotationCtx.stroke();
    });

    annotationCtx.setLineDash([]);
  }

  if (activeLine) {
    annotationCtx.strokeStyle = "#38bdf8";
    annotationCtx.lineWidth = 4;
    annotationCtx.beginPath();
    annotationCtx.moveTo(activeLine.start.x, activeLine.start.y);
    annotationCtx.lineTo(activeLine.end.x, activeLine.end.y);
    annotationCtx.stroke();
  }
}

function getPointerPos(evt) {
  const rect = annotationCanvas.getBoundingClientRect();
  return {
    x: ((evt.clientX - rect.left) / rect.width) * annotationCanvas.width,
    y: ((evt.clientY - rect.top) / rect.height) * annotationCanvas.height,
  };
}

annotationCanvas.addEventListener("pointerdown", (e) => {
  if (!frameCaptured) return;
  pointerDown = true;
  const start = getPointerPos(e);
  activeLine = { start, end: start };
  drawCanvas();
});

annotationCanvas.addEventListener("pointermove", (e) => {
  if (!pointerDown || !activeLine) return;
  activeLine.end = getPointerPos(e);
  drawCanvas();
});

annotationCanvas.addEventListener("pointerup", () => {
  if (!activeLine) return;
  pointerDown = false;
  drawCanvas();
  annotationStatus.textContent = "Line recorded. Submit when ready.";
  clearLineBtn.disabled = false;
  updateSubmissionPayload();
});

clearLineBtn.addEventListener("click", () => {
  activeLine = null;
  drawCanvas();
  clearLineBtn.disabled = true;
  annotationStatus.textContent = "Draw your incision line on the frozen frame.";
});

replayBtn.addEventListener("click", () => {
  if (!currentClip) return;
  video.currentTime = 0;
  video.play();
});

video.addEventListener("ended", () => {
  if (!frameCaptured) {
    captureFrameImage(video);
  }
});

video.addEventListener("loadeddata", () => {
  video.play().catch(() => {});
});

submitAnnotationBtn.addEventListener("click", async () => {
  if (!latestPayload || submissionInFlight) return;
  submissionInFlight = true;
  submitAnnotationBtn.disabled = true;

  try {
    const response = await fetch(submissionConfig.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annotation: latestPayload }),
    });

    if (!response.ok) throw new Error("Failed");

    showToast("Submitted.");
    currentClipIndex++;
    loadClipByIndex(currentClipIndex);
  } catch (err) {
    showToast("Error submitting.");
  } finally {
    submissionInFlight = false;
  }
});

function normalizeLine(line) {
  return {
    start: {
      x: line.start.x / annotationCanvas.width,
      y: line.start.y / annotationCanvas.height,
    },
    end: {
      x: line.end.x / annotationCanvas.width,
      y: line.end.y / annotationCanvas.height,
    },
  };
}

function updateSubmissionPayload() {
  if (!activeLine || !frameCaptured || !currentClip) return;

  latestPayload = {
    clipId: currentClip.id,
    clipLabel: currentClip.label,
    videoSrc: currentClip.src,
    incision: normalizeLine(activeLine),
    canvasSize: {
      width: annotationCanvas.width,
      height: annotationCanvas.height,
    },
    participantId: participantIdValue,
    generatedAt: new Date().toISOString(),
  };

  submitAnnotationBtn.disabled = false;
}

participantIdInput.addEventListener("input", (e) => {
  participantIdValue = e.target.value.trim();
  participantIdStatus.textContent = participantIdValue
    ? "Participant ID recorded."
    : "Please enter your participant ID.";
});

// Start the app
clips = getClips();
loadClipByIndex(0);
