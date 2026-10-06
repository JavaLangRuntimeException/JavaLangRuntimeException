import { createClient, type Client } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import type { DescService } from "@bufbuild/protobuf";

// ブラウザ → Envoy Gateway → 各サービスは Connect（JSON over HTTP）。同じオリジンなので Cookie（管理者セッション）も付く
export const transport = createConnectTransport({
  // テスト（Node）では window がないので相対 URL にしておく
  baseUrl: typeof window === "undefined" ? "http://localhost" : window.location.origin,
  useBinaryFormat: false,
  fetch: (input, init) => fetch(input, { ...init, credentials: "same-origin" }),
});

export function client<T extends DescService>(service: T): Client<T> {
  return createClient(service, transport);
}
