window.ANNOTATION_CLIPS = [
  // Clip 01
  {
    id: "clip_01_gt",
    label: "Clip 1 Ground-Truth",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_01.mp4",
    poster: "",
    annotationType: "gt"
  },
  {
    id: "clip_01_mock",
    label: "Clip 1 Mock",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_01.mp4",
    poster: "",
    annotationType: "mock"
  },

  // Clip 02
  {
    id: "clip_02_gt",
    label: "Clip 2 Ground-Truth",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_02.mp4",
    poster: "",
    annotationType: "gt"
  },
  {
    id: "clip_02_mock",
    label: "Clip 2 Mock",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_02.mp4",
    poster: "",
    annotationType: "mock"
  },

  // Clip 03
  {
    id: "clip_03_gt",
    label: "Clip 3 Ground-Truth",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_03.mp4",
    poster: "",
    annotationType: "gt"
  },
  {
    id: "clip_03_mock",
    label: "Clip 3 Mock",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_03.mp4",
    poster: "",
    annotationType: "mock"
  },

  // Clip 04
  {
    id: "clip_04_gt",
    label: "Clip 4 Ground-Truth",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_04.mp4",
    poster: "",
    annotationType: "gt"
  },
  {
    id: "clip_04_mock",
    label: "Clip 4 Mock",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_04.mp4",
    poster: "",
    annotationType: "mock"
  },

  // Clip 05
  {
    id: "clip_05_gt",
    label: "Clip 5 Ground-Truth",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_05.mp4",
    poster: "",
    annotationType: "gt"
  },
  {
    id: "clip_05_mock",
    label: "Clip 5 Mock",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_05.mp4",
    poster: "",
    annotationType: "mock"
  },

  // Clip 06
  {
    id: "clip_06_gt",
    label: "Clip 6 Ground-Truth",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_06.mp4",
    poster: "",
    annotationType: "gt"
  },
  {
    id: "clip_06_mock",
    label: "Clip 6 Mock",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_06.mp4",
    poster: "",
    annotationType: "mock"
  },

  // Clip 07
  {
    id: "clip_07_gt",
    label: "Clip 7 Ground-Truth",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_07.mp4",
    poster: "",
    annotationType: "gt"
  },
  {
    id: "clip_07_mock",
    label: "Clip 7 Mock",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_07.mp4",
    poster: "",
    annotationType: "mock"
  },

  // Clip 08
  {
    id: "clip_08_gt",
    label: "Clip 8 Ground-Truth",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_08.mp4",
    poster: "",
    annotationType: "gt"
  },
  {
    id: "clip_08_mock",
    label: "Clip 8 Mock",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_08.mp4",
    poster: "",
    annotationType: "mock"
  },

  // Clip 09
  {
    id: "clip_09_gt",
    label: "Clip 9 Ground-Truth",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_09.mp4",
    poster: "",
    annotationType: "gt"
  },
  {
    id: "clip_09_mock",
    label: "Clip 9 Mock",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_09.mp4",
    poster: "",
    annotationType: "mock"
  },

  // Clip 10
  {
    id: "clip_10_gt",
    label: "Clip 10 Ground-Truth",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_10.mp4",
    poster: "",
    annotationType: "gt"
  },
  {
    id: "clip_10_mock",
    label: "Clip 10 Mock",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_10.mp4",
    poster: "",
    annotationType: "mock"
  },

  // Clip 11–20 (same pattern)
  ...Array.from({ length: 10 }, (_, i) => {
    const n = i + 11;
    const num = String(n).padStart(2, "0");
    return [
      {
        id: `clip_${num}_gt`,
        label: `Clip ${n} Ground-Truth`,
        src: `https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_${num}.mp4`,
        poster: "",
        annotationType: "gt"
      },
      {
        id: `clip_${num}_mock`,
        label: `Clip ${n} Mock`,
        src: `https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_${num}.mp4`,
        poster: "",
        annotationType: "mock"
      }
    ];
  }).flat()
];

window.ANNOTATION_SUBMISSION = {
  endpoint: "https://formspree.io/f/xanagplk",
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  additionalFields: {},
  bodyWrapper: "annotation"
};
