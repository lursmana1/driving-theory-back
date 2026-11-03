import { describeResendError } from './mail.service';

describe('describeResendError', () => {
  it("joins Resend's name and message and masks email addresses", () => {
    const body = JSON.stringify({
      statusCode: 403,
      name: 'validation_error',
      message:
        'You can only send testing emails to your own email address (me@x.ge).',
    });
    expect(describeResendError(body)).toBe(
      'validation_error: You can only send testing emails to your own email address (<email>).',
    );
  });

  it('keeps non-JSON bodies, trimmed', () => {
    expect(describeResendError('  Forbidden \n')).toBe('Forbidden');
  });

  it('returns an empty string for an empty body', () => {
    expect(describeResendError('')).toBe('');
  });
});
