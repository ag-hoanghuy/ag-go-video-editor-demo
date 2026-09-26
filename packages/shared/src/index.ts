export interface HealthResponse {
  status: 'ok';
}

export type VideoContentType = 'video/mp4';

export interface CreateAssetUploadUrlRequest {
  filename: string;
  contentType: VideoContentType;
}

export interface CreateAssetUploadUrlResponse {
  assetId: string;
  objectKey: string;
  uploadUrl: string;
  expiresIn: number;
}
