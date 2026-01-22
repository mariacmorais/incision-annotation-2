const participantIdInput = document.getElementById("participantIdInput");
const fatigueInput = document.getElementById("fatigueInput");
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
const confidenceSection = document.getElementById("confidenceSection");

const submissionConfig = window.ANNOTATION_SUBMISSION || {};
const baseAdditionalFields = { ...(submissionConfig.additionalFields || {}) };
delete baseAdditionalFields.studyId;
delete baseAdditionalFields.participantId;
delete baseAdditionalFields.filenameHint;

const overlayCtx = finalFrameCanvas.getContext("2d");
const annotationCtx = annotationCanvas.getContext("2d");

// --- STATE ---
let frameCaptured = false;
let currentClip = null;
let activeLine = null;
let pointerDown = false;
let submissionInFlight = false;
let currentClipIndex = 0;
let expertOverlayData = null; // Stores the JSON data for the current clip

// --- UTILS ---
function showToast(message) {
  const toast = toastTemplate.content.firstElementChild.cloneNode(true);
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast--visible"));
  setTimeout(() => toast.remove(), 2800);
}

function getClips() {
  return Array.isArray(window.ANNOTATION_CLIPS) ? [...window.ANNOTATION_CLIPS] : [];
}

// --- PHASE 2: OVERLAY FETCHING ---
async function fetchOverlayData(clipId, type) {
  // If no type or type is "none", skip
  if (!type) return null;

  // Construct path: expert-annotations/clip_XX_gt.json
  const folder = type === "mock" ? "mock-annotations" : "expert-annotations";
  const suffix = type === "mock" ? "_mock" : "_gt";
  
  // Clean ID just in case (e.g. "clip_01_gt" -> "clip_01")
  const baseId = clipId.replace(/_(gt|mock)$/, "");
  
  const url = `${folder}/${baseId}${suffix}.json`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn("Could not load overlay:", err);
    return null;
  }
}

// --- SEQUENTIAL LOADING ---
async function loadClipByIndex(index) {
  const clips = getClips();

  // End of sequence?
  if (index >= clips.length) {
    handleAllClipsCompleted();
    return;
  }

  const clip = clips[index];
  currentClipIndex = index;

  // Update Button Text
  submitAnnotationBtn.textContent = (index === clips.length - 1) 
    ? "Submit & Finish" 
    : "Submit & Next Clip";

  // Reset State
  frameCaptured = false;
  activeLine = null;
  expertOverlayData = null;
  submitAnnotationBtn.disabled = true;
  submissionStatus.textContent = "Draw the incision on the frozen frame to enable submission.";
  submissionStatus.className = "help";
  
  finalFrameCanvas.hidden = true;
  canvasContainer.hidden = true;
  video.hidden = false;
  replayBtn.disabled = true;

  // Load Video
  currentClip = { ...clip };
  videoStatus.textContent = "Loading clip data...";

  // 1. Fetch Overlay (Async)
  // We do this while video loads, or before setting src
  expertOverlayData = await fetchOverlayData(currentClip.id, currentClip.annotationType || "gt");

  // 2. Set Video Source
  video.removeAttribute("controls");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.crossOrigin = "anonymous"; // Important for canvas
  video.src = currentClip.src;
  video.load();
  
  videoStatus.textContent = "Loading clip...";
}

function handleAllClipsCompleted() {
  // Hide main interface
  document.querySelectorAll('.card:not(#confidenceSection)').forEach(el => el.hidden = true);
  // Show Confidence Question
  confidenceSection.hidden = false;
}

// --- VIDEO EVENTS (Simple Phase 1 Logic) ---

video.addEventListener("loadeddata", () => {
  videoStatus.textContent = "Playing clip...";
  video.play().catch(() => {
    videoStatus.textContent = "Tap 'Replay Clip' to start.";
    replayBtn.disabled = false;
  });
});

video.addEventListener("error", () => {
  videoStatus.textContent = "Error loading video.";
  showToast("Video failed to load.");
});

video.addEventListener("ended", () => {
  if (frameCaptured) return;
  captureFinalFrame();
});

replayBtn.addEventListener("click", () => {
  frameCaptured = false;
  activeLine = null;
  submitAnnotationBtn.disabled = true;
  finalFrameCanvas.hidden = true;
  canvasContainer.hidden = true;
  video.hidden = false;
  
  video.currentTime = 0;
  video.play();
  replayBtn.disabled = true;
  videoStatus.textContent = "Playing...";
});

// --- CAPTURE & OVERLAY DRAWING ---
function captureFinalFrame() {
  if (frameCaptured) return;
  
  // 1. Setup Canvas
  finalFrameCanvas.width = video.videoWidth;
  finalFrameCanvas.height = video.videoHeight;
  annotationCanvas.width = video.videoWidth;
  annotationCanvas.height = video.videoHeight;
  
  // 2. Draw Video Frame
  overlayCtx.drawImage(video, 0, 0);

  // 3. Draw Green Overlay (if exists)
  if (expertOverlayData && expertOverlayData.lines) {
    expertOverlayData.lines.forEach(line => {
      if (line.points && line.points.length > 0) {
        overlayCtx.beginPath();
        overlayCtx.moveTo(line.points[0].x, line.points[0].y);
        for (let i = 1; i < line.points.length; i++) {
          overlayCtx.lineTo(line.points[i].x, line.points[i].y);
        }
        // STYLE: Green, semi-transparent
        overlayCtx.strokeStyle = "rgba(50, 205, 50, 0.7)"; 
        overlayCtx.lineWidth = 5;
        overlayCtx.lineCap = "round";
        overlayCtx.stroke();
      }
    });
  }

  // 4. Update UI
  video.hidden = true;
  finalFrameCanvas.hidden = false;
  canvasContainer.hidden = false;
  replayBtn.disabled = false;
  videoStatus.textContent = "Clip ended.";
  annotationStatus.textContent = "Draw your incision line now.";
  frameCaptured = true;
}

// --- ANNOTATION DRAWING (Standard) ---
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
  validateSubmit();
}

function redrawAnnotation() {
  annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
  if (!activeLine || activeLine.length < 2) return;

  annotationCtx.beginPath();
  annotationCtx.moveTo(activeLine[0].x, activeLine[0].y);
  for (let i = 1; i < activeLine.length; i++) {
    annotationCtx.lineTo(activeLine[i].x, activeLine[i].y);
  }
  annotationCtx.strokeStyle = "#ffcc00"; // Yellow user line
  annotationCtx.lineWidth = 4;
  annotationCtx.lineCap = "round";
  annotationCtx.stroke();
}

function validateSubmit() {
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

clearLineBtn.addEventListener("click", () => {
  activeLine = null;
  annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
  submitAnnotationBtn.disabled = true;
  submissionStatus.textContent = "Draw the incision on the frozen frame.";
  submissionStatus.className = "help";
});

// --- SUBMISSION ---
submitAnnotationBtn.addEventListener("click", async () => {
  if (submissionInFlight) return;
  
  const pID = participantIdInput.value.trim();
  const fatigue = fatigueInput.value;

  if (!pID || !fatigue) {
    showToast("Please fill in Participant ID and Fatigue.");
    participantIdInput.scrollIntoView({ behavior: "smooth" });
    return;
  }

  submissionInFlight = true;
  submitAnnotationBtn.disabled = true;
  submitAnnotationBtn.textContent = "Submitting...";

  const payload = {
    ...baseAdditionalFields,
    participantId: pID,
    fatigueLevel: fatigue,
    clipId: currentClip.id,
    clipLabel: currentClip.label,
    videoSrc: currentClip.src,
    annotationType: currentClip.annotationType,
    points: activeLine,
    generatedAt: new Date().toISOString()
  };

  try {
    // Attempt submission
    if (submissionConfig.endpoint) {
      await fetch(submissionConfig.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annotation: payload })
      });
    } else {
      console.warn("No endpoint configured. Simulating success.");
      await new Promise(r => setTimeout(r, 500));
    }

    showToast("Saved!");
    // Next Clip
    loadClipByIndex(currentClipIndex + 1);

  } catch (err) {
    console.error(err);
    showToast("Error submitting.");
    submitAnnotationBtn.disabled = false;
    submitAnnotationBtn.textContent = "Retry Submit";
  } finally {
    submissionInFlight = false;
  }
});

// --- FINAL CONFIDENCE SUBMISSION ---
document.getElementById("submitConfidenceBtn").addEventListener("click", async () => {
  const val = document.getElementById("confidenceInput").value;
  if (!val) { showToast("Please select a value."); return; }

  const pID = participantIdInput.value.trim();
  
  try {
    if (submissionConfig.endpoint) {
      await fetch(submissionConfig.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          survey: {
            participantId: pID,
            type: "confidence_survey",
            confidenceFinal: val,
            generatedAt: new Date().toISOString()
          }
        })
      });
    }
    document.getElementById("confidenceSection").hidden = true;
    completionCard.hidden = false;
  } catch (err) {
    showToast("Error submitting survey.");
  }
});

// --- POINTER EVENT SETUP ---
if (window.PointerEvent) {
  annotationCanvas.addEventListener("pointerdown", handlePointerDown, { passive: false });
  annotationCanvas.addEventListener("pointermove", handlePointerMove, { passive: false });
  annotationCanvas.addEventListener("pointerup", handlePointerUp, { passive: false });
} else {
  annotationCanvas.addEventListener("mousedown", handlePointerDown);
  annotationCanvas.addEventListener("mousemove", handlePointerMove);
  annotationCanvas.addEventListener("mouseup", handlePointerUp);
  annotationCanvas.addEventListener("touchstart", handlePointerDown, { passive: false });
  annotationCanvas.addEventListener("touchmove", handlePointerMove, { passive: false });
  annotationCanvas.addEventListener("touchend", handlePointerUp, { passive: false });
}

// START
loadClipByIndex(0);
