import {
  renderImage,
  type PixelImage,
  type RenderGeometry,
  type RenderSettings,
} from "../lib/renderers";
import type { SubjectMask } from "../lib/subject-mask";

export interface RenderWorkerRequest {
  id: number | string;
  input: PixelImage;
  settings: RenderSettings;
  subjectMask?: SubjectMask;
}
export interface RenderWorkerResponse {
  id: number | string;
  geometry?: RenderGeometry;
  error?: string;
}

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<RenderWorkerRequest>) => void) | null;
  postMessage: (message: RenderWorkerResponse) => void;
};

scope.onmessage = ({ data }) => {
  try {
    scope.postMessage({
      id: data.id,
      geometry: renderImage(data.input, data.settings, data.subjectMask),
    });
  } catch (error) {
    scope.postMessage({
      id: data.id,
      error:
        error instanceof Error ? error.message : "Could not render this image.",
    });
  }
};
