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
     // Use standalone output for deployment with API routes
     output: 'standalone',
};
