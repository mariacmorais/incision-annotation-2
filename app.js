// --- Global References ---
const participantIdInput = document.getElementById("participantIdInput");
const participantIdStatus = document.getElementById("participantIdStatus");
// REMOVED: const clipSelect = document.getElementById("clipSelect");
const clipProgress = document.getElementById("clipProgress"); // New Header Element

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
const fatigueInput = document.getElementById("fatigueInput"); // New Fatigue Input

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
let currentClipIndex = 0; // Tracks which clip we are on
let allClips = [];        // Loaded from config
let frameCaptured = false;
let currentClip = null;
let activeLine = null;
let expertLines = null;   // Holds the loaded expert/mock annotation data
let submissionInFlight = false;
let capturedFrameTimeValue = 0;
let helperVideo = null;
let helperSeekAttempted = false;

// --- Initialization ---
function initApp() {
  allClips = getClips();
  
  if (allClips.length === 0) {
    videoStatus.textContent = "No clips configured in clip-config.js";
    return;
  }

  // Support deep linking to a specific index (e.g. ?clipIndex=2)
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

// --- Data Loading (Includes your Expert/Mock Logic) ---
async function loadClipData(clip) {
  if (!clip) return;
  resetAnnotationState();

  currentClip = {
    ...clip,
    poster: clip.poster || "",
  };

  // !!! CRITICAL: Determine folder based on annotationType from clip-config.js !!!
  const annotationType = currentClip.annotationType || "gt";
  const clipIdBase = currentClip.id.replace(/_(mock|gt)$/, ""); // Handle ID suffixes if present
  
  // Load the JSON overlay
  expertLines = await loadExpertAnnotation(clipIdBase, annotationType);
  if (expertLines) {
      console.log(`Loaded ${annotationType} lines for ${currentClip.id}`);
  }

  // Setup Video
  canvasContainer.hidden = true;
  video.removeAttribute("controls");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.crossOrigin = "anonymous";
  
  if (currentClip.poster) video.setAttribute("poster", currentClip.poster);
  else video.removeAttribute("poster");

  video.src = currentClip.src;
  video.load();
  videoStatus.textContent = `Loading Clip ${currentClipIndex + 1}...`;
  replayBtn.disabled = true;
  prepareHelperVideo();
}

// --- Helper: Fetch JSON from expert-annotations/ or mock-annotations/ ---
async function loadExpertAnnotation(clipId, annotationType = "gt") {
  // Select folder based on type
  const basePath = annotationType === "mock" ? "mock-annotations/" : "expert-annotations/";
  const suffix = annotationType === "mock" ? "_mock.json" : "_gt.json";
  const jsonPath = `${basePath}${clipId}${suffix}`;

  try {
    const response = await fetch(jsonPath);
    if (!response.ok) {
      console.warn(`Annotation not found for clip: ${clipId}. Tried: ${jsonPath}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching annotation:", error);
    return null;
  }
}

// --- Canvas Drawing (Renders the overlays) ---
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

  // Handle normalized coordinates (0-1) vs pixel coordinates
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
  
  // Draw the video frame
  overlayCtx.drawImage(source, 0, 0, finalFrameCanvas.width, finalFrameCanvas.height);
  
  // Prepare Annotation Layer
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
  
  // Message Update
  annotationStatus.textContent = expertLines
    ? "Final frame ready. Draw your incision line on top of the safety corridor." 
    : "Final frame ready. Draw your incision when ready.";

  if (firstCapture) {
    videoStatus.textContent = "Final frame captured. You can replay if needed.";
  }
  
  replayBtn.disabled = false;
  capturedFrameTimeValue = Number((frameTimeValue || 0).toFixed(3));
  
  // DRAW THE OVERLAYS NOW
  redrawCanvas(); 

  return true;
}

// --- Interaction Handlers (Mouse/Touch) ---
function handlePointerDown(evt) {
  if (!frameCaptured) return;
  evt.preventDefault();
  annotationCanvas.setPointerCapture(evt.pointerId);
  const pos = getPointerPosition(evt);
  // Start a new line
  activeLine = [{ x: pos.x / annotationCanvas.width, y: pos.y / annotationCanvas.height }];
  redrawCanvas();
}

function handlePointerMove(evt) {
  if (!frameCaptured || !activeLine) return;
  evt.preventDefault();
  const pos = getPointerPosition(evt);
  // Add points to current line
  activeLine.push({ x: pos.x / annotationCanvas.width, y: pos.y / annotationCanvas.height });
  redrawCanvas();
}

function handlePointerUp(evt) {
  if (!frameCaptured || !activeLine) return;
  evt.preventDefault();
  annotationCanvas.releasePointerCapture(evt.pointerId);
  
  // Enforce simple line rule (optional validation could go here)
  submitAnnotationBtn.disabled = false;
}

function getPointerPosition(evt) {
  const rect = annotationCanvas.getBoundingClientRect();
  const x = evt.offsetX; // Simplest for mouse/pointer events
  const y = evt.offsetY;
  return { x, y };
}

function clearLine() {
  activeLine = null;
  submitAnnotationBtn.disabled = true;
  redrawCanvas(); // Will still draw expert lines, but clear user line
}

// --- Submission & Next Clip Logic ---
async function submitAnnotation() {
  if (submissionInFlight) return;

  // 1. Validations
  if (!participantIdValue) {
    showToast("Please enter a Participant ID first.");
    participantIdInput.focus();
    return;
  }
  if (!activeLine) {
    showToast("Please draw an incision line first.");
    return;
  }
  // Fatigue Check
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
    fatigue: fatigueInput.value, // Added Fatigue
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

// --- Standard Video Helper Functions (Unchanged logic, condensed) ---
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

function handleVideoEnded() { freezeOnFinalFrame(); video.controls = true; }
function freezeOnFinalFrame() {
  if (!frameCaptured) captureFrameImage(video, video.duration || video.currentTime);
}
function handleReplay() {
  if (!currentClip) return;
  activeLine = null; 
  redrawCanvas(); // Keeps expert lines, clears user line
  clearLineBtn.disabled = true;
  submitAnnotationBtn.disabled = true;
  video.currentTime = 0;
  video.play();
}

// Helper Video (Hidden video for background capture)
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
  // Attempt to seek to near end
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

// --- Utility Functions ---
function getClips() {
  // Use config or URL param
  const clips = Array.isArray(window.ANNOTATION_CLIPS) ? [...window.ANNOTATION_CLIPS] : [];
  const params = new URLSearchParams(window.location.search);
  if (params.get("video")) {
    clips.unshift({ id: "survey-param", label: "Linked Clip", src: params.get("video"), poster: "" });
  }
  return clips;
}

function applyParticipantId(val) {
  participantIdValue = val.trim();
  // Updates UI status if needed
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
  // Fallback for older touch handling if needed
  annotationCanvas.addEventListener("touchstart", (e) => handlePointerDown(e.touches[0]));
}

// --- Start the App ---
applyParticipantId(participantIdInput.value);
initApp();
