window.ANNOTATION_CLIPS = [
  {
    id: "clip_01",
    label: "Clip 1",
    src: "https://raw.githubusercontent.com/mariacmorais/incision-annotation-2/main/clip_01.mp4",
    poster: "",
  },
  // Clip 02 //
  {
    id: "clip_02",
    label: "Clip 2",
    src: "https://raw.githubusercontent.com/mariacmorais/incision-annotation-2/main/clip_02.mp4",
    poster: "",
  },
  // Clip 03 //
  {
    id: "clip_03",
    label: "Clip 3",
    src: "https://raw.githubusercontent.com/mariacmorais/incision-annotation-2/main/clip_03.mp4",
    poster: "",
  },
  // Clip 04 //
  {
    id: "clip_04",
    label: "Clip 4",
    src: "https://raw.githubusercontent.com/mariacmorais/incision-annotation-2/main/clip_04.mp4",
    poster: "",
  },
  // Clip 05 //
  {
    id: "clip_05",
    label: "Clip 5",
    src: "https://raw.githubusercontent.com/mariacmorais/incision-annotation-2/main/clip_05.mp4",
    poster: "",
  },
  // Clip 06 //
  {
    id: "clip_06",
    label: "Clip 6",
    src: "https://raw.githubusercontent.com/mariacmorais/incision-annotation-2/main/clip_06.mp4",
    poster: "",
  },
  // Clip 07 //
  {
    id: "clip_07",
    label: "Clip 7",
    src: "https://raw.githubusercontent.com/mariacmorais/incision-annotation-2/main/clip_07.mp4",
    poster: "",
  },
  // Clip 08 //
  {
    id: "clip_08",
    label: "Clip 8",
    src: "https://raw.githubusercontent.com/mariacmorais/incision-annotation-2/main/clip_08.mp4",
    poster: "",
  },
  // Clip 09 //
  {
    id: "clip_09",
    label: "Clip 9",
    src: "https://raw.githubusercontent.com/mariacmorais/incision-annotation-2/main/clip_09.mp4",
    poster: "",
  },
  // Clip 10 //
  {
    id: "clip_10",
    label: "Clip 10",
    src: "https://raw.githubusercontent.com/mariacmorais/incision-annotation-2/main/clip_10.mp4",
    poster: "",
  },
];

// Configure where annotations are sent after participants submit.
// Replace `endpoint` with your secure collection URL.
window.ANNOTATION_SUBMISSION = {
  endpoint: "https://formspree.io/f/xanagplk", // ← your actual Formspree endpoint
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  additionalFields: {},
  bodyWrapper: "annotation"
};
