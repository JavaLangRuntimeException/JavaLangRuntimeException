module.exports = {
     images: {
          domains: ['qiita-user-contents.imgix.net', 'picsum.photos'],
          remotePatterns: [
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
                    pathname: '/**', // 任意のパスを許可
               },
          ],
     },
     // 静的エクスポートを無効にする（デフォルトでは無効ですが明示的に指定）
     output: 'standalone',  // または設定しない
};
