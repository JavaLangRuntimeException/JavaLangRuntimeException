/** @type {import('next').NextConfig} */
const nextConfig = {
     // Docker（k8s/Dockerfile）でのビルド時のみ standalone 出力にする。Vercel のビルドには影響しない
     ...(process.env.NEXT_OUTPUT_STANDALONE === '1' ? { output: 'standalone' } : {}),
     images: {
          remotePatterns: [
               {
                    protocol: 'https',
                    hostname: 'qiita-user-contents.imgix.net',
                    port: '',
                    pathname: '/**',
               },
               {
                    protocol: 'https',
                    hostname: 'via.placeholder.com',
                    port: '',
                    pathname: '/**',
               },
               {
                    protocol: 'https',
                    hostname: 'picsum.photos',
                    port: '',
                    pathname: '/**',
               },
          ],
     },
     // ボディサイズ制限を10MBに設定（ファイル添付対応）
     experimental: {
          serverActions: {
               bodySizeLimit: '10mb',
          },
     },
};

module.exports = nextConfig;
