const renderPublicIdPrefix = 'video-editor-demo/renders';

export function createRenderOutputPublicId(renderId: string): string {
  return `${renderPublicIdPrefix}/${renderId}/output`;
}
