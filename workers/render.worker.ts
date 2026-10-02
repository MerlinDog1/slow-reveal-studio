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
  progressive?: boolean;
}
export interface RenderWorkerResponse {
  id: number | string;
  geometry?: RenderGeometry;
  error?: string;
  draft?: boolean;
}

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<RenderWorkerRequest>) => void) | null;
  postMessage: (message: RenderWorkerResponse) => void;
};

scope.onmessage = ({ data }) => {
  try {
    if (data.progressive && data.settings.spacingMm < 4)
      scope.postMessage({
        id: data.id,
        draft: true,
        geometry: renderImage(
          data.input,
          {
            ...data.settings,
            spacingMm: Math.max(4.2, data.settings.spacingMm * 2),
          },
          data.subjectMask,
        ),
      });
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
