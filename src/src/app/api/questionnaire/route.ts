import { NextResponse } from "next/server";

interface QuestionnaireData {
  name: string;
  vrUsage: string;
  height: number;
  trialPattern: string;
  r1: number;
  r2: number;
  r3: number;
  r4: number;
  r5: number;
  r6: number;
  r7: number;
  r8: number;
  r9: number;
  r10: number;
  r11: number;
  r12: number;
  r13: number;
  r14: number;
  r15: number;
  r16: number;
  r17: number;
  r18: number;
}

const TRIAL_PATTERN_LABELS: Record<string, string> = {
  standing_humanSwinging: "人間の腕振りで立位姿勢(standing_humanSwinging)",
  fours_humanSwinging: "人間の腕振りで四つん這い姿勢(fours_humanSwinging)",
  standing_bearRolling: "クマの腕振りで立位姿勢(standing_bearRolling)",
  fours_bearRolling: "クマの腕振りで四つん這い姿勢(fours_bearRolling)",
};

const VR_USAGE_LABELS: Record<string, string> = {
  none: "全くない",
  monthly: "月に数回",
  weekly: "週に数回",
  daily: "毎日",
};

function getTrialPatternLabel(value: string): string {
  return TRIAL_PATTERN_LABELS[value] || value;
}

function getVrUsageLabel(value: string): string {
  return VR_USAGE_LABELS[value] || value;
}

// AWS SESを使用したメール送信
async function sendEmailWithSES(to: string, subject: string, text: string) {
  try {
    const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const awsRegion = process.env.AWS_REGION || 'ap-northeast-1';

    if (!awsAccessKeyId || !awsSecretAccessKey) {
      throw new Error("AWS credentials are not configured");
    }

    const { SESClient, SendRawEmailCommand } = await import('@aws-sdk/client-ses');

    const sesClient = new SESClient({
      region: awsRegion,
      credentials: {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey,
      },
    });

    const fromEmail = process.env.FROM_EMAIL || 'noreply@taramanji.com';
    let rawMessage = '';

    // ヘッダー
    rawMessage += `From: ${fromEmail}\r\n`;
    rawMessage += `To: ${to}\r\n`;
    rawMessage += `Subject: ${subject}\r\n`;
    rawMessage += `MIME-Version: 1.0\r\n`;
    rawMessage += `Content-Type: text/plain; charset=UTF-8\r\n`;
    rawMessage += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
    rawMessage += text;
    rawMessage += `\r\n`;

    const command = new SendRawEmailCommand({
      Source: fromEmail,
      Destinations: [to],
      RawMessage: {
        Data: Buffer.from(rawMessage, 'utf8'),
      },
    });

    const result = await sesClient.send(command);
    console.log(`AWS SES送信成功: ${result.MessageId}`);
    return result;
  } catch (error) {
    console.error('AWS SES送信エラー:', error);
    throw new Error(`AWS SES送信エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function POST(request: Request) {
  try {
    const data: QuestionnaireData = await request.json();

    // メール本文を作成
    const emailBody = `
実験アンケート回答

━━━━━━━━━━━━━━━━━━━━━
■ 回答者情報
━━━━━━━━━━━━━━━━━━━━━
お名前: ${data.name}
VR使用頻度: ${getVrUsageLabel(data.vrUsage)}
身長: ${data.height}cm

━━━━━━━━━━━━━━━━━━━━━
■ 試行パターン
━━━━━━━━━━━━━━━━━━━━━
${getTrialPatternLabel(data.trialPattern)}

━━━━━━━━━━━━━━━━━━━━━
■ R1-R6: 身体所有感・身体運動感覚 (7段階)
━━━━━━━━━━━━━━━━━━━━━
【R1】ある時点で、私(現実)の身体が、見ているバーチャルの身体(アバタ)の姿勢や形状になり始めているかのように感じた。
回答: ${data.r1}

【R2】バーチャルの身体(アバタ)が、私自身の身体であるかのように感じた。
回答: ${data.r2}

【R3】私自身の身体が、仮想の身体(アバタ)が見えている場所にあるかのように感じた。
回答: ${data.r3}

【R4】仮想の身体(アバタ)を、まるで自分自身の身体であるかのように制御できると感じた。
回答: ${data.r4}

【R5】仮想の身体(クマの前足)が地面に触れるのを見たとき、その触れた場所で、実際にその感触を感じるように感じた。
回答: ${data.r5}

【R6】仮想の身体(アバタ)の動きが、私自身の(現実の)動きに影響を与えているように感じた。
回答: ${data.r6}

━━━━━━━━━━━━━━━━━━━━━
■ R7-R12: NASA-TLX (20段階)
━━━━━━━━━━━━━━━━━━━━━
【R7】どの程度の知的・知覚的活動を必要としましたか?
回答: ${data.r7}

【R8】どの程度、身体的活動が必要でしたか?
回答: ${data.r8}

【R9】タスクのペースや課題が発生する頻度のために感じる時間的切迫感はどの程度でしたか。
回答: ${data.r9}

【R10】作業指示者によって設定されたタスクの目標をどの程度達成できたと思いますか?
回答: ${data.r10}

【R11】作業成績のレベルを達成・維持するために、精神的・身体的にどの程度いっしょうけんめいに作業しなければなりませんでしたか。
回答: ${data.r11}

【R12】作業中に、不安感、落胆、いらいら、ストレス、悩みをどの程度感じましたか。
回答: ${data.r12}

━━━━━━━━━━━━━━━━━━━━━
■ R13-R18: その他の評価 (7段階)
━━━━━━━━━━━━━━━━━━━━━
【R13】このタスクをとても楽しんでできた。
回答: ${data.r13}

【R14】私は、この活動がかなり得意で、熟練していると思う。
回答: ${data.r14}

【R15】バーチャルの身体(アバタ)なら、普段よりも速く走れると感じた。
回答: ${data.r15}

【R16】実験中、自分の身体(現実)が普段よりも大きく感じた。
回答: ${data.r16}

【R17】実験中、自分の身体(現実)が普段よりも重く感じた。
回答: ${data.r17}

【R18】バーチャルの身体(アバタ)に対して、力強さを感じた。
回答: ${data.r18}

━━━━━━━━━━━━━━━━━━━━━
    `.trim();

    // AWS SESでメール送信
    await sendEmailWithSES("tanahashishuta@gmail.com", "実験アンケート回答", emailBody);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error processing questionnaire:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
