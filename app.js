// --- Global References ---
const participantIdInput = document.getElementById("participantIdInput");
const participantIdStatus = document.getElementById("participantIdStatus");
const clipProgress = document.getElementById("clipProgress"); 

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
const fatigueInput = document.getElementById("fatigueInput");

// Sections for Navigation
const watchCard = document.getElementById("watchCard");
const annotateCard = document.getElementById("annotateCard");
const submitCard = document.getElementById("submitCard");
const completionCard = document.getElementById("completionCard");

// --- Configuration ---
const submissionConfig = window.ANNOTATION_SUBMISSION || {};
const baseAdditionalFields = { ...(submissionConfig.additionalFields || {}) };
delete baseAdditionalFields.studyId;
delete baseAdditionalFields.participantId;
delete baseAdditionalFields.filenameHint;
let participantIdValue = "";

// --- Graphics Contexts ---
const overlayCtx = finalFrameCanvas.getContext("2d");
const annotationCtx = annotationCanvas.getContext("2d");

// --- State Variables ---
let currentClipIndex = 0;
let allClips = [];
let frameCaptured = false;
let currentClip = null;
let activeLine = null;
let expertLines = null;
let submissionInFlight = false;
let capturedFrameTimeValue = 0;
let helperVideo = null;

// --- Initialization ---
function initApp() {
  allClips = getClips();
  
  if (allClips.length === 0) {
    videoStatus.textContent = "No clips configured in clip-config.js";
    return;
  }

  // Support deep linking
  const params = new URLSearchParams(window.location.search);
  const startParam = params.get("clipIndex") || params.get("clip");
  
  let startIndex = 0;
  if (startParam) {
    const foundIndex = allClips.findIndex(c => c.id === startParam);
    startIndex = foundIndex >= 0 ? foundIndex : parseInt(startParam) || 0;
  }

  loadClipAtIndex(startIndex);
}

// --- Navigation Logic ---
function loadClipAtIndex(index) {
  // 1. Check for Completion
  if (index >= allClips.length) {
    watchCard.hidden = true;
    annotateCard.hidden = true;
    submitCard.hidden = true;
    completionCard.hidden = false;
    return;
  }

  // 2. Setup Active UI
  watchCard.hidden = false;
  annotateCard.hidden = false;
  submitCard.hidden = false;
  completionCard.hidden = true;
  
  currentClipIndex = index;

  // 3. Update Progress Header
  if (clipProgress) {
    clipProgress.textContent = `(Clip ${index + 1} of ${allClips.length})`;
  }

  // 4. Reset Fatigue Input
  if (fatigueInput) fatigueInput.value = "";

  // 5. Load Data
  loadClipData(allClips[index]);
}

// --- Data Loading (FIXED) ---
async function loadClipData(clip) {
  if (!clip) return;
  resetAnnotationState();

  currentClip = {
    ...clip,
    poster: clip.poster || "",
  };

  // 1. SETUP VIDEO IMMEDIATELY (Don't wait for JSON)
  video.removeAttribute("controls"); // Clear first to reset state
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.crossOrigin = "anonymous";
  
  if (currentClip.poster) video.setAttribute("poster", currentClip.poster);
  else video.removeAttribute("poster");

  video.src = currentClip.src;
  video.controls = true; // FORCE CONTROLS so user can play
  video.load();
  
  videoStatus.textContent = `Loading Clip ${currentClipIndex + 1}...`;
  replayBtn.disabled = true;

  // 2. LOAD ANNOTATIONS IN BACKGROUND
  const annotationType = currentClip.annotationType || "gt";
  const clipIdBase = currentClip.id.replace(/_(mock|gt)$/, ""); 
  
  try {
    expertLines = await loadExpertAnnotation(clipIdBase, annotationType);
    if (expertLines) console.log("Annotations loaded.");
  } catch (e) {
    console.warn("Could not load annotations (this is okay if none exist)", e);
  }
  
  prepareHelperVideo();
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
    return null;
  }
}

// --- Canvas Drawing ---
function redrawCanvas() {
  annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);

  // 1. Draw EXPERT/MOCK Overlay (Green)
  if (expertLines && expertLines.annotation) {
    drawPolyline(expertLines.annotation, "rgba(46, 204, 113, 0.6)", 6); 
  }

  // 2. Draw USER Line (Blue)
  if (activeLine && activeLine.length > 0) {
    drawPolyline(activeLine, "#38bdf8", 5); 
  }
}

function drawPolyline(points, color, width) {
  if (!points || points.length < 2) return;
  
  annotationCtx.beginPath();
  annotationCtx.lineWidth = width;
  annotationCtx.strokeStyle = color;
  annotationCtx.lineCap = "round";
  annotationCtx.lineJoin = "round";

  const w = annotationCanvas.width;
  const h = annotationCanvas.height;

  annotationCtx.moveTo(points[0].x * w, points[0].y * h);
  for (let i = 1; i < points.length; i++) {
    annotationCtx.lineTo(points[i].x * w, points[i].y * h);
  }
  annotationCtx.stroke();
}

// --- Frame Capture & Video Handling ---
function captureFrameImage(source, frameTimeValue) {
  if (!source.videoWidth || !source.videoHeight) return false;

  const firstCapture = !frameCaptured;
  resizeCanvases(source.videoWidth, source.videoHeight);
  
  overlayCtx.drawImage(source, 0, 0, finalFrameCanvas.width, finalFrameCanvas.height);
  
  try {
    const dataUrl = finalFrameCanvas.toDataURL("image/png");
    annotationCanvas.style.backgroundImage = `url(${dataUrl})`;
    annotationCanvas.style.backgroundSize = "contain";
    annotationCanvas.style.backgroundRepeat = "no-repeat";
    annotationCanvas.style.backgroundPosition = "center";
  } catch (error) {
    frameCaptured = false;
    showToast("Unable to capture frame. Check CORS.");
    return false;
  }

  frameCaptured = true;
  canvasContainer.hidden = false;
  
  annotationStatus.textContent = expertLines
    ? "Final frame ready. Draw your incision line on top of the safety corridor." 
    : "Final frame ready. Draw your incision when ready.";

  if (firstCapture) {
    videoStatus.textContent = "Final frame captured.";
  }
  
  replayBtn.disabled = false;
  capturedFrameTimeValue = Number((frameTimeValue || 0).toFixed(3));
  
  redrawCanvas(); 

  return true;
}

// --- Interaction Handlers ---
function handlePointerDown(evt) {
  if (!frameCaptured) return;
  evt.preventDefault();
  annotationCanvas.setPointerCapture(evt.pointerId);
  const pos = getPointerPosition(evt);
  activeLine = [{ x: pos.x / annotationCanvas.width, y: pos.y / annotationCanvas.height }];
  redrawCanvas();
}

function handlePointerMove(evt) {
  if (!frameCaptured || !activeLine) return;
  evt.preventDefault();
  const pos = getPointerPosition(evt);
  activeLine.push({ x: pos.x / annotationCanvas.width, y: pos.y / annotationCanvas.height });
  redrawCanvas();
}

function handlePointerUp(evt) {
  if (!frameCaptured || !activeLine) return;
  evt.preventDefault();
  annotationCanvas.releasePointerCapture(evt.pointerId);
  submitAnnotationBtn.disabled = false;
}

function getPointerPosition(evt) {
  const rect = annotationCanvas.getBoundingClientRect();
  return { 
    x: evt.clientX - rect.left, 
    y: evt.clientY - rect.top 
  };
}

function clearLine() {
  activeLine = null;
  submitAnnotationBtn.disabled = true;
  redrawCanvas();
}

// --- Submission ---
async function submitAnnotation() {
  if (submissionInFlight) return;

  if (!participantIdValue) {
    showToast("Please enter a Participant ID first.");
    participantIdInput.focus();
    return;
  }
  if (!activeLine) {
    showToast("Please draw an incision line first.");
    return;
  }
  // Check Fatigue
  if (fatigueInput && fatigueInput.value === "") {
    showToast("Please select how you are feeling.");
    fatigueInput.focus();
    return;
  }

  submissionInFlight = true;
  submitAnnotationBtn.disabled = true;
  submitAnnotationBtn.textContent = "Submitting...";

  const payload = {
    participantId: participantIdValue,
    clipId: currentClip.id,
    clipIndex: currentClipIndex,
    clipSrc: currentClip.src,
    annotation: activeLine,
    fatigue: fatigueInput.value,
    imageWidth: finalFrameCanvas.width,
    imageHeight: finalFrameCanvas.height,
    timestamp: new Date().toISOString(),
    ...baseAdditionalFields
  };

  try {
    let success = false;
    if (submissionConfig.endpoint) {
       const response = await fetch(submissionConfig.endpoint, {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify(payload)
       });
       if (response.ok) success = true;
       else throw new Error(`Server Error: ${response.status}`);
    } else {
       console.log("Mock Submission:", payload);
       await new Promise(r => setTimeout(r, 500)); 
       success = true;
    }

    if (success) {
      showToast("Saved! Loading next clip...");
      setTimeout(() => {
        loadClipAtIndex(currentClipIndex + 1);
      }, 500);
    }

  } catch (error) {
    console.error(error);
    showToast("Submission Failed: " + error.message);
  } finally {
    submissionInFlight = false;
    submitAnnotationBtn.disabled = false;
    submitAnnotationBtn.textContent = "Submit and Next Clip";
  }
}

// --- Helpers ---
function resizeCanvases(width, height) {
  finalFrameCanvas.width = width;
  finalFrameCanvas.height = height;
  annotationCanvas.width = width;
  annotationCanvas.height = height;
}

function resetAnnotationState() {
  teardownHelperVideo();
  frameCaptured = false;
  activeLine = null;
  expertLines = null;
  submissionInFlight = false;
  annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
  overlayCtx.clearRect(0, 0, finalFrameCanvas.width, finalFrameCanvas.height);
  annotationCanvas.style.backgroundImage = "";
  annotationStatus.textContent = "Final frame will appear below shortly.";
  clearLineBtn.disabled = true;
  submitAnnotationBtn.disabled = true;
  capturedFrameTimeValue = 0;
}

function handleVideoEnded() { 
    freezeOnFinalFrame(); 
    // Keep controls true so user can replay manually if they want, 
    // but the frame is captured.
    video.controls = true; 
}
function freezeOnFinalFrame() {
  if (!frameCaptured) captureFrameImage(video, video.duration || video.currentTime);
}
function handleReplay() {
  if (!currentClip) return;
  activeLine = null; 
  redrawCanvas();
  clearLineBtn.disabled = true;
  submitAnnotationBtn.disabled = true;
  video.currentTime = 0;
  video.play();
}

function prepareHelperVideo() {
  teardownHelperVideo();
  if (!currentClip?.src) return;
  helperVideo = document.createElement("video");
  helperVideo.crossOrigin = "anonymous";
  helperVideo.preload = "auto";
  helperVideo.muted = true;
  helperVideo.setAttribute("playsinline", "");
  helperVideo.addEventListener("seeked", () => captureFrameImage(helperVideo, helperVideo.currentTime) && teardownHelperVideo());
  helperVideo.src = currentClip.src;
  helperVideo.load();
  helperVideo.addEventListener("loadedmetadata", () => {
     helperVideo.currentTime = Math.max(helperVideo.duration - 0.05, 0);
  });
}
function teardownHelperVideo() {
  if (helperVideo) {
    helperVideo.pause();
    helperVideo.removeAttribute("src");
    helperVideo = null;
  }
}

function getClips() {
  const clips = Array.isArray(window.ANNOTATION_CLIPS) ? [...window.ANNOTATION_CLIPS] : [];
  const params = new URLSearchParams(window.location.search);
  if (params.get("video")) {
    clips.unshift({ id: "survey-param", label: "Linked Clip", src: params.get("video"), poster: "" });
  }
  return clips;
}

function applyParticipantId(val) {
  participantIdValue = val.trim();
}

function showToast(message) {
  const toast = toastTemplate.content.firstElementChild.cloneNode(true);
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast--visible"));
  setTimeout(() => toast.remove(), 2800);
}

// --- Event Listeners ---
replayBtn.addEventListener("click", handleReplay);
clearLineBtn.addEventListener("click", clearLine);
submitAnnotationBtn.addEventListener("click", submitAnnotation);
participantIdInput.addEventListener("input", (e) => applyParticipantId(e.target.value));

video.addEventListener("ended", handleVideoEnded);
if (window.PointerEvent) {
  annotationCanvas.addEventListener("pointerdown", handlePointerDown);
  annotationCanvas.addEventListener("pointermove", handlePointerMove);
  annotationCanvas.addEventListener("pointerup", handlePointerUp);
} else {
  annotationCanvas.addEventListener("touchstart", (e) => handlePointerDown(e.touches[0]));
  annotationCanvas.addEventListener("touchmove", (e) => handlePointerMove(e.touches[0]));
  annotationCanvas.addEventListener("touchend", (e) => handlePointerUp(e.changedTouches[0]));
}

// --- Start ---
applyParticipantId(participantIdInput.value);
initApp();
