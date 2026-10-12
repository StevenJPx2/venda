import { defineSite } from 'venda';

export default defineSite({
  name: 'Field Journal',
  url: 'https://journal.example.com',
  screens: {
    'content.index':
      'Everything this site publishes, from journal posts to the home page.',
    settings: 'How the Field Journal is run: its files, its people and its keys.'
  }
});
