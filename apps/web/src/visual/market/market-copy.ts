import { formatMessage, type Locale, type MessageValues } from '../i18n';

/** Texts of the Market panel, the try-on preview and chain errors, outside the shared dictionary. */
const es = {
  cardTitle: 'Mercado',
  cardDetail: 'Compra y vende piezas NFT · Stellar Testnet',
  eyebrow: 'Stellar Testnet · NFT',
  title: 'Mercado de piezas',
  body: 'Compra piezas de colección, publica las tuyas y compra las de otros comandantes. Cada operación se firma en Freighter.',
  sections: 'Secciones del mercado',
  tabShop: 'Tienda',
  tabListings: 'Anuncios',
  tabMine: 'Mis piezas',
  shopNote: 'Piezas nuevas: se acuñan al comprarlas y el pago va a la tesorería del juego.',
  officialSeller: 'Tienda oficial',
  seller: 'Vendedor',
  price: 'Precio',
  listingsOfPiece: 'Anuncios de otros comandantes: {count}',
  openDetail: 'Ver {name}',
  closeDetail: '← Volver a la lista',
  mineNeedWallet: 'Vincula una wallet para ver y vender tus piezas.',
  mineEmpty: 'Todavía no tienes piezas para vender. Cómpralas en la Tienda; los emblemas de mérito no se venden.',
  pieceToken: 'Pieza #{token}',
  ownedHint: 'Ya es tuya. Equípala desde el Hangar.',
  viewInMarket: 'Ver en el Mercado →',
  previewBadge: 'Vista previa · no equipado',
  listen: '▶ Escuchar',
  stop: '■ Detener',
  musicPurchaseNote: 'Al comprarla queda equipada y suena en tus partidas.',
  voicePurchaseNote: 'Al comprarla queda equipada y anuncia tus partidas.',
  equipAfterPurchase: 'Al comprarla queda equipada.',
  pending: 'Pendiente: revisa en el explorador.',
  invalidResponse: 'La red no confirmó la operación. Revisa en el explorador si se completó.',
  contract2: 'Esa pieza no existe en el catálogo.',
  contract3: 'Esa pieza ya no existe.',
  contract4: 'No eres dueño de esta pieza.',
  contract6: 'Esta pieza no se puede vender ni transferir.',
  contract7: 'Esta pieza no está a la venta.',
  contract8: 'Esta pieza se agotó.',
  contract9: 'Ese premio ya fue entregado.',
  contract10: 'No tienes saldo suficiente en testnet.',
  contract12: 'La autorización de venta venció. Publica el anuncio otra vez.',
  contract13: 'Tu inventario está lleno.',
  contract14: 'No puedes enviarte una pieza a ti mismo.',
  contract101: 'Ese anuncio no existe.',
  contract102: 'El anuncio ya no está disponible.',
  contract103: 'El anuncio venció.',
  contract104: 'Solo quien publicó el anuncio puede cancelarlo.',
  contract105: 'El vendedor ya no tiene esta pieza.',
  contract106: 'El precio tiene que ser mayor que cero.',
  contract107: 'El precio cambió. Revisa el anuncio antes de comprar.',
  contract108: 'No puedes comprar tu propio anuncio.',
  contract109: 'El vendedor retiró la autorización de venta.',
  contract111: 'La duración del anuncio no es válida.',
} as const;

export type MarketCopyKey = keyof typeof es;

const en: Record<MarketCopyKey, string> = {
  cardTitle: 'Market',
  cardDetail: 'Buy and sell NFT pieces · Stellar Testnet',
  eyebrow: 'Stellar Testnet · NFT',
  title: 'Piece market',
  body: 'Buy collection pieces, list your own and buy what other commanders list. Every operation is signed in Freighter.',
  sections: 'Market sections',
  tabShop: 'Shop',
  tabListings: 'Listings',
  tabMine: 'My pieces',
  shopNote: 'New pieces: minted when you buy them, paid to the game treasury.',
  officialSeller: 'Official shop',
  seller: 'Seller',
  price: 'Price',
  listingsOfPiece: 'Listings by other commanders: {count}',
  openDetail: 'View {name}',
  closeDetail: '← Back to the list',
  mineNeedWallet: 'Link a wallet to see and sell your pieces.',
  mineEmpty: 'You hold no pieces to sell yet. Buy them in the Shop; merit emblems cannot be sold.',
  pieceToken: 'Piece #{token}',
  ownedHint: 'It is yours. Equip it from the Hangar.',
  viewInMarket: 'View in the Market →',
  previewBadge: 'Preview · not equipped',
  listen: '▶ Listen',
  stop: '■ Stop',
  musicPurchaseNote: 'Once bought it is equipped and plays in your matches.',
  voicePurchaseNote: 'Once bought it is equipped and announces your matches.',
  equipAfterPurchase: 'Once bought it is equipped.',
  pending: 'Pending: check the explorer.',
  invalidResponse: 'The network did not confirm the operation. Check the explorer to see whether it went through.',
  contract2: 'That piece is not in the catalog.',
  contract3: 'That piece no longer exists.',
  contract4: 'You do not own this piece.',
  contract6: 'This piece cannot be sold or transferred.',
  contract7: 'This piece is not for sale.',
  contract8: 'This piece is sold out.',
  contract9: 'That reward was already granted.',
  contract10: 'Your testnet balance is too low.',
  contract12: 'The sale approval expired. List the piece again.',
  contract13: 'Your inventory is full.',
  contract14: 'You cannot send a piece to yourself.',
  contract101: 'That listing does not exist.',
  contract102: 'That listing is no longer available.',
  contract103: 'The listing expired.',
  contract104: 'Only the seller can cancel the listing.',
  contract105: 'The seller no longer holds this piece.',
  contract106: 'The price must be greater than zero.',
  contract107: 'The price changed. Check the listing before buying.',
  contract108: 'You cannot buy your own listing.',
  contract109: 'The seller withdrew the sale approval.',
  contract111: 'The listing duration is not valid.',
};

export const MARKET_COPY_KEYS = Object.keys(es) as MarketCopyKey[];

export function marketText(locale: Locale, key: MarketCopyKey, values?: MessageValues): string {
  return formatMessage((locale === 'en' ? en : es)[key], values);
}

/** Contract error numbers with their own wording: 1-16 cosmetics, 101-111 marketplace. */
export const CONTRACT_CODES = MARKET_COPY_KEYS
  .filter((key) => key.startsWith('contract'))
  .map((key) => Number(key.slice('contract'.length)));

/** What a contract refusal means for the player, or null for a number without wording. */
export function contractText(locale: Locale, code: number): string | null {
  const key = `contract${code}`;
  return (MARKET_COPY_KEYS as string[]).includes(key) ? marketText(locale, key as MarketCopyKey) : null;
}
