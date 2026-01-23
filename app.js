   // Multi-Clip Annotation App
    const participantIdInput = document.getElementById("participantIdInput");
    const participantIdStatus = document.getElementById("participantIdStatus");
    const fatigueInput = document.getElementById("fatigueInput");
    const clipsContainer = document.getElementById("clipsContainer");
    const clipTemplate = document.getElementById("clipTemplate");
    const toastTemplate = document.getElementById("toastTemplate");

    const submissionConfig = window.ANNOTATION_SUBMISSION || {};
    let participantIdValue = "";
    const clipStates = new Map();

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
        console.error("Error fetching annotation:", error);
        return null;
      }
    }

    function normalizeFromPixels(pixels, referenceSize) {
      const width = referenceSize ? referenceSize.width : pixels.start.x;
      const height = referenceSize ? referenceSize.height : pixels.start.y;

      return {
        start: {
          x: pixels.start.x / width,
          y: pixels.start.y / height,
        },
        end: {
          x: pixels.end.x / width,
          y: pixels.end.y / height,
        },
      };
    }

    function createClipElement(clip, index) {
      const clipEl = clipTemplate.content.cloneNode(true);
      const section = clipEl.querySelector(".clip-section");
      section.dataset.clipId = clip.id;
      section.dataset.clipIndex = index;

      const title = clipEl.querySelector(".clip-title");
      title.textContent = `${index + 1}. ${clip.label}`;

      const video = clipEl.querySelector(".clip-video");
      const finalFrame = clipEl.querySelector(".clip-final-frame");
      const annotationCanvas = clipEl.querySelector(".clip-annotation-canvas");
      const canvasContainer = clipEl.querySelector(".clip-canvas-container");
      const replayBtn = clipEl.querySelector(".clip-replay-btn");
      const clearBtn = clipEl.querySelector(".clip-clear-btn");
      const submitBtn = clipEl.querySelector(".clip-submit-btn");
      const videoStatus = clipEl.querySelector(".clip-video-status");
      const annotationStatus = clipEl.querySelector(".clip-annotation-status");
      const submissionStatus = clipEl.querySelector(".clip-submission-status");
      const statusBadge = clipEl.querySelector(".status-badge");

      const state = {
        clip,
        video,
        finalFrame,
        annotationCanvas,
        canvasContainer,
        replayBtn,
        clearBtn,
        submitBtn,
        videoStatus,
        annotationStatus,
        submissionStatus,
        statusBadge,
        overlayCtx: finalFrame.getContext("2d"),
        annotationCtx: annotationCanvas.getContext("2d"),
        frameCaptured: false,
        activeLine: null,
        expertLines: null,
        pointerDown: false,
        latestPayload: null,
        submissionInFlight: false,
        capturedFrameTime: 0,
        helperVideo: null,
        helperSeekAttempted: false,
        submitted: false
      };

      clipStates.set(clip.id, state);

      // Setup video
      video.crossOrigin = "anonymous";
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      if (clip.poster) video.setAttribute("poster", clip.poster);
      video.src = clip.src;

      // Event listeners
      video.addEventListener("loadeddata", () => handleVideoLoaded(state));
      video.addEventListener("error", () => handleVideoError(state));
      video.addEventListener("play", () => handleVideoPlay(state));
      video.addEventListener("timeupdate", () => handleVideoTimeUpdate(state));
      video.addEventListener("ended", () => handleVideoEnded(state));

      replayBtn.addEventListener("click", () => handleReplay(state));
      clearBtn.addEventListener("click", () => clearLine(state));
      submitBtn.addEventListener("click", () => submitAnnotation(state));

      setupCanvasEvents(state);

      // Load expert annotation
      loadExpertAnnotation(clip.id).then(expertLines => {
        state.expertLines = expertLines;
        if (expertLines) console.log(`Loaded expert lines for ${clip.id}`);
      });

      prepareHelperVideo(state);

      return clipEl;
    }

    function setupCanvasEvents(state) {
      const canvas = state.annotationCanvas;

      const handlePointerDown = (evt) => {
        if (!state.frameCaptured) {
          showToast("Final frame still loading. Please wait.");
          return;
        }
        evt.preventDefault();
        state.pointerDown = true;
        const start = getPointerPosition(evt, canvas);
        state.activeLine = { start, end: start };
        redrawCanvas(state);
      };

      const handlePointerMove = (evt) => {
        if (!state.pointerDown || !state.activeLine) return;
        evt.preventDefault();
        state.activeLine.end = getPointerPosition(evt, canvas);
        redrawCanvas(state);
      };

      const handlePointerUp = (evt) => {
        if (!state.pointerDown || !state.activeLine) return;
        if (evt.type === "mouseleave") {
          state.pointerDown = false;
          return;
        }
        evt.preventDefault();
        state.pointerDown = false;
        state.activeLine.end = getPointerPosition(evt, canvas);
        redrawCanvas(state);
        state.clearBtn.disabled = false;
        state.annotationStatus.textContent = "Incision line recorded. Submit below.";
        updateSubmissionPayload(state);
      };

      if (window.PointerEvent) {
        canvas.addEventListener("pointerdown", handlePointerDown, { passive: false });
        canvas.addEventListener("pointermove", handlePointerMove, { passive: false });
        canvas.addEventListener("pointerup", handlePointerUp, { passive: false });
        canvas.addEventListener("pointercancel", handlePointerUp, { passive: false });
        canvas.addEventListener("mouseleave", handlePointerUp, { passive: false });
      } else {
        canvas.addEventListener("mousedown", handlePointerDown, { passive: false });
        canvas.addEventListener("mousemove", handlePointerMove, { passive: false });
        canvas.addEventListener("mouseup", handlePointerUp, { passive: false });
        canvas.addEventListener("mouseleave", handlePointerUp, { passive: false });
        canvas.addEventListener("touchstart", handlePointerDown, { passive: false });
        canvas.addEventListener("touchmove", handlePointerMove, { passive: false });
        canvas.addEventListener("touchend", handlePointerUp, { passive: false });
        canvas.addEventListener("touchcancel", handlePointerUp, { passive: false });
      }
    }

    function getPointerPosition(evt, canvas) {
      const rect = canvas.getBoundingClientRect();
      const touch = evt.touches?.[0] ?? evt.changedTouches?.[0] ?? null;
      const clientX = evt.clientX ?? touch?.clientX ?? 0;
      const clientY = evt.clientY ?? touch?.clientY ?? 0;
      const x = ((clientX - rect.left) / rect.width) * canvas.width;
      const y = ((clientY - rect.top) / rect.height) * canvas.height;
      return { x, y };
    }

    function redrawCanvas(state) {
      const { annotationCtx, annotationCanvas, expertLines, activeLine } = state;
      annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);

      // Draw expert lines
      if (expertLines && Array.isArray(expertLines.incisionDetails)) {
        const width = annotationCanvas.width;
        const height = annotationCanvas.height;

        annotationCtx.strokeStyle = "rgba(0, 255, 0, 0.7)";
        annotationCtx.lineWidth = Math.max(2, width * 0.005);
        annotationCtx.setLineDash([8, 6]);

        expertLines.incisionDetails.forEach(detail => {
          const normalizedLine = detail.normalized ?? 
                                 normalizeFromPixels(detail.pixels, expertLines.canvasSize);
          const startX = normalizedLine.start.x * width;
          const startY = normalizedLine.start.y * height;
          const endX = normalizedLine.end.x * width;
          const endY = normalizedLine.end.y * height;

          annotationCtx.beginPath();
          annotationCtx.moveTo(startX, startY);
          annotationCtx.lineTo(endX, endY);
          annotationCtx.stroke();
        });

        annotationCtx.setLineDash([]);
      }

      // Draw user's active line
      if (!activeLine) return;

      annotationCtx.strokeStyle = "#38bdf8";
      annotationCtx.lineWidth = Math.max(4, annotationCanvas.width * 0.004);
      annotationCtx.lineCap = "round";

      annotationCtx.beginPath();
      annotationCtx.moveTo(activeLine.start.x, activeLine.start.y);
      annotationCtx.lineTo(activeLine.end.x, activeLine.end.y);
      annotationCtx.stroke();

      annotationCtx.fillStyle = "#0ea5e9";
      annotationCtx.beginPath();
      annotationCtx.arc(activeLine.start.x, activeLine.start.y, annotationCtx.lineWidth, 0, Math.PI * 2);
      annotationCtx.fill();
      annotationCtx.beginPath();
      annotationCtx.arc(activeLine.end.x, activeLine.end.y, annotationCtx.lineWidth, 0, Math.PI * 2);
      annotationCtx.fill();
    }

    function prepareHelperVideo(state) {
      if (state.helperVideo) {
        teardownHelperVideo(state);
      }

      state.helperVideo = document.createElement("video");
      state.helperVideo.crossOrigin = "anonymous";
      state.helperVideo.preload = "auto";
      state.helperVideo.muted = true;
      state.helperVideo.setAttribute("playsinline", "");

      state.helperVideo.addEventListener("loadedmetadata", () => handleHelperLoadedMetadata(state));
      state.helperVideo.addEventListener("seeked", () => helperFinalizeCapture(state));
      state.helperVideo.addEventListener("timeupdate", () => {
        if (!state.helperSeekAttempted || state.frameCaptured) return;
        helperFinalizeCapture(state);
      });

      state.helperVideo.src = state.clip.src;
      state.helperVideo.load();
    }

    function handleHelperLoadedMetadata(state) {
      if (!state.helperVideo || !Number.isFinite(state.helperVideo.duration)) return;
      state.helperSeekAttempted = true;
      const duration = state.helperVideo.duration;
      const offset = duration > 0.5 ? 0.04 : Math.max(duration * 0.5, 0.01);
      const target = Math.max(duration - offset, 0);
      try {
        state.helperVideo.currentTime = target;
      } catch (error) {
        // Ignore seek errors
      }
    }

    function helperFinalizeCapture(state) {
      if (!state.helperVideo || state.helperVideo.readyState < 2 || state.frameCaptured) return;
      const success = captureFrameImage(state, state.helperVideo, state.helperVideo.currentTime);
      if (success) {
        teardownHelperVideo(state);
      }
    }

    function teardownHelperVideo(state) {
      if (!state.helperVideo) return;
      try {
        state.helperVideo.pause();
      } catch (error) {
        // Ignore
      }
      state.helperVideo.removeAttribute("src");
      state.helperVideo.load();
      state.helperVideo.remove();
      state.helperVideo = null;
      state.helperSeekAttempted = false;
    }

    function captureFrameImage(state, source, frameTimeValue) {
      if (!source.videoWidth || !source.videoHeight) return false;

      const { finalFrame, annotationCanvas, overlayCtx, annotationCtx } = state;

      finalFrame.width = source.videoWidth;
      finalFrame.height = source.videoHeight;
      annotationCanvas.width = source.videoWidth;
      annotationCanvas.height = source.videoHeight;

      overlayCtx.drawImage(source, 0, 0, finalFrame.width, finalFrame.height);
      annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);

      try {
        const dataUrl = finalFrame.toDataURL("image/png");
        annotationCanvas.style.backgroundImage = `url(${dataUrl})`;
        annotationCanvas.style.backgroundSize = "contain";
        annotationCanvas.style.backgroundRepeat = "no-repeat";
        annotationCanvas.style.backgroundPosition = "center";
      } catch (error) {
        showToast("Unable to capture frame. Check CORS settings.");
        return false;
      }

      state.frameCaptured = true;
      state.canvasContainer.hidden = false;
      state.annotationStatus.textContent = state.expertLines
        ? "Final frame ready. Draw your incision line on top of the safety corridor."
        : "Final frame ready. Draw your incision line.";

      state.replayBtn.disabled = false;
      state.capturedFrameTime = Number((frameTimeValue ?? source.currentTime ?? 0).toFixed(3));

      redrawCanvas(state);
      return true;
    }

    function handleVideoLoaded(state) {
      state.videoStatus.textContent = "Clip loaded. Tap play to begin.";
      state.video.controls = true;
      state.video.play().catch(() => {
        state.video.pause();
        state.videoStatus.textContent = "Clip loaded. Press play to begin.";
      });
    }

    function handleVideoError(state) {
      state.videoStatus.textContent = "Clip failed to load. Check the source URL.";
      showToast("Video failed to load.");
      state.replayBtn.disabled = true;
      teardownHelperVideo(state);
    }

    function handleVideoPlay(state) {
      state.videoStatus.textContent = state.frameCaptured
        ? "Replaying clip. The final frame remains below."
        : "Watching clip...";
    }

    function handleVideoEnded(state) {
      freezeOnFinalFrame(state);
      state.video.controls = true;
    }

    function handleVideoTimeUpdate(state) {
      if (state.frameCaptured) return;

      const duration = Number.isFinite(state.video.duration) ? state.video.duration : null;
      if (!duration) return;

      const remaining = duration - state.video.currentTime;
      if (remaining <= 0.25) {
        captureFrameImage(state, state.video, duration);
      }
    }

    function freezeOnFinalFrame(state) {
      if (!state.frameCaptured) {
        const captureTime = Number.isFinite(state.video.duration)
          ? state.video.duration
          : state.video.currentTime || 0;
        captureFrameImage(state, state.video, captureTime);
      }
      state.videoStatus.textContent = "Clip complete. The frozen frame below is ready for annotation.";
    }

    function handleReplay(state) {
      state.annotationStatus.textContent = "Final frame remains below. Review and adjust your line if needed.";
      state.activeLine = null;
      redrawCanvas(state);
      state.clearBtn.disabled = true;
      state.submitBtn.disabled = true;
      updateSubmissionPayload(state);

      try {
        state.video.pause();
      } catch (error) {
        // Ignore
      }
      state.video.currentTime = 0;
      state.video.controls = true;
      state.video.play()
        .then(() => {
          state.videoStatus.textContent = "Replaying clip. The final frame remains below.";
        })
        .catch(() => {
          state.videoStatus.textContent = "Clip reset. Press play to watch again.";
        });
    }

    function clearLine(state) {
      state.activeLine = null;
      state.pointerDown = false;
      redrawCanvas(state);
      state.annotationStatus.textContent = state.expertLines
        ? "Final frame ready. Draw your incision line on top of the safety corridor."
        : "Final frame ready. Draw your incision line.";
      state.clearBtn.disabled = true;
      updateSubmissionPayload(state);
    }

    function normalizeLine(line, canvas) {
      return {
        start: {
          x: line.start.x / canvas.width,
          y: line.start.y / canvas.height,
        },
        end: {
          x: line.end.x / canvas.width,
          y: line.end.y / canvas.height,
        },
      };
    }

    function updateSubmissionPayload(state) {
      if (!state.activeLine || !state.frameCaptured || !state.clip) {
        state.latestPayload = null;
        state.submitBtn.disabled = true;
        return;
      }

      const normalizedLine = normalizeLine(state.activeLine, state.annotationCanvas);
      const lengthPixels = Math.hypot(
        state.activeLine.end.x - state.activeLine.start.x,
        state.activeLine.end.y - state.activeLine.start.y
      );

      state.latestPayload = {
        clipId: state.clip.id,
        clipLabel: state.clip.label,
        videoSrc: state.clip.src,
        capturedFrameTime: state.capturedFrameTime,
        incision: normalizedLine,
        incisionPixels: {
          start: {
            x: Number(state.activeLine.start.x.toFixed(2)),
            y: Number(state.activeLine.start.y.toFixed(2)),
          },
          end: {
            x: Number(state.activeLine.end.x.toFixed(2)),
            y: Number(state.activeLine.end.y.toFixed(2)),
          },
          length: Number(lengthPixels.toFixed(2)),
        },
        canvasSize: {
          width: state.annotationCanvas.width,
          height: state.annotationCanvas.height
        },
        generatedAt: new Date().toISOString(),
        participantId: participantIdValue || "",
        fatigue: fatigueInput.value || "",
      };

      if (!participantIdValue) {
        state.submitBtn.disabled = true;
        state.submissionStatus.textContent = "Enter participant ID to enable submission.";
        return;
      }

      if (!state.submissionInFlight) {
        state.submitBtn.disabled = false;
      }
      state.submissionStatus.textContent = "Ready to submit.";
    }

    async function submitAnnotation(state) {
      if (!state.latestPayload || state.submitted) return;

      if (!submissionConfig.endpoint) {
        showToast("Submission endpoint not configured.");
        return;
      }

      state.submissionInFlight = true;
      state.submitBtn.disabled = true;
      state.submissionStatus.textContent = "Submitting...";

      const method = submissionConfig.method || "POST";
      const headers = { "Content-Type": "application/json", ...(submissionConfig.headers || {}) };

      try {
        const response = await fetch(submissionConfig.endpoint, {
          method,
          headers,
          body: JSON.stringify(state.latestPayload),
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        state.submitted = true;
        state.submissionStatus.textContent = "Submitted successfully!";
        state.statusBadge.textContent = "Complete";
        state.statusBadge.classList.remove("status-badge--pending");
        state.statusBadge.classList.add("status-badge--complete");
        showToast(`${state.clip.label} submitted successfully.`);

        // Scroll to next clip
        scrollToNextClip(state.clip.id);
      } catch (error) {
        state.submissionStatus.textContent = "Submission failed. Try again.";
        state.submitBtn.disabled = false;
        showToast("Unable to submit. Check connection.");
        console.error(error);
      } finally {
        state.submissionInFlight = false;
      }
    }

    function scrollToNextClip(currentClipId) {
      const clips = getClips();
      const currentIndex = clips.findIndex(c => c.id === currentClipId);
      if (currentIndex >= 0 && currentIndex < clips.length - 1) {
        const nextClip = clips[currentIndex + 1];
        const nextSection = document.querySelector(`[data-clip-id="${nextClip.id}"]`);
        if (nextSection) {
          setTimeout(() => {
            nextSection.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 500);
        }
      } else {
        showToast("All clips completed! Thank you.");
      }
    }

    function applyParticipantId(rawValue) {
      participantIdValue = (rawValue || "").trim();
      if (participantIdValue) {
        participantIdStatus.textContent = "Participant ID recorded. Continue below.";
      } else {
        participantIdStatus.textContent = "Enter the ID provided by the study team.";
      }

      // Update all clip states
      clipStates.forEach(state => updateSubmissionPayload(state));
    }

    // Initialize
    participantIdInput.addEventListener("input", (e) => applyParticipantId(e.target.value));

    const clips = getClips();
    if (clips.length === 0) {
      clipsContainer.innerHTML = '<p class="help" style="text-align: center; padding: 2rem;">No clips configured. Add clips to the ANNOTATION_CLIPS array.</p>';
    } else {
      clips.forEach((clip, index) => {
        const clipEl = createClipElement(clip, index);
        clipsContainer.appendChild(clipEl);
      });
    }

    applyParticipantId(participantIdInput.value);
