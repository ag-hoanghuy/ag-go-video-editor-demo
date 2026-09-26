import type { CreateRenderResponse } from '@ag-go-video-editor/shared';
import { Body, Controller, Post } from '@nestjs/common';
import { CreateRenderDto } from './dto/create-render.dto';
import { RendersService } from './renders.service';

@Controller('api/renders')
export class RendersController {
  constructor(private readonly rendersService: RendersService) {}

  @Post()
  createRender(@Body() request: CreateRenderDto): Promise<CreateRenderResponse> {
    return this.rendersService.createRender(request);
  }
}
