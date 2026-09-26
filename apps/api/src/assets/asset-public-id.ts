const assetPublicIdPrefix = 'video-editor-demo/assets';

export function createOriginalAssetPublicId(assetId: string): string {
  return `${assetPublicIdPrefix}/${assetId}/original`;
}
