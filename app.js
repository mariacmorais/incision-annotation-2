const clipSelect = document.getElementById("clipSelect");
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
const participantIdInput = document.getElementById("participantIdInput");
const participantIdStatus = document.getElementById("participantIdStatus");

clipSelect.style.display = "none"; // Hide dropdown UI

const submissionConfig = window.ANNOTATION_SUBMISSION || {};
const baseAdditionalFields = { ...(submissionConfig.additionalFields || {}) };
delete baseAdditionalFields.studyId;
delete baseAdditionalFields.participantId;
delete baseAdditionalFields.filenameHint;

let clipIndex = 0;
let currentClip = null;
let clips = [];
let frameCaptured = false;
let activeLine = null;
let expertLines = null;
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
  setTimeout(() => toast.remove(), 2800);
}

function getClips() {
  const base = Array.isArray(window.ANNOTATION_CLIPS) ? [...window.ANNOTATION_CLIPS] : [];
  const params = new URLSearchParams(window.location.search);
  const videoParam = params.get("video");
  if (videoParam) {
    base.unshift({ id: "survey-param", label: "Embedded Clip", src: videoParam, poster: "" });
  }
  return base;
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
    console.error("Error loading expert annotation:", error);
    showToast("Could not load expert annotation.");
    return null;
  }
}

async function loadClipByIndex(index) {
  if (index >= clips.length) {
    showFinalThankYouMessage();
    return;
  }

  const clip = clips[index];
  currentClip = {
    id: clip.id,
    label: clip.label,
    src: clip.src,
    poster: clip.poster || "",
    annotationType: clip.annotationType || "gt"
  };

  resetAnnotationState();

  // Load expert annotation before video
  const baseClipId = currentClip.id.replace(/_(mock|gt)$/, "");
  expertLines = await loadExpertAnnotation(baseClipId, currentClip.annotationType);

  if (expertLines) {
    console.log(`Loaded expert lines for ${currentClip.id}`);
  }

  video.removeAttribute("controls");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.crossOrigin = "anonymous";

  if (currentClip.poster) {
    video.setAttribute("poster", currentClip.poster);
  } else {
    video.removeAttribute("poster");
  }

  video.src = currentClip.src;
  video.load();

  prepareHelperVideo();
  videoStatus.textContent = `Clip ${index + 1} of ${clips.length} loading…`;
}

function resetAnnotationState() {
  frameCaptured = false;
  activeLine = null;
  expertLines = null;
  pointerDown = false;
  latestPayload = null;
  submissionInFlight = false;
  annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
  overlayCtx.clearRect(0, 0, finalFrameCanvas.width, finalFrameCanvas.height);
  annotationCanvas.style.backgroundImage = "";
  annotationStatus.textContent = "Watch the clip. Final frame will appear below.";
  clearLineBtn.disabled = true;
  submitAnnotationBtn.disabled = true;
  canvasContainer.hidden = true;
}

function resizeCanvases(width, height) {
  finalFrameCanvas.width = width;
  finalFrameCanvas.height = height;
  annotationCanvas.width = width;
  annotationCanvas.height = height;
}

function captureFrameImage(source, frameTimeValue) {
  if (!source.videoWidth || !source.videoHeight) return false;

  resizeCanvases(source.videoWidth, source.videoHeight);
  overlayCtx.drawImage(source, 0, 0);
  annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);

  const dataUrl = finalFrameCanvas.toDataURL("image/png");
  annotationCanvas.style.backgroundImage = `url(${dataUrl})`;
  annotationCanvas.style.backgroundSize = "contain";
  annotationCanvas.style.backgroundRepeat = "no-repeat";
  annotationCanvas.style.backgroundPosition = "center";

  frameCaptured = true;
  canvasContainer.hidden = false;
  annotationStatus.textContent = expertLines
    ? "Draw your incision on top of the safety corridor."
    : "Draw your incision on the final frame.";

  capturedFrameTimeValue = Number(
    ((frameTimeValue ?? source.currentTime ?? 0) || 0).toFixed(3)
  );
  redrawCanvas();
  return true;
}

function freezeOnFinalFrame() {
  if (!frameCaptured) {
    const captureTime = Number.isFinite(video.duration)
      ? video.duration
      : video.currentTime || 0;
    captureFrameImage(video, captureTime);
  }
}

function handleVideoEnded() {
  freezeOnFinalFrame();
  video.controls = true;
}

function getPointerPosition(evt) {
  const rect = annotationCanvas.getBoundingClientRect();
  const x = ((evt.clientX - rect.left) / rect.width) * annotationCanvas.width;
  const y = ((evt.clientY - rect.top) / rect.height) * annotationCanvas.height;
  return { x, y };
}

function redrawCanvas() {
  annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);

  if (expertLines?.incisionDetails?.length) {
    annotationCtx.strokeStyle = "rgba(0,255,0,0.7)";
    annotationCtx.lineWidth = 3;
    annotationCtx.setLineDash([8, 6]);
    expertLines.incisionDetails.forEach((line) => {
      const { start, end } = line.normalized;
      annotationCtx.beginPath();
      annotationCtx.moveTo(start.x * annotationCanvas.width, start.y * annotationCanvas.height);
      annotationCtx.lineTo(end.x * annotationCanvas.width, end.y * annotationCanvas.height);
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
  if (!activeLine || !frameCaptured || !currentClip) {
    latestPayload = null;
    submitAnnotationBtn.disabled = true;
    return;
  }

  latestPayload = {
    clipId: currentClip.id,
    clipLabel: currentClip.label,
    videoSrc: currentClip.src,
    capturedFrameTime: capturedFrameTimeValue,
    incision: normalizeLine(activeLine),
    canvasSize: { width: annotationCanvas.width, height: annotationCanvas.height },
    participantId: participantIdValue,
  };

  submitAnnotationBtn.disabled = false;
  submissionStatus.textContent = "Ready to submit.";
}

function submitAnnotation() {
  if (!latestPayload || !submissionConfig.endpoint) {
    showToast("Cannot submit. Missing data or endpoint.");
    return;
  }

  submissionInFlight = true;
  submissionStatus.textContent = "Submitting…";
  submitAnnotationBtn.disabled = true;

  const payload = {
    ...baseAdditionalFields,
    annotation: latestPayload,
  };

  fetch(submissionConfig.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(submissionConfig.headers || {}),
    },
    body: JSON.stringify(payload),
  })
    .then((res) => {
      if (!res.ok) throw new Error("Failed to submit");
      submissionStatus.textContent = "Submitted!";
      showToast("Submitted. Moving to next clip…");
      clipIndex++;
      setTimeout(() => loadClipByIndex(clipIndex), 1200);
    })
    .catch((err) => {
      console.error(err);
      submissionStatus.textContent = "Submission failed.";
      showToast("Submission failed.");
      submitAnnotationBtn.disabled = false;
    })
    .finally(() => {
      submissionInFlight = false;
    });
}

function showFinalThankYouMessage() {
  document.body.innerHTML = "<h2>Thank you for completing the study!</h2>";
}

annotationCanvas.addEventListener("pointerdown", (evt) => {
  if (!frameCaptured) return;
  pointerDown = true;
  activeLine = { start: getPointerPosition(evt), end: getPointerPosition(evt) };
  redrawCanvas();
});

annotationCanvas.addEventListener("pointermove", (evt) => {
  if (!pointerDown || !activeLine) return;
  activeLine.end = getPointerPosition(evt);
  redrawCanvas();
});

annotationCanvas.addEventListener("pointerup", () => {
  if (!activeLine) return;
  pointerDown = false;
  redrawCanvas();
  annotationStatus.textContent = "Line recorded. Submit when ready.";
  clearLineBtn.disabled = false;
  updateSubmissionPayload();
});

clearLineBtn.addEventListener("click", () => {
  activeLine = null;
  pointerDown = false;
  redrawCanvas();
  clearLineBtn.disabled = true;
  annotationStatus.textContent = "Draw your incision on the final frame.";
});

submitAnnotationBtn.addEventListener("click", submitAnnotation);

video.addEventListener("ended", handleVideoEnded);

participantIdInput.addEventListener("input", (e) => {
  participantIdValue = e.target.value.trim();
  participantIdStatus.textContent = participantIdValue
    ? "Email recorded."
    : "Enter your participant email.";
});

// Start the experiment
clips = getClips();
loadClipByIndex(0);
