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
};
