/*************************************************
 * Phase 02 – Auto-progress + GT/Mock + Confidence
 *************************************************/

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
const clipProgress = document.getElementById("clipProgress");
const completionCard = document.getElementById("completionCard");

const submissionConfig = window.ANNOTATION_SUBMISSION || {};
const baseAdditionalFields = { ...(submissionConfig.additionalFields || {}) };
delete baseAdditionalFields.studyId;
delete baseAdditionalFields.participantId;
delete baseAdditionalFields.filenameHint;

let participantIdValue = "";
let frameCaptured = false;
let currentClip = null;
let activeLine = null;
let expertLines = null;
let pointerDown = false;
let latestPayload = null;
let submissionInFlight = false;
let capturedFrameTimeValue = 0;
let helperVideo = null;
let helperSeekAttempted = false;

// AUTO-PROGRESSION
let currentClipIndex = 0;

const overlayCtx = finalFrameCanvas.getContext("2d");
const annotationCtx = annotationCanvas.getContext("2d");

/* ---------------- Utils ---------------- */

function showToast(message) {
  const toast = toastTemplate.content.firstElementChild.cloneNode(true);
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast--visible"));
  setTimeout(() => toast.remove(), 2800);
}

function getClips() {
  return Array.isArray(window.ANNOTATION_CLIPS)
    ? [...window.ANNOTATION_CLIPS]
    : [];
}

/* ---------------- Expert / Mock loader ---------------- */

async function loadExpertAnnotation(clipId, annotationType = "gt") {
  const basePath = annotationType === "mock"
    ? "mock-annotations/"
    : "expert-annotations/";
  const suffix = annotationType === "mock" ? "_mock.json" : "_gt.json";
  const path = `${basePath}${clipId}${suffix}`;

  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/* ---------------- Clip loader ---------------- */

async function loadClipByIndex(index) {
  const clips = getClips();

  if (index >= clips.length) {
    handleAllClipsCompleted();
    return;
  }

  resetAnnotationState();

  const clip = clips[index];
  currentClip = { ...clip };

  if (clipProgress) {
    clipProgress.textContent = `(Clip ${index + 1} of ${clips.length})`;
  }

  submitAnnotationBtn.textContent =
    index === clips.length - 1
      ? "Submit & Finish"
      : "Submit & Next Clip";

  const annotationType = clip.annotationType || "gt";
  expertLines = await loadExpertAnnotation(clip.id, annotationType);

  video.src = clip.src;
  video.crossOrigin = "anonymous";
  video.load();
  prepareHelperVideo();
}

/* ---------------- Completion ---------------- */

function handleAllClipsCompleted() {
  document.querySelectorAll(".card:not(#confidenceSection)").forEach(el => {
    el.hidden = true;
  });
  document.getElementById("confidenceSection").hidden = false;
}

/* ---------------- Video helpers ---------------- */

function prepareHelperVideo() {
  teardownHelperVideo();
  helperVideo = document.createElement("video");
  helperVideo.src = currentClip.src;
  helperVideo.crossOrigin = "anonymous";
  helperVideo.muted = true;
  helperVideo.preload = "auto";
  helperVideo.addEventListener("loadedmetadata", handleHelperLoadedMetadata);
  helperVideo.addEventListener("seeked", handleHelperSeeked);
  helperVideo.addEventListener("timeupdate", handleHelperTimeUpdate);
  helperVideo.load();
}

function teardownHelperVideo() {
  if (!helperVideo) return;
  helperVideo.pause();
  helperVideo.remove();
  helperVideo = null;
  helperSeekAttempted = false;
}

function handleHelperLoadedMetadata() {
  helperSeekAttempted = true;
  const t = Math.max(helperVideo.duration - 0.04, 0);
  helperVideo.currentTime = t;
}

function handleHelperSeeked() {
  captureFrameImage(helperVideo, helperVideo.currentTime);
  teardownHelperVideo();
}

function handleHelperTimeUpdate() {
  if (!helperSeekAttempted || frameCaptured) return;
  captureFrameImage(helperVideo, helperVideo.currentTime);
  teardownHelperVideo();
}

/* ---------------- Frame capture ---------------- */

function resizeCanvases(w, h) {
  finalFrameCanvas.width = w;
  finalFrameCanvas.height = h;
  annotationCanvas.width = w;
  annotationCanvas.height = h;
}

function captureFrameImage(source, time) {
  resizeCanvases(source.videoWidth, source.videoHeight);
  overlayCtx.drawImage(source, 0, 0);
  annotationCanvas.style.backgroundImage =
    `url(${finalFrameCanvas.toDataURL("image/png")})`;

  frameCaptured = true;
  canvasContainer.hidden = false;
  capturedFrameTimeValue = time;

  redrawCanvas();
}

/* ---------------- Drawing ---------------- */

function redrawCanvas() {
  annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);

  if (expertLines?.incisionDetails) {
    annotationCtx.strokeStyle = "rgba(0,255,0,0.7)";
    annotationCtx.setLineDash([8, 6]);

    expertLines.incisionDetails.forEach(d => {
      const n = d.normalized;
      annotationCtx.beginPath();
      annotationCtx.moveTo(n.start.x * annotationCanvas.width, n.start.y * annotationCanvas.height);
      annotationCtx.lineTo(n.end.x * annotationCanvas.width, n.end.y * annotationCanvas.height);
      annotationCtx.stroke();
    });

    annotationCtx.setLineDash([]);
  }

  if (!activeLine) return;

  annotationCtx.strokeStyle = "#38bdf8";
  annotationCtx.lineWidth = 4;
  annotationCtx.beginPath();
  annotationCtx.moveTo(activeLine.start.x, activeLine.start.y);
  annotationCtx.lineTo(activeLine.end.x, activeLine.end.y);
  annotationCtx.stroke();
}

/* ---------------- Submission ---------------- */

async function submitAnnotation() {
  if (!latestPayload) return false;

  submissionInFlight = true;

  const body = {
    annotation: {
      ...latestPayload,
      fatigue: document.getElementById("fatigueInput")?.value || null
    }
  };

  try {
    const res = await fetch(submissionConfig.endpoint, {
      method: submissionConfig.method || "POST",
      headers: submissionConfig.headers || { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error();
    return true;
  } catch {
    return false;
  } finally {
    submissionInFlight = false;
  }
}

async function handleSubmitAndNext() {
  const ok = await submitAnnotation();
  if (ok) {
    currentClipIndex++;
    loadClipByIndex(currentClipIndex);
  }
}

/* ---------------- Final confidence ---------------- */

document.getElementById("submitConfidenceBtn")
  .addEventListener("click", async () => {
    const confidence = document.getElementById("confidenceInput").value;
    if (!confidence) return showToast("Select a confidence level.");

    await fetch(submissionConfig.endpoint, {
      method: submissionConfig.method || "POST",
      headers: submissionConfig.headers || { "Content-Type": "application/json" },
      body: JSON.stringify({
        annotation: {
          participantId: participantIdValue,
          confidenceFinal: confidence,
          generatedAt: new Date().toISOString()
        }
      })
    });

    document.getElementById("confidenceSection").hidden = true;
    completionCard.hidden = false;
  });

/* ---------------- Init ---------------- */

submitAnnotationBtn.addEventListener("click", handleSubmitAndNext);

participantIdInput.addEventListener("input", e => {
  participantIdValue = e.target.value.trim();
});

loadClipByIndex(0);
