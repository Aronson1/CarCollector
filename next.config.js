console.log('next.config.js is loaded')
module.exports = {
    async rewrites() {
      return [
        {
          source: '/api/:path*',
          destination: 'https://arval-prod-euw-appservice-portalapi.azurewebsites.net/:path*', // Zmienić na odpowiedni adres serwera API
        },
      ];
    },
  };