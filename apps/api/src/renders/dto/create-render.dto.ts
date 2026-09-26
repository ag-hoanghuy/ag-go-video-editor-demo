import type { CreateRenderRequest, VideoTrimInstruction } from '@ag-go-video-editor/shared';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsNumber,
  IsObject,
  IsUUID,
  Min,
  Validate,
  ValidateNested,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isAfterStart', async: false })
class IsAfterStartConstraint implements ValidatorConstraintInterface {
  validate(end: unknown, arguments_: ValidationArguments): boolean {
    const trim = arguments_.object as TrimDto;

    return (
      typeof end === 'number' &&
      Number.isFinite(end) &&
      typeof trim.start === 'number' &&
      Number.isFinite(trim.start) &&
      end > trim.start
    );
  }

  defaultMessage(): string {
    return 'end phải lớn hơn start.';
  }
}

class TrimDto implements VideoTrimInstruction {
  @IsNumber({ allowInfinity: false, allowNaN: false }, { message: 'start phải là số hữu hạn.' })
  @Min(0, { message: 'start phải lớn hơn hoặc bằng 0.' })
  start!: number;

  @IsNumber({ allowInfinity: false, allowNaN: false }, { message: 'end phải là số hữu hạn.' })
  @Validate(IsAfterStartConstraint)
  end!: number;
}

export class CreateRenderDto implements CreateRenderRequest {
  @IsUUID('4', { message: 'assetId phải là UUID v4 hợp lệ.' })
  assetId!: string;

  @IsDefined({ message: 'trim là bắt buộc.' })
  @IsObject({ message: 'trim phải là object.' })
  @ValidateNested({ message: 'trim phải chứa start và end hợp lệ.' })
  @Type(() => TrimDto)
  trim!: TrimDto;
}
