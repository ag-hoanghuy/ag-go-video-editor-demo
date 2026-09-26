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

export interface GetAssetPlaybackUrlResponse {
  assetId: string;
  playbackUrl: string;
  expiresIn: number;
}

export interface VideoTrimInstruction {
  start: number;
  end: number;
}

export interface CreateRenderRequest {
  assetId: string;
  trim: VideoTrimInstruction;
}

export interface CreateRenderResponse {
  renderId: string;
  status: 'completed';
  outputKey: string;
}

export interface GetRenderPlaybackUrlResponse {
  renderId: string;
  playbackUrl: string;
  expiresIn: number;
}
