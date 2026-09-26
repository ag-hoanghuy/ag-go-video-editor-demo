import type { CreateAssetUploadUrlResponse } from '@ag-go-video-editor/shared';
import { Body, Controller, Post } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { CreateAssetUploadUrlDto } from './dto/create-asset-upload-url.dto';

@Controller('api/assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Post('upload-url')
  createUploadUrl(@Body() request: CreateAssetUploadUrlDto): Promise<CreateAssetUploadUrlResponse> {
    return this.assetsService.createUploadUrl(request.contentType);
  }
}
