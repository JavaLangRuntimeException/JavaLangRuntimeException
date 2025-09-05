module.exports = {
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
     // 'export'の設定を削除するか、以下のように変更する
     // output: 'standalone',
};
