import type {
  CreateAssetUploadSignatureResponse,
  GetAssetPlaybackUrlResponse,
} from '@ag-go-video-editor/shared';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { AssetIdParamDto } from './dto/asset-id-param.dto';
import { CreateAssetUploadSignatureDto } from './dto/create-asset-upload-signature.dto';

@Controller('api/assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Post('upload-signature')
  createUploadSignature(
    @Body() request: CreateAssetUploadSignatureDto,
  ): CreateAssetUploadSignatureResponse {
    void request;
    return this.assetsService.createUploadSignature();
  }

  @Get(':assetId/playback-url')
  getPlaybackUrl(@Param() params: AssetIdParamDto): Promise<GetAssetPlaybackUrlResponse> {
    return this.assetsService.getPlaybackUrl(params.assetId);
  }
}
