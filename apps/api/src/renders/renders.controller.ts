import type {
  CreateRenderResponse,
  GetRenderPlaybackUrlResponse,
} from '@ag-go-video-editor/shared';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateRenderDto } from './dto/create-render.dto';
import { RenderIdParamDto } from './dto/render-id-param.dto';
import { RendersService } from './renders.service';

@Controller('api/renders')
export class RendersController {
  constructor(private readonly rendersService: RendersService) {}

  @Post()
  createRender(@Body() request: CreateRenderDto): Promise<CreateRenderResponse> {
    return this.rendersService.createRender(request);
  }

  @Get(':renderId/playback-url')
  getPlaybackUrl(@Param() params: RenderIdParamDto): Promise<GetRenderPlaybackUrlResponse> {
    return this.rendersService.getPlaybackUrl(params.renderId);
  }
}
