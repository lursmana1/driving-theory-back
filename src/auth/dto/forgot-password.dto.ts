import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { NormalizeEmail } from '../../common/utils/email.util.js';
import type { ResetEmailLang } from '../../mail/templates/password-reset.template';

export const RESET_EMAIL_LANGS: readonly ResetEmailLang[] = ['ka', 'en', 'ru'];

export class ForgotPasswordDto {
  @NormalizeEmail()
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254)
  email: string;

  /** Language of the email and of the link; defaults to `ka`. */
  @IsOptional()
  @IsIn(RESET_EMAIL_LANGS)
  locale?: ResetEmailLang;
}
