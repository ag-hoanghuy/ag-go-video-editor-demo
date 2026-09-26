import { IsUUID } from 'class-validator';

export class AssetIdParamDto {
  @IsUUID('4', { message: 'assetId phải là UUID v4 hợp lệ.' })
  assetId!: string;
}
