const participantIdInput = document.getElementById("participantIdInput");
const participantIdStatus = document.getElementById("participantIdStatus");
const fatigueInput = document.getElementById("fatigueInput"); // NEW
const clipSelect = document.getElementById("clipSelect");
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
const baseAdditionalFields = { ...(submissionConfig.additionalFields || {}) };
delete baseAdditionalFields.studyId;
delete baseAdditionalFields.participantId;
delete baseAdditionalFields.filenameHint;
let participantIdValue = "";

const overlayCtx = finalFrameCanvas.getContext("2d");
const annotationCtx = annotationCanvas.getContext("2d");

const EXPERT_ANNOTATION_BASE_URL = "expert-annotations/";

let frameCaptured = false;
let currentClip = null;
let activeLine = null;
let expertLines = null;
let pointerDown = false;
let latestPayload = null;
let submissionInFlight = false;
let capturedFrameTimeValue = 0;

function showToast(message) {
  const toast = toastTemplate.content.firstElementChild.cloneNode(true);
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.add("toast--visible");
  });
  setTimeout(() => toast.remove(), 2800);
}

function getClips() {
  const clips = Array.isArray(window.ANNOTATION_CLIPS) ? [...window.ANNOTATION_CLIPS] : [];
  const params = new URLSearchParams(window.location.search);
  const videoParam = params.get("video");
  if (videoParam) {
    clips.unshift({
      id: "survey-param",
      label: "Embedded Clip",
      src: videoParam,
      poster: "",
    });
  }
  return clips;
}

function populateClipSelect(clips) {
  clipSelect.innerHTML = "";
  if (clips.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Add clips in clip-config.js";
    clipSelect.appendChild(option);
    clipSelect.disabled = true;
    videoStatus.textContent = "No clip configured.";
    return;
  }

  clips.forEach((clip, index) => {
    const option = document.createElement("option");
    option.value = clip.id ?? `clip_${index}`;
    option.textContent = clip.label ?? option.value;
    option.dataset.src = clip.src;
    option.dataset.poster = clip.poster || "";
    clipSelect.appendChild(option);
  });

  clipSelect.disabled = false;

  const params = new URLSearchParams(window.location.search);
  const clipId = params.get("clip");
  if (clipId) {
    const match = [...clipSelect.options].find((opt) => opt.value === clipId);
    if (match) {
      clipSelect.value = clipId;
      loadSelectedClip();
      return;
    }
  }

  clipSelect.selectedIndex = 0;
  loadSelectedClip();
}

async function loadExpertAnnotation(clipId, annotationType = "gt") {
  const basePath = annotationType === "mock" ? "mock-annotations/" : "expert-annotations/";
  const suffix = annotationType === "mock" ? "_mock.json" : "_gt.json";
  const jsonPath = `${basePath}${clipId}${suffix}`;

  try {
    const response = await fetch(jsonPath);
    if (!response.ok) {
      // It is okay if some clips don't have expert lines (e.g. testing)
      return null;
    }
    return await response.json();
  } catch (error) {
    console.warn("Error fetching annotation:", error);
    return null;
  }
}

async function loadSelectedClip() {
  const option = clipSelect.selectedOptions[0];
  if (!option) return;

  const src = option.dataset.src;
  if (!src) {
    videoStatus.textContent = "Clip source missing.";
    return;
  }

  resetAnnotationState();

  const selectedClip = window.ANNOTATION_CLIPS.find(c => c.id === option.value);
  currentClip = {
    ...(selectedClip || {}),
    id: option.value,
    label: option.textContent,
    src,
    poster: option.dataset.poster || "",
  };

  // Load Expert Lines
  const annotationType = currentClip.annotationType || "gt";
  const clipIdBase = currentClip.id.replace(/_(mock|gt)$/, "");
  
  expertLines = await loadExpertAnnotation(clipIdBase, annotationType);

  canvasContainer.hidden = true;
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
  videoStatus.textContent = "Loading clip…";
  replayBtn.disabled = true;
}

function handleVideoError() {
  videoStatus.textContent = "Clip failed to load. Check URL.";
  showToast("Clip failed to load.");
  replayBtn.disabled = true;
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
  
  annotationStatus.textContent = "Final frame will appear below shortly.";
  clearLineBtn.disabled = true;
  submitAnnotationBtn.disabled = true;
  
  if (submissionConfig.endpoint) {
     validateSubmitButton();
  } else {
    submissionStatus.textContent = "Endpoint not configured.";
  }
  capturedFrameTimeValue = 0;
}

function resizeCanvases(width, height) {
  finalFrameCanvas.width = width;
  finalFrameCanvas.height = height;
  annotationCanvas.width = width;
  annotationCanvas.height = height;
}

// STABLE CAPTURE LOGIC (Phase 1 Style)
function captureFinalFrame() {
  if (frameCaptured) return;
  if (!video.videoWidth || !video.videoHeight) return;

  resizeCanvases(video.videoWidth, video.videoHeight);

  // 1. Draw Video Frame
  overlayCtx.drawImage(video, 0, 0, finalFrameCanvas.width, finalFrameCanvas.height);

  // 2. Draw Expert/Mock Overlay (Green)
  if (expertLines && expertLines.lines) {
      expertLines.lines.forEach(line => {
        if (line.points && line.points.length > 0) {
            overlayCtx.beginPath();
            overlayCtx.moveTo(line.points[0].x, line.points[0].y);
            line.points.forEach(p => overlayCtx.lineTo(p.x, p.y));
            overlayCtx.strokeStyle = "rgba(0, 255, 0, 0.5)"; // Green transparent
            overlayCtx.lineWidth = 5;
            overlayCtx.stroke();
        }
      });
  }

  annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);

  finalFrameCanvas.hidden = false;
  canvasContainer.hidden = false;
  frameCaptured = true;
  capturedFrameTimeValue = video.duration;

  video.hidden = true; 
  annotationStatus.textContent = "Draw your incision line now.";
  submissionStatus.textContent = "Draw the incision on the frozen frame to enable submission.";
  
  replayBtn.disabled = false;
}

// VIDEO EVENTS
video.addEventListener("error", handleVideoError);
video.addEventListener("loadeddata", () => {
  videoStatus.textContent = "Playing clip...";
  video.play().catch((err) => {
    videoStatus.textContent = "Tap 'Replay Clip' to start.";
    replayBtn.disabled = false;
  });
});
video.addEventListener("ended", () => {
  if (!frameCaptured) captureFinalFrame();
});

replayBtn.addEventListener("click", () => {
  resetAnnotationState();
  finalFrameCanvas.hidden = true;
  canvasContainer.hidden = true;
  video.hidden = false;
  video.currentTime = 0;
  video.play();
  replayBtn.disabled = true;
});

// POINTER EVENTS
function getPointerPos(e) {
  const rect = annotationCanvas.getBoundingClientRect();
  const scaleX = annotationCanvas.width / rect.width;
  const scaleY = annotationCanvas.height / rect.height;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

function handlePointerDown(e) {
  if (e.button > 0) return;
  e.preventDefault();
  pointerDown = true;
  const { x, y } = getPointerPos(e);
  activeLine = [{ x, y }];
  redrawAnnotation();
}

function handlePointerMove(e) {
  if (!pointerDown) return;
  e.preventDefault();
  const { x, y } = getPointerPos(e);
  activeLine.push({ x, y });
  redrawAnnotation();
}

function handlePointerUp(e) {
  if (!pointerDown) return;
  e.preventDefault();
  pointerDown = false;
  if (activeLine && activeLine.length > 5) {
    clearLineBtn.disabled = false;
    validateSubmitButton();
  } else {
    // line too short
    activeLine = null;
    redrawAnnotation();
    submissionStatus.textContent = "Line too short. Please draw a complete incision.";
    submissionStatus.className = "help help--error";
  }
}

function redrawAnnotation() {
  annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
  if (!activeLine || activeLine.length < 2) return;

  annotationCtx.beginPath();
  annotationCtx.moveTo(activeLine[0].x, activeLine[0].y);
  for (let i = 1; i < activeLine.length; i++) {
    annotationCtx.lineTo(activeLine[i].x, activeLine[i].y);
  }
  annotationCtx.strokeStyle = "#ffcc00";
  annotationCtx.lineWidth = 4;
  annotationCtx.lineCap = "round";
  annotationCtx.lineJoin = "round";
  annotationCtx.stroke();
}

function clearLine() {
  activeLine = null;
  annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
  clearLineBtn.disabled = true;
  submitAnnotationBtn.disabled = true;
  submissionStatus.textContent = "Draw the incision on the frozen frame to enable submission.";
  submissionStatus.className = "help";
}

// NEW: Validation to include Fatigue
function validateSubmitButton() {
  const pid = participantIdInput.value.trim();
  const fatigue = fatigueInput.value;
  
  if (!pid) {
    submitAnnotationBtn.disabled = true;
    submissionStatus.textContent = "Enter Participant ID.";
    submissionStatus.className = "help help--error";
    return;
  }
  if (!fatigue) {
    submitAnnotationBtn.disabled = true;
    submissionStatus.textContent = "Please select your fatigue level.";
    submissionStatus.className = "help help--error";
    return;
  }
  
  if (activeLine && activeLine.length > 5) {
    submitAnnotationBtn.disabled = false;
    submissionStatus.textContent = "Ready to submit.";
    submissionStatus.className = "help help--success";
  } else {
    submitAnnotationBtn.disabled = true;
    submissionStatus.textContent = "Draw the incision line.";
    submissionStatus.className = "help";
  }
}

// VALIDATE ON INPUT
participantIdInput.addEventListener("input", validateSubmitButton);
fatigueInput.addEventListener("change", validateSubmitButton);

// SUBMIT
async function submitAnnotation() {
  if (submissionInFlight) return;
  
  const participantId = participantIdInput.value.trim();
  const fatigue = fatigueInput.value;

  if (!participantId || !fatigue) {
    showToast("Please complete all fields.");
    validateSubmitButton();
    return;
  }
  if (!activeLine) return;

  submissionInFlight = true;
  submitAnnotationBtn.disabled = true;
  submitAnnotationBtn.textContent = "Submitting...";

  const body = {
    ...baseAdditionalFields,
    participantId: participantId,
    fatigueLevel: fatigue, // NEW FIELD
    clipId: currentClip.id,
    clipLabel: currentClip.label,
    videoSrc: currentClip.src,
    annotationType: currentClip.annotationType || "gt",
    imageWidth: annotationCanvas.width,
    imageHeight: annotationCanvas.height,
    videoDuration: video.duration,
    frameTime: capturedFrameTimeValue,
    points: activeLine,
    generatedAt: new Date().toISOString(),
  };

  try {
    const response = await fetch(submissionConfig.endpoint, {
      method: submissionConfig.method || "POST",
      headers: submissionConfig.headers || { "Content-Type": "application/json" },
      body: JSON.stringify({
        annotation: body,
      }),
    });

    if (!response.ok) throw new Error("Submission failed");

    showToast("Annotation saved!");
    submitAnnotationBtn.textContent = "Submitted";
    
    // Optional: Move to next clip or reset
    // For now, we just disable the button to prevent double submit
    submissionStatus.textContent = "Successfully submitted.";
    submissionStatus.className = "help help--success";

  } catch (err) {
    console.error(err);
    showToast("Could not submit. Please try again.");
    submitAnnotationBtn.disabled = false;
    submitAnnotationBtn.textContent = "Submit to Investigator";
  } finally {
    submissionInFlight = false;
  }
}

clearLineBtn.addEventListener("click", clearLine);
submitAnnotationBtn.addEventListener("click", submitAnnotation);

if (window.PointerEvent) {
  annotationCanvas.addEventListener("pointerdown", handlePointerDown, { passive: false });
  annotationCanvas.addEventListener("pointermove", handlePointerMove, { passive: false });
  annotationCanvas.addEventListener("pointerup", handlePointerUp, { passive: false });
  annotationCanvas.addEventListener("pointercancel", handlePointerUp, { passive: false });
  annotationCanvas.addEventListener("mouseleave", handlePointerUp, { passive: false });
} else {
  annotationCanvas.addEventListener("mousedown", handlePointerDown, { passive: false });
  annotationCanvas.addEventListener("mousemove", handlePointerMove, { passive: false });
  annotationCanvas.addEventListener("mouseup", handlePointerUp, { passive: false });
  annotationCanvas.addEventListener("mouseleave", handlePointerUp, { passive: false });
  annotationCanvas.addEventListener("touchstart", handlePointerDown, { passive: false });
  annotationCanvas.addEventListener("touchmove", handlePointerMove, { passive: false });
  annotationCanvas.addEventListener("touchend", handlePointerUp, { passive: false });
  annotationCanvas.addEventListener("touchcancel", handlePointerUp, { passive: false });
}

// INITIALIZATION
const availableClips = getClips();
populateClipSelect(availableClips);
