export interface HealthResponse {
  status: 'ok';
}

export type VideoContentType = 'video/mp4';

export interface CreateAssetUploadSignatureRequest {
  filename: string;
  contentType: VideoContentType;
}

export interface CreateAssetUploadSignatureResponse {
  assetId: string;
  publicId: string;
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  uploadUrl: string;
}

export interface GetAssetPlaybackUrlResponse {
  assetId: string;
  playbackUrl: string;
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
}

export interface GetRenderPlaybackUrlResponse {
  renderId: string;
  playbackUrl: string;
}
