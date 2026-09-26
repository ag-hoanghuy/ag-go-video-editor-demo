import { IsUUID } from 'class-validator';

export class RenderIdParamDto {
  @IsUUID('4', { message: 'renderId phải là UUID v4 hợp lệ.' })
  renderId!: string;
}
