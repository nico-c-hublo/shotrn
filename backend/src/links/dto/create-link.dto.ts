import { IsIn, IsOptional, IsString } from 'class-validator';
import { EXPIRY_OPTIONS, type ExpiryOption } from '../expiry';
import { IsHttpUrl } from '../url-validation';

export class CreateLinkDto {
  @IsString()
  @IsHttpUrl()
  url!: string;

  @IsOptional()
  @IsIn(EXPIRY_OPTIONS, { message: `expiry must be one of: ${EXPIRY_OPTIONS.join(', ')}` })
  expiry?: ExpiryOption;
}
