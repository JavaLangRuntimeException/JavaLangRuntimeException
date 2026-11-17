import type { DescService } from "@bufbuild/protobuf";
import { createClient, type Client } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";

// ブラウザ → Cloudflare Access → Gateway → API は Connect（JSON over HTTP）。
// 同じオリジンなので、Access のセッションの Cookie（CF_Authorization）がそのまま付く
export const transport = createConnectTransport({ baseUrl: "/" });

export function client<T extends DescService>(service: T): Client<T> {
  return createClient(service, transport);
}
