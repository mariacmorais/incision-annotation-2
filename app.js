// --- DOM Elements ---
const participantIdInput = document.getElementById("participantIdInput");
const participantIdStatus = document.getElementById("participantIdStatus");
// clipSelect is no longer the primary driver, but we keep the reference if you want to hide it in CSS
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
// Optional: Add a header element in your HTML with id="clipHeader" to show the current title
const clipHeader = document.getElementById("clipHeader"); 

// --- Configuration & State ---
const submissionConfig = window.ANNOTATION_SUBMISSION || {};
const baseAdditionalFields = { ...(submissionConfig.additionalFields || {}) };
delete baseAdditionalFields.studyId;
delete baseAdditionalFields.participantId;
delete baseAdditionalFields.filenameHint;

let participantIdValue = "";
const overlayCtx = finalFrameCanvas.getContext("2d");
const annotationCtx = annotationCanvas.getContext("2d");

// Workflow State
let allClips = [];
let currentClipIndex = 0;
let currentClip = null;

// Annotation State
let frameCaptured = false;
let activeLine = null;
let expertLines = null; 
let pointerDown = false;
let latestPayload = null;
let submissionInFlight = false;
let capturedFrameTimeValue = 0;
let helperVideo = null;
let helperSeekAttempted = false;

// --- Helper Functions ---

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

// NEW: Initialize the sequential workflow
function initStudyWorkflow() {
  allClips = getClips();
  
  if (allClips.length === 0) {
    videoStatus.textContent = "No clips configured.";
    return;
  }

  // Update button text to reflect new workflow
  submitAnnotationBtn.textContent = "Submit to investigator and Next Clip";

  // Check URL for specific starting clip (optional feature)
  const params = new URLSearchParams(window.location.search);
  const clipId = params.get("clip");
  if (clipId) {
    const foundIndex = allClips.findIndex((c) => c.id === clipId);
    if (foundIndex !== -1) currentClipIndex = foundIndex;
  }

  // Hide the dropdown if it exists in HTML, as it's no longer needed
  if (clipSelect) clipSelect.style.display = "none";

  loadCurrentClip();
}

// NEW: Load expert JSON
async function loadExpertAnnotation(clipId, annotationType = "gt") {
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
    showToast("Error loading annotation. Check console and server.");
    return null;
  }
}

// REFACTORED: Loads based on currentClipIndex rather than dropdown
async function loadCurrentClip() {
  if (currentClipIndex >= allClips.length) {
    handleStudyComplete();
    return;
  }

  resetAnnotationState();

  const clipData = allClips[currentClipIndex];
  
  // Create safe currentClip object
  currentClip = {
    ...clipData,
    id: clipData.id || `clip_${currentClipIndex}`,
    label: clipData.label || clipData.id,
    src: clipData.src,
    poster: clipData.poster || "",
  };

  if (!currentClip.src) {
    videoStatus.textContent = "Clip source missing.";
    return;
  }

  // Update Header UI
  if (clipHeader) {
    clipHeader.textContent = `${currentClipIndex + 1}/${allClips.length}: ${currentClip.label}`;
  } else {
    // Fallback if no header element exists
    videoStatus.textContent = `Loading Clip ${currentClipIndex + 1}: ${currentClip.label}…`;
  }

  // Load expert lines
  const annotationType = currentClip.annotationType || "gt";
  const clipIdBase = currentClip.id.replace(/_(mock|gt)$/, "");
  expertLines = await loadExpertAnnotation(clipIdBase, annotationType);
  
  if (expertLines) {
      console.log(`Loaded expert lines for ${currentClip.id}`);
  }

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
  videoStatus.textContent = `Loading: ${currentClip.label}...`;
  replayBtn.disabled = true;
  prepareHelperVideo();
}

function handleStudyComplete() {
  videoStatus.textContent = "All clips completed. Thank you for your participation!";
  annotationStatus.textContent = "Study Complete.";
  submissionStatus.textContent = "";
  canvasContainer.hidden = true;
  video.style.display = "none";
  submitAnnotationBtn.disabled = true;
  replayBtn.disabled = true;
  clearLineBtn.disabled = true;
  if (clipHeader) clipHeader.textContent = "Study Complete";
}

function looksLikeLocalPath(value) {
  if (!value) return false;
  const lower = value.toLowerCase();
  return (
    lower.startsWith("file:") ||
    lower.startsWith("/users/") ||
    lower.startsWith("c:\\") ||
    lower.startsWith("\\\\")
  );
}

function looksLikeGithubBlob(value) {
  if (!value) return false;
  const lower = value.toLowerCase();
  return lower.includes("github.com") && lower.includes("/blob/");
}

function handleVideoError() {
  let message = "Clip failed to load. Check that the src URL is correct and publicly accessible.";
  if (currentClip?.src) {
    message += ` (Configured source: ${currentClip.src})`;
    // ... (rest of error handling logic remains same)
  }
  videoStatus.textContent = message;
  showToast(message);
  replayBtn.disabled = true;
  teardownHelperVideo();
}

function resetAnnotationState() {
  teardownHelperVideo();
  frameCaptured = false;
  activeLine = null;
  expertLines = null;
  pointerDown = false;
  latestPayload = null;
  submissionInFlight = false;
  annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
  overlayCtx.clearRect(0, 0, finalFrameCanvas.width, finalFrameCanvas.height);
  annotationCanvas.style.backgroundImage = "";
  annotationStatus.textContent =
    "Final frame will appear below shortly. You can keep watching the clip while it prepares.";
  clearLineBtn.disabled = true;
  submitAnnotationBtn.disabled = true;
  
  if (submissionConfig.endpoint) {
    submissionStatus.textContent = participantIdValue
      ? "Draw the incision on the frozen frame to enable submission."
      : "Enter your participant ID above before submitting.";
  } else {
    submissionStatus.textContent =
      "Investigator submission endpoint not configured.";
  }
  capturedFrameTimeValue = 0;
}

function resizeCanvases(width, height) {
  finalFrameCanvas.width = width;
  finalFrameCanvas.height = height;
  annotationCanvas.width = width;
  annotationCanvas.height = height;
}

function teardownHelperVideo() {
  if (!helperVideo) return;
  helperVideo.removeEventListener("loadedmetadata", handleHelperLoadedMetadata);
  helperVideo.removeEventListener("seeked", handleHelperSeeked);
  helperVideo.removeEventListener("timeupdate", handleHelperTimeUpdate);
  helperVideo.removeEventListener("error", handleHelperError);
  try {
    helperVideo.pause();
  } catch (error) { }
  helperVideo.removeAttribute("src");
  helperVideo.load();
  helperVideo.remove();
  helperVideo = null;
  helperSeekAttempted = false;
}

function prepareHelperVideo() {
  teardownHelperVideo();
  if (!currentClip?.src) return;

  helperVideo = document.createElement("video");
  helperVideo.crossOrigin = "anonymous";
  helperVideo.preload = "auto";
  helperVideo.muted = true;
  helperVideo.setAttribute("playsinline", "");
  helperVideo.setAttribute("webkit-playsinline", "");
  helperVideo.addEventListener("loadedmetadata", handleHelperLoadedMetadata);
  helperVideo.addEventListener("seeked", handleHelperSeeked);
  helperVideo.addEventListener("timeupdate", handleHelperTimeUpdate);
  helperVideo.addEventListener("error", handleHelperError);
  helperVideo.src = currentClip.src;
  helperVideo.load();
}

function handleHelperLoadedMetadata() {
  if (!helperVideo || !Number.isFinite(helperVideo.duration)) return;
  helperSeekAttempted = true;
  const duration = helperVideo.duration;
  const offset = duration > 0.5 ? 0.04 : Math.max(duration * 0.5, 0.01);
  const target = Math.max(duration - offset, 0);
  try {
    helperVideo.currentTime = target;
  } catch (error) { }
}

function helperFinalizeCapture() {
  if (!helperVideo || helperVideo.readyState < 2 || frameCaptured) return;
  const success = captureFrameImage(helperVideo, helperVideo.currentTime);
  if (success) {
    teardownHelperVideo();
  } else {
    handleHelperError();
  }
}

function handleHelperSeeked() { helperFinalizeCapture(); }
function handleHelperTimeUpdate() { 
  if (!helperSeekAttempted || frameCaptured) return;
  helperFinalizeCapture(); 
}
function handleHelperError() {
  teardownHelperVideo();
  if (!frameCaptured) {
    annotationStatus.textContent = "Final frame will appear below once clip finishes.";
  }
}

function captureFrameImage(source, frameTimeValue) {
  if (!source.videoWidth || !source.videoHeight) return false;

  const firstCapture = !frameCaptured;
  resizeCanvases(source.videoWidth, source.videoHeight);
  overlayCtx.drawImage(source, 0, 0, finalFrameCanvas.width, finalFrameCanvas.height);
  annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);

  try {
    const dataUrl = finalFrameCanvas.toDataURL("image/png");
    annotationCanvas.style.backgroundImage = `url(${dataUrl})`;
    annotationCanvas.style.backgroundSize = "contain";
    annotationCanvas.style.backgroundRepeat = "no-repeat";
    annotationCanvas.style.backgroundPosition = "center";
  } catch (error) {
    frameCaptured = false;
    showToast("Unable to capture frame. Check CORS settings.");
    return false;
  }

  frameCaptured = true;
  canvasContainer.hidden = false;
  annotationStatus.textContent = expertLines
    ? "Final frame ready. Draw your incision line on top of the safety corridor." 
    : "Final frame ready. Draw your incision when ready.";

  if (firstCapture) {
    videoStatus.textContent = "Final frame captured. Review below.";
  }
  replayBtn.disabled = false;
  const numericTime = Number(((frameTimeValue ?? source.currentTime ?? 0) || 0).toFixed(3));
  capturedFrameTimeValue = Number.isFinite(numericTime) ? numericTime : 0;
  
  redrawCanvas();
  return true;
}

function freezeOnFinalFrame() {
  if (!frameCaptured) {
    const captureTime = Number.isFinite(video.duration) ? video.duration : video.currentTime || 0;
    captureFrameImage(video, captureTime);
  } else {
     // Ensure time is set if already captured
     const captureTime = Number.isFinite(video.duration) ? video.duration : video.currentTime;
     if(captureTime) capturedFrameTimeValue = Number(captureTime.toFixed(3));
  }
  videoStatus.textContent = "Clip complete. Frozen frame ready for annotation.";
}

function handleVideoLoaded() {
  videoStatus.textContent = "Clip loaded. Tap play to begin.";
  video.controls = true;
  video.setAttribute("controls", "");
  video.play().catch(() => {});
}

function handleVideoPlay() {
  videoStatus.textContent = frameCaptured
    ? "Replaying clip. Final frame available below."
    : "Watching clip…";
}

function handleVideoEnded() {
  freezeOnFinalFrame();
  video.controls = true;
  video.setAttribute("controls", "");
}

function handleVideoTimeUpdate() {
  if (frameCaptured) return;
  const duration = Number.isFinite(video.duration) ? video.duration : null;
  if (!duration) return;
  const remaining = duration - video.currentTime;
  if (remaining <= 0.25) {
    captureFrameImage(video, duration);
  }
}

function handleReplay() {
  if (!currentClip) return;
  annotationStatus.textContent = "Review the clip again and adjust your line if needed.";
  activeLine = null;
  redrawCanvas(); 
  clearLineBtn.disabled = true;
  submitAnnotationBtn.disabled = true;
  updateSubmissionPayload();
  
  video.currentTime = 0;
  video.play().catch(() => {});
}

function getPointerPosition(evt) {
  const rect = annotationCanvas.getBoundingClientRect();
  const touch = evt.touches?.[0] ?? evt.changedTouches?.[0] ?? null;
  const clientX = evt.clientX ?? touch?.clientX ?? 0;
  const clientY = evt.clientY ?? touch?.clientY ?? 0;
  const x = ((clientX - rect.left) / rect.width) * annotationCanvas.width;
  const y = ((clientY - rect.top) / rect.height) * annotationCanvas.height;
  return { x, y };
}

function normalizeFromPixels(pixels, referenceSize) {
  const width = referenceSize ? referenceSize.width : annotationCanvas.width;
  const height = referenceSize ? referenceSize.height : annotationCanvas.height;
  return {
    start: { x: pixels.start.x / width, y: pixels.start.y / height },
    end: { x: pixels.end.x / width, y: pixels.end.y / height },
  };
}

function redrawCanvas() {
  annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);

  // 1. Draw Expert Lines (Safety Corridor)
  if (expertLines && Array.isArray(expertLines.incisionDetails)) {
      const ctx = annotationCtx;
      const width = annotationCanvas.width;
      const height = annotationCanvas.height;

      ctx.strokeStyle = "rgba(0, 255, 0, 0.7)"; 
      ctx.lineWidth = Math.max(2, width * 0.005);
      ctx.setLineDash([8, 6]);

      expertLines.incisionDetails.forEach(detail => {
          const normalizedLine = detail.normalized ?? 
                                 normalizeFromPixels(detail.pixels, expertLines.canvasSize);          
          const startX = normalizedLine.start.x * width;
          const startY = normalizedLine.start.y * height;
          const endX = normalizedLine.end.x * width;
          const endY = normalizedLine.end.y * height;
          
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
          ctx.stroke();
      });
      ctx.setLineDash([]); 
  }

  // 2. Draw User Line
  const line = activeLine;
  if (!line) return;

  annotationCtx.strokeStyle = "#38bdf8"; 
  annotationCtx.lineWidth = Math.max(4, annotationCanvas.width * 0.004);
  annotationCtx.lineCap = "round";
  
  annotationCtx.beginPath();
  annotationCtx.moveTo(line.start.x, line.start.y);
  annotationCtx.lineTo(line.end.x, line.end.y);
  annotationCtx.stroke();

  annotationCtx.fillStyle = "#0ea5e9";
  annotationCtx.beginPath();
  annotationCtx.arc(line.start.x, line.start.y, annotationCtx.lineWidth, 0, Math.PI * 2);
  annotationCtx.fill();
  annotationCtx.beginPath();
  annotationCtx.arc(line.end.x, line.end.y, annotationCtx.lineWidth, 0, Math.PI * 2);
  annotationCtx.fill();
}

function normalizeLine(line) {
  return {
    start: { x: line.start.x / annotationCanvas.width, y: line.start.y / annotationCanvas.height },
    end: { x: line.end.x / annotationCanvas.width, y: line.end.y / annotationCanvas.height },
  };
}

function updateSubmissionPayload() {
  if (!activeLine || !frameCaptured || !currentClip) {
    latestPayload = null;
    submitAnnotationBtn.disabled = true;
    if (frameCaptured && submissionConfig.endpoint) {
      submissionStatus.textContent = participantIdValue
        ? "Draw the incision and release."
        : "Enter your participant ID above.";
    }
    return;
  }

  const frameTime = capturedFrameTimeValue;
  const normalizedLine = normalizeLine(activeLine);
  const lengthPixels = Math.hypot(
    activeLine.end.x - activeLine.start.x,
    activeLine.end.y - activeLine.start.y
  );

  const startPixels = { x: Number(activeLine.start.x.toFixed(2)), y: Number(activeLine.start.y.toFixed(2)) };
  const endPixels = { x: Number(activeLine.end.x.toFixed(2)), y: Number(activeLine.end.y.toFixed(2)) };
  const filenameHint = getFilenameHint();

  const payload = {
    clipId: currentClip.id,
    clipLabel: currentClip.label,
    videoSrc: currentClip.src,
    capturedFrameTime: frameTime,
    incision: normalizedLine,
    incisionPixels: {
      start: startPixels,
      end: endPixels,
      length: Number(lengthPixels.toFixed(2)),
    },
    canvasSize: { width: annotationCanvas.width, height: annotationCanvas.height },
    generatedAt: new Date().toISOString(),
    participantId: participantIdValue || "",
    filenameHint,
    expertAnnotation: expertLines ? {
      clipId: expertLines.clipId,
      incisions: expertLines.incisions || expertLines.incisionDetails.map(d => d.normalized),
    } : null,
  };

  latestPayload = payload;

  if (!submissionConfig.endpoint) {
    submitAnnotationBtn.disabled = true;
    submissionStatus.textContent = "Endpoint not configured.";
    return;
  }

  if (!participantIdValue) {
    submitAnnotationBtn.disabled = true;
    submissionStatus.textContent = "Enter your participant ID above.";
    return;
  }

  if (!submissionInFlight) {
    submitAnnotationBtn.disabled = false;
  }
  submissionStatus.textContent = "Ready to submit. Tap the button to send and next.";
}

function handlePointerDown(evt) {
  if (!frameCaptured) {
    showToast("Wait for final frame.");
    return;
  }
  evt.preventDefault();
  pointerDown = true;
  const start = getPointerPosition(evt);
  activeLine = { start, end: start };
  redrawCanvas(); 
}

function handlePointerMove(evt) {
  if (!pointerDown || !activeLine) return;
  evt.preventDefault();
  activeLine.end = getPointerPosition(evt);
  redrawCanvas();
}

function handlePointerUp(evt) {
  if (!pointerDown || !activeLine) return;
  if (evt.type === "mouseleave") { pointerDown = false; return; }
  evt.preventDefault();
  pointerDown = false;
  activeLine.end = getPointerPosition(evt);
  redrawCanvas();
  clearLineBtn.disabled = false;
  annotationStatus.textContent = "Line recorded.";
  updateSubmissionPayload();
}

function clearLine() {
  activeLine = null;
  pointerDown = false;
  redrawCanvas(); 
  annotationStatus.textContent = expertLines
    ? "Draw your incision line on top of the safety corridor."
    : "Draw your incision line.";
  clearLineBtn.disabled = true;
  updateSubmissionPayload();
}

// REFACTORED: Submit and move to next clip
async function submitAnnotation() {
  if (!latestPayload || !submissionConfig.endpoint) return;
  if (submissionInFlight) return;

  submissionInFlight = true;
  submitAnnotationBtn.disabled = true;
  submissionStatus.textContent = "Submitting...";

  const method = submissionConfig.method || "POST";
  const headers = { ...(submissionConfig.headers || {}) };
  let shouldSetDefaultContentType = true;
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === "content-type") {
      shouldSetDefaultContentType = false;
      if (headers[key] === null) delete headers[key];
    }
  }
  if (shouldSetDefaultContentType) headers["Content-Type"] = "application/json";

  const filenameHint = getFilenameHint();
  const additionalFields = buildAdditionalFields(filenameHint);
  
  let bodyWrapper;
  if (submissionConfig.bodyWrapper === "none") {
    bodyWrapper = { ...additionalFields, ...latestPayload };
  } else {
    const key = (typeof submissionConfig.bodyWrapper === "string" && submissionConfig.bodyWrapper)
        ? submissionConfig.bodyWrapper : "annotation";
    bodyWrapper = { ...additionalFields, [key]: latestPayload };
  }

  try {
    const response = await fetch(submissionConfig.endpoint, {
      method, headers, body: JSON.stringify(bodyWrapper),
    });
    
    if (!response.ok) throw new Error(`Status ${response.status}`);
    
    showToast("Annotation submitted.");
    submissionStatus.textContent = "Success.";
    
    // SEQUENTIAL LOGIC: Move to next clip
    setTimeout(() => {
        currentClipIndex++;
        loadCurrentClip();
        submissionInFlight = false;
    }, 500);

  } catch (error) {
    submissionStatus.textContent = "Submission failed. Try again.";
    submitAnnotationBtn.disabled = false;
    showToast("Error submitting annotation.");
    console.error(error);
    submissionInFlight = false;
  }
}

function applyParticipantId(rawValue) {
  participantIdValue = (rawValue || "").trim();
  if (participantIdValue) {
    participantIdStatus.textContent = "ID recorded.";
  } else {
    participantIdStatus.textContent = "Enter required Participant ID.";
  }
  updateSubmissionPayload();
}

function getFilenameHint() {
  const clipPart = currentClip?.id ? String(currentClip.id) : "annotation";
  if (participantIdValue) {
    return `${participantIdValue}_${clipPart}.json`;
  }
  return `${clipPart}.json`;
}

function buildAdditionalFields(filenameHint) {
  const fields = { ...baseAdditionalFields };
  const fatigue = document.getElementById("fatigueInput")?.value;
  if (participantIdValue) {
    fields.studyId = participantIdValue;
    fields.participantId = participantIdValue;
  }
  if (filenameHint) fields.filenameHint = filenameHint;
  if (fatigue) fields.fatigue = fatigue;
  return fields;
}

// --- Event Listeners ---
// Removed clipSelect 'change' listener
replayBtn.addEventListener("click", handleReplay);
video.addEventListener("loadeddata", handleVideoLoaded);
video.addEventListener("error", handleVideoError, { once: false });
video.addEventListener("play", handleVideoPlay);
video.addEventListener("timeupdate", handleVideoTimeUpdate);
video.addEventListener("ended", handleVideoEnded);
clearLineBtn.addEventListener("click", clearLine);
submitAnnotationBtn.addEventListener("click", submitAnnotation);

participantIdInput.addEventListener("input", (event) => {
  applyParticipantId(event.target.value);
});

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

// --- Initialize ---
applyParticipantId(participantIdInput.value);
initStudyWorkflow(); // Triggers the sequential flow
