import type { CreateAssetUploadUrlRequest, VideoContentType } from '@ag-go-video-editor/shared';
import { Equals, IsString, Matches, MaxLength } from 'class-validator';

export class CreateAssetUploadUrlDto implements CreateAssetUploadUrlRequest {
  @IsString({ message: 'filename phải là chuỗi.' })
  @MaxLength(255, { message: 'filename không được vượt quá 255 ký tự.' })
  @Matches(/^[^/\\]+\.mp4$/i, { message: 'filename phải là tên file .mp4 hợp lệ.' })
  filename!: string;

  @IsString({ message: 'contentType phải là chuỗi.' })
  @Equals('video/mp4', { message: 'contentType phải là video/mp4.' })
  contentType!: VideoContentType;
}
