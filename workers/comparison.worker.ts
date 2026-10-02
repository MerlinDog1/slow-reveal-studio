import {
  renderImage,
  type PixelImage,
  type RenderSettings,
} from "../lib/renderers";
import type { SubjectMask } from "../lib/subject-mask";
const scope = globalThis as unknown as {
  onmessage: (
    event: MessageEvent<{
      items: {
        name: string;
        input: PixelImage;
        settings: RenderSettings;
        subjectMask?: SubjectMask;
      }[];
    }>,
  ) => void;
  postMessage: (value: unknown) => void;
};
scope.onmessage = ({ data }) => {
  data.items.forEach((item, index) => {
    try {
      scope.postMessage({
        index,
        geometry: renderImage(item.input, item.settings, item.subjectMask),
      });
    } catch (error) {
      scope.postMessage({
        index,
        error:
          error instanceof Error ? error.message : "Could not render study.",
      });
    }
  });
  scope.postMessage({ done: true });
};
