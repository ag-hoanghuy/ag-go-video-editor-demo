const assetObjectPrefix = 'video-editor-demo/assets';

export function createOriginalAssetObjectKey(assetId: string): string {
  return `${assetObjectPrefix}/${assetId}/original.mp4`;
}
