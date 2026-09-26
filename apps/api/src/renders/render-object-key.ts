const renderObjectPrefix = 'video-editor-demo/renders';

export function createRenderOutputObjectKey(renderId: string): string {
  return `${renderObjectPrefix}/${renderId}/output.mp4`;
}
