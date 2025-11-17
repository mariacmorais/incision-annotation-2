# Automation Bias Toolkit

This repository collects utilities for comparing human-drawn line annotations across time and study phases. It now includes an HTML-based video annotation tool that lets reviewers watch a short clip, freeze the final frame, draw the intended incision line, and automatically submit the result as JSON for downstream analysis (mean distance, overlap with ground-truth boundaries, etc.).

## Web-based cholecystectomy annotation interface

The `web_annotator/` directory ships a single static page that runs entirely in the browser—no build step or server required. It was designed for REDCap, Qualtrics, or Google Forms studies that measure automation bias during cholecystectomy training.

### Workflow tailored for surveys

- Investigators pre-load the page with 30–60 second operative clips via `clip-config.js`, or pass a `?video=<URL>` parameter from the survey platform.
- Participants supply the unique ID they received via email; the value tags each submission and is folded into the JSON filename hint investigators receive.
- Participants watch the clip from start to finish on desktop or mobile. As the first playback approaches its end, the final frame is captured automatically and remains visible for annotation during the last moments of the clip and any subsequent replays.
- The respondent draws exactly one incision line on the frozen image (touch and mouse friendly).
- The tool captures the normalized start/end coordinates along with clip metadata, participant ID, and a filename hint, then transmits the JSON payload straight to the investigator-configured endpoint.

### Running locally

1. Place your MP4/WebM clips alongside the page or host them at a public URL.
   When using GitHub Pages or another static host, the easiest pattern is to upload
   the videos to the same directory as `index.html` and reference them with either
   a relative path (e.g., `"media/case-01.mp4"`) or the full HTTPS URL
   (`"https://your-org.github.io/automation-bias/media/case-01.mp4"`). Local file
   system paths such as `/Users/...` or `C:\...` only exist on your computer and
   cannot be loaded by participants. Likewise, avoid linking to the GitHub
   repository "blob" viewer (e.g., `https://github.com/org/repo/blob/main/video.mp4`).
   Instead reference the GitHub Pages URL or the raw file CDN URL such as
   `https://raw.githubusercontent.com/org/repo/main/video.mp4` so the browser can
   retrieve the actual media bytes.
2. Update `web_annotator/clip-config.js` with the clip IDs, display labels, and URLs.
   Add one object per video inside the `window.ANNOTATION_CLIPS` array—duplicate the
   provided example block and change the `id`, `label`, and `src` values for each
   additional clip you plan to serve.
3. Open `web_annotator/index.html` in Chrome, Edge, Firefox, or Safari.
4. Select a clip from the dropdown and press play. The video can be replayed as needed.
5. The final frame appears under **Annotate Final Frame** as the clip nears completion and stays visible during playback and replays. Draw the incision line by tapping or clicking and dragging.
6. Press **Submit to Investigator** to send the annotation to the study team. The button appears once a line is drawn on the frozen frame.

> **Tip:** The submitted JSON stores start/end points as values between 0 and 1, so the measurements remain valid even if the participant's display resolution changes.

### Configuring investigator submission

`web_annotator/clip-config.js` defines both the clip manifest and the submission target. Set `endpoint` to the HTTPS URL that should receive annotations, and (optionally) provide headers, authentication cookies, or contextual fields under `additionalFields`. By default the browser sends a body shaped like:

```json
{
  "studyId": "PARTICIPANT-123",
  "participantId": "PARTICIPANT-123",
  "filenameHint": "PARTICIPANT-123_demo.json",
  "annotation": {
    "clipId": "demo",
    "capturedFrameTime": 59.967,
    "incision": { "start": { "x": 0.12, "y": 0.34 }, "end": { "x": 0.78, "y": 0.56 } },
    "incisionPixels": {
      "start": { "x": 153.4, "y": 245.6 },
      "end": { "x": 892.1, "y": 302.8 },
      "length": 748.71
    },
    "canvasSize": { "width": 1280, "height": 720 },
    "participantId": "PARTICIPANT-123",
    "filenameHint": "PARTICIPANT-123_demo.json",
    "generatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

Set `bodyWrapper` to "none" if your endpoint expects the annotation fields at the top level rather than nested under `annotation`.

The `filenameHint` property mirrors the participant ID and clip ID (e.g., `PARTICIPANT-123_demo.json`) so servers can easily persist the payload using a meaningful file name.

#### Using Supabase Storage

If you want the browser to hand each annotation straight to Supabase, deploy the sample Edge Function in [`supabase/annotator-ingest.ts`](supabase/annotator-ingest.ts). The function accepts the POST from the annotator, stores the JSON in a Supabase Storage bucket, and returns the object path for auditing.

1. **Create a bucket** (e.g., `annotations`) in Supabase Storage.
2. **Deploy the Edge Function** via `supabase functions deploy annotator-ingest --project-ref <PROJECT_REF>` and set the following environment variables:
   - `SUPABASE_URL` – your project URL (e.g., `https://xyzcompany.supabase.co`).
   - `SUPABASE_SERVICE_ROLE_KEY` – service role key (kept server-side only).
   - `SUPABASE_STORAGE_BUCKET` – the bucket name you created (`annotations`).
   - `ANNOTATOR_SHARED_SECRET` – a passphrase the browser must present in the `Authorization` header.
   - `ANNOTATOR_ALLOW_ORIGIN` – the origin hosting the annotator (e.g., `https://your-lab.github.io`).
3. After deployment Supabase exposes the function at `https://<PROJECT>.functions.supabase.co/annotator-ingest`. Paste that URL into `window.ANNOTATION_SUBMISSION.endpoint` inside `clip-config.js` and add the matching header:

```js
window.ANNOTATION_SUBMISSION = {
  endpoint: "https://YOUR_PROJECT.functions.supabase.co/annotator-ingest",
  method: "POST",
  headers: {
    Authorization: "Bearer YOUR_SHARED_SECRET",
  },
  bodyWrapper: "annotation",
};
```

Each upload is written to `participant-id/timestamp_filename.json` in your bucket. Review Supabase’s access policies to ensure only investigators can read the stored files.

### Embedding in REDCap or other forms

Host the `web_annotator/` folder on a static site (GitHub Pages, Netlify, institutional web space). Then embed `index.html` inside your form via an `<iframe>`:

```html
<iframe
  src="https://your-host/cholecystectomy-annotator/index.html?clip=case-01"
  width="100%"
  height="780"
  style="border:0;"
  allowfullscreen
></iframe>
```

To drive a different clip for each survey instrument, pass the media URL directly with `?video=https://cdn.example.edu/study/case-01.mp4`. The page automatically surfaces the configured clip list or the clip supplied by the query string. When serving media from a different host, enable CORS headers (e.g., `Access-Control-Allow-Origin: *`) so the final frame can be captured into the canvas.

Annotations are POSTed to the endpoint specified in `web_annotator/clip-config.js`. Configure HTTPS, authentication headers, or additional fields (e.g., participant identifiers) in that file so each submission reaches your secure collection service.

## Notebooks for downstream analysis

The repository also includes several exploratory Jupyter notebooks for comparing JSON outputs across study phases (mean distance, binary overlap, and percentage metrics). These live at the repository root and can be executed in environments such as JupyterLab.
