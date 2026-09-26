import type {
  CreateAssetUploadUrlResponse,
  GetAssetPlaybackUrlResponse,
} from '@ag-go-video-editor/shared';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { AssetIdParamDto } from './dto/asset-id-param.dto';
import { CreateAssetUploadUrlDto } from './dto/create-asset-upload-url.dto';

@Controller('api/assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Post('upload-url')
  createUploadUrl(@Body() request: CreateAssetUploadUrlDto): Promise<CreateAssetUploadUrlResponse> {
    return this.assetsService.createUploadUrl(request.contentType);
  }

  @Get(':assetId/playback-url')
  getPlaybackUrl(@Param() params: AssetIdParamDto): Promise<GetAssetPlaybackUrlResponse> {
    return this.assetsService.getPlaybackUrl(params.assetId);
  }
}
