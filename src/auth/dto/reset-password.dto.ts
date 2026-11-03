import {
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RESET_TOKEN_LENGTH,
} from '../../common/constants/password-reset.constants';

export class ResetPasswordDto {
  /** base64url token from the email link. */
  @IsString()
  @Length(PASSWORD_RESET_TOKEN_LENGTH, PASSWORD_RESET_TOKEN_LENGTH)
  @Matches(/^[A-Za-z0-9_-]+$/)
  token: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}
