// 共通のメール送信機能

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

/**
 * メール送信機能（AWS SES優先、開発環境用フォールバック付き）
 * @param to 送信先メールアドレス
 * @param subject 件名
 * @param text 本文
 * @param attachments 添付ファイル（オプション）
 * @returns 送信結果
 */
export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  attachments: EmailAttachment[] = []
): Promise<{ messageId: string }> {
  // メールアドレスの検証
  if (!to || to.trim() === "") {
    throw new Error("無効なメールアドレス: 空のメールアドレスが指定されました");
  }

  const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const awsRegion = process.env.AWS_REGION || 'ap-northeast-1';

  // AWS認証情報がある場合はAWS SESを使用
  if (awsAccessKeyId && awsSecretAccessKey) {
    console.log('AWS SESを使用してメール送信中...');
    return await sendEmailWithSES(to, subject, text, attachments, awsAccessKeyId, awsSecretAccessKey, awsRegion);
  }

  // 開発環境では成功として扱う
  console.log(`[DEV] Email would be sent:`);
  console.log(`  To: ${to}`);
  console.log(`  Subject: ${subject}`);
  console.log(`  Body: ${text}`);
  return { messageId: 'dev-' + Date.now() };
}

/**
 * AWS SESを使用したメール送信
 */
async function sendEmailWithSES(
  to: string,
  subject: string,
  text: string,
  attachments: EmailAttachment[],
  awsAccessKeyId: string,
  awsSecretAccessKey: string,
  awsRegion: string
): Promise<{ messageId: string }> {
  try {
    console.log(`AWS SES送信開始: ${to}`);
    console.log(`件名: ${subject}`);
    console.log(`添付ファイル数: ${attachments.length}`);

    const { SESClient, SendRawEmailCommand } = await import('@aws-sdk/client-ses');

    const sesClient = new SESClient({
      region: awsRegion,
      credentials: {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey,
      },
    });

    // 送信者メールアドレス（環境変数から取得、デフォルトはnoreply@taramanji.com）
    const fromEmail = process.env.FROM_EMAIL || 'noreply@taramanji.com';

    // MIMEメールを作成
    const boundary = '----=_NextJS_Email_Boundary';
    let rawMessage = '';

    // ヘッダー
    rawMessage += `From: ${fromEmail}\r\n`;
    rawMessage += `To: ${to}\r\n`;
    rawMessage += `Subject: ${subject}\r\n`;
    rawMessage += `MIME-Version: 1.0\r\n`;

    // 添付ファイルがある場合はmultipart/mixed、ない場合はtext/plain
    if (attachments.length > 0) {
      rawMessage += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;

      // テキスト部分
      rawMessage += `--${boundary}\r\n`;
      rawMessage += `Content-Type: text/plain; charset=UTF-8\r\n`;
      rawMessage += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
      rawMessage += text;
      rawMessage += `\r\n\r\n`;

      // 添付ファイル
      for (const attachment of attachments) {
        rawMessage += `--${boundary}\r\n`;
        rawMessage += `Content-Type: ${attachment.contentType}\r\n`;
        rawMessage += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n`;
        rawMessage += `Content-Transfer-Encoding: base64\r\n\r\n`;
        rawMessage += attachment.content.toString('base64');
        rawMessage += `\r\n\r\n`;
      }

      // 終了境界
      rawMessage += `--${boundary}--\r\n`;
    } else {
      // 添付ファイルがない場合はシンプルなテキストメール
      rawMessage += `Content-Type: text/plain; charset=UTF-8\r\n`;
      rawMessage += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
      rawMessage += text;
      rawMessage += `\r\n`;
    }

    const command = new SendRawEmailCommand({
      Source: fromEmail,
      Destinations: [to],
      RawMessage: {
        Data: Buffer.from(rawMessage, 'utf8'),
      },
    });

    const result = await sesClient.send(command);
    console.log(`AWS SES送信成功: ${result.MessageId}`);
    return { messageId: result.MessageId || '' };
  } catch (error) {
    console.error('AWS SES送信エラー:', error);
    console.error('エラー詳細:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      code: (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode,
      requestId: (error as { $metadata?: { requestId?: string } })?.$metadata?.requestId,
    });
    throw new Error(`AWS SES送信エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
