const participantIdInput = document.getElementById("participantIdInput");
const fatigueInput = document.getElementById("fatigueInput");
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
const completionCard = document.getElementById("completionCard");

const submissionConfig = window.ANNOTATION_SUBMISSION || {};
const baseAdditionalFields = { ...(submissionConfig.additionalFields || {}) };
delete baseAdditionalFields.studyId;
delete baseAdditionalFields.participantId;
delete baseAdditionalFields.filenameHint;

const overlayCtx = finalFrameCanvas.getContext("2d");
const annotationCtx = annotationCanvas.getContext("2d");

let frameCaptured = false;
let currentClip = null;
let activeLine = null;
let expertLines = null;
let pointerDown = false;
let submissionInFlight = false;
let capturedFrameTimeValue = 0;
let helperVideo = null;
let helperSeekAttempted = false;

// Sequential Logic Tracker
let currentClipIndex = 0;

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
      annotationType: "gt"
    });
  }
  return clips;
}

// Phase 2: Load Expert/Mock Lines
async function loadExpertAnnotation(clipId, annotationType = "gt") {
  const basePath = annotationType === "mock" ? "mock-annotations/" : "expert-annotations/";
  const suffix = annotationType === "mock" ? "_mock.json" : "_gt.json";
  const jsonPath = `${basePath}${clipId}${suffix}`;

  try {
    const response = await fetch(jsonPath);
    if (!response.ok) {
      console.warn(`Annotation not found for clip: ${clipId}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching annotation:", error);
    return null;
  }
}

// Sequential Loader
async function loadClipByIndex(index) {
  const clips = getClips();
  
  // If we have finished all clips
  if (index >= clips.length) {
    handleAllClipsCompleted();
    return;
  }

  const clip = clips[index];

  // Update Button Text Logic
  if (index === clips.length - 1) {
    submitAnnotationBtn.textContent = "Submit & Finish";
  } else {
    submitAnnotationBtn.textContent = "Submit & Next Clip";
  }

  const src = clip.src;
  if (!src) {
    videoStatus.textContent = "Clip source missing.";
    return;
  }

  resetAnnotationState();

  currentClip = {
    ...clip,
    id: clip.id,
    label: clip.label,
    src,
    poster: clip.poster || "",
  };

  // Phase 2: Fetch Overlays
  const annotationType = currentClip.annotationType || "gt";
  const clipIdBase = currentClip.id.replace(/_(mock|gt)$/, ""); 
  
  videoStatus.textContent = "Loading configuration...";
  expertLines = await loadExpertAnnotation(clipIdBase, annotationType);
  
  canvasContainer.hidden = true;
  video.removeAttribute("controls");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.crossOrigin = "anonymous";
  if (currentClip.poster) video.setAttribute("poster", currentClip.poster);
  else video.removeAttribute("poster");

  video.src = currentClip.src;
  video.load();
  videoStatus.textContent = "Loading clip…";
  replayBtn.disabled = true;
  prepareHelperVideo();
}

function handleAllClipsCompleted() {
  document.querySelectorAll('.card:not(#confidenceSection)').forEach(el => el.hidden = true);
  document.getElementById("confidenceSection").hidden = false;
}

function handleVideoError() {
  videoStatus.textContent = "Clip failed to load. Check console for details.";
  showToast("Error loading video.");
  replayBtn.disabled = true;
  teardownHelperVideo();
}

function resetAnnotationState() {
  teardownHelperVideo();
  frameCaptured = false;
  activeLine = null;
  pointerDown = false;
  submissionInFlight = false;
  annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
  overlayCtx.clearRect(0, 0, finalFrameCanvas.width, finalFrameCanvas.height); 
  
  submitAnnotationBtn.disabled = true;
  submissionStatus.textContent = "Draw the incision on the frozen frame to enable submission.";
  submissionStatus.className = "help";
  
  finalFrameCanvas.hidden = true;
  canvasContainer.hidden = true;
  video.hidden = false;
  annotationStatus.textContent = "The final frame appears below shortly.";
}

function resizeCanvases(width, height) {
  finalFrameCanvas.width = width;
  finalFrameCanvas.height = height;
  annotationCanvas.width = width;
  annotationCanvas.height = height;
}

// ... [Helper Video Logic Redacted for brevity, same as previous Phase 1 code] ...
function teardownHelperVideo() {
  if (!helperVideo) return;
  try { helperVideo.pause(); } catch (e) {}
  helperVideo.removeAttribute("src");
  helperVideo.load();
  helperVideo.remove();
  helperVideo = null;
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
  const target = Math.max(helperVideo.duration - 0.04, 0);
  try { helperVideo.currentTime = target; } catch (e) {}
}
function handleHelperSeeked() { helperFinalizeCapture(); }
function handleHelperTimeUpdate() { if (helperSeekAttempted && !frameCaptured) helperFinalizeCapture(); }
function handleHelperError() { teardownHelperVideo(); }
function helperFinalizeCapture() {
  if (!helperVideo || helperVideo.readyState < 2 || frameCaptured) return;
  captureFrameImage(helperVideo, helperVideo.currentTime);
  teardownHelperVideo();
}

function captureFrameImage(source, frameTimeValue) {
  if (!source.videoWidth || !source.videoHeight) return false;

  resizeCanvases(source.videoWidth, source.videoHeight);

  // Draw the video frame
  overlayCtx.drawImage(source, 0, 0, finalFrameCanvas.width, finalFrameCanvas.height);
  annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);

  // Phase 2: Draw Expert/Mock Overlay
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

  finalFrameCanvas.hidden = false;
  canvasContainer.hidden = false;
  frameCaptured = true;
  capturedFrameTimeValue = frameTimeValue;
  annotationStatus.textContent = "Draw your incision line now.";
  return true;
}

video.addEventListener("error", handleVideoError);
video.addEventListener("loadeddata", () => {
  videoStatus.textContent = "Playing clip...";
  video.play().catch(() => {
    videoStatus.textContent = "Tap 'Replay Clip' to start.";
    replayBtn.disabled = false;
  });
});
video.addEventListener("ended", () => {
  if (!frameCaptured) captureFrameImage(video, video.duration);
});
replayBtn.addEventListener("click", () => {
  resetAnnotationState();
  video.currentTime = 0;
  video.play();
  replayBtn.disabled = true;
});

// Pointer Events
function getPointerPos(e) {
  const rect = annotationCanvas.getBoundingClientRect();
  const sx = annotationCanvas.width / rect.width;
  const sy = annotationCanvas.height / rect.height;
  const cx = e.touches ? e.touches[0].clientX : e.clientX;
  const cy = e.touches ? e.touches[0].clientY : e.clientY;
  return { x: (cx - rect.left) * sx, y: (cy - rect.top) * sy };
}
function handlePointerDown(e) {
  if (e.button > 0) return;
  e.preventDefault();
  pointerDown = true;
  activeLine = [getPointerPos(e)];
  redrawAnnotation();
}
function handlePointerMove(e) {
  if (!pointerDown) return;
  e.preventDefault();
  activeLine.push(getPointerPos(e));
  redrawAnnotation();
}
function handlePointerUp(e) {
  if (!pointerDown) return;
  e.preventDefault();
  pointerDown = false;
  validateAndEnableSubmit();
}
function redrawAnnotation() {
  annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
  if (!activeLine || activeLine.length < 2) return;
  annotationCtx.beginPath();
  annotationCtx.moveTo(activeLine[0].x, activeLine[0].y);
  for (let i = 1; i < activeLine.length; i++) annotationCtx.lineTo(activeLine[i].x, activeLine[i].y);
  annotationCtx.strokeStyle = "#ffcc00";
  annotationCtx.lineWidth = 4;
  annotationCtx.lineCap = "round";
  annotationCtx.lineJoin = "round";
  annotationCtx.stroke();
}
function clearLine() {
  activeLine = null;
  annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
  submitAnnotationBtn.disabled = true;
  submissionStatus.textContent = "Draw the incision on the frozen frame to enable submission.";
  submissionStatus.className = "help";
}
function validateAndEnableSubmit() {
  if (activeLine && activeLine.length > 5) {
    submitAnnotationBtn.disabled = false;
    submissionStatus.textContent = "Ready to submit.";
    submissionStatus.className = "help help--success";
  } else {
    submitAnnotationBtn.disabled = true;
    submissionStatus.textContent = "Line too short.";
    submissionStatus.className = "help help--error";
  }
}

// --- SUBMISSION LOGIC ---

async function submitAnnotation() {
  if (submissionInFlight) return;
  
  const participantId = participantIdInput.value.trim();
  const fatigueLevel = fatigueInput.value; 

  if (!participantId) {
    showToast("Please enter a Participant ID.");
    participantIdInput.focus();
    return;
  }
  if (!fatigueLevel) {
    showToast("Please select your fatigue level.");
    fatigueInput.focus();
    return;
  }
  if (!activeLine || activeLine.length < 2) return;

  submissionInFlight = true;
  submitAnnotationBtn.disabled = true;
  submitAnnotationBtn.textContent = "Submitting...";

  const body = {
    ...baseAdditionalFields,
    participantId: participantId,
    fatigueLevel: fatigueLevel,
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
      body: JSON.stringify({ annotation: body }),
    });

    if (!response.ok) throw new Error("Submission failed");

    showToast("Annotation saved!");

    currentClipIndex++;
    submissionInFlight = false;
    loadClipByIndex(currentClipIndex);

  } catch (err) {
    console.error(err);
    showToast("Could not submit. Please try again.");
    submissionInFlight = false;
    submitAnnotationBtn.disabled = false;
    // RESET BUTTON TEXT CORRECTLY BASED ON INDEX
    const clips = getClips();
    const isLast = currentClipIndex === clips.length - 1;
    submitAnnotationBtn.textContent = isLast ? "Submit & Finish" : "Submit & Next Clip";
  }
}

// CONFIDENCE SUBMISSION
document.getElementById("submitConfidenceBtn").addEventListener("click", async () => {
  const confidenceInput = document.getElementById("confidenceInput").value;
  if (!confidenceInput) {
    showToast("Please select a confidence level.");
    return;
  }
  const participantId = participantIdInput.value.trim();

  try {
    const response = await fetch(submissionConfig.endpoint, {
      method: submissionConfig.method || "POST",
      headers: submissionConfig.headers || { "Content-Type": "application/json" },
      body: JSON.stringify({
        survey: {
          participantId: participantId,
          confidenceFinal: confidenceInput,
          type: "phase2_survey_response",
          generatedAt: new Date().toISOString(),
        }
      }),
    });
    if (!response.ok) throw new Error("Submission failed");

    showToast("Confidence submitted. Thank you!");
    document.getElementById("confidenceSection").hidden = true;
    completionCard.hidden = false;

  } catch (err) {
    showToast("Could not submit. Try again.");
  }
});

// Event Listeners
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

// INIT
loadClipByIndex(0);
